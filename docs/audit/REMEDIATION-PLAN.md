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

- [ ] `DATA-1` 🟠 atomic conditional debit (no negative balances)
- [ ] `DATA-2` 🟠 wrap `/retire` in a transaction (done with `SEC-1`)
- [ ] `DATA-3` 🟠 fix `/buy` CC scope
- [x] `DATA-7` 🟠 `/sync` rollback on error _(done in Phase 1 with BUG-6)_
- [~] `DATA-4` 🟡 `setActive` now `db.run` + returns boolean (Phase 1); transaction + partial unique index still TODO
- [ ] `DATA-5` 🟡 consistent DTP normalization + rounding
- [ ] `DATA-6` 🟡 correct `dmrewards.json` anomalies
- [ ] `BUG-5` 🟠 validate all `/reward` recipients before applying
- **Exit:** Every money-mutating command is atomic; a concurrency test suite proves it.

## Phase 3 — Dead code & duplication

- [ ] `ARCH-1` delete/adopt `feature-registry.ts` (ADR the command-loading strategy)
- [ ] `ARCH-2` delete/migrate `features/lfg/repo.ts`
- [ ] `DEP-1` remove `better-sqlite3` (or schedule migration — its own ADR)
- [ ] `DEP-2` `npm audit fix` (non-breaking) + retest
- [ ] `ARCH-3` extract `utils/perms.ts`, `utils/money.ts`, `utils/guards.ts`
- [ ] `ARCH-5` extract `safeReplyError` in `bot.ts`
- [ ] `QUAL-5` remove dead imports/types; fix xp.ts import mutation
- **Exit:** No dead modules; guards/money helpers have one home.

## Phase 4 — Correctness polish & size

- [ ] `BUG-7` unify command-loader traversal
- [ ] `BUG-8` finish i18n fallback + missing-key warnings
- [ ] `BUG-9`/`BUG-10`/`BUG-11`/`BUG-13` display/precision/representation fixes
- [ ] `BUG-12` `/init` closes DB
- [ ] `ARCH-4` split `lfg.ts` (507), then `rewards.ts`/`bot.ts`/`resource.ts`/`buy.ts`
- [ ] `QUAL-1` introduce a logger; replace `console.*`
- [ ] `QUAL-2` role resolution by config IDs
- [ ] `QUAL-3`/`QUAL-4` `flags:` ephemeral + move strings to `t()`

## Phase 5 — Tests & docs

- [ ] `TEST-1` rewrite integration tests to drive real code
- [ ] `TEST-3` reuse `initDb`/`migrateDb` in the fixture
- [ ] `TEST-2` handler tests via the mocks (or remove them)
- [ ] Fill coverage gaps top-down (resource DTP, `db_queries`, money commands); raise thresholds
- [ ] `DOC-1`/`DOC-2`/`DOC-4` rebrand bissel-modern → Quil
- [ ] `DOC-3` fix ADR/CLAUDE.md DB lib _(done at audit delivery)_
- [ ] `DOC-5`/`DOC-6`/`DOC-7` typos, script de-dupe, retire `TODO.md`

---

## Definition of done for the spring clean

- 🔴 = 0, 🟠 = 0.
- `lint`, `typecheck`, `test` green in CI; coverage measured with an enforced floor.
- No dead modules; money mutations atomic; every fix carries a test that failed first (RED→GREEN).
- Docs describe the real system (right repo, right DB library, right service name).
