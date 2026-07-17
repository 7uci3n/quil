import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { getDb } from "../db/index.js";

import { CONFIG } from "../config/resolved.js";
import { t } from "../lib/i18n.js";

const FUND_ID = CONFIG.system.fundId;

export const data = new SlashCommandBuilder()
  .setName("guildfund")
  .setDescription("Show the Adventurers Guild fund balance")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers); // for now restrict to staff

export async function execute(interaction: ChatInputCommandInteraction) {
  const db = getDb();
  const row = await db.get(
    `SELECT name, level, xp, cp, tp FROM charlog WHERE userId = ?`,
    FUND_ID,
  );

  if (!row) {
    await interaction.reply({ content: t("guildfund.errors.notFound") });
    return;
  }

  const gp = (row.cp / 100).toFixed(2);
  const tp = String(row.tp ?? 0);

  await interaction.reply({
    embeds: [
      {
        title: row.name ?? t("guildfund.title"),
        fields: [
          { name: "GP", value: "💰 " + gp, inline: true },
          { name: "GT", value: "🎫 " + tp, inline: true },
        ],
        footer: { text: t("guildfund.footer") },
      },
    ],
  });
}
