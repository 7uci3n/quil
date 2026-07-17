<!--
UPDATE WHEN: adding entry points/key files, new patterns, or non-obvious behavior.
-->

# Code Landmarks

## Entry Points

| Location                         | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| src/core/bot.ts                  | Bot bootstrap; auto-loads commands from src/commands/ |
| src/scripts/register-commands.ts | Slash command registration (dev/prod)                 |

## Core Business Logic

| Location               | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| src/domain/rewards.ts  | XP/GP/GT calculations, DM reward tables       |
| src/domain/xp.ts       | Level advancement curves                      |
| src/domain/lfg.ts      | LFG tier aggregation, board embeds, auto-tier |
| src/domain/resource.ts | Time-based resource regen (DTP daily accrual) |

## Configuration

| Location                 | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| src/config/app.config.ts | Non-secret guild defaults (roles, channels, features) |
| src/config/resolved.ts   | Runtime config: .env + defaults via zod               |
| src/config/validaters.ts | zod validation schemas                                |
| config/strings/en/       | Localized user-facing strings (i18n)                  |

## Persistence

| Location                | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| src/db/index.ts         | SQLite connection (WAL), migrateDb()              |
| src/utils/db_queries.ts | getPlayer, getPlayerCC, adjustResource, PlayerRow |
| src/db/lfg.ts           | lfg_status CRUD                                   |

## Testing

| Location           | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| tests/unit/        | Domain pure-function tests (xp, rewards)         |
| tests/integration/ | Character lifecycle, LFG workflow (in-memory DB) |
| tests/fixtures/    | createTestDb(), mock Discord interactions        |

## Gotchas & Non-Obvious Behavior

| Location  | Issue        | Notes                                  |
| --------- | ------------ | -------------------------------------- |
| imports   | ESM          | Use .js extensions even for .ts files  |
| strings   | load-once    | Restart bot to reload strings          |
| charlog   | system row   | Guild fund = userId `sys:fund:remnant` |
| lfg purge | PBP excluded | Default purge scope skips PBP tier     |
