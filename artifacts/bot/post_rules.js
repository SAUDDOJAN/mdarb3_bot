import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    const channelId = "1507701269035225188"; // Rules channel from previous context
    const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId);

    const embedEng = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("📜 Sage Alliance Protocol")
      .setDescription(
        "• Mutual respect is mandatory at all times.\n" +
        "• No public drama or conflicts in any channel.\n" +
        "• 🚨 Zero Tolerance: Any toxicity = Immediate kick.\n" +
        "• All disputes must be resolved via DM with staff.\n" +
        "• Character verification is mandatory."
      );

    const embedAr = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("📜 بروتوكول تحالف السيج")
      .setDescription(
        "١. الاحترام المتبادل واجب في جميع الأوقات.\n" +
        "٢. ممنوع إثارة المشاكل أو النزاعات العلنية.\n" +
        "٣. 🚨 سياسة التسامح الصفري: أي تصرف سام = طرد فوري.\n" +
        "٤. تُحل كافة الخلافات عبر الرسائل الخاصة مع الإدارة فقط.\n" +
        "٥. التحقق من الشخصية إجباري."
      )
      .setFooter({ text: "Sage Alliance • Authorized Protocol" });

    await channel.send({ embeds: [embedEng] });
    await channel.send({ embeds: [embedAr] });

    console.log("✅ Rules successfully posted.");
  } catch (err) {
    console.error("Error posting rules:", err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
