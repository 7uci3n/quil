import { describe, it, expect } from "vitest";
import type { GuildMember } from "discord.js";
import { makeMember, type MockMember } from "../fixtures/mock-interactions.js";
import {
  addRoleById,
  removeRoleById,
  syncRolesFor,
  LFG_TIER_ROLE_IDS,
} from "../../src/features/lfg/roles.js";
import type { LfgEntry } from "../../src/domain/lfg.js";

const asMember = (m: MockMember) => m as unknown as GuildMember;

function entry(over: Partial<LfgEntry> = {}): LfgEntry {
  return {
    userId: "u",
    guildId: "g",
    name: "u",
    startedAt: 0,
    low: 0,
    mid: 0,
    high: 0,
    epic: 0,
    pbp: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("addRoleById", () => {
  it("is a no-op when the role id is missing", async () => {
    const m = makeMember({});
    await addRoleById(asMember(m), undefined);
    expect(m.roles.add).not.toHaveBeenCalled();
  });
  it("is a no-op when the member already has the role", async () => {
    const m = makeMember({ roleIds: ["r1"] });
    await addRoleById(asMember(m), "r1");
    expect(m.roles.add).not.toHaveBeenCalled();
  });
  it("adds a role the member lacks", async () => {
    const m = makeMember({});
    await addRoleById(asMember(m), "r1");
    expect(m.roles.add).toHaveBeenCalledWith("r1");
  });
});

describe("removeRoleById", () => {
  it("is a no-op when the role id is missing", async () => {
    const m = makeMember({ roleIds: ["r1"] });
    await removeRoleById(asMember(m), null);
    expect(m.roles.remove).not.toHaveBeenCalled();
  });
  it("is a no-op when the member does not have the role", async () => {
    const m = makeMember({});
    await removeRoleById(asMember(m), "r1");
    expect(m.roles.remove).not.toHaveBeenCalled();
  });
  it("removes a role the member has", async () => {
    const m = makeMember({ roleIds: ["r1"] });
    await removeRoleById(asMember(m), "r1");
    expect(m.roles.remove).toHaveBeenCalledWith("r1");
  });
});

describe("syncRolesFor", () => {
  it("adds enabled tier roles and removes disabled ones", async () => {
    const m = makeMember({ roleIds: [LFG_TIER_ROLE_IDS.mid!] }); // mid currently set
    await syncRolesFor(asMember(m), entry({ low: 1, pbp: 1 }));
    // low + pbp enabled → added
    expect(m.roles.add).toHaveBeenCalledWith(LFG_TIER_ROLE_IDS.low);
    expect(m.roles.add).toHaveBeenCalledWith(LFG_TIER_ROLE_IDS.pbp);
    // mid disabled and present → removed
    expect(m.roles.remove).toHaveBeenCalledWith(LFG_TIER_ROLE_IDS.mid);
  });
});
