import { log } from "../lib/log.js";
import { migrateDb } from "../db/index.js";
log.info("🏃‍♂️ Migrating DB...");

migrateDb()
  .then((db) => {
    log.info("✅ Migration completed successfully");
    // Properly close the connection
    return db.close();
  })
  .then(() => {
    log.info("📂 Database connection closed");
    process.exit(0);
  })
  .catch((err) => {
    log.error("❌ Migration failed:", err);
    process.exit(1);
  });
