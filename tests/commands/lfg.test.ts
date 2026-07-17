import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  makeGuild,
  makeChannel,
} from "../fixtures/mock-interactions.js";
import { getLfgEntry, upsertLfgEntry } from "../../src/db/lfg.js";
import type { LfgEntry } from "../../src/domain/lfg.js";
import { CONFIG } from "../../src/config/resolved.js";
import * as lfg from "../../src/commands/lfg.js";

const GUILD_ID = CONFIG.guild!.id;
const MOD = CONFIG.guild!.config.roles.moderator.id!;

/** Interaction for a self-service /lfg action by `userId`. */
function lfgIx(
  userId: string,
  subcommand: string,
  options: Record<string, string | number | null> = {},
  roleIds: string[] = [],
) {
  const user = makeUser({ id: userId });
  const member = makeMember({ user, roleIds });
  const guild = makeGuild({ id: GUILD_ID, members: [member] });
  return makeInteraction({
    subcommand,
    user,
    member,
    guild,
    guildId: GUILD_ID,
    options,
  });
}

function entry(userId: string, over: Partial<LfgEntry> = {}): LfgEntry {
  const now = Date.now();
  return {
    userId,
    guildId: GUILD_ID,
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

describe("/lfg (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("toggle: turns a tier on, then off", async () => {
    const on = lfgIx("u1", "toggle", { tier: "low" });
    await lfg.execute(on.ix);
    expect((await getLfgEntry("u1", GUILD_ID))?.low).toBe(1);

    const off = lfgIx("u1", "toggle", { tier: "low" });
    await lfg.execute(off.ix);
    expect(await getLfgEntry("u1", GUILD_ID)).toBeNull();
  });

  it("toggle auto: resolves the tier from character level", async () => {
    await seedTestPlayer(db, {
      userId: "u2",
      name: "Hero",
      xp: 0,
      active: true,
    });
    const { ix } = lfgIx("u2", "toggle", { tier: "auto" });
    await lfg.execute(ix);
    expect((await getLfgEntry("u2", GUILD_ID))?.low).toBe(1);
  });

  it("toggle auto: errors when the user has no character", async () => {
    const { ix, reply } = lfgIx("u3", "toggle", { tier: "auto" });
    await lfg.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("toggle: rejects an unknown tier", async () => {
    const { ix, reply } = lfgIx("u4", "toggle", { tier: "bogus" });
    await lfg.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("add: adds a tier and rejects a duplicate", async () => {
    await lfg.execute(lfgIx("u5", "add", { tier: "mid" }).ix);
    expect((await getLfgEntry("u5", GUILD_ID))?.mid).toBe(1);

    const dup = lfgIx("u5", "add", { tier: "mid" });
    await lfg.execute(dup.ix);
    const arg = dup.reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("remove: errors when the user is not on the board", async () => {
    const { ix, reply } = lfgIx("u6", "remove", { tier: "low" });
    await lfg.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("remove: clears one tier and 'all' clears everything", async () => {
    await upsertLfgEntry(entry("u7", { low: 1, mid: 1 }));
    await lfg.execute(lfgIx("u7", "remove", { tier: "low" }).ix);
    expect((await getLfgEntry("u7", GUILD_ID))?.low).toBe(0);
    expect((await getLfgEntry("u7", GUILD_ID))?.mid).toBe(1);

    await lfg.execute(lfgIx("u7", "remove", { tier: "all" }).ix);
    expect(await getLfgEntry("u7", GUILD_ID)).toBeNull();
  });

  it("remove: errors for a tier the user is not in", async () => {
    await upsertLfgEntry(entry("u8", { low: 1 }));
    const { ix, reply } = lfgIx("u8", "remove", { tier: "epic" });
    await lfg.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("status: reports not-on-board, then shows tiers", async () => {
    const none = lfgIx("u9", "status");
    await lfg.execute(none.ix);
    expect(
      (none.reply.mock.calls[0]![0] as { flags: number }).flags,
    ).toBeDefined();

    await upsertLfgEntry(entry("u9", { high: 1 }));
    const some = lfgIx("u9", "status");
    await lfg.execute(some.ix);
    const arg = some.reply.mock.calls[0]![0] as { embeds?: unknown[] };
    expect(arg.embeds?.length).toBe(1);
  });

  it("list: previews the board ephemerally", async () => {
    await upsertLfgEntry(entry("u10", { low: 1 }));
    const { ix, reply } = lfgIx("u10", "list", { post: null });
    await lfg.execute(ix);
    const arg = reply.mock.calls[0]![0] as {
      embeds?: unknown[];
      flags: number;
    };
    expect(arg.embeds?.length).toBe(1);
    expect(arg.flags).toBeDefined();
  });

  it("list post: refuses a non-mod poster", async () => {
    const user = makeUser({ id: "u11" });
    const member = makeMember({ user, roleIds: [] });
    const guild = makeGuild({ id: GUILD_ID, members: [member] });
    const { ix, followUp } = makeInteraction({
      subcommand: "list",
      user,
      member,
      guild,
      guildId: GUILD_ID,
      options: { post: true },
    });
    await lfg.execute(ix);
    expect(followUp).toHaveBeenCalled();
    const arg = followUp.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("list post: a mod posts/updates the sticky board", async () => {
    await upsertLfgEntry(entry("u13", { mid: 1 }));
    const actor = makeUser({ id: "modposter" });
    const member = makeMember({ user: actor, roleIds: [MOD] });
    const board = makeChannel(
      CONFIG.guild!.config.features!.lfg!.channels!.board,
    );
    const guild = makeGuild({
      id: GUILD_ID,
      members: [member],
      channels: [board],
    });
    const { ix, followUp } = makeInteraction({
      subcommand: "list",
      user: actor,
      member,
      guild,
      guildId: GUILD_ID,
      options: { post: true },
    });
    await lfg.execute(ix);
    expect(board.send).toHaveBeenCalled();
    expect(followUp).toHaveBeenCalled();
  });

  it("purge: rejects a non-mod caller", async () => {
    const { ix, reply } = lfgIx("u12", "purge", { days: 7 });
    await lfg.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("purge: reports when nothing was stale enough to remove", async () => {
    await upsertLfgEntry(entry("fresh", { low: 1 })); // startedAt = now
    const actor = makeUser({ id: "modnone" });
    const member = makeMember({ user: actor, roleIds: [MOD] });
    const guild = makeGuild({ id: GUILD_ID, members: [member] });
    const { ix, editReply } = makeInteraction({
      subcommand: "purge",
      user: actor,
      member,
      guild,
      guildId: GUILD_ID,
      options: { days: 7 },
    });
    await lfg.execute(ix);
    expect(editReply).toHaveBeenCalled();
    expect(await getLfgEntry("fresh", GUILD_ID)).not.toBeNull();
  });

  it("purge: mods remove stale entries", async () => {
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await upsertLfgEntry(entry("stale", { low: 1, startedAt: old }));
    const actor = makeUser({ id: "modder" });
    const member = makeMember({ user: actor, roleIds: [MOD] });
    const staleMember = makeMember({ user: makeUser({ id: "stale" }) });
    const guild = makeGuild({
      id: GUILD_ID,
      members: [member, staleMember],
    });
    const { ix, editReply } = makeInteraction({
      subcommand: "purge",
      user: actor,
      member,
      guild,
      guildId: GUILD_ID,
      options: { days: 7, scope: "all" },
    });
    await lfg.execute(ix);
    expect(editReply).toHaveBeenCalled();
    expect(await getLfgEntry("stale", GUILD_ID)).toBeNull();
  });
});
