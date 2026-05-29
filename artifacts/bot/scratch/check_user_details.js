import "dotenv/config";
import { query } from "../src/database/index.js";

async function check() {
  try {
    const userId = "388733258638295040"; // XelisaX
    const cardRes = await query("SELECT * FROM power_cards WHERE user_id=$1", [userId]);
    const recruitRes = await query("SELECT * FROM recruits WHERE user_id=$1", [userId]);

    console.log("=== POWER CARD RECORD ===");
    console.log(JSON.stringify(cardRes.rows, null, 2));

    console.log("\n=== RECRUIT RECORD ===");
    console.log(JSON.stringify(recruitRes.rows, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

check();
