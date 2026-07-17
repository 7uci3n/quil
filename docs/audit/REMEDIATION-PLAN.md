# Remediation Plan — Spring Clean

[← Index](README.md)

Ordered so each phase unblocks the next. Tick IDs here as you land them; the detail
lives in the themed docs. Suggested: one branch + PR per phase.

---

## Phase 0 — Make the gates real _(fast, low-risk, do first)_

Config-only; no behavior change. Turns CI from theatre into a real safety net before
you touch logic.

- [x] `TOOL-2` ESLint `ignores: ["dist/**", "coverage/**", ".code-graph/**"]`
- [x] `TOOL-1` ESLint `globals.node`
- [x] `TOOL-6` add `.prettierignore`
- [x] `TOOL-3` add `@vitest/coverage-v8`; `all: true` + `include: ['src/**']`; thresholds at honest floor (~3%); CI runs `test:coverage`
- [x] `TOOL-4` add `typecheck: tsc --noEmit`; run in CI. _(Did NOT enable `noUnusedLocals/noUnusedParameters` — ESLint `no-unused-vars` already enforces this; avoids double-maintenance and a build-breaking flag flip. Left as a deliberate no-op.)_
- [~] `TOOL-5` dropped `jsx`. _(Tests NOT added to typecheck: they aren't in `tsconfig.include`, so `tsc --noEmit` covers `src` only. Adding a `tsconfig.test.json` is a small follow-up — tracked, not done.)_
- [x] Re-armed **lint** in `quality.yml` (blocking). **Format stays advisory** — re-arming it needs a repo-wide `prettier --write` (the deferred bulk reformat), out of Phase 0 scope.
- Also removed the dead vars that blocked a clean lint (QUAL-5 `ROLE`, `time`/`date`; ARCH-3 duplicate `resourceMapping` in `buy.ts`; dead channel-guard locals in `resource.ts`).
- **Exit ✅:** `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build` all green (45 tests; coverage measured + floor enforced).

## Phase 1 — Critical & security _(before ANY feature work)_

- [x] `SEC-1` 🔴 `/retire` uses parameterized statements + name validation, via a new `retireCharacter()`. Regression test incl. injection-style name.
- [x] `DATA-2` 🔴→ `retireCharacter()` wraps DELETE + CC transfer + promote in a transaction (rollback on error). Tested.
- [x] `BUG-1` 🔴 `seed.me.ts` now uses `initDb` + `migrateDb` (real schema); runtime-verified (exit 0).
- [x] `BUG-2` 🔴 `register-commands.ts` handles `--list`/`--clear-global` before (and instead of) the deploy branch, in both prod and dev.
- [x] `SEC-2` 🟠 `CONFIG.env` derived from `NODE_ENV` via `deriveEnv()`; `NODE_ENV` added to the zod schema. Tested.
- [x] `SEC-3` 🟠 `SUPERUSER_IDS`/`TEST_GUILD_IDS` added to the zod schema + `.env.example`, parsed via `parseCsv()`, consumed from `CONFIG.security`. Tested.
- [x] `SEC-4` 🟠 `db:wipe` refuses in production without `--force`/`CONFIRM_WIPE=yes` (`shouldRefuseWipe()`). Tested + runtime-verified.
- [x] `BUG-3` 🟠 `await`ed both `/reward` `adjustResource` writes.
- [x] `BUG-4` 🟠 `setActive()` returns a boolean; `/swap` replies an error (i18n) instead of false success. Tested.
- [x] `BUG-6` 🟠 `/sync` defers first, then `editReply`s.
- Byproducts: `DATA-7` (`/sync` rollback), partial `DATA-4` (`setActive` now `db.run` + boolean; transaction/index still Phase 2), `DOC-5` (swap header + "libary" typo).
- **Exit ✅:** No 🔴 remain; money/permission 🟠s closed. lint + typecheck + 57 tests green; scripts runtime-verified.

## Phase 2 — Data integrity & atomicity

- [x] `DATA-1` 🟠 new `spendResources()` does a single guarded `UPDATE … WHERE col >= ?` (all-or-nothing); `/buy` uses it. No overdraft even under concurrency. Tested.
- [x] `DATA-2` 🟠 `/retire` transaction (done in Phase 1 with `SEC-1`).
- [x] `DATA-3` 🟠 `/buy` validates + debits CC on the **active** character (consistent scope). _Note: treats CC as active-char-scoped, not a cross-character pool — confirm that's the intended game rule (see open question)._
- [x] `DATA-7` 🟠 `/sync` rollback on error (done in Phase 1 with BUG-6).
- [x] `DATA-4` 🟡 `setActive` now transactional; `/initiate` inserts inactive then activates; migration normalizes existing violations + adds a **partial unique index** `(userId) WHERE active = 1`. Verified against a pre-existing 2-active row. Tested.
- [x] `DATA-5` 🟡 shared `src/domain/dtp.ts` (`dtpPeriod`/`dtpDayBoundary`, rounded) used by `updateDTP`, `/initiate`, and the migration default. Tested.
- [ ] `DATA-6` 🟡 **BLOCKED — needs game-design input.** `dmrewards.json` L20 `xp:625` and L7 `xp:1650` look wrong, but the correct values aren't knowable from code. Awaiting confirmation of intended reward numbers.
- [x] `BUG-5` 🟠 `/reward custom` validates **all** recipients before applying any delta (no partial awards).
- **Exit ✅ (except DATA-6):** every money-mutating command is atomic (`spendResources`/transactions); one-active enforced at the DB. lint + typecheck + 65 tests green; migration prod-verified. DATA-6 needs a human decision.

## Phase 3 — Dead code & duplication

- [x] `ARCH-1` deleted `feature-registry.ts`; standardized on the flat auto-loader — documented in `docs/adr/0003-command-loading.md`.
- [x] `ARCH-2` deleted `features/lfg/repo.ts` (queried the dropped `lfg_presence` table; no importers).
- [x] `DEP-1` removed unused `better-sqlite3`; updated the migration-doc inspection snippet to the `sqlite3` CLI.
- [x] `DEP-2` `npm audit fix` (non-breaking): **20 → 7** advisories. Remaining 7 are the `sqlite3`→`node-gyp`→`tar`/`cacache` chain, only fixable via `sqlite3@6` (breaking) — left for the DEP-1-migration ADR decision.
- [~] `ARCH-3` extracted `src/utils/money.ts` (`toCp`/`toGp`, adopted in buy/sell/resource) and consolidated perms — `lfg.ts`/`rewards.ts` now use `validaters.ts` (`hasAnyRole`/`isAdmin`/`canBypass`), which also unified rewards' stray `DEV_SUPERUSERS` onto the validated `SUPERUSER_IDS`. **Deferred:** `announceLevelChange` dedup (two genuinely different signatures in `xp.ts` vs `rewards.ts` — a behavior-risky merge, Phase 4). Channel/mod-perm guard extraction also left for Phase 4 (small, per-command).
- [x] `ARCH-5` extracted `safeReplyError()` in `bot.ts` (3 duplicated blocks → 1).
- [x] `QUAL-5` `xp.ts` no longer mutates the imported JSON (sorts a copy); removed unused `FeaturePrereqs`. (`time`/`date` dead imports removed in Phase 1; duplicate `resourceMapping` in Phase 0.)
- **Exit ✅ (mostly):** dead modules gone; money/perms have one home. lint + typecheck + 65 tests green; all 15 command modules import cleanly. `announceLevelChange` + guard extraction carried to Phase 4.

## Phase 4 — Correctness polish & size

- [x] `BUG-7` registrar `findCommandFiles` is now flat, matching the runtime loader (ADR-0003).
- [x] `BUG-8` i18n: removed the dead fallback; `t()` warns + returns the key on missing/non-string keys (no more silent miss / "[object Object]"). Tested.
- [x] `BUG-9` `/resource` shows the "before" value in GP for `cp` (was raw copper).
- [x] `BUG-10` `/guildfund` shows GT directly (was `tp / 2`).
- [x] `BUG-11` `/buy` rejects sub-cent GP precision (mirrors `/sell`).
- [x] `BUG-12` (`init.db` clean exit) + `BUG-13` (retire `active` representation) — done in Phase 1's retire/init rewrite.
- [x] `QUAL-2` `/dm` resolves DM/Crew by config role IDs (`hasAnyRole`); `/retire` Guild-Member role via config ID. _(`uninitiated` role has no config ID yet — TODO comment left.)_
- [x] `QUAL-3` `ephemeral: true` → `flags: MessageFlags.Ephemeral` in initiate/dm/library.
- [~] `QUAL-4` moved initiate (invalid-name, already-exists) and library (no-story, not-yours) strings to `t()` (+ new `library.json`). _Deferred: the trailing " (updated/retired by …)" suffixes in charedit/retire (cosmetic 🟢)._
- [ ] `ARCH-4` **DEFERRED** — splitting `lfg.ts` (507) etc. is a large refactor of the most complex commands; doing it safely wants handler-level tests first (Phase 5 `TEST-1/2`). Not worth an untested rewrite right before the first push.
- [ ] `QUAL-1` **DEFERRED** — logger + ~60 `console.*` replacements: mechanical, low correctness value; scheduled as its own pass.
- Also deferred: `announceLevelChange` dedup (Phase 3 note — differing signatures).
- **Exit (partial):** all Phase 4 bugs + permission/ephemeral/i18n polish done; lint + typecheck + 69 tests green; 15 commands import cleanly. `ARCH-4`/`QUAL-1` consciously deferred with rationale.

## Phase 5 — Tests & docs

- [x] `TEST-1` integration tests rewritten to drive REAL code — `character-lifecycle` now exercises `adjustResource`/`getPlayerCC`/`retireCharacter`/`updateDTP`; `lfg-workflow` uses the real `db/lfg` functions (upsert/list/purge). No more inline-SQL false confidence.
- [x] `TEST-3` fixture (`test-db.ts`) builds the schema via the real `initDb`+`migrateDb` (temp file) and wires `getDb()` — can't drift from production.
- [x] `TEST-2` removed the dead `mock-interactions.ts` (0 importers).
- [x] Coverage: added real-code coverage; whole-`src` **3.6% → 17.2%** lines (`db_queries` ~70%). Thresholds raised to 15/9/18/16 and enforced in CI.
- [x] `DOC-1`/`DOC-2`/`DOC-4` rebranded bissel-modern → Quil (README clone URL, RUNBOOK, backup dir).
- [x] `DOC-3` ADR/CLAUDE.md DB lib (done at audit delivery).
- [x] `DOC-5` `/lfg` preview now actually ephemeral (matched the comment); `DOC-6` de-duped `deploy:list`, removed the non-functional `deploy:global`; `DOC-7` deleted stray `TODO.md`. (Earlier: swap header + sync/app.config typos fixed in Phases 1/3.)
- **Exit ✅:** tests drive real code; fixture can't drift; coverage measured + enforced (ratcheted); docs describe Quil. lint + typecheck + 61 tests green.

---

## Definition of done for the spring clean

- 🔴 = 0, 🟠 = 0. ✅
- `lint`, `typecheck` (src+tests), `test:coverage` (enforced floor), `build`, and
  **format** all green and BLOCKING in CI. ✅
- No dead modules; money mutations atomic; every fix carries a test. ✅
- Docs describe the real system. ✅
- **npm audit: 0 vulnerabilities** (sqlite3 → 6). ✅
- Logger in place; `console.*` gone from src. ✅

## Post-audit maintainer direction (see chat "open decisions")

- **D2 (resolved):** CC is a pooled PLAYER resource — pooled draw restored; a
  character's CC may go negative as long as the pool balances (settled on retire).
- **Done:** D4 (logger), D6 (suffix i18n), D7 (sqlite3@6, 0 vulns), D11 (format
  gate), D12 (tsconfig strict + test typecheck), D13 (uninitiated role id), D14
  (runbook unit name), D15 (default branch = main).
- **Partial:** D3 — LFG role/board extracted; the six handlers stay in lfg.ts
  pending handler-level tests.
- **Still deferred:** D1 (dmrewards L20/L7 — low importance, L20 is max level),
  D5 (announceLevelChange dedup — maintainer to review the announcement + agree a
  test shape), C block D8/D9/D10 (CD design, GHCR-public, polyphony/agent-team —
  after first push).
- **Before first push (D16):** local test against the dev Discord server.
