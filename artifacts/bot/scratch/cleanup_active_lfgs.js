import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

async function run() {
  console.log('Starting full VC cleanup...');
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.error('No DISCORD_BOT_TOKEN found in environment.');
    process.exit(1);
  }

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
      const guilds = await client.guilds.fetch();
      for (const [guildId, oauthGuild] of guilds) {
        console.log(`Scanning guild: ${oauthGuild.name} (${guildId})...`);
        const guild = await oauthGuild.fetch();
        const channels = await guild.channels.fetch();
        
        for (const [channelId, channel] of channels) {
          if (!channel) continue;
          
          // Check if it's a voice channel and its name starts with 🔊 LFG or contains LFG
          const isLfgVoice = (channel.type === 2 || channel.type === 13) && 
                             (channel.name.startsWith('🔊 LFG') || channel.name.includes('LFG'));
          
          if (isLfgVoice) {
            console.log(`Found LFG VC: ${channel.name} (${channelId})`);
            if (channel.members.size === 0) {
              console.log(`Channel is empty. Deleting...`);
              await channel.delete().catch(e => console.error(`Failed to delete channel ${channel.name}:`, e.message));
            } else {
              console.log(`Channel is active with ${channel.members.size} members. Skipping.`);
            }
          }
        }
      }

      console.log('VC Cleanup complete.');
      process.exit(0);
    } catch (err) {
      console.error('Error during VC cleanup:', err);
      process.exit(1);
    }
  });

  await client.login(botToken);
}

run();
