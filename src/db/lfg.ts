// src/db/lfg.ts
import { getDb } from "../db/index.js";
import type { LfgEntry } from "../domain/lfg.js";

export async function getLfgEntry(userId: string): Promise<LfgEntry | null> {
  const row = getDb()
    .prepare(`SELECT * FROM lfg_status WHERE userId = ?`)
    .get(userId) as LfgEntry | undefined;
  return row ?? null;
}

export async function upsertLfgEntry(e: LfgEntry) {
  getDb()
    .prepare(
      `INSERT INTO lfg_status (userId, guildId, name, startedAt, low, mid, high, epic, pbp, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         guildId = excluded.guildId,
         name = excluded.name,
         startedAt = excluded.startedAt,
         low = excluded.low, mid = excluded.mid, high = excluded.high, epic = excluded.epic, pbp = excluded.pbp,
         updatedAt = excluded.updatedAt`,
    )
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

export async function deleteLfgEntry(userId: string) {
  getDb().prepare(`DELETE FROM lfg_status WHERE userId = ?`).run(userId);
}

export async function listAllLfg(guildId: string): Promise<LfgEntry[]> {
  return getDb()
    .prepare(`SELECT * FROM lfg_status WHERE guildId = ?`)
    .all(guildId) as LfgEntry[];
}

export async function purgeLfgBefore(
  guildId: string,
  olderThanMs: number,
  scope: "all" | "pbp",
): Promise<string[]> {
  const db = getDb();
  const clause =
    scope === "pbp"
      ? `AND pbp = 1`
      : `AND (low = 1 OR mid = 1 OR high = 1 OR epic = 1)`;
  const rows = db
    .prepare(
      `SELECT userId FROM lfg_status WHERE guildId = ? AND startedAt < ? ${clause}`,
    )
    .all(guildId, olderThanMs) as { userId: string }[];
  const ids = rows.map((r) => r.userId);
  if (ids.length) {
    const qmarks = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM lfg_status WHERE userId IN (${qmarks})`).run(
      ...ids,
    );
  }
  return ids;
}
