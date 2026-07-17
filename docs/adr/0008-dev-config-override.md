# 0008 - Local dev-config override (`app.config.dev.ts`)

**Status:** accepted (implemented 2026-07-17)
**Date:** 2026-07-17
**Deciders:** Project maintainers
**Refs:** `src/config/resolved.ts`, `src/config/app.config.ts`; recovered from
abandoned branch `20260717_misc_work_snapshot`; ADR-0001 (project init)

## Context

`DEFAULT_CONFIG` (`app.config.ts`) hardcodes the production Remnant guild's IDs
(guild id, role ids, channel ids). A developer running the bot against their own
test guild has to either edit the committed config (risking an accidental
commit of dev IDs, or clobbering prod IDs) or thread every id through `.env`.
Secrets already live in `.env`; what's missing is a way to override the
**non-secret structural config** locally without touching version control.

## Decision

Support an optional, git-ignored `src/config/app.config.dev.ts` exporting
`DEV_CONFIG: DevConfig`, where `DevConfig = DeepPartial<AppConfig>`. At load time
`resolved.ts`:

1. Resolves the environment (`deriveEnv(NODE_ENV)`).
2. **Only when not `prod`**, dynamically imports `./app.config.dev.js`
   (top-level `await import`, wrapped in try/catch — absence is silently fine).
3. Deep-merges the override over `DEFAULT_CONFIG` via a pure, exported
   `deepMerge(target, src)`: plain objects merge recursively; arrays and
   primitives in the override **replace** wholesale; `undefined` leaves the
   target value intact.

`.env`-derived values (`secrets`, `system`, `security`, `library`, resolved
`env`) are layered on top of the merged base, exactly as before — the override
only affects the structural `DEFAULT_CONFIG` portion. A committed
`app.config.dev.example.ts` documents the shape.

## Consequences

- Devs point the bot at their own guild by creating one git-ignored file; no
  risk of committing dev IDs or losing prod IDs.
- **The override is disabled in production** by the `env !== "prod"` gate, so a
  stray dev file on a prod host cannot alter behavior.
- `resolved.ts` now uses top-level `await` (fine under `nodenext`/ES2022 ESM).
  Every importer of `CONFIG` transitively awaits the config module graph.
- `deepMerge` is exported and unit-tested independently of the dynamic import
  (which is environment-dependent and not unit-tested).

## Alternatives Considered

| Option                                    | Pros                | Cons                                                             | Why Not                        |
| ----------------------------------------- | ------------------- | ---------------------------------------------------------------- | ------------------------------ |
| All ids via `.env`                        | One mechanism (env) | Dozens of ids, nested arrays (LFG tiers) don't fit flat env vars | Unwieldy for structured config |
| Commit a `dev` profile in `app.config.ts` | No dynamic import   | Dev guild ids in version control; still needs per-dev edits      | Leaks/collides                 |
| `NODE_CONFIG`-style JSON files            | Mature ecosystem    | New dependency; loses TS types on the override                   | Over-tooling for one file      |

## Links

- Supersedes: N/A
- Related: ADR-0001 (project init), ADR-0007 (reusable guards, same recovered
  branch)
