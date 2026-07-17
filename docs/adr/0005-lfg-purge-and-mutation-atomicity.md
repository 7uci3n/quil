# 0005 - LFG purge is scope-aware; LFG mutations are atomic

**Status:** accepted (implemented 2026-07-17 on `fix/lfg-purge-atomicity-cleanup`)
**Date:** 2026-07-17
**Deciders:** Project maintainers
**Refs:** ADR-0004 (better-sqlite3), ADR-0003 (command loading / LFG extraction);
post-audit review of the LFG subsystem (`features/lfg/*`, `db/lfg.ts`)

## Context

The LFG subsystem was extracted into `features/lfg/*` after the original audit
(ARCH-4), so two defects in it were never covered by `docs/audit/`:

1. **Purge deleted the whole row but stripped only scope-matching roles.**
   `purgeLfgBefore(scope)` selected rows scope-specifically but always ran
   `DELETE FROM lfg_status WHERE userId IN (...)`, removing the entire entry.
   `handlePurge` then removed only the scope's roles. A user in `pbp` **and**
   `low`, both stale, purged with `scope:pbp`, lost their whole DB row (vanished
   from every board section) yet kept their `low/mid/high/epic` roles — a
   persistent DB↔role desync.

2. **LFG mutations were a read-modify-write across an `await`.**
   `handleToggle`/`handleAdd`/`handleRemove` did `getLfgEntry` (read) →
   `await members.fetch(...)` → `upsertLfgEntry` (write). Even though
   better-sqlite3 statements are synchronous (ADR-0004), the intervening `await`
   yields the event loop, so two concurrent `/lfg` calls for the same user both
   read the pre-state and the second write clobbers the first (lost update). The
   confirmation message was also built from the pre-mutation snapshot (stale).

## Decision

### 1. Purge clears in-scope tier columns, deletes only when nothing remains

`purgeLfgBefore(guildId, olderThanMs, scope)` runs inside a single
`db.transaction()` and, for each stale in-scope row:

- clears **only the in-scope tier columns** (`scope:"pbp"` → `pbp`;
  `scope:"all"` → `low/mid/high/epic`),
- **deletes** the row iff no tier remains, otherwise **updates** it,
- returns `{ userId, entry }[]` where `entry` is the surviving row or `null`
  when deleted.

`handlePurge` then reconciles Discord roles from that authoritative result via the
existing `syncRolesFor(member, entry)` (a zeroed entry for deleted rows), instead
of the previous ad-hoc, scope-branched role removal. DB and roles can no longer
disagree. `syncRolesFor` manages **tier roles only** (see §3).

**Scope semantics (made explicit):** `scope:"all"` means the four **leveled**
tiers (`low/mid/high/epic`); `scope:"pbp"` means Play-by-Post only. These are
disjoint groups — this preserves the pre-existing selection/role behavior; the
fix is only the row-vs-column deletion mismatch, not the tier grouping.

### 2. LFG mutations are atomic read-modify-write

A new `applyLfgMutation(userId, guildId, makeDefault, mutate)` performs
read → mutate → upsert/delete inside one `db.transaction()`. Because
better-sqlite3 is synchronous and the transaction contains no `await`, the
sequence cannot interleave. The `members.fetch` (network) is moved out of the
critical section, and role sync + reply are driven from the transaction's return
value (which also fixes the stale confirmation list). An empty result deletes the
row (consistent with `/lfg remove`).

### 3. The base "Future Scheduling LFG" role is self-service — the bot never touches it

Per the server moderators, the base LFG role (`features.lfg.roles.lfg`,
`1370483275017228400`) is assigned through the server's **self-service role menu**,
not by the LFG feature. The bot previously auto-added it (on joining a tier) and
auto-removed it (on purge / clearing the last tier) via `syncRolesFor` — the cause
of the reported bug where `/lfg purge` stripped the role. We remove that
automation entirely: the role ID is dropped from config, `LFG_BASE_ROLE_ID` is
deleted, and `syncRolesFor` reconciles **only the five tier roles**
(`low/mid/high/epic/pbp`). No LFG command adds or removes the base role.

## Consequences

- **Contract change:** `purgeLfgBefore` returns `{ userId; entry: LfgEntry|null }[]`
  instead of `string[]`. The only callers are `handlePurge` and the LFG integration
  test, both updated. `handlePurge` also `deferReply()`s before its per-user
  `members.fetch` loop (removes the 3s "Unknown interaction" risk).
- `getLfgEntry` and `applyLfgMutation` are **guild-scoped** (filter by `guildId`)
  so a foreign-guild row is never read or overwritten. The table PK stays
  `userId` (single-guild deployment); a true multi-guild composite key remains a
  future migration, out of scope here.

## Non-goals

- No schema change. `lfg_status` keeps its columns and `userId` primary key.
- The sticky-board duplicate-post race (two concurrent first-posts when no
  message id is stored yet) is mitigated but not fully lock-free; tracked
  separately.
