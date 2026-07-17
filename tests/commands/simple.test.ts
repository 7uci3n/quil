// Command tests for the small read-only / single-path commands.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import { getDb } from "../../src/db/index.js";
import {
  createTestDb,
  seedTestPlayer,
  cleanupTestDb,
} from "../fixtures/test-db.js";
import { makeInteraction, makeUser } from "../fixtures/mock-interactions.js";
import { CONFIG } from "../../src/config/resolved.js";

import * as charinfo from "../../src/commands/charinfo.js";
import * as swap from "../../src/commands/swap.js";
import * as guildfund from "../../src/commands/guildfund.js";
import * as health from "../../src/commands/health.js";

describe("simple commands (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  describe("/charinfo", () => {
    it("replies with a character embed for a seeded player", async () => {
      const user = makeUser({ id: "u1", displayName: "Aria" });
      await seedTestPlayer(db, { userId: "u1", name: "Aria", active: true });
      const { ix, reply } = makeInteraction({ user, users: { user: null } });
      await charinfo.execute(ix);
      expect(reply).toHaveBeenCalledTimes(1);
      const arg = reply.mock.calls[0]![0] as { embeds?: unknown[] };
      expect(arg.embeds?.length).toBe(1);
    });

    it("replies ephemerally when the caller has no character", async () => {
      const user = makeUser({ id: "ghost" });
      const { ix, reply } = makeInteraction({ user, users: { user: null } });
      await charinfo.execute(ix);
      expect(reply).toHaveBeenCalledTimes(1);
      const arg = reply.mock.calls[0]![0] as { content?: string };
      expect(typeof arg.content).toBe("string");
    });
  });

  describe("/swap", () => {
    it("switches to an existing character", async () => {
      await seedTestPlayer(db, {
        userId: "u1",
        name: "Aria",
        active: true,
      });
      await seedTestPlayer(db, {
        userId: "u1",
        name: "Borin",
        active: false,
      });
      const user = makeUser({ id: "u1" });
      const { ix, reply } = makeInteraction({
        user,
        options: { name: "Borin" },
      });
      await swap.execute(ix);
      const active = getDb()
        .prepare(`SELECT name FROM charlog WHERE userId = ? AND active = 1`)
        .get("u1") as { name: string };
      expect(active.name).toBe("Borin");
      expect(reply).toHaveBeenCalled();
    });

    it("replies ephemerally when the target character does not exist", async () => {
      const user = makeUser({ id: "u1" });
      const { ix, reply } = makeInteraction({
        user,
        options: { name: "Nobody" },
      });
      await swap.execute(ix);
      const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
      expect(arg.content).toContain("Nobody");
      expect(arg.flags).toBeDefined();
    });
  });

  describe("/guildfund", () => {
    it("shows the fund balance (seeded on init) as GP and GT", async () => {
      const fundId = CONFIG.system.fundId;
      getDb()
        .prepare(`UPDATE charlog SET cp = 12345, tp = 7 WHERE userId = ?`)
        .run(fundId);
      const { ix, reply } = makeInteraction({});
      await guildfund.execute(ix);
      const arg = reply.mock.calls[0]![0] as {
        embeds: { fields: { value: string }[] }[];
      };
      expect(arg.embeds[0]!.fields[0]!.value).toContain("123.45");
      expect(arg.embeds[0]!.fields[1]!.value).toContain("7");
    });

    it("reports not-found when the fund character is missing", async () => {
      const fundId = CONFIG.system.fundId;
      getDb().prepare(`DELETE FROM charlog WHERE userId = ?`).run(fundId);
      const { ix, reply } = makeInteraction({});
      await guildfund.execute(ix);
      const arg = reply.mock.calls[0]![0] as { content: string };
      expect(typeof arg.content).toBe("string");
    });
  });

  describe("/health", () => {
    it("reports DB ok and uptime", async () => {
      const { ix, reply } = makeInteraction({
        guild: null,
      });
      await health.execute(ix);
      const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
      expect(arg.content).toContain("DB: ok");
      expect(arg.content).toContain("Uptime");
      expect(arg.flags).toBeDefined();
    });
  });
});
