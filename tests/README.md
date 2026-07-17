# Testing Guide

## Overview

The Quil bot uses **Vitest** for automated testing with a three-tier approach:

1. **Unit tests** (`tests/unit/`) - Pure/domain logic and small utils (XP, rewards,
   resource math, i18n, money, embeds, autocomplete, validators, gsheet mapping).
2. **Integration tests** (`tests/integration/`) - DB operations against a real
   temp-file SQLite (character lifecycle, LFG persistence, schema/migrations).
3. **Command / feature tests** (`tests/commands/`, `tests/features/`) - every
   slash-command `execute()` and the LFG feature handlers, driven end-to-end via
   mocked Discord interactions (`tests/fixtures/mock-interactions.ts`) against a
   real temp DB.

Coverage is enforced in `vitest.config.ts` (v8 provider) and clears the project's
80% quality gate on all four metrics. The composition root `src/core/bot.ts`
(constructs the Client and calls `client.login()` at import) and `src/scripts/**`
are excluded as un-unit-testable entrypoints.

## Running Tests

```powershell
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-run on changes)
npm run test:ui       # Visual UI for debugging
npm run test:coverage # Generate coverage report
```

## Test Structure

```
tests/
├── fixtures/
│   ├── test-db.ts          # In-memory SQLite utilities
│   └── mock-interactions.ts # Discord interaction mocks
├── unit/
│   ├── xp.test.ts          # XP calculations, level advancement
│   └── rewards.test.ts     # Reward computations, resource deltas
└── integration/
    ├── character-lifecycle.test.ts  # Initiate, gain/spend resources, retire
    └── lfg-workflow.test.ts         # Toggle, purge, board aggregation
```

## Writing Tests

### Unit Tests (Domain Logic)

Test pure functions from `src/domain/`:

```typescript
import { describe, it, expect } from "vitest";
import { levelForXP } from "../../src/domain/xp.js";

describe("XP Calculations", () => {
  it("should return correct level for XP", () => {
    expect(levelForXP(0)).toBe(1);
    expect(levelForXP(300)).toBe(2);
  });
});
```

### Integration Tests (Database Operations)

Use in-memory SQLite with test fixtures:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  seedTestPlayer,
  cleanupTestDb,
} from "../fixtures/test-db.js";

describe("Character Operations", () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb(); // Fresh in-memory DB
  });

  afterEach(async () => {
    await cleanupTestDb(db); // Cleanup
  });

  it("should create character", async () => {
    await seedTestPlayer(db, {
      userId: "user123",
      name: "Hero",
      level: 5,
      active: true,
    });

    const char = await db.get(
      "SELECT * FROM charlog WHERE userId = ?",
      "user123",
    );
    expect(char?.level).toBe(5);
  });
});
```

### Test Utilities

**`createTestDb()`**  
Creates in-memory SQLite database with full schema (charlog, lfg_status, etc.).

**`seedTestPlayer(db, options)`**  
Inserts a character with defaults:

- `userId` (required)
- `name` (required)
- `level` (default: 1)
- `xp`, `cp`, `tp`, `dtp`, `cc` (default: 0)
- `active` (default: true)

**`cleanupTestDb(db)`**  
Closes database connection.

**`makeInteraction(opts)`** (from `fixtures/mock-interactions.ts`)  
Builds a fake `ChatInputCommandInteraction` (options getters, `reply`/`editReply`/
`deferReply`/`followUp`/`showModal` spies, `user`/`member`/`guild`). Companions:
`makeUser`, `makeMember`, `makeGuild`, `makeRole`, `makeChannel`,
`makeAutocomplete`, `makeModalSubmit`. Cast to the real discord.js types, they let
command handlers run for real against a temp DB.

> Note: several handlers call `showCharacterEmbed()` fire-and-forget (no `await`),
> so the reply lands a tick later — `await` a short `flush()` before asserting on it.

## Coverage

Run `npm run test:coverage` to generate reports in `coverage/` directory.

**Focus areas**:

- Domain logic (xp.ts, rewards.ts, resource.ts)
- Database queries (db_queries.ts, db/lfg.ts)
- Character lifecycle workflows
- LFG tier assignments and purging

**Not covered** (by design):

- Discord.js library code
- Network requests to Discord API
- Command registration scripts

## Best Practices

1. **Isolate tests** - Use `beforeEach` to create fresh DB instances
2. **Test behavior, not implementation** - Focus on inputs/outputs, not internal details
3. **Use descriptive test names** - "should add XP without leveling" vs "test XP"
4. **Avoid magic numbers** - Use advancement.json values, not hardcoded XP thresholds
5. **Test edge cases** - Level 1, level 20, negative values, missing data

## Troubleshooting

**Tests failing with "SQLITE_CONSTRAINT"**

- Check schema in [tests/fixtures/test-db.ts](tests/fixtures/test-db.ts) matches production
- Ensure all NOT NULL columns have values in seed data

**Import errors**

- Use `.js` extensions: `import { x } from './file.js'` (even for `.ts` files)
- Check ES module config in vitest.config.ts

**Slow tests**

- Use in-memory DB (`:memory:`) not file-based
- Avoid unnecessary `beforeEach` setup
- Parallelize independent test files

## Future Improvements

- [ ] Command-level tests with mocked Discord interactions
- [ ] i18n string validation (missing keys, placeholder checks)
- [ ] Migration tests (apply migrations to various DB states)
- [ ] Performance benchmarks for large character rosters
- [ ] Snapshot tests for embed formatting
