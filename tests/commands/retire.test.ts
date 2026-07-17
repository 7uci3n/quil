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
  makeRole,
  makeModalSubmit,
} from "../fixtures/mock-interactions.js";
import { getPlayer } from "../../src/utils/db_queries.js";
import { CONFIG } from "../../src/config/resolved.js";
import * as retire from "../../src/commands/retire.js";

const flush = () => new Promise((r) => setTimeout(r, 5));
const MOD = CONFIG.guild!.config.roles.moderator.id!;
const GM_ROLE = CONFIG.guild!.config.guildMemberRole!;
const UNINIT = CONFIG.guild!.config.uninitiatedRole!;

describe("/retire execute (modal gate)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("shows the confirm modal for a self-retire", async () => {
    const user = makeUser({ id: "self" });
    const { ix, showModal } = makeInteraction({
      user,
      users: { user: null },
    });
    await retire.execute(ix);
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it("blocks a non-staff caller from retiring another user", async () => {
    const actor = makeUser({ id: "rando" });
    const target = makeUser({ id: "victim" });
    const actorMember = makeMember({ user: actor, roleIds: [] });
    const guild = makeGuild({ members: [actorMember] });
    const { ix, showModal, reply } = makeInteraction({
      user: actor,
      member: actorMember,
      users: { user: target },
      guild,
    });
    await retire.execute(ix);
    expect(showModal).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("shows the modal when staff retire another user", async () => {
    const actor = makeUser({ id: "mod" });
    const target = makeUser({ id: "victim" });
    const actorMember = makeMember({ user: actor, roleIds: [MOD] });
    const guild = makeGuild({ members: [actorMember] });
    const { ix, showModal } = makeInteraction({
      user: actor,
      member: actorMember,
      users: { user: target },
      guild,
    });
    await retire.execute(ix);
    expect(showModal).toHaveBeenCalledTimes(1);
  });
});

describe("/retire handleModal (real DB)", () => {
  let db: Sqlite;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("ignores unrelated modal submissions", async () => {
    const { ix, reply } = makeModalSubmit({
      customId: "other-modal",
      fields: {},
    });
    await retire.handleModal(ix);
    expect(reply).not.toHaveBeenCalled();
  });

  it("cancels when the confirmation text is not RETIRE", async () => {
    const { ix, reply } = makeModalSubmit({
      customId: "retire-confirm-u1",
      fields: { char_name: "", confirm_text: "nope" },
    });
    await retire.handleModal(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("rejects an invalid character name", async () => {
    const { ix, reply } = makeModalSubmit({
      customId: "retire-confirm-u1",
      fields: { char_name: "bad$name", confirm_text: "RETIRE" },
    });
    await retire.handleModal(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("reports no adventurer when the target has no character", async () => {
    const { ix, reply } = makeModalSubmit({
      customId: "retire-confirm-ghost",
      fields: { char_name: "", confirm_text: "RETIRE" },
    });
    await retire.handleModal(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("retires the last character and reconciles roles", async () => {
    await seedTestPlayer(db, { userId: "solo", name: "Solo", active: true });
    const target = makeMember({
      user: makeUser({ id: "solo" }),
      roleIds: [GM_ROLE],
    });
    const guild = makeGuild({
      members: [target],
      roles: [makeRole(GM_ROLE), makeRole(UNINIT)],
    });
    const { ix, reply } = makeModalSubmit({
      customId: "retire-confirm-solo",
      user: makeUser({ id: "solo" }),
      guild,
      fields: { char_name: "Solo", confirm_text: "RETIRE" },
    });
    await retire.handleModal(ix);
    await flush();
    expect(await getPlayer("solo", "Solo")).toBeUndefined();
    const arg = reply.mock.calls[0]![0] as { embeds?: unknown[] };
    expect(arg.embeds?.length).toBe(1);
    expect(target.roles.remove).toHaveBeenCalled(); // GM role removed
    expect(target.roles.add).toHaveBeenCalled(); // uninitiated role added
  });

  it("retires a non-last character without a role sweep", async () => {
    await seedTestPlayer(db, { userId: "multi", name: "First", active: true });
    await seedTestPlayer(db, {
      userId: "multi",
      name: "Second",
      active: false,
    });
    const { ix, reply } = makeModalSubmit({
      customId: "retire-confirm-multi",
      user: makeUser({ id: "multi" }),
      guild: null,
      fields: { char_name: "First", confirm_text: "RETIRE" },
    });
    await retire.handleModal(ix);
    expect(await getPlayer("multi", "First")).toBeUndefined();
    expect(await getPlayer("multi", "Second")).toBeDefined();
    const arg = reply.mock.calls[0]![0] as { embeds?: unknown[] };
    expect(arg.embeds?.length).toBe(1);
  });
});
