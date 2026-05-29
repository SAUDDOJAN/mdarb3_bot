import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildEmojisAndStickers
  ] 
});

client.once("ready", async () => {
  try {
    const guildId = '861355983975874601';
    const guild = await client.guilds.fetch(guildId);
    const emojis = await guild.emojis.fetch();
    
    const names = ["Templar", "Sorcerer", "Ranger", "Gladiator", "Elementalist", "Cleric", "Chanter", "Assassin"];
    const found = {};

    names.forEach(name => {
      const e = emojis.find(em => em.name.toLowerCase() === name.toLowerCase());
      if (e) {
        found[name] = `<:${e.name}:${e.id}>`;
      } else {
        found[name] = "NOT_FOUND";
      }
    });

    console.log("--- EMOJI IDS ---");
    console.log(JSON.stringify(found, null, 2));
    console.log("--- END ---");
  } catch (err) {
    console.error(err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
