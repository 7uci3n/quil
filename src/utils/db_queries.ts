import type { SheetStory } from "../commands/library.js";
import { getDb } from "../db/index.js";

export type PlayerRow = {
  userId: string;
  name: string;
  xp: number;
  level: number;
  cp: number;
  tp: number;
  dtp: number;
  dtp_updated: number;
  cc: number;
  active: boolean;
};

export const StoryCache = {
  stories: [] as SheetStory[],
  genres: [] as string[],
  titlesByGenre: new Map<string, string[]>(),
  allTitles: [] as string[],
};

export const CharCache = {
  charsByUser: new Map<string, string[]>(),
};

// better-sqlite3 is synchronous; these keep async signatures as a compatibility
// shim so callers are unchanged. Each body runs without interleaving, and
// multi-step mutations use db.transaction() for atomicity.

export async function getPlayer(
  userId: string,
  name?: string,
): Promise<PlayerRow | undefined> {
  const db = getDb();
  let query = `
    SELECT userId, name, xp, level, cp, tp, dtp, dtp_updated, cc, active
    FROM charlog
    WHERE userId = ?
  `;
  const params: (string | number)[] = [userId];
  if (name && name.trim() !== "") {
    query += ` AND name = ?`;
    params.push(name);
  } else {
    query += ` AND active = 1`;
  }
  return db.prepare(query).get(...params) as PlayerRow | undefined;
}

export async function getPlayerCC(userId: string): Promise<number> {
  const db = getDb();
  const result = db
    .prepare(
      `SELECT COALESCE(SUM(cc), 0) as total FROM charlog WHERE userId = ?`,
    )
    .get(userId) as { total: number } | undefined;
  return result?.total ?? 0;
}

export async function adjustResource(
  userId: string,
  columns: string[],
  values: number[],
  set: boolean = false,
  name: string = "",
): Promise<PlayerRow | undefined> {
  const db = getDb();

  const allowed = ["xp", "level", "cp", "tp", "dtp", "dtp_updated", "cc"];
  for (const col of columns) {
    if (!allowed.includes(col)) {
      throw new Error(`Invalid resource column: ${col}`);
    }
  }

  const assignments = columns.map((col) =>
    set ? `${col} = ?` : `${col} = ${col} + ?`,
  );
  const query = `
    UPDATE charlog
    SET ${assignments.join(", ")}
    WHERE userId = ?
    ${name.trim() !== "" ? "AND name = ?" : "AND active = 1"}
  `;
  const params: (string | number)[] = [...values, userId];
  if (name.trim() !== "") params.push(name);

  db.prepare(query).run(...params);
  return getPlayer(userId, name);
}

export async function setActive(
  userId: string,
  name: string,
): Promise<boolean> {
  const db = getDb();
  const exists = db
    .prepare(`SELECT 1 FROM charlog WHERE userId = ? AND name = ?`)
    .get(userId, name);
  if (!exists) return false;

  // Atomic flip so we never leave zero or two active characters for a user.
  db.transaction(() => {
    db.prepare(
      `UPDATE charlog SET active = 0 WHERE userId = ? AND name != ?`,
    ).run(userId, name);
    db.prepare(
      `UPDATE charlog SET active = 1 WHERE userId = ? AND name = ?`,
    ).run(userId, name);
  })();
  return true;
}

/**
 * Debit one or more CHARACTER resources atomically (single guarded UPDATE, so no
 * overdraft even under concurrent spends). `cc` is a pooled player resource that
 * may legitimately go negative on a character, so it is NOT spendable here — debit
 * it via `adjustResource` after checking the pool with `getPlayerCC`.
 */
export async function spendResources(
  userId: string,
  debits: { column: string; amount: number }[],
  name = "",
): Promise<boolean> {
  const db = getDb();
  const allowed = ["cp", "tp", "dtp"];

  const positive = debits.filter((d) => d.amount > 0);
  if (positive.length === 0) return true;
  for (const d of positive) {
    if (!allowed.includes(d.column)) {
      throw new Error(`Invalid spend column: ${d.column}`);
    }
  }

  const setClause = positive
    .map((d) => `${d.column} = ${d.column} - ?`)
    .join(", ");
  const guardClause = positive.map((d) => `${d.column} >= ?`).join(" AND ");
  const scope = name.trim() !== "" ? "AND name = ?" : "AND active = 1";
  const sql = `
    UPDATE charlog
    SET ${setClause}
    WHERE userId = ?
    ${scope}
    AND ${guardClause}
  `;
  const params: (string | number)[] = [
    ...positive.map((d) => d.amount),
    userId,
    ...(name.trim() !== "" ? [name] : []),
    ...positive.map((d) => d.amount),
  ];

  const result = db.prepare(sql).run(...params);
  return result.changes > 0;
}

/**
 * Retire (delete) a character and settle its Crew Coins — atomically.
 * If `name` is empty/omitted, the user's active character is retired.
 * Returns the retired row and whether it was the user's last character, or null.
 */
export async function retireCharacter(
  userId: string,
  name?: string,
): Promise<{ row: PlayerRow; lastChar: boolean } | null> {
  const db = getDb();

  const row = await getPlayer(userId, name);
  if (!row) return null;

  const lastChar = db.transaction((): boolean => {
    db.prepare(`DELETE FROM charlog WHERE userId = ? AND name = ?`).run(
      userId,
      row.name,
    );

    const activeLeft = db
      .prepare(`SELECT 1 FROM charlog WHERE userId = ? AND active = 1`)
      .get(userId);

    if (!activeLeft) {
      const next = db
        .prepare(
          `SELECT rowid FROM charlog WHERE userId = ? ORDER BY rowid ASC LIMIT 1`,
        )
        .get(userId) as { rowid: number } | undefined;
      if (next) {
        if (row.cc !== 0) {
          db.prepare(`UPDATE charlog SET cc = cc + ? WHERE rowid = ?`).run(
            row.cc,
            next.rowid,
          );
        }
        db.prepare(`UPDATE charlog SET active = 1 WHERE rowid = ?`).run(
          next.rowid,
        );
        return false;
      }
      return true;
    }

    if (row.cc !== 0) {
      db.prepare(
        `UPDATE charlog SET cc = cc + ? WHERE userId = ? AND active = 1`,
      ).run(row.cc, userId);
    }
    return false;
  })();

  return { row, lastChar };
}

export async function loadStoryCacheFromDB() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM library`).all() as SheetStory[];

  StoryCache.stories = rows;

  const genres = new Set<string>();
  const titlesByGenre = new Map<string, string[]>();
  const allTitles: string[] = [];

  for (const story of rows) {
    genres.add(story.genre);
    allTitles.push(story.title);
    if (!titlesByGenre.has(story.genre)) titlesByGenre.set(story.genre, []);
    titlesByGenre.get(story.genre)!.push(story.title);
  }

  StoryCache.genres = Array.from(genres).sort();
  StoryCache.titlesByGenre = titlesByGenre;
  StoryCache.allTitles = allTitles.sort();
}

export async function loadCharCacheFromDB() {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM charlog`).all() as PlayerRow[];

  const charsByUser = new Map<string, string[]>();
  for (const player of rows) {
    if (!charsByUser.has(player.userId)) charsByUser.set(player.userId, []);
    charsByUser.get(player.userId)!.push(player.name);
  }
  CharCache.charsByUser = charsByUser;
}
