import { CONFIG } from "./resolved.js";
import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { t } from "../lib/i18n.js";

import type { APIInteractionGuildMember } from "discord.js";

type ChannelIdInput =
  | (string | null | undefined)
  | (string | null | undefined)[];

/** Normalize one-or-many, possibly-nullish ids into a clean string[]. */
function toIds(input: ChannelIdInput): string[] {
  return (Array.isArray(input) ? input : [input]).filter(
    (id): id is string => !!id,
  );
}

/** The parent channel id when the interaction is inside a thread/forum post. */
function threadParentId(ix: ChatInputCommandInteraction): string | null {
  const ch = ix.channel;
  return ch && "parentId" in ch ? (ch.parentId ?? null) : null;
}

// Validated + parsed once at config load (see resolved.ts), not read ad-hoc here.
const SUPERUSER_IDS = CONFIG.security.superuserIds;
const TEST_GUILD_IDS = CONFIG.security.testGuildIds;

export function memberRoleIds(
  member: GuildMember | APIInteractionGuildMember | null,
): string[] {
  if (!member) return [];
  // Full GuildMember
  if ("roles" in member && member.roles && "cache" in member.roles) {
    return [...member.roles.cache.keys()];
  }
  // APIInteractionGuildMember
  if (Array.isArray(member.roles)) return member.roles as string[];
  return [];
}

export function hasAnyRole(
  member: GuildMember | APIInteractionGuildMember | null,
  allowed: string[],
) {
  if (!allowed?.length) return false;
  const have = new Set(memberRoleIds(member));
  return allowed.some((rid) => have.has(rid));
}

export function isAdmin(
  member: GuildMember | APIInteractionGuildMember | null,
): boolean {
  try {
    return !!(
      member &&
      "permissions" in member &&
      typeof member.permissions === "object" &&
      member.permissions?.has?.(PermissionFlagsBits.Administrator)
    );
  } catch {
    return false;
  }
}

export function isDevBypass(ix: ChatInputCommandInteraction) {
  const isSuper = SUPERUSER_IDS.includes(ix.user.id);
  if (!isSuper) return false;
  // Only bypass when not in prod OR specifically in a test guild
  const notProd = CONFIG.env !== "prod";
  const inTestGuild = ix.guildId ? TEST_GUILD_IDS.includes(ix.guildId) : false;
  return notProd || inTestGuild;
}

export function canBypass(
  ix: ChatInputCommandInteraction,
  member: GuildMember | APIInteractionGuildMember | null,
  allowed: string[],
) {
  return hasAnyRole(member, allowed) || isAdmin(member) || isDevBypass(ix);
}

/**
 * Gate an action behind one or more role ids (server Administrators always pass).
 * On failure replies ephemerally with `t(errorKey)` and returns undefined;
 * on success returns the fetched member so callers can reuse it. See ADR-0007.
 */
export async function requireRole(
  interaction: ChatInputCommandInteraction,
  roleIds: string | string[] | undefined,
  errorKey = "common.noRole",
): Promise<GuildMember | undefined> {
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  if (!member || !(hasAnyRole(member, toIds(roleIds)) || isAdmin(member))) {
    await interaction.reply({
      content: t(errorKey),
      flags: MessageFlags.Ephemeral,
    });
    return undefined;
  }
  return member;
}

/**
 * Gate an action behind one or more channel ids. Only enforced inside the
 * configured guild; an empty id list is treated as "not configured" (passes).
 * With allowThreads (default true) a thread/forum-post whose parent matches also
 * passes — required for forum channels. Replies ephemerally on failure. ADR-0007.
 */
export async function requireChannel(
  interaction: ChatInputCommandInteraction,
  channelIds: ChannelIdInput,
  options: { allowThreads?: boolean; errorKey?: string } = {},
): Promise<boolean> {
  const { allowThreads = true, errorKey = "common.notInChannel" } = options;
  if (interaction.guildId !== CONFIG.guild?.id) return true;

  const ids = toIds(channelIds);
  if (ids.length === 0) return true;

  const parentId = allowThreads ? threadParentId(interaction) : null;
  const inChannel = ids.some(
    (id) => id === interaction.channelId || id === parentId,
  );
  if (!inChannel) {
    await interaction.reply({
      content: t(errorKey, { channel: `<#${ids[0]}>` }),
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

export function validateCommandPermissions(
  ix: ChatInputCommandInteraction,
  member: GuildMember | null,
  PERMS: Record<string, string[]>,
): boolean {
  const sub = ix.options.getSubcommand();

  // Special handling for "show" subcommand - everyone can use it unless explicitly restricted
  if (sub === "show") {
    const showPerms = PERMS.show || [];
    const canShow =
      showPerms.length === 0 ||
      hasAnyRole(member, showPerms) ||
      isAdmin(member) ||
      isDevBypass(ix);
    if (!canShow) {
      ix.reply({
        ephemeral: true,
        content: "You don't have permission to use this.",
      });
      return false;
    }
    return true;
  }

  // For all other subcommands, check specific permissions
  const allowedRoles = PERMS[sub as keyof typeof PERMS] || [];
  const hasPermission =
    hasAnyRole(member, allowedRoles) || isAdmin(member) || isDevBypass(ix);

  if (!hasPermission) {
    ix.reply({
      ephemeral: true,
      content: "You don't have permission to use this.",
    });
    return false;
  }

  return true;
}
