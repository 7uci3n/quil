// Discord interaction mocks. These build the smallest fakes that satisfy the
// slices of discord.js the command/feature handlers actually touch, then cast to
// the real type. Command handlers are driven for real against a temp DB (see
// fixtures/test-db.ts); only the Discord I/O surface is faked.
import { vi, type Mock } from "vitest";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  User,
} from "discord.js";

/* ── Users ─────────────────────────────────────────────────────────────── */
export interface MockUserOpts {
  id?: string;
  username?: string;
  displayName?: string;
}

export function makeUser(opts: MockUserOpts = {}): User {
  const id = opts.id ?? "user-1";
  const user = {
    id,
    username: opts.username ?? `user_${id}`,
    displayName: opts.displayName ?? `User ${id}`,
    bot: false,
    toString: () => `<@${id}>`,
    displayAvatarURL: () => "https://cdn.example/avatar.png",
  };
  return user as unknown as User;
}

/* ── Members ───────────────────────────────────────────────────────────── */
export interface MockMemberOpts {
  user?: User;
  roleIds?: string[];
  admin?: boolean;
  displayName?: string;
}

export interface MockMember {
  id: string;
  user: User;
  displayName: string;
  roles: {
    cache: Map<string, { id: string }>;
    add: Mock;
    remove: Mock;
  };
  permissions: { has: () => boolean };
}

export function makeMember(opts: MockMemberOpts = {}): MockMember {
  const user = opts.user ?? makeUser();
  const roleIds = opts.roleIds ?? [];
  return {
    id: user.id,
    user,
    displayName: opts.displayName ?? user.displayName,
    roles: {
      cache: new Map(roleIds.map((id) => [id, { id }])),
      add: vi.fn(async (_role?: unknown) => undefined),
      remove: vi.fn(async (_role?: unknown) => undefined),
    },
    permissions: { has: () => opts.admin ?? false },
  };
}

/* ── Roles / Channels / Guild ──────────────────────────────────────────── */
export interface MockRole {
  id: string;
  // discord.js exposes role.members as a Collection; handlers only call .map(),
  // so an array (which has .map) is a faithful-enough stand-in.
  members: MockMember[];
}

export function makeRole(id: string, members: MockMember[] = []): MockRole {
  return { id, members };
}

export interface MockChannel {
  id: string;
  parentId?: string | null;
  send: Mock;
  messages: { fetch: Mock };
}

export function makeChannel(id: string, over: Partial<MockChannel> = {}) {
  return {
    id,
    parentId: over.parentId ?? null,
    send: over.send ?? vi.fn(async (_opts?: unknown) => ({ id: "msg-1" })),
    messages: over.messages ?? {
      fetch: vi.fn(async (_id?: unknown) => ({ edit: vi.fn() })),
    },
  };
}

export interface MockGuildOpts {
  id?: string;
  name?: string;
  members?: MockMember[];
  roles?: MockRole[];
  channels?: ReturnType<typeof makeChannel>[];
}

export function makeGuild(opts: MockGuildOpts = {}) {
  const membersById = new Map((opts.members ?? []).map((m) => [m.id, m]));
  const rolesById = new Map((opts.roles ?? []).map((r) => [r.id, r]));
  const channelsById = new Map((opts.channels ?? []).map((c) => [c.id, c]));
  return {
    id: opts.id ?? "371668519059980288",
    name: opts.name ?? "Remnant",
    members: {
      fetch: vi.fn(async (id: string) => {
        const m = membersById.get(id);
        if (!m) throw new Error(`no such member ${id}`);
        return m;
      }),
    },
    roles: {
      cache: {
        get: (id: string) => rolesById.get(id),
        find: (fn: (r: MockRole) => boolean) =>
          [...rolesById.values()].find(fn),
      },
    },
    channels: {
      cache: { get: (id: string) => channelsById.get(id) },
      fetch: vi.fn(async (id: string) => channelsById.get(id) ?? null),
    },
  };
}

/* ── Chat-input interaction ────────────────────────────────────────────── */
type OptionValue = string | number | boolean | null;

export interface MockInteractionOpts {
  subcommand?: string;
  /** getString / getInteger / getNumber / getBoolean values, keyed by name. */
  options?: Record<string, OptionValue>;
  /** getUser values, keyed by option name. */
  users?: Record<string, User | null>;
  user?: User;
  member?: MockMember | null;
  guild?: ReturnType<typeof makeGuild> | null;
  guildId?: string | null;
  channelId?: string | null;
  channel?: unknown;
  client?: unknown;
  /** Return value for interaction.reply (library uses withResponse). */
  replyResult?: unknown;
}

export interface MockInteraction {
  ix: ChatInputCommandInteraction;
  reply: Mock;
  editReply: Mock;
  deferReply: Mock;
  followUp: Mock;
  showModal: Mock;
  /** Content string of the Nth reply/editReply/followUp call. */
  replyContent: (n?: number) => string | undefined;
}

// Default guild id that is NOT the configured guild, so channel guards no-op.
const NON_GUILD = "test-guild-000";

export function makeInteraction(
  opts: MockInteractionOpts = {},
): MockInteraction {
  const options = opts.options ?? {};
  const users = opts.users ?? {};
  const user = opts.user ?? opts.member?.user ?? makeUser();

  const val = (name: string): OptionValue =>
    Object.prototype.hasOwnProperty.call(options, name) ? options[name]! : null;

  const req = <T>(v: T | null, name: string, required?: boolean): T | null => {
    if (v == null && required)
      throw new Error(`missing required option ${name}`);
    return v;
  };

  const reply = vi.fn(async (_opts?: unknown) => opts.replyResult);
  const editReply = vi.fn(async (_opts?: unknown) => undefined);
  const followUp = vi.fn(async (_opts?: unknown) => undefined);
  const showModal = vi.fn(async (_modal?: unknown) => undefined);

  const ix = {
    user,
    member: opts.member ?? null,
    guild: opts.guild ?? null,
    guildId: opts.guildId !== undefined ? opts.guildId : NON_GUILD,
    channelId: opts.channelId ?? null,
    channel: opts.channel ?? null,
    client: opts.client ?? {
      readyTimestamp: Date.now() - 5000,
      ws: { ping: 42 },
    },
    commandName: "test",
    deferred: false,
    replied: false,
    options: {
      getSubcommand: (_required?: boolean) => {
        if (!opts.subcommand && _required) throw new Error("no subcommand");
        return opts.subcommand as string;
      },
      getString: (name: string, required?: boolean) => {
        const v = val(name);
        return req(v == null ? null : String(v), name, required);
      },
      getInteger: (name: string, required?: boolean) => {
        const v = val(name);
        return req(v == null ? null : Number(v), name, required);
      },
      getNumber: (name: string, required?: boolean) => {
        const v = val(name);
        return req(v == null ? null : Number(v), name, required);
      },
      getBoolean: (name: string) => {
        const v = val(name);
        return typeof v === "boolean" ? v : null;
      },
      getUser: (name: string, required?: boolean) =>
        req(users[name] ?? null, name, required),
    },
    reply,
    editReply,
    followUp,
    showModal,
    deferReply: vi.fn(async () => {
      (ix as { deferred: boolean }).deferred = true;
    }),
  };

  const deferReply = ix.deferReply as Mock;

  const replyContent = (n = 0): string | undefined => {
    const calls = [
      ...reply.mock.calls,
      ...editReply.mock.calls,
      ...followUp.mock.calls,
    ];
    const arg = calls[n]?.[0] as { content?: string } | undefined;
    return arg?.content;
  };

  return {
    ix: ix as unknown as ChatInputCommandInteraction,
    reply,
    editReply,
    deferReply,
    followUp,
    showModal,
    replyContent,
  };
}

/* ── Autocomplete interaction ──────────────────────────────────────────── */
export interface MockAutocompleteOpts {
  focused: { name: string; value: string };
  /** getString values (e.g. genre). */
  strings?: Record<string, string | null>;
  /** options.get(name) → { value } (e.g. resolved user id). */
  raw?: Record<string, { value: unknown } | undefined>;
  userId?: string;
}

export function makeAutocomplete(opts: MockAutocompleteOpts) {
  const respond = vi.fn(async (_choices?: unknown) => undefined);
  const ix = {
    user: { id: opts.userId ?? "user-1" },
    options: {
      getFocused: (_full?: boolean) => opts.focused,
      getString: (name: string) => opts.strings?.[name] ?? null,
      get: (name: string) => opts.raw?.[name] ?? null,
    },
    respond,
  };
  return { ix: ix as unknown as AutocompleteInteraction, respond };
}

/* ── Modal submit interaction ──────────────────────────────────────────── */
export interface MockModalOpts {
  customId: string;
  fields: Record<string, string>;
  user?: User;
  guild?: ReturnType<typeof makeGuild> | null;
}

export function makeModalSubmit(opts: MockModalOpts) {
  const reply = vi.fn(async (_opts?: unknown) => undefined);
  const user = opts.user ?? makeUser();
  const ix = {
    customId: opts.customId,
    user,
    guild: opts.guild ?? null,
    fields: {
      getTextInputValue: (id: string) => opts.fields[id] ?? "",
    },
    reply,
  };
  return { ix: ix as unknown as ModalSubmitInteraction, reply };
}
