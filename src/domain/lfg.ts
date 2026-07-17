import { EmbedBuilder } from "discord.js";
import { levelForXP } from "./xp.js";
import { t } from "../lib/i18n.js";

export type LfgTier = "low" | "mid" | "high" | "epic" | "pbp";
export const ORDER: LfgTier[] = ["pbp", "low", "mid", "high", "epic"];

export type LfgEntry = {
  userId: string;
  guildId: string;
  name: string; // display name shown on the board
  startedAt: number; // ms since epoch when first tier was enabled
  low: 0 | 1;
  mid: 0 | 1;
  high: 0 | 1;
  epic: 0 | 1;
  pbp: 0 | 1;
  updatedAt: number;
};

export function autoTierForLevelFromXP(xp: number): Exclude<LfgTier, "pbp"> {
  const lvl = levelForXP(xp);
  if (lvl < 5) return "low";
  if (lvl < 11) return "mid";
  if (lvl < 17) return "high";
  return "epic";
}

export function anyTierOn(e: LfgEntry): boolean {
  return !!(e.low || e.mid || e.high || e.epic || e.pbp);
}

export function tiersOf(e: LfgEntry): LfgTier[] {
  const out: LfgTier[] = [];
  if (e.pbp) out.push("pbp");
  if (e.low) out.push("low");
  if (e.mid) out.push("mid");
  if (e.high) out.push("high");
  if (e.epic) out.push("epic");
  return out;
}

export function setTier(
  e: LfgEntry,
  tier: LfgTier,
  on: boolean,
  nowMs = Date.now(),
): LfgEntry {
  const wasAny = anyTierOn(e);
  const next = { ...e, updatedAt: nowMs };
  next[tier] = (on ? 1 : 0) as 0 | 1;
  // if enabling and previously nothing was on, stamp startedAt
  if (on && !wasAny) next.startedAt = nowMs;
  // if disabling and nothing remains, keep startedAt (history) or you can clear it
  return next;
}

export function clearAll(e: LfgEntry, nowMs = Date.now()): LfgEntry {
  return { ...e, low: 0, mid: 0, high: 0, epic: 0, pbp: 0, updatedAt: nowMs };
}

export type LfgSectionRow = {
  userId: string;
  name: string;
  ageDays: number;
  startedAt: number;
};
export type LfgList = {
  pbp: LfgSectionRow[];
  low: LfgSectionRow[];
  mid: LfgSectionRow[];
  high: LfgSectionRow[];
  epic: LfgSectionRow[];
};

export function aggregateList(
  entries: LfgEntry[],
  nowMs = Date.now(),
): LfgList {
  const mk = (e: LfgEntry): LfgSectionRow => ({
    userId: e.userId,
    name: e.name,
    startedAt: e.startedAt,
    ageDays: Math.max(
      0,
      Math.floor((nowMs - e.startedAt) / (24 * 60 * 60 * 1000)),
    ),
  });
  const list: LfgList = { pbp: [], low: [], mid: [], high: [], epic: [] };
  for (const e of entries) {
    if (e.pbp) list.pbp.push(mk(e));
    if (e.low) list.low.push(mk(e));
    if (e.mid) list.mid.push(mk(e));
    if (e.high) list.high.push(mk(e));
    if (e.epic) list.epic.push(mk(e));
  }
  for (const k of ORDER)
    (list as Record<LfgTier, LfgSectionRow[]>)[k].sort(
      (a: LfgSectionRow, b: LfgSectionRow) => a.startedAt - b.startedAt,
    );
  return list;
}

export function buildLfgEmbed(list: LfgList): EmbedBuilder {
  const eb = new EmbedBuilder()
    .setTitle(t("lfg.board.title"))
    .setColor(0x4ea8de);

  const section = (rows: LfgSectionRow[], tier: LfgTier) =>
    rows.length
      ? rows
          .map(
            (r) =>
              `${r.name}${r.ageDays > 0 ? t("lfg.board.ageSuffix", { days: r.ageDays, s: r.ageDays > 1 ? "S" : "" }) : ""}`,
          )
          .join("\n")
      : t(`lfg.board.empty.${tier}`);

  eb.addFields(
    { name: t("lfg.board.fields.pbp"), value: section(list.pbp, "pbp") },
    {
      name: t("lfg.board.fields.low"),
      value: section(list.low, "low"),
      inline: true,
    },
    {
      name: t("lfg.board.fields.mid"),
      value: section(list.mid, "mid"),
      inline: true,
    },
    {
      name: t("lfg.board.fields.high"),
      value: section(list.high, "high"),
      inline: true,
    },
    {
      name: t("lfg.board.fields.epic"),
      value: section(list.epic, "epic"),
      inline: true,
    },
  );
  return eb;
}

export function cutoffMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
