import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  try {
    console.log('Logged in as', client.user.tag);
    const guild = await client.guilds.fetch('861355983975874601');
    if (!guild) {
      console.log('Guild not found');
      process.exit(1);
    }
    
    // Enable widget and set the invite channel
    await guild.setWidgetSettings({
      enabled: true,
      channel: '1290124827184726080'
    });
    
    console.log('Widget successfully enabled and invite channel set to 1290124827184726080!');
    process.exit(0);
  } catch (error) {
    console.error('Error enabling widget:', error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
