import "dotenv/config";
import { query } from "../src/database/index.js";

async function check() {
  try {
    const res = await query(
      "SELECT user_id, character_name, last_updated, shugo_url, message_id, channel_id FROM power_cards"
    );
    console.log("--- POWER CARDS IN DATABASE ---");
    console.table(res.rows.map(r => ({
      ...r,
      last_updated: r.last_updated ? r.last_updated.toISOString() : "null"
    })));
  } catch (err) {
    console.error("Error checking power cards:", err);
  }
}

check();
