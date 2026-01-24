import { migrateDb } from "../db/index.js";
console.log("🏃‍♂️ Migrating DB...");

migrateDb()
  .then((db) => {
    console.log("✅ Migration completed successfully");
    // Properly close the connection
    return db.close();
  })
  .then(() => {
    console.log("📂 Database connection closed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });
