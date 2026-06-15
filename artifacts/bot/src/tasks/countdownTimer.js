import { query } from '../database/index.js';
import { EmbedBuilder } from 'discord.js';

function formatTimeLeft(endTime) {
  const diff = endTime - new Date();
  if (diff <= 0) return null;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let str = "";
  if (days > 0) str += `${days}d `;
  if (hours > 0) str += `${hours}h `;
  str += `${minutes}m`;
  if (!str) str = "0m";
  return str.trim();
}

export async function processCountdowns(client) {
  try {
    const res = await query("SELECT * FROM live_countdowns WHERE status = 'active'");
    for (const row of res.rows) {
      const { id, guild_id, voice_channel_id, text_channel_id, game_name, short_name, mention_target, end_time } = row;
      
      const guild = client.guilds.cache.get(guild_id) || await client.guilds.fetch(guild_id).catch(() => null);
      if (!guild) continue;

      const timeStr = formatTimeLeft(new Date(end_time));

      if (!timeStr) {
        // Time is up!
        // 1. Mark as completed
        await query("UPDATE live_countdowns SET status = 'completed' WHERE id = $1", [id]);
        
        // 2. Announce
        const txtChannel = guild.channels.cache.get(text_channel_id) || await guild.channels.fetch(text_channel_id).catch(() => null);
        if (txtChannel) {
          const embed = new EmbedBuilder()
            .setColor("#e74c3c")
            .setTitle(`🎉 حان الموعد! - ${game_name}`)
            .setDescription(`الوقت انتهى يا أبطال، استعدوا للانطلاق في **${game_name}**! ⚔️🔥\n\nالشباب متجمعين في الروم الصوتي الآن، اضغط هنا عشان تدخل معهم: <#${voice_channel_id}>`)
            .setTimestamp();
          
          let content = mention_target || "";
          await txtChannel.send({ content, embeds: [embed] }).catch(() => {});
        }

        // 3. Rename voice channel to "Launched!"
        const vc = guild.channels.cache.get(voice_channel_id) || await guild.channels.fetch(voice_channel_id).catch(() => null);
        if (vc) {
          await vc.setName(`✅ ${short_name || game_name}: بدأت!`).catch(() => {});
        }

      } else {
        // Update name
        const vc = guild.channels.cache.get(voice_channel_id) || await guild.channels.fetch(voice_channel_id).catch(() => null);
        if (vc) {
          const expectedName = `⏳ ${short_name || game_name}: ${timeStr}`;
          if (vc.name !== expectedName) {
            await vc.setName(expectedName).catch(err => {
              console.error(`[Countdown] Failed to rename VC for ${game_name}:`, err.message);
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Countdown] Error processing countdowns:", err);
  }
}

export function startCountdownTimer(client) {
  const loop = () => {
    processCountdowns(client);
  };
  
  if (client.isReady()) loop();
  else client.once('ready', loop);

  // Every 6 minutes (Discord rate limit is 2 times per 10 mins)
  setInterval(() => {
    if (client.isReady()) loop();
  }, 6 * 60 * 1000);
}
