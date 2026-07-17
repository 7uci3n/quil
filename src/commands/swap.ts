// src/commands/swap.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { setActive } from "../utils/db_queries.js";
import { showCharacterEmbed } from "../utils/embeds.js";
import { t } from "../lib/i18n.js";

export const data = new SlashCommandBuilder()
  .setName("swap")
  .setDescription("Swap to another character")
  .addStringOption((o) =>
    o
      .setName("name")
      .setDescription("Adventurer's name")
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("name", true).trim();
  const switched = await setActive(interaction.user.id, name);
  if (!switched) {
    await interaction.reply({
      content: t("swap.notFound", { name }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await showCharacterEmbed(interaction, {
    title: t("swap.switched", { name }),
  });
}
