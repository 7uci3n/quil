// commands/charedit.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { getDb } from "../db/index.js";
import { CONFIG } from "../config/resolved.js";
import { getPlayer, loadCharCacheFromDB } from "../utils/db_queries.js";
import { t } from "../lib/i18n.js";
import { requireRole, requireChannel } from "../config/validaters.js";

export const data = new SlashCommandBuilder()
  .setName("charedit")
  .setDescription("Edit character details")
  .addSubcommand((sc) =>
    sc
      .setName("rename")
      .setDescription("Rename one of your characters")
      .addStringOption((o) =>
        o
          .setName("new_name")
          .setDescription("The new name for the character")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("character")
          .setDescription("Character to rename (defaults to active character)")
          .setAutocomplete(true)
          .setRequired(false)
      )
      .addUserOption((o) =>
        o
          .setName("user")
          .setDescription("Target user to rename for (Mod+ only)")
          .setRequired(false)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (sub === "rename") {
    // Channel guard: must be in the character submissions forum or a thread under it
    if (!await requireChannel(interaction, CONFIG.guild?.config.channels.charSubmissions)) return;

    const targetUser = interaction.options.getUser("user");
    const charName = interaction.options.getString("character");
    const newName = interaction.options.getString("new_name", true).trim();
    // isSelf is preserved solely to include an audit note on the success message.
    const isSelf = !targetUser || targetUser.id === interaction.user.id;

    if (!isSelf) {
      const CFG = CONFIG.guild!.config;
      const modRoleIds = [CFG.roles.moderator.id, CFG.roles.admin.id, CFG.roles.keeper.id].filter(Boolean) as string[];
      const member = await requireRole(interaction, modRoleIds, 'charedit.rename.noPermission');
      if (!member) return;
    }

    if (!/^[a-zA-Z0-9'\- ]+$/.test(newName)) {
      return interaction.reply({
        content: t("charedit.rename.invalidName"),
        flags: MessageFlags.Ephemeral,
      });
    }

    const resolvedUserId = targetUser?.id ?? interaction.user.id;
    const row = await getPlayer(resolvedUserId, charName ?? undefined);

    if (!row) {
      return interaction.reply({
        content: t("charedit.rename.noChar"),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (newName === row.name) {
      return interaction.reply({
        content: t("charedit.rename.sameName"),
        flags: MessageFlags.Ephemeral,
      });
    }

    const conflict = await getPlayer(resolvedUserId, newName);
    if (conflict) {
      return interaction.reply({
        content: t("charedit.rename.conflict", { newName }),
        flags: MessageFlags.Ephemeral,
      });
    }

    const db = await getDb();
    await db.run(
      `UPDATE charlog SET name = ? WHERE userId = ? AND name = ?`,
      newName,
      resolvedUserId,
      row.name
    );
    await loadCharCacheFromDB();

    const note = isSelf ? "" : ` (updated by ${interaction.user})`;
    return interaction.reply({
      content: t("charedit.rename.success", { oldName: row.name, newName }) + note,
    });
  }
}
