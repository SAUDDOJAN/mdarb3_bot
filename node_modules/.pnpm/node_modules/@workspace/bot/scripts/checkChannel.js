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
    const channel = await client.channels.fetch('1290124827184726080');
    console.log('Channel Type:', channel.type);
    console.log('Channel Name:', channel.name);
    process.exit(0);
  } catch (error) {
    console.error('Error fetching channel:', error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
