# 0007 - Reusable command guards (`requireRole` / `requireChannel`)

**Status:** accepted (implemented 2026-07-17)
**Date:** 2026-07-17
**Deciders:** Project maintainers
**Refs:** `src/config/validators.ts`; recovered from abandoned branch
`20260717_misc_work_snapshot`; ADR-0003 (command loading)

## Context

Command entrypoints each hand-rolled their access checks:

- **Channel gates** (`buy`, `sell`) inlined the same
  `channelId === A || channelId === B` + `guildId === CONFIG.guild.id` block,
  copy-pasted with subtle drift (buy checked four channels, sell two) and no
  awareness of threads/forum posts.
- **"Manage another player" gates** (`retire`, `charedit`) inlined a
  `member.permissions.has(KickMembers) || member.roles.cache.some(... any
configured role ...)` block. `retire` even replied with a **hardcoded**
  English string, violating the i18n rule in CLAUDE.md.

This duplication meant permission/UX fixes had to be applied N times, and the
"any configured role" check silently granted base crew the ability to retire or
rename _other_ players' characters.

## Decision

Add two async guard helpers to `src/config/validators.ts`, built on the existing
`hasAnyRole` / `isAdmin` primitives:

- **`requireRole(interaction, roleIds, errorKey?)`** — fetches the member, passes
  when they hold any of `roleIds` **or** are a server Administrator. On failure
  it replies ephemerally with `t(errorKey)` and returns `undefined`; on success
  it returns the fetched `GuildMember` (so callers reuse it). Default
  `errorKey` is `common.noRole`.
- **`requireChannel(interaction, channelIds, { allowThreads?, errorKey? })`** —
  only enforced inside the configured guild (`guildId === CONFIG.guild.id`), so
  dev/test servers are never blocked. Passes when the interaction's channel (or,
  with `allowThreads: true`, its thread/forum-post parent) matches any allowed
  id. Empty/unconfigured id list ⇒ pass. On failure replies ephemerally with
  `t(errorKey, { channel })`. Default `errorKey` is `common.notInChannel`.
  `allowThreads` defaults to `true` — **required** for forum channels, whose
  interactions only ever occur inside posts (threads whose `parentId` is the
  forum).

Permission semantics for managing _another_ player's character are tightened to
**staff roles only** (`moderator`, `admin`, `keeper`) + Administrators, dropping
the base-crew and raw-`KickMembers` paths.

## Consequences

- Channel/role gating is one call each; `buy`, `sell`, `retire`, `charedit`
  refactored onto the helpers. `retire`'s hardcoded string is replaced with
  `t('retire.noPermission')`.
- **Behavioral change:** base crew (and users with only the Discord Kick-Members
  permission) can no longer retire/rename other players. This is intentional.
- `validators.ts` now imports `discord.js` `MessageFlags` and `i18n.t` — the
  module can reply, not just compute booleans. Guard helpers therefore assume a
  repliable `ChatInputCommandInteraction` and must run before any `deferReply`.
- File sits at 10 functions (the project's per-file ceiling); further guards
  should prompt a split into `validators/` submodules.

## Alternatives Considered

| Option                                           | Pros                     | Cons                                                       | Why Not                                      |
| ------------------------------------------------ | ------------------------ | ---------------------------------------------------------- | -------------------------------------------- |
| Keep inline checks                               | No new abstraction       | Duplication, drift, hardcoded strings persist              | The problem we're fixing                     |
| Boolean-only helpers (no reply)                  | Pure, trivially testable | Every caller re-writes the identical ephemeral reply       | Marginal; the reply _is_ the duplicated part |
| Middleware/decorator layer in the command loader | Fully declarative gates  | Large change to ADR-0003 loading; overkill for ~4 commands | Disproportionate                             |

## Links

- Supersedes: N/A
- Related: ADR-0003 (command loading), ADR-0008 (dev-config override, recovered
  from the same branch)
