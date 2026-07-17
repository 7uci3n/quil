# 0003 - Command loading strategy

**Status:** accepted
**Date:** 2026-07-17
**Deciders:** Project maintainers

## Context

Two command-loading mechanisms coexisted: an ad-hoc flat auto-loader in
`src/core/bot.ts` (live) and an unused registry module
`src/core/feature-registry.ts` (dead — no importers). Two competing systems are
confusing, and the registry was never wired in (audit `ARCH-1`).

## Decision

Standardize on the **flat directory auto-loader** in `bot.ts`: every `*.ts`/`*.js`
file in `src/commands/` that exports a `data` (SlashCommandBuilder) and `execute`
is registered at startup. `src/core/feature-registry.ts` is removed. The deploy
registrar (`src/scripts/register-commands.ts`) performs the same discovery.

## Consequences

- One place to reason about command discovery; add a command by dropping a file in
  `src/commands/` that exports `data`/`execute`.
- **Known gap (audit `BUG-7`):** the registrar recurses into subdirectories while
  the runtime loader is flat — a command in a subfolder would be registered but not
  loaded. Keep both flat (current) or make both recursive. Tracked for Phase 4.

## Links

- docs/audit `ARCH-1`, `BUG-7`
