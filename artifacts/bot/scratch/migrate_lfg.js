import "dotenv/config";
import { initDb, pool } from "../src/database/index.js";

async function run() {
  console.log("[Migration] Running initDb...");
  await initDb();
  console.log("[Migration] Done!");
  await pool.end();
}

run().catch((err) => {
  console.error("[Migration] Failed:", err);
  process.exit(1);
});
