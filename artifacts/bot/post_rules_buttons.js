import "dotenv/config";
import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    const channelId = "1507701269035225188"; 
    const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId);

    const messages = await channel.messages.fetch({ limit: 10 });
    for (const [id, msg] of messages) {
      if (msg.author.id === client.user.id) {
        await msg.delete().catch(() => {});
      }
    }

    const embedAr = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("📜 ميثاق وبروتوكول تحالف الحصارات | Siege Alliance")
      .setDescription(
        "• **الاحترام المتبادل إلزامي بين جميع الأعضاء في كافة الأوقات.**\n" +
        "• **يُمنع منعاً باتاً أي جدال، دراما، أو نزاعات علنية في أي قناة بالخادم.**\n" +
        "• 🚨 **سياسة الحزم التام (Zero Tolerance):** أي تجاوز أو إساءة أو تخريب = **طرد وحظر فوري دائم دون سابق إنذار.**\n" +
        "• **جميع الخلافات والشكاوى تُحل حصرياً وبشكل خاص عبر الرسائل الخاصة (DM) مع إدارة التحالف فقط.**\n" +
        "• **توثيق وربط الشخصية عبر موقع Shugo.gg إلزامي لكافة الأعضاء.**"
      )
      .setFooter({ text: "تحالف الحصارات • البروتوكول المعتمد" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sage_gate_agree")
        .setLabel("✅ أوافق على الشروط")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("sage_gate_reject")
        .setLabel("❌ أرفض الشروط")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embedAr], components: [row] });
    console.log("✅ Gatekeeper Arabic message sent successfully.");

  } catch (err) {
    console.error("Error adding buttons:", err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
