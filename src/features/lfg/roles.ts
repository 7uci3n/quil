// LFG Discord-role synchronisation (extracted from commands/lfg.ts).
import type { GuildMember } from "discord.js";
import { CONFIG } from "../../config/resolved.js";
import { anyTierOn, type LfgEntry, type LfgTier } from "../../domain/lfg.js";

const LFG_FEATURE = CONFIG.guild?.config.features?.lfg;

export const LFG_BASE_ROLE_ID = LFG_FEATURE?.roles?.lfg;
export const LFG_TIER_ROLE_IDS: Record<LfgTier, string | undefined> = {
  low: LFG_FEATURE?.tiers?.low,
  mid: LFG_FEATURE?.tiers?.mid,
  high: LFG_FEATURE?.tiers?.high,
  epic: LFG_FEATURE?.tiers?.epic,
  pbp: LFG_FEATURE?.tiers?.pbp,
};

export async function addRoleById(member: GuildMember, roleId?: string | null) {
  if (!roleId) return;
  if (member.roles.cache.has(roleId)) return;
  await member.roles.add(roleId).catch(() => {});
}

export async function removeRoleById(
  member: GuildMember,
  roleId?: string | null,
) {
  if (!roleId) return;
  if (!member.roles.cache.has(roleId)) return;
  await member.roles.remove(roleId).catch(() => {});
}

export async function syncRolesFor(member: GuildMember, entry: LfgEntry) {
  // Base LFG role
  if (anyTierOn(entry)) {
    await addRoleById(member, LFG_BASE_ROLE_ID);
  } else {
    await removeRoleById(member, LFG_BASE_ROLE_ID);
  }
  // Tier roles
  const shouldHave: Array<[LfgTier, boolean]> = [
    ["low", !!entry.low],
    ["mid", !!entry.mid],
    ["high", !!entry.high],
    ["epic", !!entry.epic],
    ["pbp", !!entry.pbp],
  ];
  for (const [tier, on] of shouldHave) {
    const rid = LFG_TIER_ROLE_IDS[tier];
    if (on) await addRoleById(member, rid);
    else await removeRoleById(member, rid);
  }
}
