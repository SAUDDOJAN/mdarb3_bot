import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const parser = new Parser();

// Paths and configurations
const DATA_FILE = path.resolve('./social_data.json');
const YT_HANDLE = '@mdarb3';
const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YT_HANDLE}`;

const NOTIFY_CHANNEL_ID = '1405207264868175952';
const NOTIFY_ROLE_ID = '1405203186389745885';

// You can use a URL for the logo, or attach it later. For now we use the discord avatar if possible, or a direct link.
// We'll leave it empty to use author icon later.
const LOGO_URL = 'https://yt3.googleusercontent.com/ytc/AIdro_k6yB-G4pW9Z-f0000000000000000000000000000=s900-c-k-c0x00ffffff-no-rj'; // Placeholder or you can upload the image to discord and put the link here.

// State to track last notified items
let socialData = {
  lastYouTubeVideoId: null,
  isTwitchLive: false
};

// Load existing data if available
if (fs.existsSync(DATA_FILE)) {
  try {
    socialData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (error) {
    console.error('[SocialNotifier] Error reading social_data.json:', error);
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(socialData, null, 2));
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
      const latestVideo = feed.items[0];
      const videoId = latestVideo.id.replace('yt:video:', '');

      // Check if this is a new video
      if (socialData.lastYouTubeVideoId !== videoId) {
        console.log(`[SocialNotifier] New YouTube video detected: ${latestVideo.title}`);
        
        // Notify Discord
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
          let roleCount = 0;
          if (channel.guild) {
            try {
              const role = channel.guild.roles.cache.get(NOTIFY_ROLE_ID) || await channel.guild.roles.fetch(NOTIFY_ROLE_ID);
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
            .setTimestamp(new Date(latestVideo.pubDate));

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
          socialData.lastYouTubeVideoId = videoId;
          saveData();
        }
      }
    }
  } catch (error) {
    console.error('[SocialNotifier] Error checking YouTube:', error.message);
  }
}

// Main task runner
export function startSocialNotifier(client) {
  console.log('[SocialNotifier] Starting social media notification task...');
  
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
