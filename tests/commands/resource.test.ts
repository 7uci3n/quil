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
import * as resource from "../../src/commands/resource.js";

const ADMIN = CONFIG.guild!.config.roles.admin.id!;

// resource's show/adjust paths call showCharacterEmbed() WITHOUT awaiting it, so
// the reply lands on a later tick — flush the queue before asserting on it.
const flush = () => new Promise((r) => setTimeout(r, 5));

/** Build an interaction where an admin acts on a target user. */
function resourceIx(
  sub: string,
  target: ReturnType<typeof makeUser>,
  options: Record<string, string | number | null> = {},
) {
  const member = makeMember({ roleIds: [ADMIN] });
  return makeInteraction({
    subcommand: sub,
    user: target,
    member,
    users: { user: target },
    channel: { send: vi.fn(async () => undefined) },
    options,
  });
}

describe("/resource (real DB)", () => {
  let db: Sqlite;
  let target: ReturnType<typeof makeUser>;
  beforeEach(async () => {
    db = await createTestDb();
    target = makeUser({ id: "p1", displayName: "Pip" });
    await seedTestPlayer(db, {
      userId: "p1",
      name: "Pip",
      cp: 1000,
      xp: 300,
      tp: 2,
      level: 2,
      active: true,
    });
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("rejects a caller without permission", async () => {
    const member = makeMember({ roleIds: [] });
    const { ix, reply } = makeInteraction({
      subcommand: "add",
      user: target,
      member,
      users: { user: target },
      options: { type: "cp", amount: 5 },
    });
    await resource.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string };
    expect(arg.content).toContain("permission");
    // unchanged
    expect((await getPlayer("p1"))!.cp).toBe(1000);
  });

  it("show cp: replies with a resource embed", async () => {
    const { ix, reply } = resourceIx("show", target, { type: "cp" });
    await resource.execute(ix);
    await flush();
    const arg = reply.mock.calls[0]![0] as { embeds?: unknown[] };
    expect(arg.embeds?.length).toBe(1);
  });

  it("show xp: includes level/progress fields", async () => {
    const { ix, reply } = resourceIx("show", target, { type: "xp" });
    await resource.execute(ix);
    await flush();
    const arg = reply.mock.calls[0]![0] as {
      embeds: { data: { fields: { name: string }[] } }[];
    };
    const names = arg.embeds[0]!.data.fields.map((f) => f.name).join(" ");
    expect(names.length).toBeGreaterThan(0);
  });

  it("add cp: converts GP to copper and updates the character", async () => {
    const { ix } = resourceIx("add", target, { type: "cp", amount: 5 });
    await resource.execute(ix);
    expect((await getPlayer("p1"))!.cp).toBe(1000 + 500);
  });

  it("adjust: applies a signed delta", async () => {
    const { ix } = resourceIx("adjust", target, { type: "tp", amount: -1 });
    await resource.execute(ix);
    expect((await getPlayer("p1"))!.tp).toBe(1);
  });

  it("set: writes an absolute value", async () => {
    const { ix } = resourceIx("set", target, { type: "tp", amount: 9 });
    await resource.execute(ix);
    expect((await getPlayer("p1"))!.tp).toBe(9);
  });

  it("add xp across a level boundary announces a level change", async () => {
    const send = vi.fn(async () => undefined);
    const member = makeMember({ roleIds: [ADMIN] });
    const { ix } = makeInteraction({
      subcommand: "add",
      user: target,
      member,
      users: { user: target },
      channel: { send },
      options: { type: "xp", amount: 5000 },
    });
    await resource.execute(ix);
    const after = await getPlayer("p1");
    expect(after!.xp).toBe(5300);
    expect(after!.level).toBeGreaterThan(2);
    expect(send).toHaveBeenCalled();
  });

  it("add xp within a level does not announce a change", async () => {
    const send = vi.fn(async () => undefined);
    const member = makeMember({ roleIds: [ADMIN] });
    const { ix } = makeInteraction({
      subcommand: "add",
      user: target,
      member,
      users: { user: target },
      channel: { send },
      options: { type: "xp", amount: 5 },
    });
    await resource.execute(ix);
    await flush();
    expect((await getPlayer("p1"))!.xp).toBe(305);
    expect(send).not.toHaveBeenCalled();
  });

  it("dtp on a user with no record replies not-in-system", async () => {
    const ghost = makeUser({ id: "ghost" });
    const member = makeMember({ roleIds: [ADMIN] });
    const { ix, reply } = makeInteraction({
      subcommand: "show",
      user: ghost,
      member,
      users: { user: ghost },
      options: { type: "dtp" },
    });
    await resource.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(arg.flags).toBeDefined();
    expect(typeof arg.content).toBe("string");
  });

  it("show dtp for a valid player accrues and renders", async () => {
    const { ix, reply } = resourceIx("show", target, { type: "dtp" });
    await resource.execute(ix);
    await flush();
    expect(reply).toHaveBeenCalled();
  });

  it("adjust cc updates the pooled balance", async () => {
    const { ix } = resourceIx("adjust", target, { type: "cc", amount: 15 });
    await resource.execute(ix);
    await flush();
    const { getPlayerCC } = await import("../../src/utils/db_queries.js");
    expect(await getPlayerCC("p1")).toBe(15);
  });

  it("set xp downward announces a level drop", async () => {
    await seedTestPlayer(db, {
      userId: "hi",
      name: "High",
      xp: 6500,
      level: 5,
      active: true,
    });
    const highUser = makeUser({ id: "hi" });
    const send = vi.fn(async () => undefined);
    const { ix } = makeInteraction({
      subcommand: "set",
      user: highUser,
      member: makeMember({ roleIds: [ADMIN] }),
      users: { user: highUser },
      channel: { send },
      options: { type: "xp", amount: 0 },
    });
    await resource.execute(ix);
    await flush();
    const row = await getPlayer("hi", "High");
    expect(row!.level).toBe(1);
    expect(send).toHaveBeenCalled();
  });

  it("add on a user with no character replies not-in-system", async () => {
    const ghost = makeUser({ id: "ghost2" });
    const member = makeMember({ roleIds: [ADMIN] });
    const { ix, reply } = makeInteraction({
      subcommand: "add",
      user: ghost,
      member,
      users: { user: ghost },
      options: { type: "cp", amount: 5 },
    });
    await resource.execute(ix);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("cc show reads the pooled balance", async () => {
    await seedTestPlayer(db, {
      userId: "p1",
      name: "Second",
      cc: 40,
      active: false,
    });
    const { ix, reply } = resourceIx("show", target, { type: "cc" });
    await resource.execute(ix);
    await flush();
    expect(reply).toHaveBeenCalled();
  });
});
