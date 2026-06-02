import "dotenv/config";
import { query } from "../src/database/index.js";

async function force() {
  const name = "XelisaX";
  console.log(`Setting last_updated of ${name} to 2 days ago...`);
  
  const res = await query(
    "UPDATE power_cards SET last_updated = NOW() - INTERVAL '2 days' WHERE character_name ILIKE $1 RETURNING *",
    [`%${name}%`]
  );
  
  if (res.rows.length > 0) {
    console.log(`✅ Success! ${name}'s card is now marked as overdue.`);
    console.log("If you restart the bot, it will refresh this card in 1 minute!");
  } else {
    console.log(`❌ Character ${name} not found in power_cards table.`);
  }
}

force().catch(console.error).finally(() => process.exit());
