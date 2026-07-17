# 0009 - Node 24 LTS Runtime Upgrade & Dependency Refresh

**Status:** proposed
**Date:** 2026-07-18
**Spec:** \_project_specs/todos/active.md (Node-24 upgrade block)
**Deciders:** Project maintainers

## Context

The runtime is pinned to **Node 20** in three coordinated places — `.nvmrc`
(`v20.20.2`), the `Dockerfile` (`node:20-bookworm` builder + `-slim` runtime), and
CI (`quality.yml` / `security.yml`, `node-version: "20"`). `package.json` declares
**no `engines` floor**, so nothing enforces a minimum.

Node 20 is in **Maintenance LTS** and reaches **end-of-life in April 2026**. Staying
on it means running an unsupported runtime within the year. Alongside the runtime,
several dependencies have drifted (see `npm outdated`), including four major bumps
(`eslint` 9→10, `lint-staged` 15→16, `csv-parse` 6→7, `@types/node` tracking) and
one that is currently **blocked** (`typescript` 5.9→7).

## Decision

Move the runtime to **Node 24 (Krypton LTS)** — the current Active LTS, supported
into 2028 — skipping Node 22 (Maintenance LTS) so we don't repeat this upgrade in
months. Refresh dependencies in controlled phases.

1. **Runtime pin → Node 24** in `.nvmrc`, `Dockerfile` (builder + runtime stages),
   and both CI workflows. Add `"engines": { "node": ">=24" }` to `package.json` to
   enforce the floor.
2. **`@types/node` tracks the runtime** — pin to `^24`, **not** `latest` (26). Types
   must match the Node version actually executing.
3. **`better-sqlite3`** native bindings are rebuilt against Node 24's ABI. The
   Docker builder already does `npm rebuild better-sqlite3 --build-from-source`
   (ADR-0002/0004); local dev runs `npm rebuild better-sqlite3` after the switch.
   `better-sqlite3@12` engines already list `24.x`.
4. **Safe minor bumps** applied as a batch: `axios`, `discord.js`, `dotenv`, `zod`,
   `tsx`, `jiti`, `typescript-eslint`, `vitest` + `@vitest/*`, `prettier`.
   `prettier` is also **moved from `dependencies` to `devDependencies`** — it is a
   tooling-only package with no `src/` import.
5. **Major bumps applied individually**, each behind a green suite: `eslint@10` +
   `@eslint/js@10` + `globals@17` (flat config already in use → low friction);
   `lint-staged@16` (needs Node ≥20.17, satisfied); `csv-parse@7` (single call site,
   `src/utils/gsheet.ts`).
6. **TypeScript stays on 5.9.x.** TS 7 (the native compiler) is `latest`, but
   `typescript-eslint@8.64` caps its peer at `typescript >=4.8.4 <6.1.0`. Adopting
   TS 7 would break linting entirely. **Deferred** until typescript-eslint widens
   its peer range; tracked as a backlog item.

## Consequences

- The bot runs on a supported LTS again; the `engines` floor makes accidental
  downgrades fail fast at `npm ci`.
- CI matrix, Docker base images, and local `.nvmrc` all move together — one runtime,
  no drift.
- Native `better-sqlite3` must be rebuilt on the deploy host / image (already the
  documented pattern; no new work, but a required step on the version change).
- No schema, data, or file-format changes. This is a runtime + toolchain change
  only; the SQLite file is untouched.
- TypeScript remains a major version behind `latest` by deliberate choice; revisit
  when the lint toolchain supports TS 6/7.

## Alternatives Considered

| Option                     | Pros                                   | Cons                                                       | Why Not                                  |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Stay on Node 20            | Zero work                              | EOL April 2026; unsupported runtime                        | The problem being solved                 |
| Node 22 (Maintenance LTS)  | Smaller jump                           | Already in maintenance; forces another upgrade within ~1yr | Skipping to 24 avoids repeating the work |
| Node 24 (Active LTS)       | Supported to 2028; all deps compatible | Native `better-sqlite3` rebuild required                   | **Chosen**                               |
| Bump everything incl. TS 7 | Fully current                          | Breaks `typescript-eslint`; lint unusable                  | Hard peer-dep block; TS 7 deferred       |

## Links

- Supersedes: N/A
- Related: ADR-0002 (containerization / build-from-source), ADR-0004 (better-sqlite3
  native addon), CLAUDE.md (tech stack), `.nvmrc`, `Dockerfile`,
  `.github/workflows/{quality,security}.yml`
