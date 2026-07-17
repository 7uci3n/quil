# Migrating a bare-node install to Docker (keeping your data)

You already run Quil with `node` and have a populated `data/remnant.sqlite`. This
moves that exact database under the Docker deployment with **no data loss**.

> **Verified:** a legacy-schema DB (before the `dtp`/`dtp_updated`/`cc` columns
> existed) was run through the container's entrypoint in testing — existing
> characters were preserved and the new columns were added automatically. The
> `init` + `migrate` steps are idempotent and non-destructive.

## Two rules that prevent silent data loss

1. **Never run the bare bot and the container against the same file at once.**
   SQLite is single-writer. Stop the old process before starting the container.
2. **Account for the WAL file.** This bot uses WAL mode, and the _bare-node_
   version does not close the DB cleanly on stop — recently committed rows may sit
   in `remnant.sqlite-wal`, not yet folded into `remnant.sqlite`. So either copy
   **all** sidecar files (`.sqlite`, `.sqlite-wal`, `.sqlite-shm`) together, or
   checkpoint first (below). The Docker version fixes the clean-close bug, so this
   is a one-time concern during cutover.

## Cutover procedure (on the deploy box)

```bash
# 0. Know where the live DB is. Default is <app>/data/remnant.sqlite unless the
#    old process set DB_FILE. Confirm:
echo "$DB_FILE"                 # empty => default ./data/remnant.sqlite

# 1. STOP the bare bot so nothing is writing.
sudo systemctl stop quil        # or: pm2 stop quil   (whatever the unit is called)

# 2. Checkpoint the WAL into the main file (folds in any pending rows).
#    If sqlite3 CLI isn't installed, skip this and instead copy all 3 files in step 4.
sqlite3 /path/to/data/remnant.sqlite "PRAGMA wal_checkpoint(TRUNCATE);" || true

# 3. BACK UP first — always have a rollback copy.
cp /path/to/data/remnant.sqlite ~/quil-premigration-backup.sqlite

# 4. Put the DB where compose expects it (./data next to docker-compose.yml).
mkdir -p data backups
cp /path/to/data/remnant.sqlite* data/     # the * grabs -wal/-shm too, if present

# 5. The container runs as uid 1000 (non-root). Make the folders writable by it.
sudo chown -R 1000:1000 data backups

# 6. Start the container. The entrypoint runs init+migrate (idempotent) then the bot.
docker compose up -d
docker compose logs -f          # watch for "Ready as <bot#tag>"

# 7. Register slash commands once (safe to repeat).
docker compose run --rm register
```

## Verify the data came across

Because `./data` is a bind mount, inspect the file directly on the host with the
`sqlite3` CLI (install with `apt install sqlite3` if missing):

```bash
sqlite3 data/remnant.sqlite "SELECT COUNT(*) AS characters FROM charlog;"
sqlite3 data/remnant.sqlite "SELECT userId, name, level, cp, cc FROM charlog LIMIT 5;"
```

## Rollback

If anything looks wrong:

```bash
docker compose down                       # stop the container (data untouched)
cp ~/quil-premigration-backup.sqlite /path/to/data/remnant.sqlite
sudo systemctl start quil                 # bring the bare bot back
```

Because `./data` is a **bind mount**, `docker compose down` never deletes your
database — it stays in `./data` on the host. Back it up by copying that folder (or
keep using `npm run db:backup` semantics via the `backups/` mount).

## Notes

- The template DB you copied from the old dev box works the same way — drop it into
  `./data/` at step 4. Just make sure you brought its `-wal` file or checkpointed it
  on the old box, or the newest rows may be missing.
- To pin a custom DB path, set `DB_FILE` in `.env` (defaults to `./data/remnant.sqlite`,
  i.e. `/app/data/remnant.sqlite` inside the container).
