import { describe, it, expect } from "vitest";
import type { GuildMember } from "discord.js";
import {
  makeInteraction,
  makeMember,
  type MockMember,
} from "../fixtures/mock-interactions.js";
import {
  memberRoleIds,
  hasAnyRole,
  isAdmin,
  isDevBypass,
  canBypass,
  validateCommandPermissions,
} from "../../src/config/validators.js";

const asMember = (m: MockMember) => m as unknown as GuildMember;

describe("memberRoleIds", () => {
  it("returns [] for a null member", () => {
    expect(memberRoleIds(null)).toEqual([]);
  });
  it("reads ids from a full GuildMember roles cache", () => {
    const m = makeMember({ roleIds: ["a", "b"] });
    expect(memberRoleIds(asMember(m)).sort()).toEqual(["a", "b"]);
  });
  it("reads ids from an API interaction member (roles array)", () => {
    const apiMember = { roles: ["x", "y"] } as unknown as GuildMember;
    expect(memberRoleIds(apiMember)).toEqual(["x", "y"]);
  });
});

describe("hasAnyRole", () => {
  it("is false when the allow-list is empty", () => {
    expect(hasAnyRole(asMember(makeMember({ roleIds: ["a"] })), [])).toBe(
      false,
    );
  });
  it("is true when the member holds one of the allowed roles", () => {
    expect(
      hasAnyRole(asMember(makeMember({ roleIds: ["a"] })), ["a", "b"]),
    ).toBe(true);
  });
  it("is false when the member holds none", () => {
    expect(hasAnyRole(asMember(makeMember({ roleIds: ["z"] })), ["a"])).toBe(
      false,
    );
  });
});

describe("isAdmin", () => {
  it("is true for a member with Administrator permission", () => {
    expect(isAdmin(asMember(makeMember({ admin: true })))).toBe(true);
  });
  it("is false otherwise", () => {
    expect(isAdmin(asMember(makeMember({ admin: false })))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("isDevBypass", () => {
  it("is false for a non-superuser (no SUPERUSER_IDS configured in tests)", () => {
    const { ix } = makeInteraction({});
    expect(isDevBypass(ix)).toBe(false);
  });
});

describe("canBypass", () => {
  it("passes a member with an allowed role", () => {
    const { ix } = makeInteraction({});
    expect(canBypass(ix, asMember(makeMember({ roleIds: ["a"] })), ["a"])).toBe(
      true,
    );
  });
  it("passes an administrator regardless of role", () => {
    const { ix } = makeInteraction({});
    expect(canBypass(ix, asMember(makeMember({ admin: true })), ["a"])).toBe(
      true,
    );
  });
  it("fails a member with neither", () => {
    const { ix } = makeInteraction({});
    expect(canBypass(ix, asMember(makeMember({ roleIds: ["z"] })), ["a"])).toBe(
      false,
    );
  });
});

describe("validateCommandPermissions", () => {
  it("allows 'show' for everyone when no show perms are set", () => {
    const { ix } = makeInteraction({ subcommand: "show" });
    expect(
      validateCommandPermissions(ix, asMember(makeMember({})), { add: ["a"] }),
    ).toBe(true);
  });

  it("blocks 'show' when show perms are set and the member lacks them", () => {
    const { ix, reply } = makeInteraction({ subcommand: "show" });
    const ok = validateCommandPermissions(ix, asMember(makeMember({})), {
      show: ["a"],
    });
    expect(ok).toBe(false);
    expect(reply).toHaveBeenCalled();
  });

  it("allows a gated subcommand when the member has the role", () => {
    const { ix } = makeInteraction({ subcommand: "add" });
    expect(
      validateCommandPermissions(ix, asMember(makeMember({ roleIds: ["a"] })), {
        add: ["a"],
      }),
    ).toBe(true);
  });

  it("blocks a gated subcommand when the member lacks the role", () => {
    const { ix, reply } = makeInteraction({ subcommand: "add" });
    const ok = validateCommandPermissions(
      ix,
      asMember(makeMember({ roleIds: ["z"] })),
      { add: ["a"] },
    );
    expect(ok).toBe(false);
    expect(reply).toHaveBeenCalled();
  });
});
