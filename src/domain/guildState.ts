import { getDb } from "../db/index.js";

export async function getGuildState(
  guildId: string,
  key: string,
): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ value: string }>(
    `SELECT value FROM guild_state WHERE guildId = ? AND key = ?`,
    [guildId, key],
  );
  return row ? row.value : null;
}

export async function setGuildState(
  guildId: string,
  key: string,
  value: string,
): Promise<void> {
  const db = await getDb();
  await db.run(
    `
    INSERT INTO guild_state (guildId, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(guildId, key) DO UPDATE SET
      value = excluded.value
    `,
    [guildId, key, value],
  );
}
