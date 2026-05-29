import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

async function findRole() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(process.env.DISCORD_BOT_TOKEN);
    const guild = await client.guilds.fetch('861355983975874601');
    const roles = await guild.roles.fetch();
    const role = roles.find(r => r.name.includes('AION 2 Guild'));
    console.log("ROLE_ID:", role ? role.id : 'NOT_FOUND');
  } catch (err) {
    console.error(err);
  } finally {
    client.destroy();
    process.exit(0);
  }
}

findRole();
