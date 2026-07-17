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
} from "../fixtures/mock-interactions.js";
import { getPlayer } from "../../src/utils/db_queries.js";
import { getDb } from "../../src/db/index.js";
import { CONFIG } from "../../src/config/resolved.js";
import * as initiate from "../../src/commands/initiate.js";
import * as charedit from "../../src/commands/charedit.js";

const flush = () => new Promise((r) => setTimeout(r, 5));
const MOD = CONFIG.guild!.config.roles.moderator.id!;
const GM_ROLE = CONFIG.guild!.config.guildMemberRole!;

describe("/initiate (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("creates a baseline character and marks it active", async () => {
    const target = makeUser({ id: "new1" });
    const { ix } = makeInteraction({
      user: target,
      users: { user: target },
      options: { name: "Fresh" },
      guild: null,
    });
    await initiate.execute(ix);
    await flush();
    const row = await getPlayer("new1", "Fresh");
    expect(row).toBeDefined();
    expect(row!.level).toBe(3);
    expect(row!.xp).toBe(900);
    expect(row!.cp).toBe(8000);
    expect(row!.active).toBeTruthy();
  });

  it("grants the Guild Member role when a guild is present", async () => {
    const target = makeUser({ id: "new2" });
    const member = makeMember({ user: target, roleIds: [] });
    const guild = makeGuild({ members: [member] });
    const { ix } = makeInteraction({
      user: makeUser({ id: "actor" }),
      users: { user: target },
      options: { name: "Rolegrant" },
      guild,
    });
    await initiate.execute(ix);
    await flush();
    expect(member.roles.add).toHaveBeenCalledWith(GM_ROLE);
  });

  it("warns via follow-up when the role grant fails", async () => {
    const target = makeUser({ id: "new4" });
    const member = makeMember({ user: target, roleIds: [] });
    member.roles.add = (async () => {
      throw new Error("Missing Permissions");
    }) as unknown as typeof member.roles.add;
    const guild = makeGuild({ members: [member] });
    const { ix, followUp } = makeInteraction({
      user: makeUser({ id: "actor" }),
      users: { user: target },
      options: { name: "Grantfail" },
      guild,
    });
    await initiate.execute(ix);
    await flush();
    expect(followUp).toHaveBeenCalled();
    // character is still created despite the role failure
    expect(await getPlayer("new4", "Grantfail")).toBeDefined();
  });

  it("rejects an invalid character name", async () => {
    const target = makeUser({ id: "new3" });
    const { ix, reply } = makeInteraction({
      user: target,
      users: { user: target },
      options: { name: "bad$$name" },
      guild: null,
    });
    await initiate.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
    expect(await getPlayer("new3", "bad$$name")).toBeUndefined();
  });

  it("rejects a duplicate character for the same user", async () => {
    await seedTestPlayer(db, { userId: "dup", name: "Twin", active: true });
    const target = makeUser({ id: "dup" });
    const { ix, reply } = makeInteraction({
      user: target,
      users: { user: target },
      options: { name: "Twin" },
      guild: null,
    });
    await initiate.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });
});

describe("/charedit rename (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("renames the caller's own active character", async () => {
    const user = makeUser({ id: "self" });
    await seedTestPlayer(db, { userId: "self", name: "OldName", active: true });
    const { ix, reply } = makeInteraction({
      subcommand: "rename",
      user,
      member: makeMember({ user, roleIds: [] }),
      options: { new_name: "NewName" },
    });
    await charedit.execute(ix);
    expect(await getPlayer("self", "NewName")).toBeDefined();
    expect(await getPlayer("self", "OldName")).toBeUndefined();
    expect(reply).toHaveBeenCalled();
  });

  it("rejects an invalid new name", async () => {
    const user = makeUser({ id: "self" });
    await seedTestPlayer(db, { userId: "self", name: "OldName", active: true });
    const { ix, reply } = makeInteraction({
      subcommand: "rename",
      user,
      options: { new_name: "bad@name" },
    });
    await charedit.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("reports when the character does not exist", async () => {
    const user = makeUser({ id: "self" });
    const { ix, reply } = makeInteraction({
      subcommand: "rename",
      user,
      options: { new_name: "Ghosty" },
    });
    await charedit.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("rejects renaming to the same name", async () => {
    const user = makeUser({ id: "self" });
    await seedTestPlayer(db, { userId: "self", name: "Same", active: true });
    const { ix, reply } = makeInteraction({
      subcommand: "rename",
      user,
      options: { new_name: "Same" },
    });
    await charedit.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("rejects a name conflict with another of the caller's characters", async () => {
    const user = makeUser({ id: "self" });
    await seedTestPlayer(db, { userId: "self", name: "A", active: true });
    await seedTestPlayer(db, { userId: "self", name: "B", active: false });
    const { ix, reply } = makeInteraction({
      subcommand: "rename",
      user,
      options: { new_name: "B", character: "A" },
    });
    await charedit.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("lets staff rename another player's character", async () => {
    const actor = makeUser({ id: "mod" });
    const target = makeUser({ id: "victim" });
    await seedTestPlayer(db, { userId: "victim", name: "Old", active: true });
    const actorMember = makeMember({ user: actor, roleIds: [MOD] });
    const guild = makeGuild({ members: [actorMember] });
    const { ix } = makeInteraction({
      subcommand: "rename",
      user: actor,
      member: actorMember,
      users: { user: target },
      guild,
      options: { new_name: "Renamed" },
    });
    await charedit.execute(ix);
    expect(await getPlayer("victim", "Renamed")).toBeDefined();
    // rename cache-refresh is fire-and-forget
    await flush();
    getDb();
  });

  it("blocks a non-staff caller from renaming another player's character", async () => {
    const actor = makeUser({ id: "rando" });
    const target = makeUser({ id: "victim" });
    await seedTestPlayer(db, { userId: "victim", name: "Old", active: true });
    const actorMember = makeMember({ user: actor, roleIds: [] });
    const guild = makeGuild({ members: [actorMember] });
    const { ix, reply } = makeInteraction({
      subcommand: "rename",
      user: actor,
      member: actorMember,
      users: { user: target },
      guild,
      options: { new_name: "Renamed" },
    });
    await charedit.execute(ix);
    expect(reply).toHaveBeenCalled();
    expect(await getPlayer("victim", "Old")).toBeDefined();
  });
});
