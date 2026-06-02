import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "path";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("ready", async () => {
  console.log("Test client ready!");
  const channelId = "1509153258323705927"; // User specified channel
  const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId);

  if (!channel) {
    console.error("Channel not found!");
    process.exit(1);
  }

  const bannerPath = path.join(process.cwd(), "assets", "welcome_banner_v2.png");
  const banner = await loadImage(bannerPath);
  const canvas = createCanvas(banner.width, banner.height);
  const ctx = canvas.getContext("2d");

  // Load fake avatar
  const avatar = await loadImage("https://cdn.discordapp.com/embed/avatars/0.png");

  // === COORDINATES TO TWEAK ===
  const avatarX = 339; // Scaled for 1879x1029
  const avatarY = 321; // Scaled for 1879x1029
  const avatarRadius = 260; // Scaled up to cover the hole

  const nameX = 339; // Aligned with avatar
  const nameY = 790; // Scaled down to the name box
  // ============================

  // 1. Draw avatar BEHIND everything
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
  ctx.restore();

  // 2. Draw the transparent banner ON TOP
  ctx.drawImage(banner, 0, 0);

  const fakeUsername = "FakePlayer123";
  ctx.font = "bold 75px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(fakeUsername, nameX, nameY);

  const buffer = canvas.toBuffer("image/jpeg");
  const attachment = new AttachmentBuilder(buffer, { name: "welcome_test.jpg" });

  const msg = await channel.send({ content: "صورة الترحيب التجريبية:", files: [attachment] });
  console.log("Sent test message:", msg.url);
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
