import { userMention, type ChatInputCommandInteraction } from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { proficiencyFor } from "../domain/xp.js";
import { t } from "../lib/i18n.js";
import { log } from "../lib/log.js";

const REWARDS_CHANNEL_ID = CONFIG.guild?.config.channels?.resourceTracking;

/**
 * Build the level-change announcement (pings the user). Pure aside from the
 * random flavor-variant pick in t(); split out so it can be unit-tested without
 * a Discord channel.
 */
export function levelChangeMessage(
  userId: string,
  displayName: string,
  newLevel: number,
  diff: number,
): string {
  const mention = userMention(userId);
  return diff > 0
    ? t("reward.announce.levelUp", {
        mention,
        display: displayName,
        level: newLevel,
        prof: proficiencyFor(newLevel),
      })
    : t("reward.announce.levelDown", {
        mention,
        display: displayName,
        level: newLevel,
      });
}

/**
 * Announce a character level change in the rewards/resource-tracking channel
 * (falling back to the invoking channel). Used by /reward and /resource.
 */
export async function announceLevelChange(
  ix: ChatInputCommandInteraction,
  userId: string,
  displayName: string,
  newLevel: number,
  diff: number,
): Promise<void> {
  const msg = levelChangeMessage(userId, displayName, newLevel, diff);
  const guild = ix.guild;
  const target =
    (guild &&
      REWARDS_CHANNEL_ID &&
      guild.channels.cache.get(REWARDS_CHANNEL_ID)) ||
    ix.channel;
  log.info(msg);
  // @ts-expect-error text-channel narrowing omitted
  await target?.send(msg);
}
