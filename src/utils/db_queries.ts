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

export async function getPlayer(
  userId: string,
  name?: string,
): Promise<PlayerRow | undefined> {
  const db = getDb();

  // Base query
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

  const row = await db.get<PlayerRow>(query, params);
  return row;
}

export async function getPlayerCC(userId: string): Promise<number> {
  const db = getDb();
  const result = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(cc), 0) as total FROM charlog WHERE userId = ?`,
    userId,
  );
  return result?.total ?? 0;
}

export async function adjustResource(
  userId: string,
  columns: string[],
  values: number[],
  set: boolean = false,
  name: string = "",
) {
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
  await db.run(query, params);
  return await getPlayer(userId, name);
}

export async function setActive(
  userId: string,
  name: string,
): Promise<boolean> {
  const db = getDb();

  if (!(await getPlayer(userId, name))) return false;

  // Atomic flip so we never leave zero or two active characters for a user.
  await db.exec("BEGIN");
  try {
    await db.run(
      `UPDATE charlog SET active = 0 WHERE userId = ? AND name != ?`,
      userId,
      name,
    );
    await db.run(
      `UPDATE charlog SET active = 1 WHERE userId = ? AND name = ?`,
      userId,
      name,
    );
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

/**
 * Debit one or more CHARACTER resources atomically. Each debit only applies if
 * the balance is sufficient (`col >= amount`), enforced in a single guarded
 * UPDATE — so concurrent spends can never overdraw into a negative balance.
 * Column names come from a fixed allowlist; amounts are parameterized.
 * Returns true if the debit was applied, false if funds were insufficient.
 *
 * NOTE: `cc` (Crew Coins) is a *pooled player* resource that may legitimately go
 * negative on a single character, so it is deliberately NOT spendable here —
 * debit it via `adjustResource` after checking the pool with `getPlayerCC`.
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
    ...positive.map((d) => d.amount), // SET col = col - ?
    userId,
    ...(name.trim() !== "" ? [name] : []),
    ...positive.map((d) => d.amount), // guard: col >= ?
  ];

  const result = await db.run(sql, params);
  return (result.changes ?? 0) > 0;
}

/**
 * Retire (delete) a character and settle its Crew Coins — atomically.
 * If `name` is empty/omitted, the user's active character is retired.
 * Returns the retired row and whether it was the user's last character, or
 * null if no matching character exists. All statements are parameterized.
 */
export async function retireCharacter(
  userId: string,
  name?: string,
): Promise<{ row: PlayerRow; lastChar: boolean } | null> {
  const db = getDb();

  const row = await getPlayer(userId, name);
  if (!row) return null;

  await db.exec("BEGIN");
  try {
    await db.run(
      `DELETE FROM charlog WHERE userId = ? AND name = ?`,
      userId,
      row.name,
    );

    let lastChar = false;
    const activeLeft = await db.get(
      `SELECT 1 AS ok FROM charlog WHERE userId = ? AND active = 1`,
      userId,
    );

    if (!activeLeft) {
      const next = await db.get<{ rowid: number }>(
        `SELECT rowid FROM charlog WHERE userId = ? ORDER BY rowid ASC LIMIT 1`,
        userId,
      );
      if (next) {
        if (row.cc !== 0) {
          await db.run(
            `UPDATE charlog SET cc = cc + ? WHERE rowid = ?`,
            row.cc,
            next.rowid,
          );
        }
        await db.run(
          `UPDATE charlog SET active = 1 WHERE rowid = ?`,
          next.rowid,
        );
      } else {
        lastChar = true;
      }
    } else if (row.cc !== 0) {
      await db.run(
        `UPDATE charlog SET cc = cc + ? WHERE userId = ? AND active = 1`,
        row.cc,
        userId,
      );
    }

    await db.exec("COMMIT");
    return { row, lastChar };
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

export async function loadStoryCacheFromDB() {
  const db = getDb();
  const rows = await db.all<SheetStory[]>(`SELECT * FROM library`);

  StoryCache.stories = rows;

  // Unique genres
  const genres = new Set<string>();
  const titlesByGenre = new Map<string, string[]>();
  const allTitles: string[] = [];

  for (const story of rows) {
    genres.add(story.genre);
    allTitles.push(story.title);

    if (!titlesByGenre.has(story.genre)) {
      titlesByGenre.set(story.genre, []);
    }
    titlesByGenre.get(story.genre)!.push(story.title);
  }

  StoryCache.genres = Array.from(genres).sort();
  StoryCache.titlesByGenre = titlesByGenre;
  StoryCache.allTitles = allTitles.sort();
}

export async function loadCharCacheFromDB() {
  const db = getDb();
  const rows = await db.all<PlayerRow[]>(`SELECT * FROM charlog`);

  // Unique genres

  const charsByUser = new Map<string, string[]>();

  for (const player of rows) {
    if (!charsByUser.has(player.userId)) {
      charsByUser.set(player.userId, []);
    }
    charsByUser.get(player.userId)!.push(player.name);
  }

  CharCache.charsByUser = charsByUser;
}
