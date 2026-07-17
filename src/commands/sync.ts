import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { getDb } from "../db/index.js";
import { fetchStoriesFromGoogleSheet } from "../utils/gsheet.js";
import {
  loadCharCacheFromDB,
  loadStoryCacheFromDB,
} from "../utils/db_queries.js";

export const data = new SlashCommandBuilder()
  .setName("sync")
  .setDescription("Syncs google sheet data with the bot and refreshes cache")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles); // optional: restrict

export async function execute(interaction: ChatInputCommandInteraction) {
  // Defer first: the sheet fetch + ~200 inserts can exceed Discord's 3s window.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rows = await fetchStoriesFromGoogleSheet(); // ~200 rows

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO library (title, genre, content, author) VALUES (?, ?, ?, ?)`,
  );
  // Clear and replace atomically (auto-rollback on any failed insert).
  const replaceAll = db.transaction((items: typeof rows) => {
    db.prepare("DELETE FROM library").run();
    for (const row of items)
      insert.run(row.title, row.genre, row.content, row.author ?? null);
  });
  replaceAll(rows);

  await loadCharCacheFromDB();
  await loadStoryCacheFromDB(); // refresh in-memory cache
  await interaction.editReply({
    content: `🖋 The library's ledger is up to date again.`,
  });
}
