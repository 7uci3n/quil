import advancement from "../../config/advancement.json" with { type: "json" };

export type AdvancementRow = { level: number; xp: number; proficiency: number };
export type AdvancementTable = {
  levels: AdvancementRow[];
  maxLevel: number;
};

const raw = advancement as AdvancementTable;

// Work on a sorted COPY — never mutate the imported JSON module.
const table: AdvancementTable = {
  ...raw,
  levels: [...raw.levels].sort((a, b) => a.xp - b.xp),
};

/** Minimum XP required to be at `level`. Clamped to table range. */
export function xpNeededFor(level: number): number {
  const lv = clampLevel(level);
  return table.levels[lv - 1]!.xp;
}

/** Proficiency bonus for arbitrary level (clamped). */
export function proficiencyFor(level: number): number {
  const lv = clampLevel(level);
  return table.levels[lv - 1]!.proficiency;
}

/** Compute level for a given total XP (1..maxLevel). */
export function levelForXP(totalXP: number): number {
  const xp = Math.max(0, Math.floor(totalXP));
  // last level whose floor XP <= xp
  let lo = 0,
    hi = table.levels.length - 1,
    ans = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (table.levels[mid]!.xp <= xp) {
      ans = table.levels[mid]!.level;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** XP floor for current level and next level’s floor (or null if maxed). */
export function bandFor(level: number): { curr: number; next: number | null } {
  const lv = clampLevel(level);
  const curr = table.levels[lv - 1]!.xp;
  const next = lv < table.maxLevel ? table.levels[lv]!.xp : null;
  return { curr, next };
}

export type PlayerProgress = {
  xp: number; // absolute xp total
  level: number; // cached level (optional to trust)
};

/** Apply XP delta and auto-level (up or down). Returns new snapshot + level change. */
export function applyXP(
  prev: PlayerProgress,
  delta: number,
): PlayerProgress & { levelsChanged: number; proficiency: number } {
  // clamp XP >= 0; cap effective level to maxLevel rules
  const newXP = Math.max(0, Math.floor(prev.xp + Math.floor(delta)));
  const newLevel = levelForXP(newXP);
  const levelsChanged = newLevel - prev.level;

  return {
    xp: newXP,
    level: newLevel,
    levelsChanged,
    proficiency: proficiencyFor(newLevel),
  };
}

function clampLevel(level: number): number {
  return Math.min(Math.max(1, Math.floor(level)), table.maxLevel);
}
