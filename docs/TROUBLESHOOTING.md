# Production Deployment Troubleshooting

## SQLITE_READONLY Error Root Cause

The error occurs because:

1. **WAL Mode Files**: SQLite in WAL mode creates `-wal` and `-shm` files alongside the database
2. **Permission Requirements**: These files require write permissions on both files AND the directory
3. **Migration Issue**: Previously, `migrateDb()` wasn't setting WAL mode, causing inconsistent journal states

## Fixed Issues (v1.0.1)

- ✅ `migrateDb()` now sets WAL mode pragmas consistently with `initDb()`
- ✅ Migration script properly closes DB connection
- ✅ Added permission diagnostic script

## Production Deployment Checklist

### 1. Check Service User

```bash
systemctl show -p User,Group bissel.service
# Should show: User=quil, Group=quil
```

### 2. Verify File Permissions

```bash
cd /srv/bissel-modern
ls -la data/

# Expected output:
# drwxr-xr-x  quil quil  data/
# -rw-r--r--  quil quil  remnant.sqlite
# -rw-r--r--  quil quil  remnant.sqlite-wal
# -rw-r--r--  quil quil  remnant.sqlite-shm
```

### 3. Fix Permissions (if needed)

```bash
sudo chown -R quil:quil /srv/bissel-modern/data/
sudo chmod 755 /srv/bissel-modern/data/
sudo chmod 644 /srv/bissel-modern/data/remnant.sqlite*
```

### 4. Running Migrations

```bash
# Option A: Run as service user (recommended)
sudo -u quil npm run db:migrate

# Option B: Run as your user (requires group membership)
sudo usermod -aG quil $(whoami)
sudo chmod 775 /srv/bissel-modern/data/  # Group write
newgrp quil  # Activate group membership
npm run db:migrate
```

### 5. Deployment Steps

```bash
# 1. Stop service
sudo systemctl stop bissel

# 2. Pull latest code
git pull

# 3. Install dependencies
npm ci

# 4. Build
npm run build

# 5. Run migrations (as service user!)
sudo -u quil npm run db:migrate

# 6. Start service
sudo systemctl start bissel

# 7. Check status
sudo systemctl status bissel
journalctl -u bissel -f  # Follow logs
```

## Common Pitfalls

### ❌ Running migrations as root

- Migration creates files owned by root
- Service user `quil` can't access them
- **Solution**: Always run migrations as the service user

### ❌ 777 permissions

- While this works, it's a security risk
- **Better**: Use proper ownership with 644/755

### ❌ Forgetting to rebuild

- Old compiled code in `dist/` won't include fixes
- **Always**: `npm run build` before restarting service

## Diagnostic Commands

```bash
# Check who owns database files
stat -c "%U:%G %a %n" data/*

# Check if WAL mode is enabled
sqlite3 data/remnant.sqlite "PRAGMA journal_mode;"
# Should output: wal

# Test write permissions as service user
sudo -u quil touch data/.test && sudo -u quil rm data/.test
# Should succeed without errors

# Check service logs for permission errors
journalctl -u bissel --since "1 hour ago" | grep -i "readonly\|permission"
```

## Quick Fix Script

Run the diagnostic script to automatically check and suggest fixes:

```bash
chmod +x check-permissions.sh
./check-permissions.sh
```
