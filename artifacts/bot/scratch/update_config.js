import "dotenv/config";
import { query } from "../src/database/index.js";

async function run() {
  const guildId = process.env.DISCORD_GUILD_ID;
  const channelId = "1498360289446465636"; // 🪽｜ᴬᶦᵒⁿ²-رادار-القيلد
  
  console.log(`Setting powercard_channel_id to ${channelId} for guild ${guildId}...`);
  
  await query(
    "INSERT INTO guild_config (guild_id, powercard_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET powercard_channel_id = $2",
    [guildId, channelId]
  );
  
  console.log("Update successful.");
}

run().catch(console.error).finally(() => process.exit());
