import { describe, it, expect } from "vitest";
import {
  makeInteraction,
  makeMember,
  makeUser,
  makeGuild,
  makeRole,
} from "../fixtures/mock-interactions.js";
import { CONFIG } from "../../src/config/resolved.js";
import * as dm from "../../src/commands/dm.js";

const DM_AVAILABLE = CONFIG.guild!.config.features!.lfg!.roles!.dmAvailable!;
const CREW = CONFIG.guild!.config.roles.member.id!;

describe("/dm", () => {
  it("is guild-only", async () => {
    const { ix, reply } = makeInteraction({
      subcommand: "list",
      guild: null,
    });
    await dm.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("reports a missing DM role", async () => {
    const guild = makeGuild({ roles: [] });
    const { ix, reply } = makeInteraction({
      subcommand: "list",
      guild,
    });
    await dm.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
  });

  it("list: shows the members holding the DM role", async () => {
    const available = makeMember({
      user: makeUser({ id: "dm1", displayName: "Gandalf" }),
    });
    const guild = makeGuild({
      roles: [makeRole(DM_AVAILABLE, [available])],
    });
    const { ix, reply } = makeInteraction({ subcommand: "list", guild });
    await dm.execute(ix);
    const arg = reply.mock.calls[0]![0] as {
      embeds: { data: { description: string } }[];
    };
    expect(arg.embeds[0]!.data.description).toContain("Gandalf");
  });

  it("list: shows empty state when no one is available", async () => {
    const guild = makeGuild({ roles: [makeRole(DM_AVAILABLE, [])] });
    const { ix, reply } = makeInteraction({ subcommand: "list", guild });
    await dm.execute(ix);
    expect(reply).toHaveBeenCalled();
  });

  it("toggle: enables the role for an allowed member who lacks it", async () => {
    const actor = makeUser({ id: "crew1" });
    const member = makeMember({ user: actor, roleIds: [CREW] });
    const guild = makeGuild({
      members: [member],
      roles: [makeRole(DM_AVAILABLE)],
    });
    const { ix } = makeInteraction({
      subcommand: "toggle",
      user: actor,
      member,
      guild,
    });
    await dm.execute(ix);
    expect(member.roles.add).toHaveBeenCalled();
  });

  it("toggle: disables the role for an allowed member who has it", async () => {
    const actor = makeUser({ id: "crew2" });
    const member = makeMember({
      user: actor,
      roleIds: [CREW, DM_AVAILABLE],
    });
    const guild = makeGuild({
      members: [member],
      roles: [makeRole(DM_AVAILABLE)],
    });
    const { ix } = makeInteraction({
      subcommand: "toggle",
      user: actor,
      member,
      guild,
    });
    await dm.execute(ix);
    expect(member.roles.remove).toHaveBeenCalled();
  });

  it("toggle: rejects a member without permission", async () => {
    const actor = makeUser({ id: "rando" });
    const member = makeMember({ user: actor, roleIds: [] });
    const guild = makeGuild({
      members: [member],
      roles: [makeRole(DM_AVAILABLE)],
    });
    const { ix, reply } = makeInteraction({
      subcommand: "toggle",
      user: actor,
      member,
      guild,
    });
    await dm.execute(ix);
    const arg = reply.mock.calls[0]![0] as { flags: number };
    expect(arg.flags).toBeDefined();
    expect(member.roles.add).not.toHaveBeenCalled();
  });
});
