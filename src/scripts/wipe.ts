import { log } from "../lib/log.js";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { shouldRefuseWipe } from "./guards.js";
const DB_FILE = process.env.DB_FILE || "./data/remnant.sqlite";

async function main() {
  const force =
    process.argv.includes("--force") || process.env.CONFIRM_WIPE === "yes";
  if (shouldRefuseWipe(process.env.NODE_ENV, force)) {
    log.error(
      `❌ Refusing to wipe in production without --force (or CONFIRM_WIPE=yes). Target: ${DB_FILE}`,
    );
    process.exit(1);
  }
  log.info(`⚠️  Wiping database at ${DB_FILE}`);

  const db = await open({ filename: DB_FILE, driver: sqlite3.Database });
  await db.exec(`DROP TABLE IF EXISTS charlog;`);
  log.info("✅ Dropped charlog table");

  await db.exec(`DROP TABLE IF EXISTS lfg_status;`);
  log.info("✅ Dropped lfg_status table");

  await db.exec(`DROP TABLE IF EXISTS guild_state;`);
  log.info("✅ Dropped guild_state table");

  // Future use tables
  await db.exec(`DROP TABLE IF EXISTS xp_audit;`);
  log.info("✅ Dropped xp_audit table");

  await db.exec(`DROP TABLE IF EXISTS lfg_requests;`);
  log.info("✅ Dropped lfg_requests table");

  await db.exec(`DROP TABLE IF EXISTS lfg_audit;`);
  log.info("✅ Dropped lfg_audit table");

  await db.exec(`DROP TABLE IF EXISTS guild_audit;`);
  log.info("✅ Dropped guild_audit table");

  await db.close();
  log.info("✅ Wiped all tables in", DB_FILE);
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
