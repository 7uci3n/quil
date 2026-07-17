import { log } from "../lib/log.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { DEFAULT_CONFIG } from "../config/app.config.js";
import { dtpDayBoundary } from "../domain/dtp.js";

export type Sqlite = Database.Database;
let _db: Sqlite | null = null;

const DEFAULT_DB =
  process.env.DB_FILE || path.resolve(process.cwd(), "data/remnant.sqlite");
const FUND_ID = process.env.GUILD_FUND_ID || "sys:fund:remnant";

function applyPragmas(db: Sqlite) {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("wal_autocheckpoint = 1000");
}

// NOTE: functions keep async signatures as a thin compatibility shim so callers
// are unchanged; better-sqlite3 itself is synchronous, so each body runs without
// interleaving and multi-step mutations use db.transaction() (see db_queries.ts).
export async function initDb(dbFile = DEFAULT_DB): Promise<Sqlite> {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  applyPragmas(db);

  // Character log
  db.exec(`
    CREATE TABLE IF NOT EXISTS charlog (
      userId TEXT,
      name   TEXT NOT NULL,
      level  INTEGER NOT NULL,
      xp     INTEGER NOT NULL,
      cp     INTEGER NOT NULL,
      tp     INTEGER NOT NULL,
      active BOOL NOT NULL,
      PRIMARY KEY (userId, name)
    );
  `);

  // drop the deprecated lfg_presence table/index if present
  db.exec(
    `DROP TABLE IF EXISTS lfg_presence; DROP INDEX IF EXISTS idx_lfg_guild_tier;`,
  );

  // LFG status + guild state
  db.exec(`
    CREATE TABLE IF NOT EXISTS lfg_status (
      userId    TEXT PRIMARY KEY,
      guildId   TEXT NOT NULL,
      name      TEXT NOT NULL,
      startedAt INTEGER NOT NULL,
      low       INTEGER NOT NULL DEFAULT 0,
      mid       INTEGER NOT NULL DEFAULT 0,
      high      INTEGER NOT NULL DEFAULT 0,
      epic      INTEGER NOT NULL DEFAULT 0,
      pbp       INTEGER NOT NULL DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guild_state (
      guildId TEXT NOT NULL,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (guildId, key)
    );
  `);

  // create the fund row if missing
  db.prepare(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, active)
     VALUES (?, 'Adventurers Guild Fund', 20, 305000, 500000, 0, 1)
     ON CONFLICT(userId,name) DO NOTHING`,
  ).run(FUND_ID);

  _db = db;
  log.info(`📂 Database initialized: ${dbFile}`);
  return db;
}

export async function migrateDb(dbFile = DEFAULT_DB): Promise<Sqlite> {
  const db = new Database(dbFile);
  applyPragmas(db);

  const hasColumn = (table: string, column: string): boolean =>
    !!db
      .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, column);

  if (!hasColumn("charlog", "active")) {
    db.exec(
      `ALTER TABLE charlog ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1;`,
    );
  }
  if (!hasColumn("charlog", "dtp")) {
    db.exec(`ALTER TABLE charlog ADD COLUMN dtp INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!hasColumn("charlog", "dtp_updated")) {
    const dtpRate = DEFAULT_CONFIG.guild?.config.features.dtp?.rate ?? 1;
    const timestampNormal = dtpDayBoundary(Date.now() / 1000, dtpRate);
    db.exec(
      `ALTER TABLE charlog ADD COLUMN dtp_updated INTEGER NOT NULL DEFAULT ${timestampNormal};`,
    );
  }
  if (!hasColumn("library", "title")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS library (
        title   TEXT,
        genre   TEXT NOT NULL,
        content TEXT NOT NULL,
        PRIMARY KEY (title)
      );
    `);
  }
  if (!hasColumn("library", "author")) {
    db.exec(`ALTER TABLE library ADD COLUMN author TEXT;`);
  }
  if (!hasColumn("charlog", "cc")) {
    db.exec(`ALTER TABLE charlog ADD COLUMN cc INTEGER NOT NULL DEFAULT 0;`);
  }

  // Enforce "one active character per user": normalize existing violations
  // (keep the lowest-rowid active row), then add a partial unique index.
  db.exec(`
    UPDATE charlog SET active = 0
    WHERE active = 1 AND rowid NOT IN (
      SELECT MIN(rowid) FROM charlog WHERE active = 1 GROUP BY userId
    );
  `);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_charlog_one_active
     ON charlog (userId) WHERE active = 1;`,
  );

  log.info(`📂 Database migrations done: ${dbFile}`);
  return db;
}

export function getDb(): Sqlite {
  if (!_db)
    throw new Error("DB not initialized — call initDb() before using getDb()");
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    _db.close();
    _db = null;
  }
}
