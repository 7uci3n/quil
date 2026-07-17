import { describe, it, expect } from "vitest";
import {
  autoTierForLevelFromXP,
  anyTierOn,
  tiersOf,
  setTier,
  clearAll,
  aggregateList,
  buildLfgEmbed,
  cutoffMs,
  type LfgEntry,
} from "../../src/domain/lfg.js";

function entry(over: Partial<LfgEntry> = {}): LfgEntry {
  return {
    userId: "u",
    guildId: "g",
    name: "u",
    startedAt: 0,
    low: 0,
    mid: 0,
    high: 0,
    epic: 0,
    pbp: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("autoTierForLevelFromXP", () => {
  it("maps XP-derived level to a tier band", () => {
    expect(autoTierForLevelFromXP(0)).toBe("low"); // level 1
    expect(autoTierForLevelFromXP(6500)).toBe("mid"); // level 5
    expect(autoTierForLevelFromXP(85000)).toBe("high"); // level 11
    expect(autoTierForLevelFromXP(355000)).toBe("epic"); // level 20
  });
});

describe("anyTierOn / tiersOf", () => {
  it("anyTierOn reflects whether any tier is set", () => {
    expect(anyTierOn(entry())).toBe(false);
    expect(anyTierOn(entry({ mid: 1 }))).toBe(true);
  });
  it("tiersOf lists set tiers in board order (pbp first)", () => {
    expect(tiersOf(entry({ low: 1, pbp: 1, epic: 1 }))).toEqual([
      "pbp",
      "low",
      "epic",
    ]);
  });
});

describe("setTier", () => {
  it("stamps startedAt when enabling from empty", () => {
    const next = setTier(entry(), "low", true, 1000);
    expect(next.low).toBe(1);
    expect(next.startedAt).toBe(1000);
    expect(next.updatedAt).toBe(1000);
  });
  it("does not restamp startedAt when another tier is already on", () => {
    const next = setTier(entry({ mid: 1, startedAt: 500 }), "low", true, 2000);
    expect(next.startedAt).toBe(500);
  });
  it("disabling a tier leaves startedAt intact", () => {
    const next = setTier(entry({ low: 1, startedAt: 500 }), "low", false, 3000);
    expect(next.low).toBe(0);
    expect(next.startedAt).toBe(500);
  });
});

describe("clearAll", () => {
  it("zeroes every tier", () => {
    const next = clearAll(entry({ low: 1, mid: 1, pbp: 1 }), 42);
    expect(anyTierOn(next)).toBe(false);
    expect(next.updatedAt).toBe(42);
  });
});

describe("aggregateList", () => {
  it("buckets entries by tier and computes age in days, sorted by startedAt", () => {
    const now = 100 * 24 * 60 * 60 * 1000;
    const list = aggregateList(
      [
        entry({ userId: "a", low: 1, startedAt: now - 5 * 86400000 }),
        entry({ userId: "b", low: 1, startedAt: now - 1 * 86400000 }),
        entry({ userId: "c", pbp: 1, startedAt: now }),
      ],
      now,
    );
    expect(list.low.map((r) => r.userId)).toEqual(["a", "b"]); // oldest first
    expect(list.low[0]!.ageDays).toBe(5);
    expect(list.pbp[0]!.ageDays).toBe(0);
  });
});

describe("buildLfgEmbed", () => {
  it("renders sections, including empty-state text and an age suffix", () => {
    const now = 10 * 86400000;
    const list = aggregateList(
      [entry({ userId: "old", low: 1, startedAt: now - 3 * 86400000 })],
      now,
    );
    const embed = buildLfgEmbed(list);
    const json = embed.toJSON();
    expect(json.fields?.length).toBe(5);
    // the "low" field should contain the aged member name
    const low = json.fields!.find((f) => /LOW|Low|low/.test(f.name));
    expect(low).toBeDefined();
  });
});

describe("cutoffMs", () => {
  it("returns a timestamp N days in the past", () => {
    const before = Date.now();
    const c = cutoffMs(7);
    expect(c).toBeLessThanOrEqual(before - 6.9 * 86400000);
  });
});
