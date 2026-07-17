# Quil — Project Audit (Spring Clean)

_Generated 2026-07-17. Baseline commit: `chore/claude-init`._

A full pre-feature audit of the Quil Discord bot. Findings were produced by four
parallel code-review passes (commands, domain/DB, core/config/scripts, tests/tooling)
applying the 7-category review rubric, plus repository-level metrics. The highest-severity
items were re-verified by hand against source.

## How to use this document set

Each finding has a **stable ID** (e.g. `SEC-1`), a **severity**, a `file:line`
anchor, and a `[ ]` checkbox. Work through them and tick the box; when a whole
file's boxes are ticked, that workstream is clean. `REMEDIATION-PLAN.md` sequences
everything into phases — **start there** if you want the recommended order.

| Doc                                                                          | Theme                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [01-security-and-permissions.md](01-security-and-permissions.md)             | SQL injection, prod permission bypass, destructive scripts   |
| [02-data-integrity-and-atomicity.md](02-data-integrity-and-atomicity.md)     | Transactions, negative balances, invariants, DTP math        |
| [03-correctness-bugs.md](03-correctness-bugs.md)                             | Broken scripts, un-awaited writes, wrong output, i18n engine |
| [04-architecture-and-code-quality.md](04-architecture-and-code-quality.md)   | Dead code, duplication, file/function size, logging          |
| [05-tooling-tests-and-dependencies.md](05-tooling-tests-and-dependencies.md) | ESLint/tsconfig/vitest bugs, coverage, deps, vulns           |
| [06-docs-and-hygiene.md](06-docs-and-hygiene.md)                             | Stale docs, typos, naming, this session's ADR error          |
| [REMEDIATION-PLAN.md](REMEDIATION-PLAN.md)                                   | Phased, ordered execution checklist                          |

## Severity scoreboard

| Severity    | Count | Meaning                                                              |
| ----------- | ----- | -------------------------------------------------------------------- |
| 🔴 Critical | 3     | Data-loss / security / broken-in-prod. Fix before shipping anything. |
| 🟠 High     | 11    | Money/permission/atomicity correctness. Fix before new features.     |
| 🟡 Medium   | 17    | Real bugs & structural debt. Fix during the clean.                   |
| 🟢 Low      | 14    | Polish, hygiene, naming. Batch opportunistically.                    |

## The five things to fix first

1. 🔴 **`SEC-1` SQL injection in `/retire`** — free-text character name interpolated into a `DELETE`. Data-loss grade.
2. 🔴 **`BUG-1` `db:seed:me` is broken** — malformed SQL; the seed throws.
3. 🔴 **`BUG-2` prod deploy scripts are inverted** — `deploy:clear:global:prod` / `deploy:list:prod` do the opposite of their name.
4. 🟠 **`SEC-2` prod permission bypass** — `CONFIG.env` is hardcoded `"dev"`, so the superuser bypass is always live.
5. 🟠 **`DATA-1`/`DATA-2` no transactions on money mutations** — balances can go negative; a failed `/retire` permanently loses Crew Coins.

## Important correction (verified this session)

The code **does not use `better-sqlite3`**. The live DB layer is the async
`sqlite` + `sqlite3` wrapper (`src/db/index.ts`), and the test fixtures use the
same driver. `better-sqlite3` is a **dead dependency** (`DEP-1`). This also means
the ADR and `CLAUDE.md` written during `/initialize-project` named the wrong DB
library — corrected under `DOC-3`.

## Method & confidence

- "Verified: hand" = re-read from source by the compiler of this report.
- "Verified: 2 agents" = independently flagged by two review passes (higher confidence).
- "Verified: agent" = single review pass; mechanism cited but not independently re-run.
- Line numbers are against the baseline commit and may drift as fixes land.
