import { log } from "../lib/log.js";
import Database from "better-sqlite3";
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

  const db = new Database(DB_FILE);
  db.exec(`DROP TABLE IF EXISTS charlog;`);
  log.info("✅ Dropped charlog table");

  db.exec(`DROP TABLE IF EXISTS lfg_status;`);
  log.info("✅ Dropped lfg_status table");

  db.exec(`DROP TABLE IF EXISTS guild_state;`);
  log.info("✅ Dropped guild_state table");

  // Future use tables
  db.exec(`DROP TABLE IF EXISTS xp_audit;`);
  log.info("✅ Dropped xp_audit table");

  db.exec(`DROP TABLE IF EXISTS lfg_requests;`);
  log.info("✅ Dropped lfg_requests table");

  db.exec(`DROP TABLE IF EXISTS lfg_audit;`);
  log.info("✅ Dropped lfg_audit table");

  db.exec(`DROP TABLE IF EXISTS guild_audit;`);
  log.info("✅ Dropped guild_audit table");

  db.close();
  log.info("✅ Wiped all tables in", DB_FILE);
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});
