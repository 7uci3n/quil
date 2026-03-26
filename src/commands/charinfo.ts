// commands/charinfo.ts
import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { showCharacterEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("charinfo")
  .setDescription("Show your character info")
  .addUserOption((o) => o.setName("user").setDescription("Target user"))
  .addStringOption((o) =>
    o
      .setName("character")
      .setDescription("Target character")
      .setAutocomplete(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  return showCharacterEmbed(interaction);
}
