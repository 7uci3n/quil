# 0004 - Migrate the SQLite driver to better-sqlite3

**Status:** proposed
**Date:** 2026-07-17
**Deciders:** Project maintainers (deploy timing coordinated with the server team)
**Refs:** docs/audit `DEP-1`, `DATA-1`, `DATA-4`; ADR-0001, ADR-0002

## Context

Quil currently persists via the async **`sqlite`** wrapper over the callback-based
native **`sqlite3`** driver. Every DB call is `await`ed, which creates
check-then-act windows between awaits — the root of several audit findings we've
been closing with transactions and guarded UPDATEs (`DATA-1` negative balances,
`DATA-4` one-active-character). The wrapper also adds a promise layer over a
callback addon, and `sqlite3@6` recently shipped a prebuilt binary targeting a
newer glibc than the slim Docker runtime (worked around with build-from-source,
ADR-0002).

`better-sqlite3` was the project's originally-declared dependency (removed in audit
Phase 3 as unused) and is the audit's preferred endgame (`DEP-1` option B).

## Decision

Migrate the persistence layer from `sqlite` + `sqlite3` to **`better-sqlite3`**.

Rationale:

- **Synchronous API eliminates the interleave-between-await bug class** entirely.
  `db.transaction(fn)` makes atomic multi-statement operations trivial, and there
  are no `await` points inside a logical operation to interleave.
- Well-maintained, fast, first-class prebuilds; a single native dependency instead
  of two packages + a wrapper.
- Aligns with ADR-0001's original intent.

### Non-goals / caveats

- `better-sqlite3` is **still a native addon**, so it does not by itself avoid
  native-build/glibc issues — the Docker builder keeps the **build-from-source**
  pattern (retargeted from `sqlite3` to `better-sqlite3`).
- **No schema, file-format, or data changes.** Same `.sqlite` file, same tables,
  same migration semantics. This is a code-only driver swap.

## Consequences — migration surface

- **`src/db/index.ts`:** `initDb`/`migrateDb`/`getDb`/`closeDb` become synchronous.
  `open({filename, driver})` → `new Database(file)`; pragmas via `db.pragma(...)`;
  `_db: Database`. Import as `import Database from "better-sqlite3"` (CJS default
  under ESM); types from `@types/better-sqlite3`.
- **Query sites** (`db_queries.ts`, `db/lfg.ts`, `domain/guildState.ts`,
  `domain/resource.ts`, all commands, `scripts/*`):
  - `await db.get(sql, params)` → `db.prepare(sql).get(...params)`
  - `await db.run(sql, params)` → `db.prepare(sql).run(...params)` (returns
    `{ changes, lastInsertRowid }`)
  - `await db.all(sql, params)` → `db.prepare(sql).all(...params)`
  - `await db.exec(multiStatementSql)` → `db.exec(multiStatementSql)` (unchanged)
  - Functions lose `async`; callers drop `await` (harmless if left, but remove).
- **Transactions:** the explicit `BEGIN/COMMIT/ROLLBACK` in `retireCharacter`,
  `setActive`, and `/sync` become `db.transaction(fn)()` (auto rollback on throw).
  `spendResources` stays a single guarded UPDATE.
- **Tests:** `tests/fixtures/test-db.ts` can go back to a shared in-memory DB —
  because the driver is synchronous, `new Database(':memory:')` is a single
  connection that `initDb`+`migrateDb` share, so the Phase-5 temp-file workaround
  is no longer needed (simpler fixture, faster tests).
- **Dependencies:** add `better-sqlite3` + `@types/better-sqlite3`; remove `sqlite`
  and `sqlite3`. Docker: keep `RUN npm rebuild better-sqlite3 --build-from-source`.
- **Docs:** update ADR-0001's DB-layer line, `CLAUDE.md`, and the
  `docs/MIGRATION-docker.md` inspection snippet (better-sqlite3 makes the one-liner
  trivial again).

## Risks & mitigation

- **Large mechanical rewrite → regression risk.** Mitigated by the real-code test
  suite (character-lifecycle / retire / lfg) plus a local dev-server re-deploy
  before merge — the same validation we just used for the Docker work.
- **Boolean binding (the main behavioral gotcha):** better-sqlite3 refuses to bind
  JS `true`/`false` (only number/bigint/string/buffer/null). Our `active` column
  must be bound as `1`/`0`. Today `/initiate` and the test fixture already use
  `0/1`; `initDb`/seed use the SQL literal `true` (fine — that's SQL, not a bound
  param). A careful pass must confirm no JS boolean is ever passed to `.run()`.
- **Types:** `@types/better-sqlite3` with `exactOptionalPropertyTypes` on — expect
  a few generic annotations on `.get<T>()`.

## Rollout

- Implemented on a dedicated branch (`feat/better-sqlite3`); this ADR flips to
  **accepted** on merge.
- **Deploy migration is coordinated with the server team.** Because the SQLite file
  format is unchanged, it's a code-only swap: back up the DB (`db:backup` /
  `docs/MIGRATION-docker.md`), stop the old process/container, deploy the new one
  (which runs the same idempotent init+migrate). No data conversion.

## Links

- docs/audit `DEP-1`, `DATA-1`, `DATA-4`
- ADR-0001 (initial stack), ADR-0002 (Docker build-from-source)
