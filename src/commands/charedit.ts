// commands/charedit.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { getDb } from "../db/index.js";
import { CONFIG } from "../config/resolved.js";
import { getPlayer, loadCharCacheFromDB } from "../utils/db_queries.js";
import { t } from "../lib/i18n.js";

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
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("character")
          .setDescription("Character to rename (defaults to active character)")
          .setAutocomplete(true)
          .setRequired(false),
      )
      .addUserOption((o) =>
        o
          .setName("user")
          .setDescription("Target user to rename for (Mod+ only)")
          .setRequired(false),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (sub === "rename") {
    const targetUser = interaction.options.getUser("user");
    const charName = interaction.options.getString("character");
    const newName = interaction.options.getString("new_name", true).trim();
    const isSelf = !targetUser || targetUser.id === interaction.user.id;

    if (!isSelf) {
      const member = await interaction.guild?.members.fetch(
        interaction.user.id,
      );
      const canManage =
        member?.permissions.has(PermissionFlagsBits.KickMembers) ||
        member?.roles.cache.some((r) =>
          Object.values(CONFIG.guild?.config.roles ?? {})
            .map((role) => role.id)
            .includes(r.id),
        );
      if (!canManage) {
        return interaction.reply({
          content: t("charedit.rename.noPermission"),
          flags: MessageFlags.Ephemeral,
        });
      }
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
      row.name,
    );
    await loadCharCacheFromDB();

    const note = isSelf
      ? ""
      : t("charedit.updatedBy", { actor: interaction.user.toString() });
    return interaction.reply({
      content:
        t("charedit.rename.success", { oldName: row.name, newName }) + note,
      flags: MessageFlags.Ephemeral,
    });
  }
}
