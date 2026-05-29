import "dotenv/config";
import client from "../src/client.js";
import { fireAlert } from "../src/modules/alerts.js";
import { initDb } from "../src/database/index.js";

async function testAlert() {
  await initDb();
  await client.login(process.env.DISCORD_BOT_TOKEN);

  client.once("ready", async () => {
    console.log("Bot is ready");
    const guildId = "861355983975874601";
    const alertType = "shugo";

    console.log(`Firing test alert "${alertType}" for guild ${guildId}`);
    try {
      await fireAlert(client, guildId, alertType);
      console.log("Alert fired successfully (check Discord)");
    } catch (err) {
      console.error("Failed to fire alert:", err);
    }

    process.exit(0);
  });
}

testAlert();
