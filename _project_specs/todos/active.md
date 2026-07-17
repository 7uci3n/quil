# Active Todos

Current work in progress. Each todo follows the atomic todo format from the base skill.

---

<!-- Add todos here -->

## NODE-24: Node 24 LTS runtime upgrade & dependency refresh (ADR-0009)

Branch: `chore/node-24-dep-updates`. Green baseline captured on Node 20:
build ✅, lint ✅, 263 tests ✅.

### Phase 0 — Enforce runtime floor

- [x] Add `"engines": { "node": ">=24" }` to `package.json`.
- **Validation:** `npm pkg get engines` returns `{"node":">=24"}`.

### Phase 1 — Node 24 runtime bump

- [x] `.nvmrc` → `24`.
- [x] `Dockerfile` builder + runtime stages → `node:24-bookworm` / `-slim`.
- [x] CI `quality.yml` + `security.yml` → `node-version: "24"`.
- [x] `@types/node` → `^24` (track runtime, NOT latest 26).
- [x] `npm rebuild better-sqlite3` against Node 24 ABI.
- **Validation:** on Node 24 — `npm ci && npm run build && npm run lint && npm test`
  all green (263 tests).

### Phase 2 — Safe minor bumps (batch)

- [x] axios, discord.js, dotenv, zod, tsx, jiti, typescript-eslint, vitest + @vitest/\*.
- [x] Move `prettier` from `dependencies` → `devDependencies`.
- **Validation:** build + lint + format:check + test all green.

### Phase 3 — Major bumps (one at a time, green suite between each)

- [x] `eslint@10` + `@eslint/js@10` + `globals@17` (flat config already in use).
- [x] `lint-staged@16`.
- [x] `csv-parse@7` — single call site `src/utils/gsheet.ts` (`csv-parse/sync`).
- **Validation:** after each — build + lint + test green; `csv-parse` output verified
  against gsheet parser tests.

### Phase 4 — Deferred (tracked, NOT in this work)

- TypeScript 6/7: BLOCKED by `typescript-eslint@8.64` peer `typescript <6.1.0`.
  Revisit when typescript-eslint widens its peer range. Stay on 5.9.x.
