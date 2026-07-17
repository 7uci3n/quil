// Integration tests that drive the REAL db/lfg persistence functions.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { createTestDb, cleanupTestDb } from "../fixtures/test-db.js";
import {
  upsertLfgEntry,
  getLfgEntry,
  listAllLfg,
  purgeLfgBefore,
} from "../../src/db/lfg.js";
import type { LfgEntry } from "../../src/domain/lfg.js";

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

  describe("purgeLfgBefore", () => {
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;

    it("default scope purges stale low/mid/high/epic but NOT pbp", async () => {
      await upsertLfgEntry(entry("oldLow", { low: 1, startedAt: old }));
      await upsertLfgEntry(entry("oldPbp", { pbp: 1, startedAt: old }));
      await upsertLfgEntry(entry("fresh", { low: 1 }));

      const purged = await purgeLfgBefore(GUILD, threshold, "all");
      expect(purged).toContain("oldLow");
      expect(purged).not.toContain("oldPbp");
      expect(purged).not.toContain("fresh");
      expect(await getLfgEntry("oldLow")).toBeNull();
      expect(await getLfgEntry("oldPbp")).not.toBeNull();
    });

    it("pbp scope purges stale pbp entries", async () => {
      await upsertLfgEntry(entry("oldPbp", { pbp: 1, startedAt: old }));
      const purged = await purgeLfgBefore(GUILD, threshold, "pbp");
      expect(purged).toContain("oldPbp");
      expect(await getLfgEntry("oldPbp")).toBeNull();
    });
  });
});
