import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { StoryCache } from "../utils/db_queries.js";
import { chunkString } from "../utils/embeds.js";
import { t } from "../lib/i18n.js";

export interface SheetStory {
  title: string;
  genre: string;
  content: string;
  author?: string;
}

/** Footer line: page position, genre, and author (when the sheet supplies one). */
export function buildFooterText(
  story: SheetStory,
  pageIndex: number,
  pageCount: number,
): string {
  const base = `Page ${pageIndex + 1} / ${pageCount} • Genre: ${story.genre}`;
  return story.author ? `${base} • By ${story.author}` : base;
}

export type LibraryAction = "toggle-lock" | "deny-lock" | "turn" | "deny-turn";

/** Decide what a button press means given who pressed it and the lock state. */
export function resolveLibraryAction(
  customId: string,
  isOwner: boolean,
  locked: boolean,
): LibraryAction {
  if (customId === "lock") return isOwner ? "toggle-lock" : "deny-lock";
  if (locked && !isOwner) return "deny-turn";
  return "turn";
}

/** Clamp the next page index for prev/next; unknown ids leave it unchanged. */
export function nextPageIndex(
  customId: string,
  current: number,
  pageCount: number,
): number {
  if (customId === "prev") return Math.max(0, current - 1);
  if (customId === "next") return Math.min(pageCount - 1, current + 1);
  return current;
}

export const data = new SlashCommandBuilder()
  .setName("library")
  .setDescription("Read to your heart's content")
  .addStringOption((o) =>
    o
      .setName("genre")
      .setDescription("Story genre / category")
      .setRequired(false)
      .setAutocomplete(true),
  )
  .addStringOption((o) =>
    o
      .setName("title")
      .setDescription("Story title")
      .setRequired(false)
      .setAutocomplete(true),
  );

function getRandomElement<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickStoryFromCache(
  title?: string | null,
  genre?: string | null,
): SheetStory | null {
  // 1. Title explicitly set → exact match
  if (title) {
    const found = StoryCache.stories.find(
      (s) => s.title.toLowerCase() === title.toLowerCase(),
    );
    return found ?? null;
  }

  // 2. Genre set → random story from that genre
  if (genre) {
    const titles = StoryCache.titlesByGenre.get(genre);
    if (!titles || titles.length === 0) return null;

    const randomTitle = getRandomElement(titles);
    if (!randomTitle) return null;

    return StoryCache.stories.find((s) => s.title === randomTitle) ?? null;
  }

  // 3. Neither set → random story overall
  const randomStory = getRandomElement(StoryCache.stories);
  return randomStory ?? null;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const title = interaction.options.getString("title");
  const genre = interaction.options.getString("genre");

  const story = pickStoryFromCache(title, genre);

  if (!story) {
    await interaction.reply({
      content: t("library.noStory"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const pages = chunkString(story.content, 3500);
  const ownerId = interaction.user.id;
  let pageIndex = 0;
  let locked = false;

  const buildEmbed = () =>
    new EmbedBuilder()
      .setTitle(story.title)
      .setDescription(pages[pageIndex] ?? null)
      .setFooter({ text: buildFooterText(story, pageIndex, pages.length) })
      .setColor(0x5865f2);

  const button = (id: string, label: string, style: ButtonStyle) =>
    new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

  const buildRow = () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("prev", "◀", ButtonStyle.Secondary),
      button("next", "▶", ButtonStyle.Secondary),
      button(
        "lock",
        locked ? "🔓" : "🔒",
        locked ? ButtonStyle.Danger : ButtonStyle.Secondary,
      ),
    );

  const response = await interaction.reply({
    embeds: [buildEmbed()],
    components: pages.length > 1 ? [buildRow()] : [],
    withResponse: true,
  });

  const message = response.resource?.message;
  if (pages.length <= 1) return;

  const owner = `<@${ownerId}>`;
  const collector = message?.createMessageComponentCollector({
    time: 5 * 60_000,
  });

  collector?.on("collect", async (i) => {
    const action = resolveLibraryAction(
      i.customId,
      i.user.id === ownerId,
      locked,
    );
    if (action === "deny-lock") {
      await i.reply({
        content: t("library.lock.denyLock", { owner }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (action === "deny-turn") {
      await i.reply({
        content: t("library.lock.denyTurn", { owner }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (action === "toggle-lock") locked = !locked;
    else pageIndex = nextPageIndex(i.customId, pageIndex, pages.length);
    await i.update({ embeds: [buildEmbed()], components: [buildRow()] });
  });

  // Disable the buttons once the collector times out so they don't sit live.
  collector?.on("end", async () => {
    const dead = buildRow();
    dead.components.forEach((b) => b.setDisabled(true));
    await message?.edit({ components: [dead] }).catch(() => {});
  });
}
