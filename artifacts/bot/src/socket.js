import { Server } from "socket.io";
import client from "./client.js";

const TARGET_CHANNEL_ID = "1294312574162178200";

let io;

function getFormattedContent(msg) {
  if (!msg.content) return "";
  let text = msg.content;
  if (msg.mentions && msg.guild) {
    msg.mentions.users.forEach(user => {
      const member = msg.guild.members.cache.get(user.id);
      const name = member ? member.displayName : (user.globalName || user.username);
      text = text.replace(new RegExp(`<@!?${user.id}>`, 'g'), `@${name}`);
    });
    msg.mentions.roles.forEach(role => {
      text = text.replace(new RegExp(`<@&${role.id}>`, 'g'), `@${role.name}`);
    });
    msg.mentions.channels.forEach(channel => {
      text = text.replace(new RegExp(`<#${channel.id}>`, 'g'), `#${channel.name}`);
    });
  }
  return text;
}

export function emitNotification(notification) {
  if (io) {
    io.emit("notification", notification);
  }
}

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] App user connected: ${socket.id}`);

    socket.on("appMessage", async (data) => {
      try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel) return;

        // Try to find an existing webhook created by the bot
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.owner.id === client.user.id);

        if (!webhook) {
          webhook = await channel.createWebhook({
            name: "M3RGEEN App Chat",
            avatar: client.user.displayAvatarURL(),
          });
        }

        let contentText = data.rawText || data.text;
        
        if (data.replyTo) {
          const replyPreview = data.replyTo.text.length > 50 ? data.replyTo.text.substring(0, 50) + '...' : data.replyTo.text;
          contentText = `> **${data.replyTo.sender}:** ${replyPreview}\n\n${contentText}`;
        }

        const payload = {
          content: contentText,
          username: data.username || "App User",
          avatarURL: data.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
        };

        if (data.image) {
          const matches = data.image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const buffer = Buffer.from(matches[2], 'base64');
            let ext = 'png';
            const mimeType = matches[1].toLowerCase();
            if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
            else if (mimeType.includes('gif')) ext = 'gif';
            else if (mimeType.includes('mp4')) ext = 'mp4';
            else if (mimeType.includes('mov') || mimeType.includes('quicktime')) ext = 'mov';
            else if (mimeType.includes('webm')) ext = 'webm';
            
            payload.files = [{
              attachment: buffer,
              name: `upload.${ext}`
            }];
          }
        }

        await webhook.send(payload);
      } catch (err) {
        console.error("[Socket.io] Error sending to discord:", err);
      }
    });

    socket.on("requestHistory", async () => {
      try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel) return;
        
        const fetchedMessages = await channel.messages.fetch({ limit: 50 });
        const history = fetchedMessages.map(msg => ({
          id: msg.id,
          senderId: msg.author.id,
          sender: msg.member ? msg.member.displayName : (msg.author.displayName || msg.author.username),
          text: getFormattedContent(msg),
          image: msg.attachments.first()?.url || null,
          avatar: msg.member?.displayAvatarURL() || msg.author.displayAvatarURL(),
          source: 'discord',
          isMe: false,
          timestamp: msg.createdTimestamp
        })).reverse(); // Oldest first

        socket.emit("chatHistory", history);
      } catch (err) {
        console.error("[Socket.io] Error fetching history:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] App user disconnected: ${socket.id}`);
    });
  });
}

export function emitDiscordMessage(message) {
  if (!io) return;
  io.emit("discordMessage", {
    id: message.id,
    senderId: message.author.id,
    sender: message.member ? message.member.displayName : (message.author.displayName || message.author.username),
    text: getFormattedContent(message),
    image: message.attachments.first()?.url || null,
    avatar: message.member?.displayAvatarURL() || message.author.displayAvatarURL(),
    source: 'discord',
    isMe: false,
    timestamp: message.createdTimestamp
  });
}
