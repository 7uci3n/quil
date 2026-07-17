# 0001 - Project Initialization

**Status:** accepted
**Date:** 2026-07-17
**Spec:** \_project_specs/overview.md
**Deciders:** Project creator

## Context

Quil is a modern rewrite of a legacy Discord bot for the Remnant D&D Discord
server. This ADR captures the foundational technology and architecture choices
already present in the codebase at the time Claude guardrails were adopted.

## Decision

- **Runtime:** Node.js 20+ with ESM (`"type": "module"`).
- **Language:** TypeScript 5.9, compiled via `tsc`; `tsx` for dev/scripts.
- **Platform:** discord.js v14 (slash commands, one file per command in `src/commands/`).
- **Persistence:** SQLite via `better-sqlite3` (data/remnant.sqlite), with
  init/migrate/backup/seed scripts in `src/scripts/`.
- **Validation:** zod for config and input validation (`src/config/validaters.ts`).
- **Layering:** `commands/` (Discord entrypoints) → `domain/` (business logic) →
  `db/` + `utils/db_queries.ts` (persistence). Typed i18n strings in `config/strings/`.
- **Testing:** vitest, with unit and integration suites under `tests/`.
- **Tooling:** ESLint 9 (flat config) + Prettier.

## Consequences

All future development follows these technology choices. Slash commands remain
thin wrappers over domain logic; persistence stays behind the db layer.
Development workflow is enforced by the Claude skills and the ADR gate.

## Links

- Related: \_project_specs/overview.md
- Related: README.md, docs/RUNBOOK.md
