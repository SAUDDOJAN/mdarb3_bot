import Parser from 'rss-parser';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { query } from '../database/index.js';

const parser = new Parser();

const YT_HANDLE = '@mdarb3';
const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YT_HANDLE}`;
const NOTIFY_CHANNEL_ID = '1405207264868175952';
const NOTIFY_ROLE_ID = '1405203186389745885';
const LOGO_URL = 'https://yt3.googleusercontent.com/B7d8Q9FNxZmvYyFcdJphoXMrTMKVBlcCYdDMXl-18Kmdi9QV4YCyNIjPASielOovkdDJn3Mn-Q=s900-c-k-c0x00ffffff-no-rj';

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
export async function checkYouTube(client) {
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

export async function checkYouTubeDebug(client) {
  await loadData();
  const channelId = YOUTUBE_CHANNEL_ID;
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const feed = await parser.parseURL(feedUrl);
  
  const debugInfo = {
    announcedVideos: socialData.announcedVideos || [],
    lastYouTubeVideoId: socialData.lastYouTubeVideoId,
    latestVideosInFeed: [],
  };

  if (feed.items && feed.items.length > 0) {
    const itemsToCheck = feed.items.slice(0, 3).reverse();
    for (const latestVideo of itemsToCheck) {
      const videoId = latestVideo.id.replace('yt:video:', '');
      const pubDate = new Date(latestVideo.pubDate);
      const hoursOld = (new Date() - pubDate) / (1000 * 60 * 60);
      debugInfo.latestVideosInFeed.push({
        title: latestVideo.title,
        id: videoId,
        hoursOld: hoursOld,
        isAnnounced: debugInfo.announcedVideos.includes(videoId)
      });
    }
  }
  
  return debugInfo;
}

export async function startSocialNotifier(client) {
  console.log('[SocialNotifier] Starting social media notification task...');
  
  await loadData();

  const initYouTube = () => {
    // 1. Initial Webhook Subscription
    subscribeToYouTubeHub();
    
    // 2. Renew Webhook Subscription every 3 days to prevent lease expiration
    setInterval(subscribeToYouTubeHub, 3 * 24 * 60 * 60 * 1000);

    // 3. Fallback Polling every 15 minutes just in case webhook fails or drops
    setInterval(() => checkYouTube(client), 15 * 60 * 1000);
    // Also do an initial check right now
    checkYouTube(client);
  };

  if (client.isReady()) {
    initYouTube();
  } else {
    client.once('ready', initYouTube);
  }
}

export async function subscribeToYouTubeHub() {
  const publicUrl = process.env.PUBLIC_URL || process.env.RAILWAY_STATIC_URL;
  if (!publicUrl) {
    console.log('[SocialNotifier] No PUBLIC_URL found. Skipping YouTube Webhook subscription. Please set PUBLIC_URL in Railway.');
    return;
  }

  const callbackUrl = `${publicUrl}/api/youtube-webhook`.replace(/([^:]\/)\/+/g, "$1"); // prevent double slashes
  const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

  try {
    const response = await fetch('https://pubsubhubbub.appspot.com/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'hub.callback': callbackUrl,
        'hub.topic': topicUrl,
        'hub.verify': 'sync',
        'hub.mode': 'subscribe',
        'hub.lease_seconds': '864000' // 10 days
      })
    });

    if (!response.ok) {
      console.error(`[SocialNotifier] Failed to subscribe to YouTube Hub: ${response.status} ${response.statusText}`);
    } else {
      console.log(`[SocialNotifier] Successfully subscribed to YouTube Webhook! Callback: ${callbackUrl}`);
    }
  } catch (error) {
    console.error('[SocialNotifier] Error subscribing to YouTube Hub:', error.message);
  }
}

export async function handleYouTubeWebhook(req, res, client) {
  // Handle Hub Challenge (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const mode = url.searchParams.get('hub.mode');
    const topic = url.searchParams.get('hub.topic');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && topic.includes(YOUTUBE_CHANNEL_ID)) {
      console.log('[SocialNotifier] YouTube Hub verified subscription!');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
      return;
    }
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // Handle Video Push (POST)
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const feed = await parser.parseString(body);
        if (feed.items && feed.items.length > 0) {
          const latestVideo = feed.items[0];
          const videoId = latestVideo.id.replace('yt:video:', '');
          
          if (!socialData.announcedVideos) {
            socialData.announcedVideos = socialData.lastYouTubeVideoId ? [socialData.lastYouTubeVideoId] : [];
          }

          // Sometimes YouTube sends "deleted" pokes. We only care if it's new.
          if (!socialData.announcedVideos.includes(videoId)) {
            console.log(`[SocialNotifier] 🚀 INSTANT YouTube Webhook received: ${latestVideo.title}`);
            
            // Notify Discord
            const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(()=>null);
            if (channel) {
              let roleCount = 0;
              if (channel.guild) {
                try {
                  await channel.guild.members.fetch();
                  const role = channel.guild.roles.cache.get(NOTIFY_ROLE_ID);
                  if (role) roleCount = role.members.size;
                } catch (err) {}
              }

              const pubDate = new Date(latestVideo.pubDate);
              const embed = new EmbedBuilder()
                .setColor('#FF0000') // YouTube Red
                .setAuthor({ name: feed.title || 'Mdarb3 | مدربة', iconURL: LOGO_URL, url: YOUTUBE_CHANNEL_URL })
                .setTitle(latestVideo.title)
                .setURL(latestVideo.link)
                .setImage(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`) // Video Thumbnail
                .setFooter({ text: 'YouTube Instant Push', iconURL: 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png' })
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
              socialData.lastYouTubeVideoId = videoId;
              await saveData();
            }
          }
        }
        res.writeHead(200);
        res.end('OK');
      } catch (err) {
        console.error('[SocialNotifier] Error processing Webhook XML:', err.message);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    return;
  }

  res.writeHead(405);
  res.end('Method Not Allowed');
}
