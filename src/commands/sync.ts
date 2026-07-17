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
  await db.exec("BEGIN TRANSACTION");
  try {
    // Clear and replace (for simple small datasets)
    await db.run("DELETE FROM library");

    const insertStmt = await db.prepare(
      `INSERT INTO library (title, genre, content)
       VALUES (?, ?, ?)`,
    );
    try {
      for (const row of rows) {
        await insertStmt.run(row.title, row.genre, row.content);
      }
    } finally {
      await insertStmt.finalize();
    }

    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }

  await loadCharCacheFromDB();
  await loadStoryCacheFromDB(); // refresh in-memory cache
  await interaction.editReply({
    content: `🖋 The library's ledger is up to date again.`,
  });
}
