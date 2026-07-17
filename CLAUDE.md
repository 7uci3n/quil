# CLAUDE.md

## Skills

Read and follow these skills before writing any code:

- .claude/skills/base/SKILL.md
- .claude/skills/security/SKILL.md
- .claude/skills/project-tooling/SKILL.md
- .claude/skills/session-management/SKILL.md
- .claude/skills/code-graph/SKILL.md
- .claude/skills/cross-agent-delegation/SKILL.md
- .claude/skills/typescript/SKILL.md
- .claude/skills/nodejs-backend/SKILL.md
- .claude/skills/existing-repo/SKILL.md
- .claude/skills/polyphony/SKILL.md
- .claude/skills/agent-teams/SKILL.md

## Project Overview

**Quil** is a modern Discord.js v14 bot for D&D guilds (a rewrite of a legacy bot
for the Remnant D&D Discord server). It manages character progression, resource
tracking, and guild operations, with a dry-witted "ledger quill" personality.

## Tech Stack

- **Language:** TypeScript 5.9 (strict, `noUncheckedIndexedAccess`), ESM (`"type": "module"`)
- **Runtime:** Node.js 20+ (dev via `tsx watch`, prod via compiled `dist/`)
- **Platform:** discord.js v14 — slash commands
- **Database:** SQLite via **`better-sqlite3`** (synchronous), WAL mode (`src/db/index.ts`). db-layer functions keep async signatures as a thin shim; internals are sync + `db.transaction()` (see ADR-0004)
- **Validation:** zod
- **Testing:** vitest (unit + integration, in-memory SQLite)
- **Tooling:** ESLint 9 (flat config) + Prettier
- **Deployment:** systemd/pm2 on a host (see docs/RUNBOOK.md)

## Architecture

Layered: `commands/` (Discord entrypoints) → `domain/` (business logic) → `db/` +
`utils/db_queries.ts` (persistence). User-facing text is in `config/strings/en/`,
accessed via `t(key, params)` from `src/lib/i18n.ts` — **never hardcode user text**.

- Commands auto-load from `src/commands/`; each exports `data` (SlashCommandBuilder) + `execute`.
- Config: `src/config/app.config.ts` (non-secret guild defaults) merged with `.env`
  via zod in `src/config/resolved.ts`; access via `CONFIG`.
- Primary table `charlog` (userId, name, level, xp, cp, tp, dtp, cc, active); one
  active character per user. Guild fund uses system userId `sys:fund:remnant`.
- Migrations live in `src/db/index.ts` `migrateDb()` — guard with `pragma_table_info` before `ALTER TABLE`.

## Key Commands

```bash
# Verify tooling
./scripts/verify-tooling.sh

# Install dependencies
npm ci

# Dev (hot reload)
npm run dev

# Build (typecheck + compile)
npm run build

# Lint
npx eslint .

# Format
npx prettier --write .

# Tests
npm test                 # vitest run
npm run test:watch
npm run test:coverage

# Database
npm run db:init          # create data/remnant.sqlite
npm run db:migrate       # apply migrations
npm run db:backup

# Register slash commands
npm run deploy:dev       # dev guild
npm run deploy:prod      # production guild
```

## Code Conventions (project-specific — these OVERRIDE defaults where they conflict)

- **ES modules:** always use `.js` extensions in imports, even for `.ts` files.
- **JSON config imports:** use `with { type: "json" }`.
- **User-facing text:** always `t(key, params)`; provide array variants for flavor.
- **Personality:** dry wit, ledger metaphors; one emoji max (🪶 📜 💰 🎫). See docs/PERSONALITY.md.
- **Errors/confirmations:** use `MessageFlags.Ephemeral`; check `deferred || replied` before `followUp`.
- **Guards:** gate commands by channel/role before running logic.
- **Adding a resource type:** column in `charlog` (migration) → `PlayerRow` type →
  `adjustResource()` allowlist → domain logic → commands → strings.

## Documentation

- `docs/` — technical docs (RUNBOOK.md, PERSONALITY.md, commands/)
- `.github/copilot-instructions.md` — detailed dev guide (kept as canonical deep reference)
- `_project_specs/` — specifications, todos, and session state

## Atomic Todos

Work is tracked in `_project_specs/todos/`: `active.md`, `backlog.md`, `completed.md`.
Every todo must have validation criteria and test cases (see base skill).

## Session Management

Maintain session state in `_project_specs/session/`:

- `current-state.md` — live state (update after each todo / ~20 tool calls)
- `decisions.md` — append-only architectural/implementation decisions
- `code-landmarks.md` — key code locations
- `archive/` — past session summaries

When resuming: read `current-state.md`, then `todos/active.md`, then recent `decisions.md`.

## Architecture Decision Records (ADR)

All architectural decisions live in `docs/adr/` (template: `docs/adr/TEMPLATE.md`).

- Check existing ADRs before making architectural choices.
- Create a new ADR before implementing architectural changes.
- Code reviews verify ADR compliance; violations are Critical/High severity.
- Status flow: proposed → accepted → deprecated/superseded. Files: `docs/adr/NNNN-title.md`.

## Code Graph (MCP)

This project uses `codebase-memory-mcp` (Tier 1) for code navigation.

- **Graph first** (symbol search, dependency/impact analysis), **file read second**, **grep last**.
- MCP config: `.mcp.json` (committed). Graph data: `.code-graph/` (gitignored).
- Post-commit hook keeps the graph fresh.

## Agent Teams (available, not auto-run)

Agent-team definitions live in `.claude/agents/`. To deploy a TDD pipeline team:
`export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` then `/spawn-team`.

## Common Pitfalls

- Created/edited a command? Run `npm run deploy:dev` to re-register.
- Strings not updating? Strings load once on startup — restart the bot.
- Wrong-channel errors? Check channel IDs in `src/config/app.config.ts`.
- Import errors? Use `.js` extensions even for `.ts` files (ESM requirement).
