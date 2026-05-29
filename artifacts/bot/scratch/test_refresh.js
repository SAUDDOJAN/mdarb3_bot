import "dotenv/config";
import client from "../src/client.js";
import { refreshAllCards } from "../src/modules/powercards.js";

async function run() {
  console.log("Logging in bot to run overdue card refresh test...");

  client.once("ready", async () => {
    console.log("Bot is ready. Starting refreshAllCards...");
    try {
      await refreshAllCards(client);
      console.log("✅ Refresh test completed successfully!");
    } catch (err) {
      console.error("❌ Error in refresh test:", err);
    }
    process.exit(0);
  });

  await client.login(process.env.DISCORD_BOT_TOKEN);
}

run().catch(console.error);
