import { Server } from "socket.io";
import client from "./client.js";

const TARGET_CHANNEL_ID = "1294312574162178200";

let io;

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

        await webhook.send({
          content: data.text,
          username: data.username || "App User",
          avatarURL: data.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
        });
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
          sender: msg.author.displayName || msg.author.username,
          text: msg.cleanContent || msg.content,
          avatar: msg.author.displayAvatarURL(),
          source: 'discord',
          isMe: false,
          timestamp: msg.createdTimestamp,
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
    sender: message.author.displayName || message.author.username,
    text: message.cleanContent || message.content,
    avatar: message.author.displayAvatarURL(),
    source: 'discord',
    isMe: false,
  });
}
