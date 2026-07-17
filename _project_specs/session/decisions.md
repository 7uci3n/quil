<!--
LOG DECISIONS WHEN:
- Choosing between architectural approaches
- Selecting libraries or tools
- Making security-related choices
- Deviating from standard patterns

This is append-only. Never delete entries.
-->

# Decision Log

## Format

```
## [YYYY-MM-DD] Decision Title

**Decision**: What was decided
**Context**: Why this decision was needed
**Options Considered**: What alternatives existed
**Choice**: Which option was chosen
**Reasoning**: Why this choice was made
**Trade-offs**: What we gave up
**References**: Related code/docs
```

---

## [2026-07-17] Adopt Claude guardrails (full setup) on existing codebase

**Decision**: Add Claude skills, ADRs, project specs, guardrails, and CI without
restyling existing code.
**Context**: /initialize-project run on an existing, working TypeScript bot.
**Choice**: Full setup, preserving existing ESLint/Prettier/TS/vitest config.
**Reasoning**: Additive guardrails improve maintainability without churn.
**Trade-offs**: Some overlap with the pre-existing `.github/copilot-instructions.md`.
**References**: CLAUDE.md, docs/adr/0001-project-init.md
