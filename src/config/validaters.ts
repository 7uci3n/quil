import { CONFIG } from "./resolved.js";
import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { t } from '../lib/i18n.js';

import type { APIInteractionGuildMember} from 'discord.js'
const SUPERUSER_IDS = [
  process.env.SUPERUSER_IDS?.split(",").map((s) => s.trim()) ?? [],
].flat();

const TEST_GUILD_IDS = [
  process.env.TEST_GUILD_IDS?.split(",").map((s) => s.trim()) ?? [],
].flat();

export function memberRoleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
  if (!member) return [];
  // Full GuildMember
  if ('roles' in member && member.roles && 'cache' in member.roles) {
    return [...member.roles.cache.keys()];
  }
  // APIInteractionGuildMember
  if (Array.isArray(member.roles)) return member.roles as string[];
  return [];
}

export function hasAnyRole(
  member: GuildMember | APIInteractionGuildMember | null,
  allowed: string[]
) {
  if (!allowed?.length) return false;
  const have = new Set(memberRoleIds(member));
  return allowed.some((rid) => have.has(rid));
}

export function isAdmin(member: GuildMember | APIInteractionGuildMember | null): boolean {
  try {
    return !!(
      member &&
      "permissions" in member &&
      typeof member.permissions === 'object' &&
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
  allowed: string[]
) {
  return hasAnyRole(member, allowed) || isAdmin(member) || isDevBypass(ix);
}

export function validateCommandPermissions(
  ix: ChatInputCommandInteraction, 
  member: GuildMember | null, 
  PERMS: Record<string, string[]>
): boolean {
  const sub = ix.options.getSubcommand();
  
  // Special handling for "show" subcommand - everyone can use it unless explicitly restricted
  if (sub === "show") {
    const showPerms = PERMS.show || [];
    const canShow = showPerms.length === 0 || hasAnyRole(member, showPerms) || isAdmin(member) || isDevBypass(ix);
    if (!canShow) {
      ix.reply({ ephemeral: true, content: "You don't have permission to use this." });
      return false;
    }
    return true;
  }
  
  // For all other subcommands, check specific permissions
  const allowedRoles = PERMS[sub as keyof typeof PERMS] || [];
  const hasPermission = hasAnyRole(member, allowedRoles) || isAdmin(member) || isDevBypass(ix);
  
  if (!hasPermission) {
    ix.reply({ ephemeral: true, content: "You don't have permission to use this." });
    return false;
  }
  
  return true;
}

/**
 * Gate a subcommand behind one or more role IDs.
 * Also passes for server Administrators.
 * Replies with an ephemeral error and returns undefined on failure;
 * returns the fetched GuildMember on success.
 *
 * Usage:
 *   const member = await requireRole(interaction, CONFIG.guild?.config.roles.member.id, 'charedit.crewOnly');
 *   if (!member) return;
 */
export async function requireRole(
  interaction: ChatInputCommandInteraction,
  roleIds: string | string[] | undefined,
  errorKey = 'common.errors.noRole',
): Promise<GuildMember | undefined> {
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  const ids = (Array.isArray(roleIds) ? roleIds : [roleIds]).filter((id): id is string => !!id);
  if (!member || (!hasAnyRole(member, ids) && !isAdmin(member))) {
    await interaction.reply({ content: t(errorKey), flags: MessageFlags.Ephemeral });
    return undefined;
  }
  return member;
}

/**
 * Gate a command/subcommand behind one or more channel IDs.
 * Only enforced when the interaction originates from the configured guild.
 * By default also accepts threads whose parentId matches an allowed channel (allowThreads: true).
 * Replies ephemeral and returns false on failure; returns true on success.
 *
 * Usage:
 *   if (!await requireChannel(interaction, CONFIG.guild?.config.channels.charSubmissions)) return;
 *   if (!await requireChannel(ix, [CHANNEL_A, CHANNEL_B], { errorKey: 'sell.notInResourceChannel' })) return;
 */
export async function requireChannel(
  interaction: ChatInputCommandInteraction,
  channelIds: (string | null | undefined) | (string | null | undefined)[],
  options: {
    allowThreads?: boolean; // default: true — also passes for threads whose parentId matches
    errorKey?: string;      // default: 'common.notInChannel'
  } = {}
): Promise<boolean> {
  const { allowThreads = true, errorKey = 'common.notInChannel' } = options;

  // Only enforce in the configured guild so dev/test servers aren't blocked
  if (interaction.guildId !== CONFIG.guild?.id) return true;

  const ids = (Array.isArray(channelIds) ? channelIds : [channelIds]).filter((id): id is string => !!id);
  // Guard not configured — skip
  if (ids.length === 0) return true;

  const parentId =
    allowThreads && interaction.channel && 'parentId' in interaction.channel
      ? interaction.channel.parentId
      : null;

  const inChannel = ids.some(id => id === interaction.channelId || (parentId !== null && id === parentId));

  if (!inChannel) {
    await interaction.reply({
      content: t(errorKey, { channel: `<#${ids[0]}>` }),
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}
