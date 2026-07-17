# 06 — Docs & Hygiene

[← Index](README.md)

---

## 🟡 DOC-1 — README points at the old repo

- [ ] **`README.md:24-25`** · Verified: hand
- **Issue:** Quick-start clones `https://github.com/donovan-townes/bissel-modern.git`
  and `cd bissel-modern` — the previous project name/URL. New devs clone the wrong repo.
- **Fix:** Update to `7uci3n/quil` and `cd quil`.

## 🟡 DOC-2 — RUNBOOK still branded "bissel-modern"

- [ ] **`docs/RUNBOOK.md:1,79,81`** · Verified: hand
- **Issue:** Title "# bissel-modern Runbook"; ops commands `pm2 restart bissel-modern`,
  `systemctl restart bissel-modern`. Wrong service name will confuse deploys.
- **Fix:** Rebrand to Quil; confirm the actual systemd/pm2 unit name.

## 🟡 DOC-3 — ADR-0001 & CLAUDE.md name the wrong DB library _(introduced this session)_

- [ ] **`docs/adr/0001-project-init.md`, `CLAUDE.md`** · Verified: hand
- **Issue:** Both say the DB layer is `better-sqlite3`. The code uses the async
  `sqlite` + `sqlite3` wrapper (see `DEP-1`). This error was introduced during
  `/initialize-project`.
- **Fix:** Correct both to `sqlite`/`sqlite3`. **(Being fixed as part of delivering this
  audit — see the wrap-up.)**

## 🟢 DOC-4 — `backup.ts` default dir references the old project

- [ ] **`src/scripts/backup.ts:7`** · Verified: agent
- **Issue:** `BACKUP_DIR` defaults to `'../bissel-modern-backup/backups'` — a relative
  path outside the repo with the old name. (`VACUUM INTO` path is correctly escaped.)
  Also, second-granular timestamps collide if two backups run in the same second
  (`VACUUM INTO` requires a non-existent destination → throw).
- **Fix:** Sane in-project default (e.g. `./backups`); millisecond/uuid suffix on the
  filename.

## 🟢 DOC-5 — Misc typos & stale comments

- [ ] Verified: agent
- `src/commands/swap.ts:1` — header comment says `// src/commands/initiate.ts` (copy-paste).
- `src/config/app.config.ts:31` — typo `caopabilities` (in the unused `FeaturePrereqs`).
- `src/commands/sync.ts:36` — "libary" typo in a (non-i18n) success string.
- `src/commands/lfg.ts:437-438` — comment says "show ephemerally" but reply has no `Ephemeral` flag.

## 🟢 DOC-6 — Misleading npm scripts

- [ ] **`package.json:16-17`** · Verified: agent
- **Issue:** `deploy:list` and `deploy:list:dev` are byte-identical; `deploy:global`
  sets `DEV_GUILD_ID=` which forces the "refuse global" hard-guard, so it can never
  deploy globally despite its name.
- **Fix:** De-dupe; rename or fix `deploy:global` once `BUG-2` is resolved.

## 🟢 DOC-7 — `TODO.md` is two stray lines

- [ ] **`TODO.md`** · Verified: hand
- **Issue:** Contains only "Adjust permissions for resource commands" and "node version
  stuff was very wonky." — now superseded by `_project_specs/todos/` and this audit.
- **Fix:** Fold the permissions note into `SEC-2`/backlog; delete `TODO.md` or point it
  at `_project_specs/`.
