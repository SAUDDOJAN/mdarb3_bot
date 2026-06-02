import "dotenv/config";
import client from "../src/client.js";
import { query } from "../src/database/index.js";

async function run() {
  client.once("ready", async () => {
    console.log("Bot ready.");
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (!guild) {
      console.log("Guild not found.");
      process.exit(1);
    }
    
    console.log("Channels in guild:");
    guild.channels.cache.forEach(ch => {
      console.log(`${ch.id} - ${ch.name} (${ch.type})`);
    });
    
    // Check current config
    const res = await query("SELECT powercard_channel_id FROM guild_config WHERE guild_id=$1", [guild.id]);
    console.log("Current powercard_channel_id:", res.rows[0]?.powercard_channel_id);
    
    process.exit();
  });
  
  await client.login(process.env.DISCORD_BOT_TOKEN);
}

run().catch(console.error);
