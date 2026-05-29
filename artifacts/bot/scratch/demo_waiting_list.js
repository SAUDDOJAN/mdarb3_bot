import "dotenv/config";
import client from "../src/client.js";
import { query, initDb } from "../src/database/index.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// Mocking some functions from events.js to avoid full module dependency for a simple demo
const CLASS_EMOJIS = {
  Gladiator: "⚔️", Templar: "🛡️",
  Sorcerer: "🔮", Spiritmaster: "🌀", Ranger: "🏹", Assassin: "🗡️",
  Chanter: "🎵", Cleric: "✨",
};

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

    const leaderId = "136371223209836544"; // The USER
    const leaderTag = "M3RGEEN_Leader";

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`⚔️ Group — ${leaderTag}`)
      .setDescription("هذا مثال توضيحي لكيفية ظهور **قائمة الانتظار**:")
      .addFields(
        {
          name: "🛡️ Frontline  |  Gladiator · Templar",
          value: `✅ **${leaderTag}** — 🛡️ Templar`,
          inline: false,
        },
        {
          name: "⚔️ DPS  |  Sorcerer · Spiritmaster · Ranger · Assassin",
          value: `⏳ **Member_A** — 🏹 Ranger  *(بانتظار الموافقة)*\n▪️ **فارغ**`,
          inline: false,
        },
        {
          name: "💚 Support  |  Chanter · Cleric",
          value: "▪️ **فارغ**",
          inline: false,
        },
        {
          name: "\u200b",
          value:
            "⏱️ ابقَ **30 دقيقة** في الغرفة الصوتية للحصول على **+10 نقاط**\n" +
            "⚠️ المغادرة المبكرة تُسجَّل كـ **Withdrawal**",
          inline: false,
        }
      )
      .setFooter({ text: "مثال توضيحي لنظام الانتظار • M3RGEEN" })
      .setTimestamp();

    const joinBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`demo:join`)
        .setLabel("انضمام للمجموعة")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      content: "📢 **توضيح لنظام الانتظار (Demo):**",
      embeds: [embed],
      components: [joinBtn]
    });

    console.log("Demo message sent to Discord.");
    process.exit(0);
  });
}

runDemo();
