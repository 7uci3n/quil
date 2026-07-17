#!/bin/sh
set -e

# Ensure the schema exists and is up to date before the bot logs in.
#   init.db   -> creates tables (CREATE TABLE IF NOT EXISTS)     [idempotent]
#   migrate.db -> adds newer columns, guarded by pragma checks    [idempotent]
# Order matters: migrate ALTERs an existing table, so init must run first.
echo "▶ Initializing database..."
node dist/src/scripts/init.db.js

echo "▶ Running migrations..."
node dist/src/scripts/migrate.db.js

echo "▶ Starting Quil..."
# exec so the bot becomes the container's main process and receives SIGTERM
exec "$@"
