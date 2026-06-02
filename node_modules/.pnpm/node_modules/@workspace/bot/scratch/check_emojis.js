import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

async function checkEmojis() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(process.env.DISCORD_BOT_TOKEN);
    const guild = await client.guilds.fetch('861355983975874601');
    const emojis = await guild.emojis.fetch();
    console.log("EMOJIS:", emojis.map(e => e.name + ':' + e.id).join(', '));
  } catch (err) {
    console.error(err);
  } finally {
    client.destroy();
    process.exit(0);
  }
}

checkEmojis();
