import { log } from "../lib/log.js";
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  MessageFlags,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { t } from "../lib/i18n.js";
import { retireCharacter, loadCharCacheFromDB } from "../utils/db_queries.js";

export const data = new SlashCommandBuilder()
  .setName("retire")
  .setDescription("Retire your adventurer or another adventurer (Mod+ only).")
  .addUserOption((o) =>
    o
      .setName("user")
      .setDescription("Target user to retire (Mod+ only).")
      .setRequired(false),
  )
  .addStringOption((o) =>
    o
      .setName("character")
      .setDescription("character to retire")
      .setRequired(false)
      .setAutocomplete(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

// We’ll register an event listener in execute() for the modal submit.
export async function execute(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser("user");
  const char = interaction.options.getString("character");
  const isSelf = !targetUser || targetUser.id === interaction.user.id;

  // Permission check for mod actions
  if (!isSelf) {
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const canManage =
      member?.permissions.has(PermissionFlagsBits.KickMembers) ||
      member?.roles.cache.some((r) =>
        Object.values(CONFIG.guild?.config.roles ?? {})
          .map((role) => role.id)
          .includes(r.id),
      );
    if (!canManage) {
      return interaction.reply({
        content: "Only moderators or staff can retire another adventurer.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Build modal
  const modal = new ModalBuilder()
    .setCustomId(`retire-confirm-${targetUser?.id ?? interaction.user.id}`)
    .setTitle(`Confirm Retirement`);

  const charInput = new TextInputBuilder()
    .setCustomId("char_name")
    .setLabel("Character Name (leave blank for active char)")
    .setValue(char ?? "")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const confirmInput = new TextInputBuilder()
    .setCustomId("confirm_text")
    .setLabel(t("retire.confirmLabel"))
    .setPlaceholder("RETIRE")
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
    charInput,
  );
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(
    confirmInput,
  );
  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

// --- Modal Handler ---
export async function handleModal(interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith("retire-confirm-")) return;
  const char = interaction.fields.getTextInputValue("char_name");
  const input = interaction.fields.getTextInputValue("confirm_text");
  if (input !== "RETIRE") {
    return interaction.reply({
      content: t("retire.cancelled"),
      flags: MessageFlags.Ephemeral,
    });
  }

  const targetId = interaction.customId.replace("retire-confirm-", "");
  const actor = interaction.user;

  // Defence-in-depth: reject junk names (the query itself is parameterized).
  if (char && !/^[a-zA-Z0-9'\- ]+$/.test(char)) {
    return interaction.reply({
      content: t("retire.invalidName"),
      flags: MessageFlags.Ephemeral,
    });
  }

  let result: Awaited<ReturnType<typeof retireCharacter>>;
  try {
    result = await retireCharacter(targetId, char);
  } catch (err) {
    log.error("[retire] failed:", err);
    return interaction.reply({
      content: t("errors.generic"),
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!result) {
    return interaction.reply({
      content: t("retire.noAdventurer", { name: `<@${targetId}>` }),
      flags: MessageFlags.Ephemeral,
    });
  }

  const { row, lastChar } = result;

  // Optional role cleanup
  if (lastChar) {
    const guild = interaction.guild;
    if (guild) {
      const member = await guild.members.fetch(targetId).catch(() => null);
      if (member) {
        const gmRoleId = CONFIG.guild?.config.guildMemberRole;
        const uninitId = CONFIG.guild?.config.uninitiatedRole;
        const gmRole = gmRoleId ? guild.roles.cache.get(gmRoleId) : undefined;
        const uninit = uninitId ? guild.roles.cache.get(uninitId) : undefined;
        if (gmRole && member.roles.cache.has(gmRole.id))
          await member.roles.remove(gmRole).catch(() => {});
        if (uninit && !member.roles.cache.has(uninit.id))
          await member.roles.add(uninit).catch(() => {});
      }
    }
  }

  const targetMention = `<@${targetId}>`;
  const selfAction = actor.id === targetId;
  const note = selfAction
    ? ""
    : t("retire.retiredBy", { actor: actor.toString() });

  await interaction.reply({
    content: t("retire.userNotice", { name: targetMention }) + note,
    embeds: [
      {
        title: t("retire.title", { name: row.name ?? "Unknown" }),
        description: t("retire.description", { name: row.name ?? "Unknown" }),
        fields: [
          {
            name: "⬆️ Level",
            value: row.level?.toString() ?? "N/A",
            inline: true,
          },
          { name: "💪 XP", value: row.xp?.toString() ?? "N/A", inline: true },
          {
            name: "💰 GP",
            value: row.cp !== undefined ? (row.cp / 100).toFixed(2) : "N/A",
            inline: true,
          },
          { name: "🎫 GT", value: row.tp?.toString() ?? "N/A", inline: true },
        ],
        footer: { text: t("retire.footer") },
        color: 0xff0000,
      },
    ],
  });

  loadCharCacheFromDB();
}
