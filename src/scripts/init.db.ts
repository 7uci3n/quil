import { initDb } from "../db/index.js";
console.log("🏃‍♂️ Initializing DB...");

initDb()
  .then((db) => {
    console.log("✅ Initialization completed successfully");
    return db.close();
  })
  .then(() => {
    console.log("📂 Database connection closed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Initialization failed:", err);
    process.exit(1);
  });
