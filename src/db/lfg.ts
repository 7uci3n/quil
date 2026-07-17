// src/db/lfg.ts
import { getDb } from "../db/index.js";
import { type LfgEntry, type LfgTier, anyTierOn } from "../domain/lfg.js";

/** Result of a purge: the surviving entry, or null when the row was removed. */
export type LfgPurgeResult = { userId: string; entry: LfgEntry | null };

export async function getLfgEntry(
  userId: string,
  guildId?: string,
): Promise<LfgEntry | null> {
  const db = getDb();
  const row = guildId
    ? db
        .prepare(`SELECT * FROM lfg_status WHERE userId = ? AND guildId = ?`)
        .get(userId, guildId)
    : db.prepare(`SELECT * FROM lfg_status WHERE userId = ?`).get(userId);
  return (row as LfgEntry | undefined) ?? null;
}

const UPSERT_SQL = `INSERT INTO lfg_status (userId, guildId, name, startedAt, low, mid, high, epic, pbp, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(userId) DO UPDATE SET
     guildId = excluded.guildId,
     name = excluded.name,
     startedAt = excluded.startedAt,
     low = excluded.low, mid = excluded.mid, high = excluded.high, epic = excluded.epic, pbp = excluded.pbp,
     updatedAt = excluded.updatedAt`;

function upsertRow(e: LfgEntry): void {
  getDb()
    .prepare(UPSERT_SQL)
    .run(
      e.userId,
      e.guildId,
      e.name,
      e.startedAt,
      e.low,
      e.mid,
      e.high,
      e.epic,
      e.pbp,
      e.updatedAt,
    );
}

export async function upsertLfgEntry(e: LfgEntry): Promise<void> {
  upsertRow(e);
}

export async function deleteLfgEntry(userId: string): Promise<void> {
  getDb().prepare(`DELETE FROM lfg_status WHERE userId = ?`).run(userId);
}

export async function listAllLfg(guildId: string): Promise<LfgEntry[]> {
  return getDb()
    .prepare(`SELECT * FROM lfg_status WHERE guildId = ?`)
    .all(guildId) as LfgEntry[];
}

/**
 * Atomic read-modify-write for a single user's LFG entry (ADR-0005). Reads the
 * current row (or `makeDefault()` if none), applies `mutate`, then upserts —
 * deleting the row when no tier remains. Runs in one synchronous transaction, so
 * concurrent `/lfg` invocations cannot interleave into a lost update. Scoped to
 * `guildId` so a foreign-guild row is never read or overwritten.
 */
export async function applyLfgMutation(
  userId: string,
  guildId: string,
  makeDefault: () => LfgEntry,
  mutate: (e: LfgEntry) => LfgEntry,
): Promise<LfgEntry> {
  const db = getDb();
  const run = db.transaction((): LfgEntry => {
    const existing = db
      .prepare(`SELECT * FROM lfg_status WHERE userId = ? AND guildId = ?`)
      .get(userId, guildId) as LfgEntry | undefined;
    const next = mutate(existing ?? makeDefault());
    if (anyTierOn(next)) {
      upsertRow(next);
    } else {
      db.prepare(`DELETE FROM lfg_status WHERE userId = ?`).run(userId);
    }
    return next;
  });
  return run();
}

/**
 * Purge stale LFG entries, clearing only the in-scope tier columns (ADR-0005):
 * `scope:"pbp"` → `pbp`; `scope:"all"` → the leveled tiers `low/mid/high/epic`.
 * A row is deleted only when no tier remains, otherwise it is updated. Returns
 * one result per affected user so the caller can reconcile Discord roles from the
 * surviving (or null) entry — DB and roles can no longer disagree.
 */
export async function purgeLfgBefore(
  guildId: string,
  olderThanMs: number,
  scope: "all" | "pbp",
): Promise<LfgPurgeResult[]> {
  const db = getDb();
  const tiersToClear: LfgTier[] =
    scope === "pbp" ? ["pbp"] : ["low", "mid", "high", "epic"];
  const clause =
    scope === "pbp"
      ? `AND pbp = 1`
      : `AND (low = 1 OR mid = 1 OR high = 1 OR epic = 1)`;

  const run = db.transaction((): LfgPurgeResult[] => {
    const rows = db
      .prepare(
        `SELECT * FROM lfg_status WHERE guildId = ? AND startedAt < ? ${clause}`,
      )
      .all(guildId, olderThanMs) as LfgEntry[];

    const now = Date.now();
    const results: LfgPurgeResult[] = [];
    for (const row of rows) {
      const next: LfgEntry = { ...row, updatedAt: now };
      for (const tier of tiersToClear) next[tier] = 0;
      if (anyTierOn(next)) {
        upsertRow(next);
        results.push({ userId: row.userId, entry: next });
      } else {
        db.prepare(`DELETE FROM lfg_status WHERE userId = ?`).run(row.userId);
        results.push({ userId: row.userId, entry: null });
      }
    }
    return results;
  });
  return run();
}
