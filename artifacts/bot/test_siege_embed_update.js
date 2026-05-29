import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.once("ready", async () => {
  console.log("Client connected. Preparing design preview...");
  try {
    const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";
    const AION2_GUILD_ROLE_ID = "1401376073077231702"; // ⚔️ ┃ Aion 2 Guild
    const LOBBY_CHANNEL_ID = "1496783538937135184";

    const mainGuild = client.guilds.cache.get(MAIN_GUILD_ID) ?? await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);
    if (!mainGuild) {
      console.error("M3RGEEN guild not found.");
      process.exit(1);
    }

    const channel = mainGuild.channels.cache.get(LOBBY_CHANNEL_ID) ?? await mainGuild.channels.fetch(LOBBY_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error("Lobby channel not found.");
      process.exit(1);
    }

    // Fetch members with the Aion 2 Guild role
    await mainGuild.members.fetch();
    const aionMembers = mainGuild.roles.cache.get(AION2_GUILD_ROLE_ID)?.members;
    if (!aionMembers || aionMembers.size === 0) {
      console.error("No members found with AION 2 Guild role.");
      process.exit(1);
    }

    const memberArray = Array.from(aionMembers.values());
    console.log(`Found ${memberArray.length} members.`);

    // Mocking 3 present, 2 withdrawn, rest absent
    const presentMembers = memberArray.slice(0, Math.min(3, memberArray.length));
    const withdrawnMembers = memberArray.slice(presentMembers.length, Math.min(presentMembers.length + 2, memberArray.length));
    const absentMembers = memberArray.slice(presentMembers.length + withdrawnMembers.length);

    const memberStats = [];

    for (const m of presentMembers) {
      memberStats.push({ id: m.id, displayName: m.displayName, points: 50, status: "present" });
    }
    for (const m of withdrawnMembers) {
      memberStats.push({ id: m.id, displayName: m.displayName, points: 20, status: "withdrawn" });
    }
    for (const m of absentMembers) {
      memberStats.push({ id: m.id, displayName: m.displayName, points: 0, status: "absent" });
    }

    // Sort: present first, then withdrawn, then absent
    memberStats.sort((a, b) => {
      const order = { present: 0, withdrawn: 1, absent: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.points - a.points;
    });

    const totalPoints = memberStats.reduce((sum, m) => sum + m.points, 0);
    const presentCount = memberStats.filter(m => m.status === "present").length;
    const withdrawnCount = memberStats.filter(m => m.status === "withdrawn").length;
    const absentCount = memberStats.filter(m => m.status === "absent").length;

    // Build stats text
    let statsText = "";
    for (const m of memberStats) {
      const icon = m.status === "present" ? "✅" : m.status === "withdrawn" ? "⚠️" : "❌";
      statsText += `${icon} <@${m.id}> \`${m.points}pt\`\n`;
    }

    // 1. Build the base Siege Embed (new design)
    const baseDescription = "السيج هو الركيزة الأساسية لسيادتنا وسيطرتنا على بوابات الأبيس (Abyss Gates). مشاركتك ليست مجرد خيار، بل هي واجب وطني لتعزيز قوة تحالفنا في السيرفر. الامتناع أو التكاسل يضعف شوكتنا أمام الخصوم!\n\n" +
      "📍 **مكان الفعالية:**\n" +
      "سيرفر تحالف المعرقين (M3RGEEN Alliance Server) - القنوات الصوتية المخصصة للسيج.\n\n" +
      "📜 **شروط المشاركة:**\n" +
      "1️⃣ التواجد والانضمام للقنوات الصوتية في سيرفر التحالف خلال وقت السيج.\n" +
      "2️⃣ الالتزام الكامل بتعليمات القادة والتعاون مع بقية الفورسز.\n\n" +
      `🌐 **الموقع:** التواجد في سيرفر التحالف (Alliance Server)\n` +
      `⏱️ **المدة المطلوبة:** ابقَ **50 دقيقة** في القناة الصوتية للحصول على النقاط.\n` +
      `⚡ **النظام تلقائي:** يتم رصد الحضور واحتساب النقاط آلياً بالكامل فور انتهاء الفعالية.\n` +
      `⚠️ **تنبيه:** المغادرة قبل انتهاء الوقت المحدد تُسجَّل كـ **Withdrawal** وتلغي نقاطك.`;

    const embed = new EmbedBuilder()
      .setColor(0xc0392b)
      .setTitle("⚔️ حصار التحالف (Alliance Siege)")
      .setDescription(baseDescription)
      .addFields(
        {
          name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          value: "​",
          inline: false,
        },
        {
          name: `📊 إحصائية سيج اليوم — أعضاء Aion 2 Guild`,
          value:
            `✅ حضور: **${presentCount}** | ⚠️ انسحاب مبكر: **${withdrawnCount}** | ❌ غياب: **${absentCount}**\n` +
            `🏅 إجمالي نقاط القيلد: **${totalPoints}pt**`,
          inline: false,
        },
        {
          name: "👥 تفاصيل الأعضاء:",
          value: statsText || "لا يوجد بيانات.",
          inline: false,
        }
      )
      .setFooter({ text: "M3RGEEN Events System • معاينة تجريبية" })
      .setTimestamp();

    await channel.send({
      content: "🧪 **[معاينة تجريبية لشكل إحصائيات السيج التلقائية للأعضاء]**",
      embeds: [embed]
    });

    console.log("✅ Preview embed sent successfully!");

  } catch (error) {
    console.error("Failed to run preview:", error);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
