# 03 — Correctness Bugs

[← Index](README.md)

---

## 🔴 BUG-1 — `db:seed:me` / `db:reseed:me` are broken

- [ ] **`src/scripts/seed.me.ts:25-38`** · Verified: agent
- **Issue:** Two runtime-fatal SQL errors in the divergent copy of the schema:
  1. `CREATE TABLE` line `tp INTEGER NOT NULL   -- halves of TP` has **no trailing
     comma** and the `--` comment swallows the rest of the line → SQLite parses
     `tp INTEGER NOT NULL active BOOL NOT NULL` → syntax error.
  2. The `INSERT` names 7 columns but `VALUES (?, ?, ?, ?, ?, ?)` has **6**
     placeholders while passing 7 params; `ON CONFLICT(userId)` names one column
     though the PK is composite `(userId, name)`.
- **Fix:** Add the 7th placeholder, `ON CONFLICT(userId,name)`, and fix the DDL
  comment/comma. Better: have the seed import `initDb` from `src/db/index.ts` instead
  of maintaining a second schema copy.

---

## 🔴 BUG-2 — Prod deploy scripts do the opposite of their name

- [ ] **`src/scripts/register-commands.ts:98-134`** · Verified: hand + agent
- **Issue:** `if (PROD) { … return }` at line 107 returns **before** the `LIST`
  (123) and `CLEAR_GLOBAL` (128) blocks. So `deploy:clear:global:prod`
  (`--clear-global --prod`) re-deploys guild commands instead of clearing global
  ones, and `deploy:list:prod` (`--list --prod`) **mutates** (upserts) guild commands
  instead of listing. The dev branch has the same flaw for `--list`/`--clear-global`.
- **Fix:** Evaluate `LIST`/`CLEAR_GLOBAL` before the deploy branch and honor them in
  both prod and dev.

---

## 🟠 BUG-3 — Un-awaited resource writes in `/reward`

- [ ] **`src/commands/rewards.ts:208`, `:259`** · Verified: 2 agents
- **Issue:** `adjustResource(...)` is called without `await` in both the multi-recipient
  custom path and the DM path. The DB write is fire-and-forget: the success/level-up
  embed is built from the in-memory value and replied regardless of whether the write
  commits, and a rejection becomes an unhandled promise. The custom loop also races
  several concurrent un-awaited writes.
- **Fix:** `await` both calls; handle failure before replying.

---

## 🟠 BUG-4 — `/swap` reports success for a non-existent character

- [ ] **`src/commands/swap.ts:15-16`** · Verified: agent
- **Issue:** `showCharacterEmbed(...)` is not awaited, and `setActive` silently
  no-ops when the name doesn't exist (guard at `db_queries.ts:91`). So `/swap` to a
  bogus name still replies `Switched Character - <name>` while showing the old active
  character.
- **Fix:** Await the embed; check `setActive`'s result and reply with an error when no
  matching character exists.

---

## 🟠 BUG-5 — `/reward` multi-recipient partial award

- [ ] **`src/commands/rewards.ts:188-193`** · Verified: agent
- **Issue:** In the recipient loop, a missing player triggers `ix.reply(...)` and
  `return` **after** earlier recipients' `adjustResource` calls already fired —
  leaving a partial award.
- **Fix:** Validate all recipients before applying any deltas (and make the batch
  atomic — see `DATA-1`).

---

## 🟠 BUG-6 — `/sync` can exceed the 3s interaction window

- [ ] **`src/commands/sync.ts:11-37`** · Verified: agent
- **Issue:** `fetchStoriesFromGoogleSheet()` + ~200 inserts run before any reply,
  with no `deferReply()`. If the sheet fetch exceeds Discord's 3s window the token
  expires ("Unknown interaction"). (Transaction handling is `DATA-7`.)
- **Fix:** `await interaction.deferReply()` first, then `editReply` on completion.

---

## 🟡 BUG-7 — Registrar recurses, runtime loader doesn't

- [ ] **`src/scripts/register-commands.ts:42-52` vs `src/core/bot.ts:43-47`** · Verified: agent
- **Issue:** The registrar walks subdirectories (`findCommandFiles`), but the runtime
  auto-loader does a flat `readdirSync`. A command in a subfolder gets **registered
  with Discord but never loaded at runtime** → "command not found".
- **Fix:** Make both loaders use the same (recursive) traversal.

---

## 🟡 BUG-8 — i18n engine edge cases

- [ ] **`src/lib/i18n.ts:46-52, 74`** · Verified: agent
- **Issue:** In `fmt`, a missing placeholder value calls `getRaw(k)` and **discards
  the result** (no assignment) before falling back to literal `{k}` — an unfinished
  fallback. `t()` returns `String(node)` for an object node → `"[object Object]"` on a
  mis-keyed lookup. Missing keys return the key silently (no warn log).
- **Fix:** Finish the fallback or delete the dead call; return a visible sentinel +
  `console.warn` on missing/object keys.

---

## 🟡 BUG-9 — `/resource` shows the "before" value in the wrong unit

- [ ] **`src/commands/resource.ts:205`** · Verified: agent
- **Issue:** For the `cp` case, `newAmt` is converted with `toGp` (line 202) but
  `oldAmt: res` is passed raw — so the "before" GP value is displayed in copper.
- **Fix:** Convert `oldAmt` the same way.

---

## 🟡 BUG-10 — `/guildfund` misreports Golden Tickets

- [ ] **`src/commands/guildfund.ts:27`** · Verified: 2 agents
- **Issue:** `const tp = (row.tp / 2)` halves GT for display, inconsistent with every
  other command (retire/resource show `tp` directly; `rewards.ts` even notes "no
  doubling"). A magic `2` with no comment.
- **Fix:** Show `row.tp` directly (confirm the intended GT accounting first).

---

## 🟡 BUG-11 — `/buy` accepts unguarded decimal GP

- [ ] **`src/commands/buy.ts:74`** · Verified: agent
- **Issue:** GP input accepts arbitrary decimals with no precision guard (unlike
  `sell.ts:73`); `toCp(1.005)` rounding silently mischarges.
- **Fix:** Mirror sell's 2-decimal validation.

---

## 🟢 BUG-12 — `db:init` can hang (DB never closed)

- [ ] **`src/scripts/init.db.ts`** · Verified: agent
- **Issue:** Never closes the DB or exits; the sqlite handle stays open, so the script
  can hang (contrast `migrate.db.ts:5-13`, which closes and exits).
- **Fix:** Close the DB and `process.exit(0)` on success.

---

## 🟢 BUG-13 — Mixed `active` representations

- [ ] **`src/commands/retire.ts:92` (`active = true`) vs `:105` (`active = 1`)** · Verified: agent
- **Issue:** Two representations for the same boolean column. Pick `1`/`0` consistently.
