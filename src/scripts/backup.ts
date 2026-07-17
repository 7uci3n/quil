import { log } from "../lib/log.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_FILE = process.env.DB_FILE || "./data/remnant.sqlite";
const BACKUP_DIR = process.env.BACKUP_DIR || "./backups";
const RETAIN_DAYS_DEFAULT = 14;
// Guard against a non-numeric BACKUP_RETAIN_DAYS silently disabling retention
// (NaN cutoff would make every prune comparison false → unbounded disk growth).
const RETAIN_DAYS = (() => {
  const parsed = Number(process.env.BACKUP_RETAIN_DAYS ?? RETAIN_DAYS_DEFAULT);
  if (!Number.isFinite(parsed) || parsed < 0) {
    log.warn(
      `[backup] invalid BACKUP_RETAIN_DAYS="${process.env.BACKUP_RETAIN_DAYS}" — using ${RETAIN_DAYS_DEFAULT}`,
    );
    return RETAIN_DAYS_DEFAULT;
  }
  return parsed;
})();

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  // millisecond suffix so two backups in the same second don't collide
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ms}`;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const db = new Database(DB_FILE);

  // Destination file (uncompressed .sqlite snapshot)
  const dest = path.resolve(BACKUP_DIR, `remnant-${stamp()}.sqlite`);
  const escaped = dest.replace(/'/g, "''"); // escape single quotes for SQL

  // Create a consistent snapshot
  db.pragma("wal_checkpoint(FULL)");
  db.exec(`VACUUM INTO '${escaped}';`);
  db.close();

  log.info(`[backup] wrote ${dest}`);

  // Retention cleanup
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".sqlite"))
    .map((f) => path.join(BACKUP_DIR, f));

  for (const f of files) {
    const s = fs.statSync(f);
    if (s.mtime.getTime() < cutoff) {
      fs.unlinkSync(f);
      log.info(`[backup] pruned ${f}`);
    }
  }
}

main().catch((err) => {
  log.error("[backup] failed:", err);
  process.exit(1);
});
