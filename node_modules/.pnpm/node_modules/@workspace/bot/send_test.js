import "dotenv/config";
import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    const channelId = "1290449971639881849"; // test room
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId);
    
    if (!channel) {
      console.error("Channel not found!");
      process.exit(1);
    }

    // 1. Generate Image
    const banner = await loadImage("./assets/welcome_banner.png");
    const canvas = createCanvas(banner.width, banner.height);
    const ctx = canvas.getContext("2d");

    const avatarUrl = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80";
    const avatar = await loadImage(avatarUrl);

    const centerX = 512;
    const centerY = 348;
    const radius = 38; 

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.drawImage(banner, 0, 0);

    // Dummy user simulation
    const dummyUserId = client.user.id; 
    const username = "M3RGEEN_Hero";
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(username, centerX, 415);

    const buffer = canvas.toBuffer("image/png");
    const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });

    // Compose Welcome Text (Banner message)
    const welcomeText = `**[اختبار حي - Live Test]**\n\nيا هلا بـ <@${dummyUserId}> في مجتمع المعرقين! 🛡️✨\n\n` +
      `ندري إن الخطوة الأولى والمشاركة في مجتمعات جديدة ممكن تكون صعبة أو تسبب شوية توتر، وعشان كذا نبيك ترتاح.. هنا ما فيه أي ضغط عليك!\n` +
      `تقدر تقعد في المدرج وتتفرج، أو تشارك متى ما حسيت إنك جاهز. مكانك محفوظ ومرحب بك دائماً كجزء من الجيش.\n\n` +
      `إذا احتجت أي شي أو حبيت تسولف على خفيف، الكل هنا إخوانك وفي خدمتك. نوّرتنا! 🤍`;

    await channel.send({ content: welcomeText, files: [attachment] });
    
    // Short message to general/test room
    await channel.send(`يا هلا ومرحباً بك يا <@${dummyUserId}> في جيش المعرقين! نورتنا يا وحش، خذ راحتك والميدان ميدانك! ⚔️🔥`);
    
    console.log("✅ Test message sent successfully to channel.");
  } catch (err) {
    console.error("Error sending test:", err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
