import "dotenv/config";
import client from "../src/client.js";
import { AuditLogEvent } from "discord.js";

client.once("ready", async () => {
  console.log(`[Scratch] Logged in as ${client.user.tag}`);
  
  const GUILD_ID = "861355983975874601";
  const guild = client.guilds.cache.get(GUILD_ID);
  
  if (!guild) {
    console.error(`Guild ${GUILD_ID} not found!`);
    process.exit(1);
  }
  
  try {
    const auditLogs = await guild.fetchAuditLogs({
      limit: 5,
      type: AuditLogEvent.ChannelDelete
    });
    
    console.log("\n--- Recently Deleted Channels (Audit Log) ---");
    for (const entry of auditLogs.entries.values()) {
      console.log(`- Time: ${entry.createdAt}`);
      console.log(`  Executor: ${entry.executor ? entry.executor.tag : "Unknown"}`);
      console.log(`  Target Name: ${entry.target.name} (Type: ${entry.target.type})`);
      console.log(`  Reason: ${entry.reason}`);
    }
  } catch (err) {
    console.error("Error fetching audit logs:", err);
  }
  
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
