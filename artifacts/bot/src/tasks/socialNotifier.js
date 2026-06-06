import Parser from 'rss-parser';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { query } from '../database/index.js';

const parser = new Parser();

const YT_HANDLE = '@mdarb3';
const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YT_HANDLE}`;
const NOTIFY_CHANNEL_ID = '1405207264868175952';
const NOTIFY_ROLE_ID = '1405203186389745885';
const LOGO_URL = 'https://yt3.googleusercontent.com/ytc/AIdro_k6yB-G4pW9Z-f0000000000000000000000000000=s900-c-k-c0x00ffffff-no-rj';

let socialData = {
  lastYouTubeVideoId: null,
  isTwitchLive: false
};

async function loadData() {
  try {
    const res = await query("SELECT value FROM bot_state WHERE key = 'social_data'");
    if (res.rows.length > 0) {
      socialData = res.rows[0].value;
    }
  } catch (err) {
    console.error('[SocialNotifier] Error loading data from DB:', err.message);
  }
}

async function saveData() {
  try {
    await query(`
      INSERT INTO bot_state (key, value) VALUES ('social_data', $1)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [JSON.stringify(socialData)]);
  } catch (err) {
    console.error('[SocialNotifier] Error saving data to DB:', err.message);
  }
}

// Hardcoded Channel ID for @mdarb3
const YOUTUBE_CHANNEL_ID = 'UCAGq4equWK9mLMz0wB9MJLw';

// Check YouTube for new videos
async function checkYouTube(client) {
  try {
    const channelId = YOUTUBE_CHANNEL_ID;

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const feed = await parser.parseURL(feedUrl);

    if (feed.items && feed.items.length > 0) {
      // Check the latest 3 videos (oldest first so we announce in order)
      const itemsToCheck = feed.items.slice(0, 3).reverse();

      for (const latestVideo of itemsToCheck) {
        const videoId = latestVideo.id.replace('yt:video:', '');
        const pubDate = new Date(latestVideo.pubDate);
        const now = new Date();
        const hoursOld = (now - pubDate) / (1000 * 60 * 60);

        // Make sure socialData has announcedVideos array
        if (!socialData.announcedVideos) {
          socialData.announcedVideos = socialData.lastYouTubeVideoId ? [socialData.lastYouTubeVideoId] : [];
        }

        // Check if this is a new video and less than 24 hours old
        if (!socialData.announcedVideos.includes(videoId) && hoursOld < 24) {
          console.log(`[SocialNotifier] New YouTube video detected: ${latestVideo.title}`);
          
          // Notify Discord
          const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
          if (channel) {
            let roleCount = 0;
            if (channel.guild) {
              try {
                await channel.guild.members.fetch();
                const role = channel.guild.roles.cache.get(NOTIFY_ROLE_ID);
                if (role) roleCount = role.members.size;
              } catch (err) {
                console.error('[SocialNotifier] Error fetching role for count:', err);
              }
            }

            const embed = new EmbedBuilder()
              .setColor('#FF0000') // YouTube Red
              .setAuthor({ name: feed.title || 'Mdarb3 | مدربة', iconURL: LOGO_URL, url: YOUTUBE_CHANNEL_URL })
              .setTitle(latestVideo.title)
              .setURL(latestVideo.link)
              .setImage(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`) // Video Thumbnail
              .setFooter({ text: 'YouTube', iconURL: 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png' })
              .setTimestamp(pubDate);

            const subscribeButton = new ButtonBuilder()
              .setCustomId('social:subscribe')
              .setLabel(`🔔 اشترك بالإشعارات (${roleCount})`)
              .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(subscribeButton);

            await channel.send({
              content: `<@&${NOTIFY_ROLE_ID}> مقطع جديد نزل يا معرقين لحقوا عليه! 🔥\n${latestVideo.link}`,
              embeds: [embed],
              components: [row]
            });

            // Update state
            socialData.announcedVideos.push(videoId);
            if (socialData.announcedVideos.length > 10) socialData.announcedVideos.shift();
            socialData.lastYouTubeVideoId = videoId; // fallback for older logic
            await saveData();
          }
        }
      }
    }
  } catch (error) {
    console.error('[SocialNotifier] Error checking YouTube:', error.message);
  }
}

export async function startSocialNotifier(client) {
  console.log('[SocialNotifier] Starting social media notification task...');
  
  await loadData();

  const runCheck = () => {
    checkYouTube(client);
  };

  if (client.isReady()) {
    runCheck();
  } else {
    client.once('ready', runCheck);
  }

  // Check every 3 minutes (180,000 ms)
  setInterval(() => {
    if (client.isReady()) {
      runCheck();
    }
  }, 3 * 60 * 1000);
}
