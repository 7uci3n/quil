# 01 — Security & Permissions

[← Index](README.md)

---

## 🔴 SEC-1 — SQL injection in `/retire`

- [ ] **`src/commands/retire.ts:90-102`** · Verified: hand + 2 agents
- **Issue:** The retirement `DELETE` is built by string interpolation:
  ```ts
  let query = `FROM charlog WHERE userId = ${targetId}`
  if (char) { query += ` AND name = '${char}'` }
  ...
  await db.run(`DELETE ${query}`);
  ```
  `char` is free-text from the modal input `char_name` and is **not** validated
  (unlike `/initiate` and `/charedit`, which enforce `/^[a-zA-Z0-9'\- ]+$/`). A
  name like `x' OR '1'='1` deletes arbitrary/all rows; even a legitimate
  apostrophe name breaks the statement. `targetId` is also interpolated unquoted
  (snowflake-precision risk against the TEXT column). The row is _read_ safely via
  parameterized `getPlayer(targetId, char)` on line 93 — only the destructive path
  is unsafe.
- **Fix:** Delete the hand-built `query` string. Use parameterized statements:
  ```ts
  if (char)
    await db.run(
      `DELETE FROM charlog WHERE userId = ? AND name = ?`,
      targetId,
      char,
    );
  else
    await db.run(
      `DELETE FROM charlog WHERE userId = ? AND active = 1`,
      targetId,
    );
  ```
  Also validate `char` with the same regex the other commands use before querying.

---

## 🟠 SEC-2 — Production permission bypass (`CONFIG.env` never leaves `"dev"`)

- [ ] **`src/config/app.config.ts:88`, `src/config/validaters.ts:54`, `src/commands/rewards.ts:57`** · Verified: agent
- **Issue:** `env` is hardcoded to `"dev"` in `DEFAULT_CONFIG` and never derived
  from `NODE_ENV` or the `--prod` flag. So `CONFIG.env !== "prod"` is **always
  true**, and `isDevBypass` grants any configured `SUPERUSER_IDS` a full
  permission bypass even in production. Currently mitigated only because
  `SUPERUSER_IDS` defaults to empty.
- **Fix:** Derive `CONFIG.env` from `NODE_ENV`/deploy flag, validate it in zod, and
  make the bypass depend on a real dev environment.

---

## 🟠 SEC-3 — Security-sensitive env vars skip zod validation

- [ ] **`src/config/resolved.ts:9-15`** · Verified: agent
- **Issue:** `SUPERUSER_IDS` and `TEST_GUILD_IDS` (both grant permission bypass) are
  read directly from `process.env`, bypassing the zod `Env` schema that validates
  every other variable. They are also absent from `.env.example`, so their
  existence is undiscoverable.
- **Fix:** Add both to the zod schema (validate shape: comma-separated snowflakes)
  and document them in `.env.example`.

---

## 🟠 SEC-4 — `db:wipe` has no production guard

- [ ] **`src/scripts/wipe.ts`** · Verified: agent
- **Issue:** Drops all seven tables with no environment guard, no confirmation, and
  no `DB_FILE` sanity check — it will happily target the production
  `./data/remnant.sqlite`. `db:reseed:me` chains `db:wipe && db:seed:me`, and the
  seed is currently broken (`BUG-1`), so a reseed wipes and then fails to repopulate.
- **Fix:** Refuse unless `NODE_ENV !== 'production'` or an explicit `--force`/`CONFIRM=`
  flag is passed; echo the target file before dropping.

---

## 🟢 SEC-5 — Google Sheet ID hardcoded (not a secret, but move to config)

- [ ] **`src/utils/gsheet.ts:23`** · Verified: agent
- **Issue:** The Sheet ID is inlined. It is a public CSV export with no SSRF surface
  (constant URL, 10s timeout, `validateStatus: 200`, HTML sniffing) — so **not** a
  vulnerability, but a maintainability smell.
- **Fix:** Move the Sheet ID to config/env.

---

### Notes (clean, no action)

- Token handling is safe: no code logs `DISCORD_TOKEN` or other secrets; error
  messages reference env-var _names_ only. Zod fails fast on missing
  `DISCORD_TOKEN`/`GUILD_ID`/`APP_ID` at boot.
