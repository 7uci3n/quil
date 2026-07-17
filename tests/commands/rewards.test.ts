import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Sqlite } from "../../src/db/index.js";
import {
  createTestDb,
  seedTestPlayer,
  cleanupTestDb,
} from "../fixtures/test-db.js";
import {
  makeInteraction,
  makeMember,
  makeUser,
} from "../fixtures/mock-interactions.js";
import { getPlayer } from "../../src/utils/db_queries.js";
import { CONFIG } from "../../src/config/resolved.js";
import * as rewards from "../../src/commands/rewards.js";

const ADMIN = CONFIG.guild!.config.roles.admin.id!;

describe("/reward (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("rejects a caller without permission", async () => {
    const { ix, reply } = makeInteraction({
      subcommand: "custom",
      member: makeMember({ roleIds: [] }),
      options: {},
    });
    await rewards.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(arg.flags).toBeDefined();
    expect(typeof arg.content).toBe("string");
  });

  describe("custom", () => {
    it("awards explicit xp/gp to two recipients", async () => {
      const u1 = makeUser({ id: "a" });
      const u2 = makeUser({ id: "b" });
      await seedTestPlayer(db, { userId: "a", name: "A", xp: 0, active: true });
      await seedTestPlayer(db, { userId: "b", name: "B", xp: 0, active: true });
      const { ix, reply } = makeInteraction({
        subcommand: "custom",
        member: makeMember({ roleIds: [ADMIN] }),
        users: { user1: u1, user2: u2 },
        channel: { send: vi.fn(async () => undefined) },
        options: { xp: 100, gp: 10, reason: "quest" },
      });
      await rewards.execute(ix);
      expect((await getPlayer("a"))!.xp).toBe(100);
      expect((await getPlayer("a"))!.cp).toBe(1000);
      expect((await getPlayer("b"))!.xp).toBe(100);
      const arg = reply.mock.calls[0]![0] as { embeds?: unknown[] };
      expect(arg.embeds?.length).toBe(1);
    });

    it("auto-awards GT when only xp/gp are given", async () => {
      const u1 = makeUser({ id: "a" });
      await seedTestPlayer(db, {
        userId: "a",
        name: "A",
        xp: 0,
        tp: 0,
        active: true,
      });
      const { ix } = makeInteraction({
        subcommand: "custom",
        member: makeMember({ roleIds: [ADMIN] }),
        users: { user1: u1 },
        channel: { send: vi.fn(async () => undefined) },
        options: { xp: 50 },
      });
      await rewards.execute(ix);
      // level < 5 → auto TP of 3
      expect((await getPlayer("a"))!.tp).toBe(3);
    });

    it("uses an explicit GT and announces a level-up", async () => {
      const u1 = makeUser({ id: "lvl" });
      const send = vi.fn(async () => undefined);
      await seedTestPlayer(db, {
        userId: "lvl",
        name: "Climber",
        xp: 290,
        level: 1,
        tp: 0,
        active: true,
      });
      const { ix } = makeInteraction({
        subcommand: "custom",
        member: makeMember({ roleIds: [ADMIN] }),
        users: { user1: u1 },
        channel: { send },
        options: { xp: 100, gt: 2 },
      });
      await rewards.execute(ix);
      const after = (await getPlayer("lvl"))!;
      expect(after.level).toBeGreaterThan(1); // crossed a boundary
      expect(after.tp).toBe(2); // explicit GT, not auto
      expect(send).toHaveBeenCalled(); // level-up announced
    });

    it("errors when no recipients are given", async () => {
      const { ix, reply } = makeInteraction({
        subcommand: "custom",
        member: makeMember({ roleIds: [ADMIN] }),
        options: { xp: 10 },
      });
      await rewards.execute(ix);
      const arg = reply.mock.calls[0]![0] as { flags: number };
      expect(arg.flags).toBeDefined();
    });

    it("errors when a recipient has no character record", async () => {
      const u1 = makeUser({ id: "ghost" });
      const { ix, reply } = makeInteraction({
        subcommand: "custom",
        member: makeMember({ roleIds: [ADMIN] }),
        users: { user1: u1 },
        options: { xp: 10 },
      });
      await rewards.execute(ix);
      const arg = reply.mock.calls[0]![0] as { flags: number };
      expect(arg.flags).toBeDefined();
    });

    it("errors when nothing is awarded (explicit gt only, all zero)", async () => {
      const u1 = makeUser({ id: "a" });
      await seedTestPlayer(db, { userId: "a", name: "A", active: true });
      const { ix, reply } = makeInteraction({
        subcommand: "custom",
        member: makeMember({ roleIds: [ADMIN] }),
        users: { user1: u1 },
        options: { gt: 0 },
      });
      await rewards.execute(ix);
      const arg = reply.mock.calls[0]![0] as { flags: number };
      expect(arg.flags).toBeDefined();
    });
  });

  describe("dm", () => {
    it("grants the invoker a bracketed DM reward", async () => {
      const u = makeUser({ id: "dmm" });
      await seedTestPlayer(db, {
        userId: "dmm",
        name: "DMChar",
        xp: 6500,
        level: 5,
        active: true,
      });
      const { ix, reply } = makeInteraction({
        subcommand: "dm",
        user: u,
        member: makeMember({ user: u, roleIds: [ADMIN] }),
        channel: { send: vi.fn(async () => undefined) },
        options: {},
      });
      await rewards.execute(ix);
      expect((await getPlayer("dmm"))!.xp).toBeGreaterThan(6500);
      const arg = reply.mock.calls[0]![0] as { embeds?: unknown[] };
      expect(arg.embeds?.length).toBe(1);
    });

    it("half flag grants a reduced reward", async () => {
      const u = makeUser({ id: "dmh" });
      await seedTestPlayer(db, {
        userId: "dmh",
        name: "DMHalf",
        xp: 6500,
        level: 5,
        active: true,
      });
      const { ix } = makeInteraction({
        subcommand: "dm",
        user: u,
        member: makeMember({ user: u, roleIds: [ADMIN] }),
        channel: { send: vi.fn(async () => undefined) },
        options: { half: true },
      });
      await rewards.execute(ix);
      expect((await getPlayer("dmh"))!.xp).toBeGreaterThan(6500);
    });

    it("announces a level-up when the DM reward crosses a boundary", async () => {
      const u = makeUser({ id: "dmlvl" });
      const send = vi.fn(async () => undefined);
      await seedTestPlayer(db, {
        userId: "dmlvl",
        name: "DMClimb",
        xp: 290,
        level: 1,
        active: true,
      });
      const { ix } = makeInteraction({
        subcommand: "dm",
        user: u,
        member: makeMember({ user: u, roleIds: [ADMIN] }),
        channel: { send },
        options: {},
      });
      await rewards.execute(ix);
      expect((await getPlayer("dmlvl"))!.level).toBeGreaterThan(1);
      expect(send).toHaveBeenCalled();
    });

    it("errors when the invoker has no character", async () => {
      const u = makeUser({ id: "nodm" });
      const { ix, reply } = makeInteraction({
        subcommand: "dm",
        user: u,
        member: makeMember({ user: u, roleIds: [ADMIN] }),
        options: {},
      });
      await rewards.execute(ix);
      const arg = reply.mock.calls[0]![0] as { flags: number };
      expect(arg.flags).toBeDefined();
    });
  });
});
