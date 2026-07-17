// Test database utilities.
// Build the schema via the REAL init + migrate path (on a temp file) so it can
// never drift from production, and wire getDb() so the production db_queries /
// db/lfg functions operate against this database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Sqlite } from "../../src/db/index.js";
import { initDb, migrateDb, getDb, closeDb } from "../../src/db/index.js";

let currentFile: string | null = null;

export async function createTestDb(): Promise<Sqlite> {
  // Temp file (not :memory:) so init and migrate share one database.
  currentFile = path.join(
    os.tmpdir(),
    `quil-test-${process.hrtime.bigint()}.sqlite`,
  );
  await initDb(currentFile);
  const migrated = await migrateDb(currentFile);
  await migrated.close();
  return getDb();
}

export async function seedTestPlayer(
  db: Sqlite,
  data: {
    userId: string;
    name: string;
    level?: number;
    xp?: number;
    cp?: number;
    tp?: number;
    dtp?: number;
    dtp_updated?: number;
    cc?: number;
    active?: boolean;
  },
) {
  await db.run(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, dtp, dtp_updated, cc, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.userId,
    data.name,
    data.level ?? 1,
    data.xp ?? 0,
    data.cp ?? 0,
    data.tp ?? 0,
    data.dtp ?? 0,
    data.dtp_updated ?? 0,
    data.cc ?? 0,
    data.active ? 1 : 0,
  );
}

export async function cleanupTestDb(_db?: Sqlite) {
  await closeDb();
  if (currentFile) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.unlinkSync(currentFile + suffix);
      } catch {
        /* ignore */
      }
    }
    currentFile = null;
  }
}
