import "dotenv/config";
import client from "../src/client.js";

async function run() {
  client.once("ready", async () => {
    console.log("Bot logged in successfully.");
    console.log("Connected guilds:");
    client.guilds.cache.forEach(guild => {
      console.log(`Guild Name: "${guild.name}" | ID: ${guild.id}`);
    });
    process.exit();
  });

  await client.login(process.env.DISCORD_BOT_TOKEN);
}

run().catch(console.error);
