import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    const channel = client.channels.cache.get("1507703833223233567") || await client.channels.fetch("1507703833223233567");
    
    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle("⚔️ M3RGEEN")
      .setAuthor({ name: "Sage Alliance Test" })
      .addFields(
        {
          name: "🏰 سيرفر الديسكورد",
          value: "Allfight Server", // Simulated source discord server
        },
        {
          name: "👥 عدد أعضاء القيلد",
          value: "**42** عضو",
        },
        {
          name: "✅ أعضاء مضافين اليوم",
          value: "**3** عضو جديد اليوم",
        }
      )
      .setDescription(
        `👑 **قائد القيلد:** TestLeader\n` +
        `🎮 **الكلاس:** Sorcerer\n` +
        `🌍 **سيرفر Aion 2:** Bakarma\n` +
        `⚡ **CP:** 250,000\n` +
        `[🔗 عرض البروفايل](https://shugo.gg)`
      )
      .setThumbnail("https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_SO_SKILL_006.png")
      .setFooter({ text: `Sage Alliance (Test) • آخر تحديث: اليوم` })
      .setTimestamp();

    await channel.send({ content: "**[معاينة تجريبية لشكل البطاقة الجديد]**", embeds: [embed] });
    console.log("✅ Test card sent successfully.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
