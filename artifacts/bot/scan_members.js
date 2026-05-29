import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const ROLE_ID = "1262605914918359140";

client.once("ready", async () => {
  console.log(`[Scan] Logged in as ${client.user.tag}`);
  let totalUpdated = 0;

  try {
    const guilds = client.guilds.cache.values();
    for (const guild of guilds) {
      console.log(`[Scan] Fetching members for guild: ${guild.name}`);
      const members = await guild.members.fetch();
      
      let guildUpdated = 0;
      for (const [id, member] of members) {
        if (!member.user.bot && !member.roles.cache.has(ROLE_ID)) {
          try {
            await member.roles.add(ROLE_ID);
            guildUpdated++;
            totalUpdated++;
          } catch (e) {
            console.error(`[Scan] Failed to add role to ${member.user.tag}:`, e.message);
          }
        }
      }
      console.log(`[Scan] Guild ${guild.name}: Updated ${guildUpdated} members.`);
    }
  } catch (error) {
    console.error("[Scan] Error during scan:", error);
  }

  console.log(`[Scan] Finished. Total members updated: ${totalUpdated}`);
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(console.error);
