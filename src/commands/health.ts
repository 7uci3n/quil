import { log } from "../lib/log.js";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { getDb } from "../db/index.js";
import pkg from "../../package.json" with { type: "json" };

export const data = new SlashCommandBuilder()
  .setName("health")
  .setDescription("Show bot health/uptime and basic checks")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles); // optional: restrict

export async function execute(interaction: ChatInputCommandInteraction) {
  const startedAt = interaction.client.readyTimestamp ?? Date.now();
  const uptimeMs = Date.now() - startedAt;
  const ping = Math.round(interaction.client.ws.ping);

  // DB probe (non-destructive, fast)
  const db = getDb();

  let dbStatus = "skipped";
  try {
    db.prepare("SELECT 1").get();
    dbStatus = "ok";
  } catch (err) {
    dbStatus = "error";
    log.error("❌ DB health check failed:", err);
  }

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: [
      `** — /health**`,
      `• Uptime: ${ms(uptimeMs)}`,
      `• WS Ping: ${ping} ms`,
      `• DB: ${dbStatus}`,
      `• Version: ${pkg.version ?? "dev"} (${process.env.COMMIT_SHA?.slice(0, 7) ?? "local"})`,
      `• Env: ${process.env.NODE_ENV ?? "dev"}`,
      `• Guild: ${interaction.guild?.name ?? "DM"} (${interaction.guildId ?? "n/a"})`,
    ].join("\n"),
  });
}

function ms(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}
