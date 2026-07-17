import { getDb } from "../db/index.js";

export async function getGuildState(
  guildId: string,
  key: string,
): Promise<string | null> {
  const row = getDb()
    .prepare(`SELECT value FROM guild_state WHERE guildId = ? AND key = ?`)
    .get(guildId, key) as { value: string } | undefined;
  return row ? row.value : null;
}

export async function setGuildState(
  guildId: string,
  key: string,
  value: string,
): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO guild_state (guildId, key, value)
       VALUES (?, ?, ?)
       ON CONFLICT(guildId, key) DO UPDATE SET value = excluded.value`,
    )
    .run(guildId, key, value);
}
