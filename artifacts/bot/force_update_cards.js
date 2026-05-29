import { query } from "./src/database/index.js";

async function run() {
  console.log("Setting last_updated to NULL for all power_cards...");
  await query("UPDATE power_cards SET last_updated = NULL");
  console.log("Done. All cards are now marked as overdue.");
  process.exit(0);
}

run();
