# 04 — Architecture & Code Quality

[← Index](README.md)

---

## 🟡 ARCH-1 — Dead module: `feature-registry.ts`

- [ ] **`src/core/feature-registry.ts` (whole file)** · Verified: agent
- **Issue:** `registry`, `register`, `loadFeatures`, `Feature`, `FeatureFactory` are
  unused. `bot.ts` implements its own flat auto-loader and never imports this. Two
  competing systems; only the auto-loader is live.
- **Fix:** Delete the file, or adopt the registry and delete the ad-hoc loader. (Pick
  one command-loading strategy and document it in an ADR.)

---

## 🟡 ARCH-2 — Dead module querying a dropped table: `features/lfg/repo.ts`

- [ ] **`src/features/lfg/repo.ts` (whole file)** · Verified: agent
- **Issue:** All three functions query `lfg_presence`, which is explicitly **dropped**
  in `src/db/index.ts:52`. No importers found — it is live-but-broken code that throws
  "no such table" if ever wired in.
- **Fix:** Delete it, or migrate it to `lfg_status` if it's meant to be used.

---

## 🟡 ARCH-3 — Duplicated helpers across commands

- [ ] **Multiple files** · Verified: agent
- **Issue:** Substantial copy-paste instead of shared utilities:
  - `hasAnyRole` + `isAdmin` — duplicated in `lfg.ts:58-69` and `rewards.ts:40-52`.
  - Mod-permission check — duplicated in `retire.ts:37-46` and `charedit.ts:51-58`.
  - Channel-guard block — duplicated across `buy.ts:59-68`, `sell.ts:43-52`, `resource.ts:115-117`.
  - `toCp`/`toGp` money helpers redefined in `buy.ts:19-20`, `sell.ts:19-20`, `resource.ts:29-30`.
  - `resourceMapping` redefined in `buy.ts:21` and `resource.ts:31`.
  - `announceLevelChange` exists in both `rewards.ts:148` and `domain/xp.ts`.
- **Fix:** Extract `utils/perms.ts`, `utils/money.ts`, `utils/guards.ts`; import from one home.

---

## 🟡 ARCH-4 — Files/functions exceed size gates

- [ ] **`src/commands/lfg.ts` (507), `rewards.ts` (283), `core/bot.ts` (214), `commands/resource.ts` (213), `buy.ts` (212)** · Verified: metrics
- **Issue:** Against the 200-line file / 20-line function gate: `lfg.ts` is 2.5× the
  limit; `bot.ts`'s `loadCommands` (~40) and `InteractionCreate` handler (~70) and
  `resource.ts`'s `execute` (~110, 4-deep nesting) blow the function limit.
- **Fix:** Split by subcommand/responsibility; extract handlers. Prioritize `lfg.ts`.

---

## 🟡 ARCH-5 — Duplicated error-reply blocks in the interaction handler

- [ ] **`src/core/bot.ts`** · Verified: agent
- **Issue:** Three reply-on-error blocks are duplicated verbatim in the
  `InteractionCreate` handler.
- **Fix:** Extract one `safeReplyError(interaction, err)` helper.

---

## 🟡 QUAL-1 — No logging abstraction (60 raw `console.*`)

- [ ] **`src/**/\*.ts` (60 occurrences)\*\* · Verified: metrics
- **Issue:** Logging is scattered `console.log/error` with no levels, structure, or
  redaction control. Hard to silence in tests or ship structured logs.
- **Fix:** Introduce a tiny logger (level + prefix); replace `console.*`. Optional but
  high-leverage before scaling features.

---

## 🟡 QUAL-2 — Role resolution by hardcoded English name

- [ ] **`src/commands/dm.ts:50`, `src/commands/retire.ts:156-157`** · Verified: agent
- **Issue:** Roles resolved by `r.name === 'Guild Member'` / `'uninitiated'` /
  `['DM','Crew']` rather than the configured role **IDs** the project already has in
  `CONFIG…roles`. Breaks on rename/localization.
- **Fix:** Resolve by configured role IDs.

---

## 🟢 QUAL-3 — Deprecated `ephemeral: true`

- [ ] **`initiate.ts:27,33`, `dm.ts:28,32,52`, `library.ts:61,105`** · Verified: agent
- **Issue:** Uses the deprecated `reply({ ephemeral: true })` instead of the
  project-standard `flags: MessageFlags.Ephemeral`.
- **Fix:** Switch to `flags`.

---

## 🟢 QUAL-4 — Hardcoded English strings (i18n bypass)

- [ ] **`initiate.ts:27,33-37,65-67`, `library.ts:58,105`, `charedit.ts:108`, `retire.ts:166`** · Verified: 2 agents
- **Issue:** User-facing text bypasses `t()` (validation errors, "No story found",
  "Not your story!", `" (updated by …)"` / `" (retired by …)"` suffixes).
- **Fix:** Move to `config/strings/en/`; call `t()`.

---

## 🟢 QUAL-5 — Small dead code / import-side-effect smells

- [ ] Verified: agent
- `src/db/index.ts:5-6` — dead imports (`time` from `console`, `date` from `zod`).
- `src/domain/xp.ts:17` — `table.levels.sort(...)` mutates the imported JSON module at load (import side effect).
- `src/config/app.config.ts:29-33` — `FeaturePrereqs` type declared but never used.
- `src/commands/library.ts:99-116` — component collector has no `end` handler; buttons stay active after the 5-min timeout.
- `src/commands/rewards.ts:111,164` — `sub` typed with a `"staff"` case that has no registered subcommand (`PERMS.staff` dead); `@ts-expect-error` + implicit `any` on `target?.send`.
- `src/commands/initiate.ts:12-13,22` — `user` option `setRequired(true)` but description says "defaults to you"; the `?? interaction.user` fallback is dead.
