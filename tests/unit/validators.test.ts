import { describe, it, expect, vi } from "vitest";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { requireRole, requireChannel } from "../../src/config/validators.js";
import { CONFIG } from "../../src/config/resolved.js";

// CONFIG.guild.id is the hardcoded Remnant guild id from DEFAULT_CONFIG.
const GUILD_ID = CONFIG.guild!.id;

type FakeMember = Pick<GuildMember, never> & {
  roles: { cache: Map<string, { id: string }> };
  permissions: { has: () => boolean };
};

function fakeMember(roleIds: string[], admin = false): FakeMember {
  return {
    roles: { cache: new Map(roleIds.map((id) => [id, { id }])) },
    permissions: { has: () => admin },
  };
}

function fakeInteraction(opts: {
  member?: FakeMember | null;
  guildId?: string | null;
  channelId?: string | null;
  parentId?: string | null;
}) {
  const reply = vi.fn(async () => undefined);
  const channel =
    opts.parentId !== undefined ? { parentId: opts.parentId } : undefined;
  const guild =
    opts.member === null
      ? undefined
      : { members: { fetch: vi.fn(async () => opts.member) } };
  const ix = {
    user: { id: "user-1" },
    guild,
    guildId: opts.guildId ?? GUILD_ID,
    channelId: opts.channelId ?? null,
    channel,
    reply,
  } as unknown as ChatInputCommandInteraction;
  return { ix, reply };
}

describe("requireRole", () => {
  it("returns the member and does not reply when they hold an allowed role", async () => {
    const member = fakeMember(["role-A"]);
    const { ix, reply } = fakeInteraction({ member });
    const result = await requireRole(
      ix,
      ["role-A", "role-B"],
      "retire.noPermission",
    );
    expect(result).toBe(member);
    expect(reply).not.toHaveBeenCalled();
  });

  it("passes server Administrators even without a listed role", async () => {
    const member = fakeMember([], true);
    const { ix, reply } = fakeInteraction({ member });
    const result = await requireRole(ix, ["role-A"], "retire.noPermission");
    expect(result).toBe(member);
    expect(reply).not.toHaveBeenCalled();
  });

  it("rejects (undefined + ephemeral reply) when the member lacks the role and is not admin", async () => {
    const member = fakeMember(["role-Z"]);
    const { ix, reply } = fakeInteraction({ member });
    const result = await requireRole(ix, ["role-A"], "retire.noPermission");
    expect(result).toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(typeof arg.content).toBe("string");
    expect(arg.content).not.toBe("retire.noPermission"); // key resolved to text
    expect(arg.flags).toBeDefined();
  });

  it("rejects when there is no member to fetch", async () => {
    const { ix, reply } = fakeInteraction({ member: null });
    const result = await requireRole(ix, ["role-A"]);
    expect(result).toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("filters out null/undefined role ids", async () => {
    const member = fakeMember(["role-A"]);
    const { ix, reply } = fakeInteraction({ member });
    // Only falsy ids configured → nobody but admins can pass.
    const result = await requireRole(ix, [undefined as unknown as string]);
    expect(result).toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
  });
});

describe("requireChannel", () => {
  it("is a no-op (returns true) outside the configured guild", async () => {
    const { ix, reply } = fakeInteraction({
      guildId: "some-other-guild",
      channelId: "wrong",
    });
    expect(await requireChannel(ix, "allowed-chan")).toBe(true);
    expect(reply).not.toHaveBeenCalled();
  });

  it("returns true when in an allowed channel", async () => {
    const { ix, reply } = fakeInteraction({ channelId: "allowed-chan" });
    expect(await requireChannel(ix, ["allowed-chan", "other"])).toBe(true);
    expect(reply).not.toHaveBeenCalled();
  });

  it("returns true for a thread whose parent is an allowed channel (allowThreads default)", async () => {
    const { ix, reply } = fakeInteraction({
      channelId: "thread-1",
      parentId: "forum-chan",
    });
    expect(await requireChannel(ix, "forum-chan")).toBe(true);
    expect(reply).not.toHaveBeenCalled();
  });

  it("rejects a thread-parent match when allowThreads is false", async () => {
    const { ix, reply } = fakeInteraction({
      channelId: "thread-1",
      parentId: "forum-chan",
    });
    expect(
      await requireChannel(ix, "forum-chan", { allowThreads: false }),
    ).toBe(false);
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("rejects and replies ephemerally (with a channel mention) when not in an allowed channel", async () => {
    const { ix, reply } = fakeInteraction({ channelId: "wrong-chan" });
    expect(await requireChannel(ix, "allowed-chan")).toBe(false);
    expect(reply).toHaveBeenCalledTimes(1);
    const arg = reply.mock.calls[0]![0] as { content: string; flags: number };
    expect(arg.content).toContain("<#allowed-chan>");
    expect(arg.flags).toBeDefined();
  });

  it("returns true when no channel ids are configured (guard not set up)", async () => {
    const { ix, reply } = fakeInteraction({ channelId: "whatever" });
    expect(await requireChannel(ix, [null, undefined])).toBe(true);
    expect(reply).not.toHaveBeenCalled();
  });
});
