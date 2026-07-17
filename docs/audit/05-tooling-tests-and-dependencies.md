# 05 — Tooling, Tests & Dependencies

[← Index](README.md)

---

## Tooling config bugs

## 🟡 TOOL-1 — ESLint uses `globals.browser` on a Node project

- [ ] **`eslint.config.ts:7`** · Verified: agent (probe-tested)
- **Issue:** A Node bot is linted with browser globals: `process`/`Buffer` trigger
  bogus `no-undef` in `.js`, while `window`/`document` are wrongly allowed. Muted on
  `src/` today (all `.ts`, and `tseslint` disables core `no-undef`) but wrong.
- **Fix:** `languageOptions: { globals: globals.node }`.

## 🟡 TOOL-2 — ESLint lints the build output (`dist/`)

- [ ] **`eslint.config.ts` (no `ignores` key)** · Verified: hand + agent
- **Issue:** No `ignores`, so `eslint .` lints emitted `dist/**/*.js` after a build.
  Combined with `TOOL-1` this is the entire reason the gate showed **109** errors vs
  the real **13** in `src/`.
- **Fix:** `{ ignores: ["dist/**", "node_modules/**", "coverage/**"] }`.

## 🟡 TOOL-3 — `test:coverage` is broken; coverage never enforced

- [ ] **`vitest.config.ts:11` vs `package.json`** · Verified: agent (ran it)
- **Issue:** `provider: 'v8'` is configured but `@vitest/coverage-v8` is not a
  devDependency, so `npm run test:coverage` fails immediately. CI runs plain
  `npm test`, and no coverage thresholds are set — your 80% standard is unenforced
  everywhere.
- **Fix:** Add `@vitest/coverage-v8`; set `coverage.thresholds` (start realistic,
  raise over time); run `test:coverage` in CI.

## 🟡 TOOL-4 — No pure typecheck; `build` emits

- [ ] **`package.json:12`, `tsconfig.json:29-30`** · Verified: agent
- **Issue:** No `tsc --noEmit` script; CI's "Type check / build" produces `dist/`
  output instead of a pure check. `noUnusedLocals`/`noUnusedParameters` are commented
  out (so unused code is only caught by ESLint).
- **Fix:** Add `"typecheck": "tsc --noEmit"`; run it in CI; enable the unused-\* flags.

## 🟢 TOOL-5 — `tsconfig` misconfigurations

- [ ] **`tsconfig.json:36,44`** · Verified: agent
- **Issue:** `jsx: "react-jsx"` is meaningless for a discord.js bot; `include: ["src","data"]`
  treats `data` as a source root and **excludes `tests/`** from typecheck.
- **Fix:** Drop `jsx`; add `tests` to the typecheck include (or a separate tsconfig).

---

## Tests

## 🟠 TEST-1 — Integration tests validate SQLite, not the bot (false confidence)

- [ ] **`tests/integration/character-lifecycle.test.ts`, `lfg-workflow.test.ts`** · Verified: agent
- **Issue:** Both open a real in-memory sqlite (good) but then run **hand-written
  inline SQL that re-implements the logic** instead of importing production code (e.g.
  LFG tier assignment duplicated as a ternary `lfg-workflow.test.ts:95-98`;
  retire/CC-transfer inline `UPDATE`/`DELETE` `character-lifecycle.test.ts:243-281`).
  They would still pass if the real command/`db_queries` code were broken.
  `adjustResource` — the real balance mutation — is never exercised.
- **Fix:** Drive the actual handlers / `src/utils/db_queries.ts` / `src/domain/*` from
  tests. This is what would have caught `SEC-1`, `DATA-1`, `DATA-2`.

## 🟡 TEST-2 — Discord interaction mocks are dead code

- [ ] **`tests/fixtures/mock-interactions.ts`** · Verified: agent
- **Issue:** Imported by **zero** tests. No command handler, permission-denial path,
  or concurrent-active-character case is tested.
- **Fix:** Use the mocks to write handler-level tests, or remove them.

## 🟡 TEST-3 — Test schema is a hand-copied duplicate

- [ ] **`tests/fixtures/test-db.ts:15`** · Verified: agent
- **Issue:** The schema is a hand-copied duplicate of `initDb` (per its own comment)
  and can silently diverge from production/migrations.
- **Fix:** Import/reuse `initDb`/`migrateDb` so tests run the real schema.

### Coverage gaps (risk-ranked — files with no real tests)

1. `src/domain/resource.ts` — DTP accrual + 365-cap math. **Untested.**
2. `src/utils/db_queries.ts` — `adjustResource` (incl. allowlist `throw`), `getPlayer`, `getPlayerCC`, `setActive`.
3. `src/commands/{buy,sell,dm,rewards,guildfund}.ts` — resource-changing handlers.
4. `src/features/lfg/repo.ts`, `src/db/lfg.ts`, `src/domain/lfg.ts` — reimplemented inline, not imported.
5. `src/domain/mip.ts` (193 lines), `src/domain/guildState.ts`.
6. Remaining command handlers: `charedit, charinfo, initiate, retire, swap, library, resource, health, sync`.
7. `src/config/*` (incl. permission logic), `src/core/*`, `src/utils/{embeds,autocomplete,gsheet}.ts`, `src/lib/i18n.ts`.

Only `src/domain/xp.ts` and `src/domain/rewards.ts` have genuine unit tests (and
these are the strongest in the suite — real imports, clamping, level boundaries).

---

## Dependencies

## 🟠 DEP-1 — `better-sqlite3` is a dead dependency

- [ ] **`package.json`** · Verified: hand
- **Issue:** Not imported anywhere in `src/` or `tests/`. The live driver is the async
  `sqlite` + `sqlite3` wrapper.
- **Decision required (pick one):**
  - **(A) Remove `better-sqlite3`** — smallest change, stays on `sqlite3`. Leaves the
    `node-gyp`/`tar` vuln chain (`DEP-2`).
  - **(B) Migrate TO `better-sqlite3`** — synchronous API removes most check-then-act
    concurrency risk _and_ drops the vulnerable `sqlite3`/`node-gyp`/`tar` chain, but
    rewrites every `await db.*` call and the test fixture. Higher effort, best endgame.
  - Recommendation: (A) now to unblock; schedule (B) as a tracked migration (worth an ADR).

## 🟡 DEP-2 — 27 npm advisories

- [ ] **`npm audit`** · Verified: hand
- **Issue:** 2 critical / 15 high / 8 moderate / 2 low.
  - **`npm audit fix` (non-breaking):** `axios`, `discord.js`→`undici`/`ws`, `vitest`/`@vitest/ui`, `vite`/`rollup`, `flatted`, `form-data`, `lodash`, etc.
  - **Breaking:** the `sqlite3` → `node-gyp` → `tar` chain only fully clears via
    `sqlite3@6` (or resolving `DEP-1`).
- **Fix:** Run `npm audit fix`, re-run tests, commit. Handle the `sqlite3` chain with `DEP-1`.

## 🟢 TOOL-6 — No `.prettierignore`

- [ ] **repo root** · Verified: hand
- **Issue:** Prettier formats `dist/` (and anything else) since nothing is ignored.
- **Fix:** Add `.prettierignore` (`dist/`, `node_modules/`, `coverage/`, `*.json` lockfiles).

## 🟢 TOOL-7 — `validaters.ts` filename typo

- [ ] **`src/config/validaters.ts`** · Verified: agent
- **Issue:** Should be `validators.ts`. Imported in only **one** file
  (`src/commands/resource.ts:13`) — cheap rename, low churn.
