import { log } from "../lib/log.js";
import { initDb, migrateDb, getDb, closeDb } from "../db/index.js";

const DB_FILE = process.env.DB_FILE || "./data/remnant.sqlite";
const MY_ID = process.env.MY_DISCORD_ID || "246030816692404234";

async function main() {
  // Use the real schema path so the seed DB matches production.
  await initDb(DB_FILE);
  const migrated = await migrateDb(DB_FILE);
  await migrated.close();

  const db = getDb();

  // minimal seed: you (125.00 GP, 4 GT)
  db.prepare(
    `INSERT INTO charlog (userId, name, level, xp, cp, tp, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId, name) DO UPDATE SET
       level=excluded.level, xp=excluded.xp,
       cp=excluded.cp, tp=excluded.tp, active=excluded.active`,
  ).run(MY_ID, "Donovan Test", 3, 900, 12500, 4, 1);

  const row = db
    .prepare(
      `SELECT name, level, xp, cp, tp FROM charlog WHERE userId = ? AND active = 1`,
    )
    .get(MY_ID);
  log.info("Seeded:", row);

  await closeDb();
  log.info("🌱 Seed complete →", DB_FILE);
  process.exit(0);
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
