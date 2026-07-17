// src/commands/initiate.ts
import { log } from "../lib/log.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  userMention,
} from "discord.js";
import { getDb } from "../db/index.js";
import { t } from "../lib/i18n.js";
import {
  getPlayer,
  loadCharCacheFromDB,
  setActive,
} from "../utils/db_queries.js";
import { CONFIG } from "../config/resolved.js";
import { showCharacterEmbed } from "../utils/embeds.js";
import { dtpDayBoundary } from "../domain/dtp.js";

export const data = new SlashCommandBuilder()
  .setName("initiate")
  .setDescription("Create an adventurer record for a user")
  .addUserOption((o) =>
    o
      .setName("user")
      .setDescription("Discord user to initiate (defaults to you)")
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName("name").setDescription("Adventurer's name").setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers); // mod+

export async function execute(interaction: ChatInputCommandInteraction) {
  // --- inputs ---
  const db = getDb();
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const rawName = interaction.options.getString("name", true).trim();

  // name validation (letters/numbers/spaces/apostrophes/hyphens)
  if (!/^[a-zA-Z0-9'\- ]+$/.test(rawName)) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: t("initiate.invalidName"),
    });
    return;
  }

  if (await getPlayer(targetUser.id, rawName)) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        targetUser.id === interaction.user.id
          ? t("initiate.alreadyExists.self")
          : t("initiate.alreadyExists.other"),
    });
    return;
  }

  const CFG = CONFIG.guild!.config;
  const DTP_RATE = CFG.features.dtp?.rate || 1;
  const timestampNormal = dtpDayBoundary(Date.now() / 1000, DTP_RATE);

  // --- create baseline record (Level 3 / 900 XP / 80 GP / 0 TP) ---
  // Insert inactive, then setActive() flips exactly one active char atomically —
  // keeps the "one active character" invariant (enforced by a partial unique index).
  db.prepare(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, active, dtp, dtp_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId,name) DO NOTHING`,
  ).run(targetUser.id, rawName, 3, 900, 8000, 0, 0, 0, timestampNormal);

  await setActive(targetUser.id, rawName);

  // Auto-grant Guild Member role if not already present
  const GUILD_MEMBER_ROLE_ID = CONFIG.guild?.config.guildMemberRole;
  if (interaction.guild && GUILD_MEMBER_ROLE_ID) {
    try {
      const member = await interaction.guild.members.fetch(targetUser.id);
      if (!member.roles.cache.has(GUILD_MEMBER_ROLE_ID)) {
        await member.roles.add(GUILD_MEMBER_ROLE_ID);
      }
    } catch (err) {
      log.error(`Failed to grant Guild Member role to ${targetUser.id}:`, err);
      await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        content: `⚠️ Character created, but I couldn't grant the Guild Member role (<@&${GUILD_MEMBER_ROLE_ID}>). Check my role position and permissions.\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``,
      });
    }
  }

  showCharacterEmbed(interaction, {
    title: t("initiate.title", { name: rawName }),
    desc: t("initiate.description", { name: rawName }),
    footer: t("initiate.footer"),
    content: t("initiate.userGreeting", { name: userMention(targetUser.id) }),
  });

  loadCharCacheFromDB();
}
