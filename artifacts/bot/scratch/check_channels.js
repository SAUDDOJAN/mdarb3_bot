import "dotenv/config";
import client from "../src/client.js";

client.once("ready", async () => {
  console.log(`[Scratch] Logged in as ${client.user.tag}`);
  
  const GUILD_ID = "861355983975874601";
  const guild = client.guilds.cache.get(GUILD_ID);
  
  if (!guild) {
    console.error(`Guild ${GUILD_ID} not found in cache!`);
    process.exit(1);
  }
  
  console.log(`\n--- Text Channels in Guild: ${guild.name} ---`);
  const channels = await guild.channels.fetch();
  channels.forEach(ch => {
    if (ch.isTextBased()) {
      console.log(`- ID: ${ch.id} | Name: ${ch.name} | Category: ${ch.parent ? ch.parent.name : "None"} | Position: ${ch.position}`);
    }
  });
  
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
