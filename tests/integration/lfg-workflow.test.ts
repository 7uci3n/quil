// Integration tests that drive the REAL db/lfg persistence functions.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { createTestDb, cleanupTestDb } from "../fixtures/test-db.js";
import {
  upsertLfgEntry,
  getLfgEntry,
  listAllLfg,
  purgeLfgBefore,
  applyLfgMutation,
} from "../../src/db/lfg.js";
import { setTier, type LfgEntry } from "../../src/domain/lfg.js";

const GUILD = "test-guild";

function entry(userId: string, over: Partial<LfgEntry> = {}): LfgEntry {
  const now = Date.now();
  return {
    userId,
    guildId: GUILD,
    name: userId,
    startedAt: now,
    low: 0,
    mid: 0,
    high: 0,
    epic: 0,
    pbp: 0,
    updatedAt: now,
    ...over,
  };
}

describe("LFG persistence (real code)", () => {
  let db: Sqlite;

  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("upserts and reads an entry", async () => {
    await upsertLfgEntry(entry("u1", { low: 1 }));
    const got = await getLfgEntry("u1");
    expect(got?.low).toBe(1);
    expect(got?.guildId).toBe(GUILD);
  });

  it("updates on conflict (same userId)", async () => {
    await upsertLfgEntry(entry("u1", { low: 1 }));
    await upsertLfgEntry(entry("u1", { low: 0, mid: 1 }));
    const got = await getLfgEntry("u1");
    expect(got?.low).toBe(0);
    expect(got?.mid).toBe(1);
  });

  it("lists entries by guild", async () => {
    await upsertLfgEntry(entry("u1", { low: 1 }));
    await upsertLfgEntry(entry("u2", { mid: 1 }));
    const all = await listAllLfg(GUILD);
    expect(all).toHaveLength(2);
  });

  it("getLfgEntry is guild-scoped when a guild is given", async () => {
    await upsertLfgEntry(entry("u1", { low: 1 }));
    expect(await getLfgEntry("u1", GUILD)).not.toBeNull();
    expect(await getLfgEntry("u1", "other-guild")).toBeNull();
  });

  describe("purgeLfgBefore", () => {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const ids = (res: Awaited<ReturnType<typeof purgeLfgBefore>>) =>
      res.map((r) => r.userId);

    it("default scope removes stale low/mid/high/epic but NOT pbp", async () => {
      await upsertLfgEntry(entry("oldLow", { low: 1, startedAt: old }));
      await upsertLfgEntry(entry("oldPbp", { pbp: 1, startedAt: old }));
      await upsertLfgEntry(entry("fresh", { low: 1 }));

      const purged = await purgeLfgBefore(GUILD, threshold, "all");
      expect(ids(purged)).toContain("oldLow");
      expect(ids(purged)).not.toContain("oldPbp");
      expect(ids(purged)).not.toContain("fresh");
      // oldLow had only `low`; clearing it leaves nothing → row deleted.
      expect(purged.find((r) => r.userId === "oldLow")?.entry).toBeNull();
      expect(await getLfgEntry("oldLow")).toBeNull();
      expect(await getLfgEntry("oldPbp")).not.toBeNull();
    });

    it("pbp scope removes stale pbp-only entries entirely", async () => {
      await upsertLfgEntry(entry("oldPbp", { pbp: 1, startedAt: old }));
      const purged = await purgeLfgBefore(GUILD, threshold, "pbp");
      expect(ids(purged)).toContain("oldPbp");
      expect(purged.find((r) => r.userId === "oldPbp")?.entry).toBeNull();
      expect(await getLfgEntry("oldPbp")).toBeNull();
    });

    // The bug: a user in pbp AND a leveled tier, purged by one scope, must keep
    // the other tier — the row survives with only the in-scope tiers cleared.
    it("pbp scope keeps a mixed user's leveled tiers (row survives)", async () => {
      await upsertLfgEntry(entry("mix", { pbp: 1, low: 1, startedAt: old }));

      const purged = await purgeLfgBefore(GUILD, threshold, "pbp");
      const survivor = purged.find((r) => r.userId === "mix");
      expect(survivor).toBeDefined();
      expect(survivor?.entry).not.toBeNull();
      expect(survivor?.entry?.pbp).toBe(0);
      expect(survivor?.entry?.low).toBe(1);

      const row = await getLfgEntry("mix");
      expect(row).not.toBeNull();
      expect(row?.pbp).toBe(0);
      expect(row?.low).toBe(1);
    });

    it("all scope keeps a mixed user's pbp tier (row survives)", async () => {
      await upsertLfgEntry(entry("mix", { pbp: 1, high: 1, startedAt: old }));

      const purged = await purgeLfgBefore(GUILD, threshold, "all");
      const survivor = purged.find((r) => r.userId === "mix");
      expect(survivor?.entry?.high).toBe(0);
      expect(survivor?.entry?.pbp).toBe(1);

      const row = await getLfgEntry("mix");
      expect(row?.high).toBe(0);
      expect(row?.pbp).toBe(1);
    });
  });

  describe("applyLfgMutation (atomic read-modify-write)", () => {
    const mk = (userId: string) => () => entry(userId);

    it("creates a row on first mutation", async () => {
      const res = await applyLfgMutation("m1", GUILD, mk("m1"), (e) =>
        setTier(e, "low", true),
      );
      expect(res.low).toBe(1);
      expect((await getLfgEntry("m1", GUILD))?.low).toBe(1);
    });

    it("deletes the row when the mutation clears the last tier", async () => {
      await applyLfgMutation("m1", GUILD, mk("m1"), (e) =>
        setTier(e, "low", true),
      );
      const res = await applyLfgMutation("m1", GUILD, mk("m1"), (e) =>
        setTier(e, "low", false),
      );
      expect(res.low).toBe(0);
      expect(await getLfgEntry("m1", GUILD)).toBeNull();
    });

    it("only acts within the given guild", async () => {
      await applyLfgMutation("m1", GUILD, mk("m1"), (e) =>
        setTier(e, "mid", true),
      );
      // A different guild sees no existing row, so it starts from makeDefault.
      const other = await applyLfgMutation(
        "m1",
        "other-guild",
        () => entry("m1", { guildId: "other-guild" }),
        (e) => setTier(e, "epic", true),
      );
      expect(other.guildId).toBe("other-guild");
      expect(other.mid).toBe(0);
      expect(other.epic).toBe(1);
    });
  });
});
