import "dotenv/config";
import client from "../src/client.js";
import { query } from "../src/database/index.js";
import { createOrUpdateCard } from "../src/modules/powercards.js";

async function run() {
  const name = "Lexus";
  console.log(`Searching for ${name}...`);
  
  // Find in recruits or power_cards
  let userId, shugoUrl, currentCP;
  
  const res = await query("SELECT user_id, shugo_url, combat_power FROM power_cards WHERE character_name ILIKE $1", [`%${name}%`]);
  if (res.rows.length > 0) {
    userId = res.rows[0].user_id;
    shugoUrl = res.rows[0].shugo_url;
    currentCP = res.rows[0].combat_power;
  } else {
    const rec = await query("SELECT user_id, shugo_url, combat_power FROM recruits WHERE character_name ILIKE $1", [`%${name}%`]);
    if (rec.rows.length > 0) {
      userId = rec.rows[0].user_id;
      shugoUrl = rec.rows[0].shugo_url;
      currentCP = rec.rows[0].combat_power;
    }
  }
  
  if (!userId) {
    console.log("Lexus not found.");
    process.exit(1);
  }
  
  console.log(`Found ${name} (ID: ${userId}). Inserting mock history...`);
  
  // Insert mock history
  await query("DELETE FROM power_history WHERE user_id = $1", [userId]);
  await query("INSERT INTO power_history (user_id, combat_power, recorded_at) VALUES ($1, $2, NOW() - INTERVAL '24 hours')", [userId, currentCP - 4320]);
  await query("INSERT INTO power_history (user_id, combat_power, recorded_at) VALUES ($1, $2, NOW() - INTERVAL '7 days')", [userId, currentCP - 15600]);
  await query("INSERT INTO power_history (user_id, combat_power, recorded_at) VALUES ($1, $2, NOW() - INTERVAL '30 days')", [userId, currentCP - 42000]);
  
  console.log("Mock history inserted. Logging in bot to post card...");
  
  client.once("ready", async () => {
    console.log("Bot ready. Posting card...");
    try {
      const success = await createOrUpdateCard(client, process.env.DISCORD_GUILD_ID, userId, shugoUrl);
      console.log(success ? "✅ Card posted/updated!" : "❌ Failed to post card.");
    } catch (err) {
      console.error("Error posting card:", err);
    }
    process.exit();
  });
  
  await client.login(process.env.DISCORD_BOT_TOKEN);
}

run().catch(console.error);
