# Project Overview

## Vision

Quil is a modern Discord.js v14 bot for D&D guilds — a maintainable rewrite of a
legacy bot for the Remnant D&D Discord server — handling character progression,
resource tracking, group-finder (LFG) tools, and an engaging "ledger quill" personality.

## Goals

- [ ] Reliable character progression tracking (XP, levels, resources)
- [ ] Resource management (cp/tp/dtp/cc, guild fund)
- [ ] LFG board with tier auto-assignment
- [ ] Typed, localized personality strings (i18n)
- [ ] Long-term maintainability (strict TS, tests, clear layering)

## Non-Goals

- Not a general-purpose multi-guild SaaS bot (tuned for Remnant guild structure)
- No web dashboard (Discord-native only)

## Success Metrics

- Slash commands respond reliably within Discord interaction timeouts
- Test suite green; coverage on domain logic
- Migrations apply cleanly to production DB without data loss
