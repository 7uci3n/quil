<!--
CHECKPOINT RULES (from session-management skill):
- Quick update: After any todo completion
- Full checkpoint: After ~20 tool calls or decisions
- Archive: End of session or major feature complete
-->

# Current Session State

_Last updated: 2026-07-17_

## Active Task

Project initialized with Claude guardrails (full setup). No feature work in progress.

## Current Status

- **Phase**: planning
- **Progress**: /initialize-project full setup complete
- **Blocking Issues**: None

## Context Summary

Quil (Discord.js v14 D&D bot, TypeScript + SQLite) had ESLint/Prettier/TS/vitest but
no Claude setup, pre-commit hooks, or CI. Full guardrail setup was applied on init.

## Files Being Modified

| File | Status | Notes |
| ---- | ------ | ----- |
| -    | -      | -     |

## Next Steps

1. [ ] Run `npm ci` and `./scripts/verify-tooling.sh`
2. [ ] Confirm CI workflows pass on first PR
3. [ ] Define feature specs in `_project_specs/features/` when starting new work

## Key Context to Preserve

- Existing code style preserved; guardrails are additive.
- `.github/copilot-instructions.md` remains the canonical deep dev guide.

## Resume Instructions

To continue: read this file, then `_project_specs/todos/active.md`, then `docs/adr/`.
