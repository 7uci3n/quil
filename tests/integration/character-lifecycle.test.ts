// Integration tests that drive the REAL db_queries / domain functions
// (not inline SQL) against the real schema.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import {
  createTestDb,
  seedTestPlayer,
  cleanupTestDb,
} from "../fixtures/test-db.js";
import {
  getPlayer,
  getPlayerCC,
  adjustResource,
  retireCharacter,
} from "../../src/utils/db_queries.js";
import { updateDTP } from "../../src/domain/resource.js";
import { dtpDayBoundary, dtpPeriod } from "../../src/domain/dtp.js";

const DTP_RATE = 2; // matches app.config default

describe("Character lifecycle (real code)", () => {
  let db: Sqlite;

  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  describe("adjustResource", () => {
    it("adds a delta to the active character", async () => {
      await seedTestPlayer(db, {
        userId: "u",
        name: "Hero",
        cp: 1000,
        active: true,
      });
      const updated = await adjustResource("u", ["cp"], [500]);
      expect(updated!.cp).toBe(1500);
    });

    it("sets absolute values when set=true", async () => {
      await seedTestPlayer(db, {
        userId: "u",
        name: "Hero",
        xp: 10,
        level: 1,
        active: true,
      });
      const updated = await adjustResource(
        "u",
        ["xp", "level"],
        [900, 3],
        true,
      );
      expect(updated!.xp).toBe(900);
      expect(updated!.level).toBe(3);
    });

    it("rejects columns outside the allowlist", async () => {
      await seedTestPlayer(db, { userId: "u", name: "Hero", active: true });
      await expect(adjustResource("u", ["evil"], [1])).rejects.toThrow();
    });
  });

  describe("getPlayerCC", () => {
    it("sums Crew Coins across all of a user's characters", async () => {
      await seedTestPlayer(db, {
        userId: "u",
        name: "A",
        cc: 50,
        active: true,
      });
      await seedTestPlayer(db, {
        userId: "u",
        name: "B",
        cc: 30,
        active: false,
      });
      expect(await getPlayerCC("u")).toBe(80);
    });
  });

  describe("retireCharacter", () => {
    it("deletes the character and reports lastChar", async () => {
      await seedTestPlayer(db, { userId: "u", name: "Solo", active: true });
      const res = await retireCharacter("u");
      expect(res!.lastChar).toBe(true);
      expect(await getPlayer("u", "Solo")).toBeUndefined();
    });
  });

  describe("updateDTP", () => {
    it("accrues whole periods since dtp_updated", async () => {
      const boundary = dtpDayBoundary(Date.now() / 1000, DTP_RATE);
      await seedTestPlayer(db, {
        userId: "u",
        name: "Idler",
        dtp: 0,
        dtp_updated: boundary - 3 * dtpPeriod(DTP_RATE),
        active: true,
      });
      const dtp = await updateDTP("u");
      expect(dtp).toBe(3);
      expect((await getPlayer("u", "Idler"))!.dtp).toBe(3);
    });

    it("does not accrue past the cap", async () => {
      await seedTestPlayer(db, {
        userId: "u",
        name: "Capped",
        dtp: 365,
        active: true,
      });
      expect(await updateDTP("u")).toBe(365);
    });

    it("returns null for a user with no character", async () => {
      expect(await updateDTP("ghost")).toBeNull();
    });
  });
});
