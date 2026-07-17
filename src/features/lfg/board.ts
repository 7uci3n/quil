// LFG sticky-board refresh (extracted from commands/lfg.ts).
import type { ChatInputCommandInteraction } from "discord.js";
import { CONFIG } from "../../config/resolved.js";
import { listAllLfg } from "../../db/lfg.js";
import { buildLfgEmbed, aggregateList } from "../../domain/lfg.js";
import { getGuildState, setGuildState } from "../../domain/guildState.js";
import { log } from "../../lib/log.js";

const LFG_BOARD_CHANNEL_ID =
  CONFIG.guild?.config.features?.lfg?.channels?.board;
const BOARD_KEY = "lfg_board_message_id";

export async function refreshBoard(
  ix: ChatInputCommandInteraction,
  reason?: string,
) {
  if (!ix.guild) return;
  const guildId = ix.guild.id;
  const entries = await listAllLfg(guildId);
  const embed = buildLfgEmbed(aggregateList(entries));

  // If no channel configured, just bail silently.
  const boardChanId = LFG_BOARD_CHANNEL_ID;
  if (!boardChanId) return;

  // Try to edit the sticky message; else send new and store id.
  const chan = ix.guild.channels.cache.get(boardChanId);
  if (!chan || !("send" in chan)) return;

  const existingId = await getGuildState(guildId, BOARD_KEY);
  if (existingId) {
    try {
      const msg = await chan.messages.fetch(existingId);
      await msg.edit({ embeds: [embed] });
      return;
    } catch {
      // falls through to create new
    }
  }
  const sent = await chan.send({ embeds: [embed] });
  log.info(`LFG: Posted new board message (${reason ?? "auto"})`);
  await setGuildState(guildId, BOARD_KEY, sent.id);
}
