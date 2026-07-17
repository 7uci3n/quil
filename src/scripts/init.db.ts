import { log } from "../lib/log.js";
import { initDb } from "../db/index.js";
log.info("🏃‍♂️ Initializing DB...");

initDb()
  .then((db) => {
    log.info("✅ Initialization completed successfully");
    return db.close();
  })
  .then(() => {
    log.info("📂 Database connection closed");
    process.exit(0);
  })
  .catch((err) => {
    log.error("❌ Initialization failed:", err);
    process.exit(1);
  });
