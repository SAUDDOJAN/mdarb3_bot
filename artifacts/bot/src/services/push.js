import webpush from 'web-push';
import { Expo } from 'expo-server-sdk';
import { query } from '../database/index.js';

let expo = new Expo();

export async function getVapidKeys() {
  // Check if keys exist in DB
  let result = await query("SELECT value FROM bot_state WHERE key = 'vapid_keys'");
  if (result.rows.length > 0) {
    return result.rows[0].value;
  }

  // If not, generate new keys
  const vapidKeys = webpush.generateVAPIDKeys();
  
  await query("INSERT INTO bot_state (key, value) VALUES ('vapid_keys', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(vapidKeys)]);
  
  return vapidKeys;
}

// Initialize web-push details
export async function initPush() {
  try {
    const keys = await getVapidKeys();
    webpush.setVapidDetails(
      'mailto:admin@m3rgeen.com',
      keys.publicKey,
      keys.privateKey
    );
    console.log("[Push] VAPID keys loaded successfully.");
  } catch (err) {
    console.error("[Push] Failed to load VAPID keys:", err);
  }
}

export async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const result = await query("SELECT token, platform FROM push_tokens WHERE user_id = $1", [userId]);
    
    if (result.rows.length === 0) return; // User has no registered devices

    for (const device of result.rows) {
      if (device.platform === 'web') {
        try {
          const pushSubscription = JSON.parse(device.token);
          await webpush.sendNotification(pushSubscription, JSON.stringify({
            title,
            body,
            data
          }));
        } catch (webErr) {
          if (webErr.statusCode === 410 || webErr.statusCode === 404) {
            // Subscription expired or unsubscribed, remove it
            await query("DELETE FROM push_tokens WHERE user_id = $1 AND token = $2", [userId, device.token]);
          } else {
            console.error("[Push] Web push error:", webErr);
          }
        }
      } else if (device.platform === 'android' || device.platform === 'ios') {
        if (!Expo.isExpoPushToken(device.token)) {
          console.error(`[Push] Push token ${device.token} is not a valid Expo push token`);
          continue;
        }

        try {
          let ticketChunk = await expo.sendPushNotificationsAsync([{
            to: device.token,
            sound: 'default',
            title,
            body,
            data
          }]);
        } catch (expoErr) {
          console.error("[Push] Expo push error:", expoErr);
        }
      }
    }
  } catch (err) {
    console.error(`[Push] Error sending push to user ${userId}:`, err);
  }
}

export async function handleChatPush(message) {
  try {
    const targetUsers = new Set();
    const senderName = message.member ? message.member.displayName : (message.author.globalName || message.author.username);
    
    // Add mentioned users
    if (message.mentions && message.mentions.users) {
      message.mentions.users.forEach(u => {
        if (u.id !== message.author.id && !u.bot) targetUsers.add(u.id);
      });
    }

    // Add replied user
    if (message.reference && message.reference.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId);
        if (refMsg && refMsg.author.id !== message.author.id && !refMsg.author.bot) {
          targetUsers.add(refMsg.author.id);
        }
      } catch (err) {}
    }

    // Send push to all targets
    const bodyText = message.content.length > 100 ? message.content.substring(0, 100) + "..." : message.content;
    
    for (const userId of targetUsers) {
      await sendPushNotification(userId, `رسالة جديدة من ${senderName}`, bodyText, {
        type: 'chat_mention',
        url: '/chat'
      });
    }
  } catch (err) {
    console.error("[Push] Error handling chat push:", err);
  }
}

export async function broadcastPushNotification(title, body, data = {}, prefKey = null) {
  try {
    let queryStr = "SELECT pt.user_id, pt.token, pt.platform FROM push_tokens pt";
    if (prefKey) {
      queryStr += ` LEFT JOIN user_push_preferences pp ON pt.user_id = pp.user_id WHERE pp.${prefKey} = true OR pp.${prefKey} IS NULL`;
    }
    const result = await query(queryStr);
    if (result.rows.length === 0) return;

    // Group by platform
    const webTokens = [];
    const nativeTokens = [];

    for (const device of result.rows) {
      if (device.platform === 'web') {
        webTokens.push(device);
      } else if (device.platform === 'android' || device.platform === 'ios') {
        if (Expo.isExpoPushToken(device.token)) {
          nativeTokens.push(device.token);
        }
      }
    }

    // Send Web Push
    for (const device of webTokens) {
      try {
        const pushSubscription = JSON.parse(device.token);
        await webpush.sendNotification(pushSubscription, JSON.stringify({
          title,
          body,
          data
        }));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await query("DELETE FROM push_tokens WHERE token = $1", [device.token]);
        }
      }
    }

    // Send Expo Push (Batching)
    if (nativeTokens.length > 0) {
      const messages = nativeTokens.map(token => ({
        to: token,
        sound: 'default',
        title,
        body,
        data
      }));

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          console.error("[Push] Error broadcasting Expo push:", error);
        }
      }
    }
  } catch (err) {
    console.error("[Push] Error in broadcastPushNotification:", err);
  }
}

export async function checkScheduledReminders() {
  try {
    const res = await query("SELECT * FROM scheduled_reminders WHERE status = 'pending' AND trigger_at <= NOW()");
    for (const reminder of res.rows) {
      // Send the push notification
      await sendPushNotification(reminder.user_id, reminder.title, reminder.body, { type: 'reminder' });
      // Update status
      await query("UPDATE scheduled_reminders SET status = 'completed' WHERE id = $1", [reminder.id]);
    }
  } catch (err) {
    console.error("[Push] Error checking scheduled reminders:", err);
  }
}

