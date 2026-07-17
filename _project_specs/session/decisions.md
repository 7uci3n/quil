<!--
LOG DECISIONS WHEN:
- Choosing between architectural approaches
- Selecting libraries or tools
- Making security-related choices
- Deviating from standard patterns

This is append-only. Never delete entries.
-->

# Decision Log

## Format

```
## [YYYY-MM-DD] Decision Title

**Decision**: What was decided
**Context**: Why this decision was needed
**Options Considered**: What alternatives existed
**Choice**: Which option was chosen
**Reasoning**: Why this choice was made
**Trade-offs**: What we gave up
**References**: Related code/docs
```

---

## [2026-07-17] Adopt Claude guardrails (full setup) on existing codebase

**Decision**: Add Claude skills, ADRs, project specs, guardrails, and CI without
restyling existing code.
**Context**: /initialize-project run on an existing, working TypeScript bot.
**Choice**: Full setup, preserving existing ESLint/Prettier/TS/vitest config.
**Reasoning**: Additive guardrails improve maintainability without churn.
**Trade-offs**: Some overlap with the pre-existing `.github/copilot-instructions.md`.
**References**: CLAUDE.md, docs/adr/0001-project-init.md

---

## [2026-07-17] LFG purge scope-awareness + mutation atomicity (post-audit review)

**Decision**: Purge clears only in-scope tier columns (deleting a row only when no
tier remains) and reconciles Discord roles from the authoritative post-purge entry
via `syncRolesFor`; all LFG mutations go through an atomic `applyLfgMutation`
(single `db.transaction()`), guild-scoped reads.
**Context**: An independent review of the LFG subsystem (extracted after the
original audit under ARCH-4) found two defects the audit never covered: purge
deleted the whole row but stripped only scope-matching roles (DB↔role desync), and
toggle/add/remove were read-modify-write across an `await members.fetch` (lost
update; stale confirmation message).
**Options Considered**: (a) keep whole-row delete but remove ALL roles; (b) make
purge column-scoped + reconcile via the existing role-sync helper.
**Choice**: (b), plus an atomic mutation helper; `purgeLfgBefore` now returns
`{userId, entry|null}[]`; `handlePurge` defers before its per-user fetch loop.
**Reasoning**: Column-scoped clearing matches the command's stated scope semantics
(`all` = leveled tiers, `pbp` = play-by-post) and lets one code path (`syncRolesFor`)
keep DB and roles consistent. better-sqlite3 transactions remove the interleave.
**Trade-offs**: Purge return contract changed (callers + one test updated); `/lfg
remove all` now also drops the base LFG role (was inconsistently retained).
**References**: docs/adr/0005-lfg-purge-and-mutation-atomicity.md; src/db/lfg.ts;
src/features/lfg/handlers.ts

## [2026-07-17] Post-audit hygiene batch

**Decision**: Removed the unwired `domain/mip.ts` LootService PoC; routed the LFG
board embed through `t()`; renamed `validaters.ts`→`validators.ts`; moved the
`/library` Google Sheet ID to `LIBRARY_SHEET_ID` (env, defaulted); guarded
`backup.ts` retention against a non-numeric `BACKUP_RETAIN_DAYS`; disabled
`/library` buttons on collector timeout; added a fetch fallback for the LFG board
channel; fixed the stale `strings-smoke` key.
**Context**: Low-severity items surfaced by the independent review; `mip.ts` was an
experiment/PoC with no importer (to be re-added later with a proper spec if needed).
**Choice**: Address as a single non-behavioral cleanup; DATA-6 (dmrewards L7) left
open per maintainer (game-design call; L20 is max level).
**Reasoning**: Removes dead code/duplication, honors the i18n + config conventions,
and closes footguns without changing product behavior.
**Trade-offs**: None material; coverage rose 17.4%→20.1% (mip removed).
**References**: docs/audit/{01,04,05}; src/utils/gsheet.ts; src/scripts/backup.ts

---

## [2026-07-17] Base "Future Scheduling LFG" role is self-service (bot never manages it)

**Decision**: The bot no longer adds or removes the base LFG role
(`features.lfg.roles.lfg` = `1370483275017228400`). The role ID is removed from
config, `LFG_BASE_ROLE_ID` is deleted, and `syncRolesFor` reconciles only the five
tier roles (`low/mid/high/epic/pbp`).
**Context**: A server mod confirmed `/lfg purge` stripped the "Future Scheduling
LFG" role from purged players. Tracing showed the role is used ONLY by
`syncRolesFor` (auto add on tier join / auto remove when empty). Mods clarified the
role is assigned via the server's self-service role menu and must not be automated.
**Choice**: Remove the automation entirely (option "standing / add-only" was moot
once we learned the role is assigned outside the bot).
**Reasoning**: Matches the moderators' documented command spec; the bot has no
business toggling a self-service role.
**Trade-offs**: Supersedes the earlier note in the "LFG purge scope-awareness +
mutation atomicity" entry that said `/lfg remove all` would drop the base role —
it now leaves the base role untouched on every path, which is the desired behavior.
**References**: docs/adr/0005 §3; src/features/lfg/roles.ts; src/config/app.config.ts

---

## 2026-07-17 — Recovered work from `20260717_misc_work_snapshot` (ADR-0007, ADR-0008)

**Decision**: Reverse-engineered the abandoned pre-refactor branch and
re-implemented its net-new value TDD-style (RED→GREEN→VALIDATE) on top of current
`main`, rather than merging (branch predated the `validaters→validators` rename
and the better-sqlite3 migration, so a merge was infeasible).

**Shipped**:

- `requireRole` / `requireChannel` guard helpers in `config/validators.ts`
  (ADR-0007). Refactored `buy`, `sell` (channel), `retire`, `charedit`
  (permission) onto them. Permission for managing _another_ player's character
  tightened to **staff roles only** (moderator/admin/keeper + Administrators),
  dropping base-crew and raw-KickMembers paths. `retire`'s hardcoded English
  string replaced with `t('retire.noPermission')`.
- `/charedit rename` gated to the `charSubmissions` forum (id 1408349966686224424)
  via `requireChannel`; success reply made public as the forum audit record.
- Library `author` column: DB migration (`library.author`), `gsheet.rowsToStories`
  (pure, tested), `/sync` insert, footer "• By {author}", + 🔒 owner lock button.
- Dev-config override (ADR-0008): git-ignored `app.config.dev.ts` deep-merged over
  DEFAULT_CONFIG via exported `deepMerge`; disabled in prod. Example committed.

**Dropped as obsolete**: the branch's `hasAnyRole`/`isAdmin` extraction (the
refactor already did it, better) and its `dm.ts` change (already absorbed).

**Validation**: 105 tests pass (14 files; +5 new test files), tsc clean, eslint
clean on all touched files, prod build clean. Coverage above enforced floors.

**References**: docs/adr/0007, docs/adr/0008; branch `20260717_misc_work_snapshot`
commit 53c47e1.
