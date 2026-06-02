import "dotenv/config";
import client from "../src/client.js";
import { query, initDb } from "../src/database/index.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

async function runDemo() {
  await initDb();
  await client.login(process.env.DISCORD_BOT_TOKEN);

  client.once("ready", async () => {
    console.log("Bot is ready for demo");

    const guildId = "861355983975874601";
    const channelId = "1496783538937135184";
    const channel = await client.channels.fetch(channelId);

    if (!channel) {
      console.error("Could not find channel");
      process.exit(1);
    }

    const leaderId = "136371223209836544";

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🏹 مجموعة نشطة")
      .addFields(
        {
          name: "الأعضاء 👥",
          value: 
            `1️⃣ 👑 <@${leaderId}> 🛡️ **تم ✅**\n` +
            `2️⃣ <@123456789> 🏹 **انتظار ⏳**\n` +
            `3️⃣ ▪️ **فارغ** (DPS)\n` +
            `4️⃣ ▪️ **فارغ** (Healers)`,
          inline: false,
        },
        {
          name: "قناة الصوت 🔊",
          value: "▫️ سيتم إنشاؤها عند اكتمال المجموعة",
          inline: false,
        },
        {
          name: "شروط الحصول على النقاط 💎",
          value:
            "ابقَ في قناة الصوت لمدة **30 دقيقة** متواصلة للحصول على **+10 نقاط**.\n" +
            "المجموعة ستنتهي تلقائياً بعد **60 دقيقة**.",
          inline: false,
        }
      )
      .setFooter({ text: "معرّف المجموعة: FINAL-DEMO" })
      .setTimestamp();

    const joinBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`demo:final`)
        .setLabel("انضمام")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({
      content: "🏁 **اللمسات النهائية لتنسيق المجموعات:**",
      embeds: [embed],
      components: [joinBtn]
    });

    console.log("Final demo message sent to Discord.");
    process.exit(0);
  });
}

runDemo();
