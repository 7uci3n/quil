import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { CONFIG } from "../config/resolved.js";
import { t } from "../lib/i18n.js";
import {
  getPlayer,
  getPlayerCC,
  adjustResource,
  spendResources,
} from "../utils/db_queries.js";
import { updateDTP } from "../domain/resource.js";
import { toCp, toGp } from "../utils/money.js";

const CFG = CONFIG.guild!.config;
const RESOURCE_CHANNEL_ID = CFG.channels?.resourceTracking || null;
const DTP_CHANNEL_ID = CFG.channels?.dtpTracking || null;
const MAGIC_ITEMS_CHANNEL_ID = CFG.channels?.magicItems || null;
const CC_CHANNEL_ID = CFG.channels?.crewCoins || null;

export const data = new SlashCommandBuilder()
  .setName("buy")
  .setDescription(
    "Buy an item for GP, GT, and/or DTP and record it to the resource log.",
  )
  .addStringOption((opt) =>
    opt
      .setName("item")
      .setDescription("What are you buying?")
      .setRequired(true),
  )
  .addNumberOption((opt) =>
    opt
      .setName("gp")
      .setDescription("GP (Gold Pieces) to spend")
      .setMinValue(0),
  )
  .addNumberOption((opt) =>
    opt
      .setName("gt")
      .setDescription("GT (Golden Tickets) to spend")
      .setMinValue(0),
  )
  .addNumberOption((opt) =>
    opt
      .setName("dtp")
      .setDescription("DTP (Downtime Points) to spend")
      .setMinValue(0),
  )
  .addNumberOption((opt) =>
    opt.setName("cc").setDescription("CC (Crew Coins) to spend").setMinValue(0),
  );

export async function execute(ix: ChatInputCommandInteraction) {
  // Channel guard: only allowed in Resource or Magic Items channel (or test override)
  const isInAllowedChannel =
    ix.channelId === RESOURCE_CHANNEL_ID ||
    ix.channelId === MAGIC_ITEMS_CHANNEL_ID ||
    ix.channelId === DTP_CHANNEL_ID ||
    ix.channelId === CC_CHANNEL_ID;
  const isInConfiguredGuild = ix.guildId === CONFIG.guild?.id;

  if (!isInAllowedChannel && isInConfiguredGuild) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("sell.notInResourceChannel"),
    });
    return;
  }

  const member = ix.member as GuildMember;
  const user = member.user;

  const item = ix.options.getString("item", true).trim();
  const gpInput = ix.options.getNumber("gp") ?? 0;
  const gtInput = ix.options.getNumber("gt") ?? 0;
  const dtpInput = ix.options.getNumber("dtp") ?? 0;
  const ccInput = ix.options.getNumber("cc") ?? 0;

  // Permission check: CC is crew+ only
  if (ccInput > 0) {
    const crewRoleId = CFG.roles.member.id;
    const hasCrew = crewRoleId && member.roles.cache.has(crewRoleId);
    if (!hasCrew) {
      await ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t("buy.errors.ccCrewOnly"),
      });
      return;
    }
  }

  // Validation: at least one resource must be specified
  if (gpInput === 0 && gtInput === 0 && dtpInput === 0 && ccInput === 0) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("buy.errors.noResourceSpecified"),
    });
    return;
  }

  // GP is stored as copper — reject sub-cent precision (mirrors /sell).
  if (gpInput > 0 && Math.round(gpInput * 100) !== gpInput * 100) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("sell.errors.invalidPrecision"),
    });
    return;
  }

  // Update DTP if needed
  if (dtpInput > 0) {
    if ((await updateDTP(user.id)) == null) {
      return ix.reply({
        flags: MessageFlags.Ephemeral,
        content: t("dtp.errors.notInSystem", { username: user.username }),
      });
    }
  }

  const row = await getPlayer(user.id);
  if (!row) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("buy.errors.noPlayerRecord", { user: user.username }),
    });
    return;
  }

  // Validate sufficient funds for all requested resources
  const insufficientResources: string[] = [];

  if (gpInput > 0 && row.cp < toCp(gpInput)) {
    insufficientResources.push("💰 GP");
  }
  if (gtInput > 0 && row.tp < gtInput) {
    insufficientResources.push("🎫 GT");
  }
  if (dtpInput > 0 && row.dtp < dtpInput) {
    insufficientResources.push("🔨 DTP");
  }
  // CC is a pooled PLAYER resource — validate against the sum across characters.
  if (ccInput > 0) {
    const poolCC = await getPlayerCC(user.id);
    if (poolCC < ccInput) {
      insufficientResources.push("🪙 CC");
    }
  }

  if (insufficientResources.length > 0) {
    const resourceList = insufficientResources.join(", ");
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("buy.errors.noFunds", { resources: resourceList }),
    });
    return;
  }

  // Character resources (cp/tp/dtp) must not go negative → atomic guarded debit.
  const guardedDebits: { column: string; amount: number }[] = [];
  if (gpInput > 0) guardedDebits.push({ column: "cp", amount: toCp(gpInput) });
  if (gtInput > 0) guardedDebits.push({ column: "tp", amount: gtInput });
  if (dtpInput > 0) guardedDebits.push({ column: "dtp", amount: dtpInput });

  const debited = await spendResources(user.id, guardedDebits);
  if (!debited) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("buy.errors.noFunds", { resources: "the requested amount" }),
    });
    return;
  }

  // CC is a pooled PLAYER resource: validated against the pool above, debited from
  // the active character. It MAY go negative here — the pool stays balanced across
  // the player's characters and is settled on retire. Intentionally not guarded.
  if (ccInput > 0) {
    await adjustResource(user.id, ["cc"], [ccInput * -1]);
  }

  const updated = await getPlayer(user.id);
  if (!updated) {
    await ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("errors.generic"),
    });
    return;
  }

  // Build cost and balance strings for response
  const costParts: string[] = [];
  const balanceParts: string[] = [];

  if (gpInput > 0) {
    costParts.push(`💰 **${gpInput} GP**`);
    balanceParts.push(`💰 **${toGp(updated.cp)} GP**`);
  }
  if (gtInput > 0) {
    costParts.push(`🎫 **${gtInput} GT**`);
    balanceParts.push(`🎫 **${updated.tp} GT**`);
  }
  if (dtpInput > 0) {
    costParts.push(`🔨 **${dtpInput} DTP**`);
    balanceParts.push(`🔨 **${updated.dtp} DTP**`);
  }
  if (ccInput > 0) {
    const poolCC = await getPlayerCC(user.id);
    costParts.push(`🪙 **${ccInput} CC**`);
    balanceParts.push(`🪙 **${poolCC} CC**`);
  }

  const costStr = costParts.join(", ");
  const balanceStr = balanceParts.join(" · ");

  await ix.reply({
    content: t("buy.purchaseSuccessMulti", {
      item,
      cost: costStr,
      balance: balanceStr,
      name: updated.name ?? "",
    }),
  });
}

export default { data, execute };
