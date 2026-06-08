import { Client, GatewayIntentBits } from "discord.js";
import "dotenv/config";
import { sendWeeklyReport } from "../src/tasks/weeklyReport.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once("ready", async () => {
  console.log("Client ready, triggering weekly report...");
  try {
    await sendWeeklyReport(client);
    console.log("Report sent.");
  } catch (err) {
    console.error("Error sending report:", err);
  }
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
