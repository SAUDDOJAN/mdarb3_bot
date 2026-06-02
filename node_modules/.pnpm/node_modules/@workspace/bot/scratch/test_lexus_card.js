import "dotenv/config";
import { query } from "../src/database/index.js";

async function run() {
  const name = "Lexus";
  console.log(`Searching for ${name}...`);
  
  const res = await query(
    "SELECT * FROM power_cards WHERE character_name ILIKE $1",
    [`%${name}%`]
  );
  
  if (res.rows.length === 0) {
    console.log("No card found for Lexus. Checking recruitment...");
    const rec = await query(
      "SELECT * FROM recruits WHERE character_name ILIKE $1",
      [`%${name}%`]
    );
    if (rec.rows.length === 0) {
      console.log("Lexus not found.");
      return;
    }
    console.log("Found in recruits:", rec.rows[0]);
    return;
  }
  
  const user = res.rows[0];
  console.log("Found user:", user);
  
  const currentCP = user.combat_power || 0;
  
  // Insert mock history
  console.log("Inserting mock history...");
  
  // 24h ago: currentCP - 5000
  await query(
    "INSERT INTO power_history (user_id, combat_power, recorded_at) VALUES ($1, $2, NOW() - INTERVAL '24 hours')",
    [user.user_id, currentCP - 5000]
  );
  
  // 7d ago: currentCP - 20000
  await query(
    "INSERT INTO power_history (user_id, combat_power, recorded_at) VALUES ($1, $2, NOW() - INTERVAL '7 days')",
    [user.user_id, currentCP - 20000]
  );
  
  // 30d ago: currentCP - 50000
  await query(
    "INSERT INTO power_history (user_id, combat_power, recorded_at) VALUES ($1, $2, NOW() - INTERVAL '30 days')",
    [user.user_id, currentCP - 50000]
  );
  
  console.log("Done. Now you can trigger the card update.");
}

run().catch(console.error).finally(() => process.exit());
