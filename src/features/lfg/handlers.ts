// LFG subcommand handlers (extracted from commands/lfg.ts — ADR-0003 / ARCH-4).
// Mutations are atomic + roles reconciled from the authoritative entry (ADR-0005).
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  userMention,
  MessageFlags,
} from "discord.js";
import { CONFIG } from "../../config/resolved.js";
import { hasAnyRole, isAdmin } from "../../config/validators.js";
import { getDb } from "../../db/index.js";
import {
  getLfgEntry,
  listAllLfg,
  purgeLfgBefore,
  applyLfgMutation,
} from "../../db/lfg.js";
import {
  buildLfgEmbed,
  aggregateList,
  setTier,
  clearAll,
  anyTierOn,
  type LfgEntry,
  type LfgTier,
  ORDER as LFG_ORDER,
} from "../../domain/lfg.js";
import { syncRolesFor } from "./roles.js";
import { refreshBoard } from "./board.js";
import { levelForXP } from "../../domain/xp.js";
import { t } from "../../lib/i18n.js";

/* ──────────────────────────────────────────────────────────────────────────────
  CONFIG / PERMS
────────────────────────────────────────────────────────────────────────────── */
const CFG = CONFIG.guild!.config;
const ROLES = CFG.roles;

const PERMS = {
  // toggle/add/remove are self-service (everyone); only purge & post are gated.
  postBoard: [ROLES.moderator.id, ROLES.admin.id],
  purge: [ROLES.moderator.id, ROLES.admin.id],
};

/* ──────────────────────────────────────────────────────────────────────────────
  HELPERS
────────────────────────────────────────────────────────────────────────────── */
async function getCharlogXPName(
  userId: string,
): Promise<{ xp: number; name: string } | null> {
  const row = getDb()
    .prepare(`SELECT xp, name FROM charlog WHERE userId = ? AND active = 1`)
    .get(userId) as { xp: number; name: string } | undefined;
  return row ?? null;
}

type TierChoice = "auto" | LfgTier | "all";

function parseTier(choice?: string | null): TierChoice | null {
  if (!choice) return "auto";
  const v = choice.toLowerCase();
  if (v === "auto" || v === "all") return v as TierChoice;
  if (["low", "mid", "high", "epic", "pbp"].includes(v)) return v as LfgTier;
  return null;
}

function defaultEntry(userId: string, guildId: string): LfgEntry {
  const now = Date.now();
  return {
    userId,
    guildId,
    name: userMention(userId),
    startedAt: now,
    low: 0,
    mid: 0,
    high: 0,
    epic: 0,
    pbp: 0,
    updatedAt: now,
  };
}

async function resolveAutoTier(
  userId: string,
): Promise<Exclude<LfgTier, "pbp"> | null> {
  const row = await getCharlogXPName(userId);
  if (!row) return null;
  const level = levelForXP(row.xp);
  if (level < 5) return "low";
  if (level < 11) return "mid";
  if (level < 17) return "high";
  return "epic";
}

/** Resolve a tier choice to a concrete tier, or an i18n error key for auto/all. */
async function resolveConcreteTier(
  ix: ChatInputCommandInteraction,
  choice: Exclude<TierChoice, null>,
): Promise<{ tier: LfgTier } | { errorKey: string }> {
  if (choice === "auto") {
    const auto = await resolveAutoTier(ix.user.id);
    return auto
      ? { tier: auto }
      : { errorKey: "lfg.errors.couldNotDetermineLevel" };
  }
  if (choice === "all") return { errorKey: "lfg.errors.useRemoveAllHint" };
  return { tier: choice };
}

function activeTierList(entry: LfgEntry): string {
  const active = LFG_ORDER.filter((tier) => entry[tier])
    .map((tier) => `\`${tier}\``)
    .join(", ");
  return active || t("lfg.toggle.noneList");
}

/* ──────────────────────────────────────────────────────────────────────────────
  HANDLERS
────────────────────────────────────────────────────────────────────────────── */
export async function handleToggle(ix: ChatInputCommandInteraction) {
  const choice = parseTier(ix.options.getString("tier"));
  if (!choice)
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.unknownTier"),
    });

  const resolved = await resolveConcreteTier(ix, choice);
  if ("errorKey" in resolved)
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t(resolved.errorKey),
    });
  const tier = resolved.tier;

  const userId = ix.user.id;
  const guildId = ix.guild!.id;
  let wasOn = false;
  const entry = await applyLfgMutation(
    userId,
    guildId,
    () => defaultEntry(userId, guildId),
    (e) => {
      wasOn = !!e[tier];
      return setTier(e, tier, !wasOn, Date.now());
    },
  );

  const member = await ix.guild!.members.fetch(userId);
  await syncRolesFor(member, entry);
  await refreshBoard(ix);

  return ix.reply({
    content: t(wasOn ? "lfg.toggle.removed" : "lfg.toggle.added", {
      tierUpper: tier.toUpperCase(),
      activeList: activeTierList(entry),
    }),
  });
}

export async function handleAdd(ix: ChatInputCommandInteraction) {
  const choice = parseTier(ix.options.getString("tier"));
  if (!choice)
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.unknownTier"),
    });

  const resolved = await resolveConcreteTier(ix, choice);
  if ("errorKey" in resolved)
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t(resolved.errorKey),
    });
  const tier = resolved.tier;

  const userId = ix.user.id;
  const guildId = ix.guild!.id;
  let already = false;
  const entry = await applyLfgMutation(
    userId,
    guildId,
    () => defaultEntry(userId, guildId),
    (e) => {
      if (e[tier]) {
        already = true;
        return e;
      }
      return setTier(e, tier, true, Date.now());
    },
  );

  if (already)
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.alreadyInTier", { tier }),
    });

  const member = await ix.guild!.members.fetch(userId);
  await syncRolesFor(member, entry);
  await refreshBoard(ix);

  return ix.reply({
    content: t("lfg.add.success", { display: member.displayName, tier }),
  });
}

export async function handleRemove(ix: ChatInputCommandInteraction) {
  const choice = parseTier(ix.options.getString("tier"));
  if (!choice)
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.unknownTier"),
    });

  const userId = ix.user.id;
  const guildId = ix.guild!.id;
  const existing = await getLfgEntry(userId, guildId);
  if (!existing)
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.notOnBoard"),
    });

  if (choice === "all") {
    const entry = await applyLfgMutation(
      userId,
      guildId,
      () => defaultEntry(userId, guildId),
      (e) => clearAll(e, Date.now()),
    );
    const member = await ix.guild!.members.fetch(userId);
    await syncRolesFor(member, entry);
    await refreshBoard(ix);
    return ix.reply({ content: t("lfg.remove.allSuccess") });
  }

  const tier = choice as LfgTier;
  if (!existing[tier])
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.notInTier", { tier }),
    });

  const entry = await applyLfgMutation(
    userId,
    guildId,
    () => defaultEntry(userId, guildId),
    (e) => setTier(e, tier, false, Date.now()),
  );
  const member = await ix.guild!.members.fetch(userId);
  await syncRolesFor(member, entry);
  await refreshBoard(ix);

  return ix.reply({
    content: t("lfg.remove.oneSuccess", { display: member.displayName, tier }),
  });
}

export async function handleStatus(ix: ChatInputCommandInteraction) {
  const entry = await getLfgEntry(ix.user.id, ix.guild!.id);
  if (!entry || !anyTierOn(entry)) {
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.notOnBoard"),
    });
  }
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - entry.startedAt) / (24 * 60 * 60 * 1000)),
  );
  const tiers = LFG_ORDER.filter((tier) => !!entry[tier]);
  const embed = new EmbedBuilder()
    .setTitle(t("lfg.status.title"))
    .addFields(
      {
        name: t("lfg.status.fields.tiers"),
        value: tiers.map((tier) => `\`${tier}\``).join(", ") || "—",
        inline: true,
      },
      {
        name: t("lfg.status.fields.waiting"),
        value: ageDays
          ? `${ageDays} day${ageDays > 1 ? "s" : ""}`
          : t("lfg.status.fields.waitingLessThanDay"),
        inline: true,
      },
    )
    .setColor(0x4ea8de);

  return ix.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
}

export async function handleList(ix: ChatInputCommandInteraction) {
  const post = ix.options.getBoolean("post") ?? false;
  const entries = await listAllLfg(ix.guild!.id);
  const embed = buildLfgEmbed(aggregateList(entries));

  // Always show a preview ephemerally (public board goes out only if `post`)
  await ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  if (!post) return;

  // Gate posting to mods/admins
  const member = ix.member as GuildMember | null;
  const allowed =
    hasAnyRole(member, PERMS.postBoard.filter(Boolean) as string[]) ||
    isAdmin(member);
  if (!allowed) {
    return ix.followUp({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.list.cannotPost"),
    });
  }

  await refreshBoard(ix, "manual-post");
  await ix.followUp({ content: t("lfg.list.posted") });
}

export async function handlePurge(ix: ChatInputCommandInteraction) {
  const days = ix.options.getInteger("days", true);
  const scope = (ix.options.getString("scope") as "all" | "pbp") ?? "all";

  const member = ix.member as GuildMember | null;
  const allowed =
    hasAnyRole(member, PERMS.purge.filter(Boolean) as string[]) ||
    isAdmin(member);
  if (!allowed) {
    return ix.reply({
      flags: MessageFlags.Ephemeral,
      content: t("lfg.errors.notAllowed"),
    });
  }

  // The per-user member fetch loop can exceed Discord's 3s window — defer first.
  await ix.deferReply();

  const guildId = ix.guild!.id;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const results = await purgeLfgBefore(guildId, cutoff, scope);

  // Reconcile roles from the authoritative post-purge entry (null = removed).
  for (const { userId, entry } of results) {
    const m = await ix.guild!.members.fetch(userId).catch(() => null);
    if (!m) continue;
    await syncRolesFor(m, entry ?? defaultEntry(userId, guildId));
  }

  await refreshBoard(ix, "purge");
  return ix.editReply({
    content: results.length
      ? t("lfg.purge.resultSome", {
          count: results.length,
          days,
          scope,
          suffix: t(
            results.length === 1
              ? "lfg.purge.suffixOne"
              : "lfg.purge.suffixMany",
          ),
        })
      : t("lfg.purge.resultNone", { days, scope }),
  });
}
