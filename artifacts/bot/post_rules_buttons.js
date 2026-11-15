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
        "• ⛔ **منع التحرش والتسلط نهائياً:** يُمنع منعاً باتاً التحرش، التسلط، أو مضايقة أي لاعبة في التحالف، والتعدي بالألفاظ أو الإساءة لأي لاعب. سيتم تطبيق **الحظر النهائي فوراً ومباشرة دون سابق إنذار.**\n" +
        "• ⏰ **طبيعة السيرفر ومواعيد التواجد (حصر النشاط على الحصارات):** خادم التحالف مخصص حصرياً لتجمعات ونداءات الحصارات والمعارك المعتمدة (Siege Only)، منعاً للمشاكل والخلافات الجانبية وحفاظاً على الجو العام واستقلالية كل قيلد. يُفتح الدخول للقنوات الصوتية قبل موعد السيج بـ 3 ساعات (أو فور صدور الإعلان المعتمد)، ويتم إغلاق الرومات وفصل كافة الأعضاء تلقائياً بعد مرور 3 ساعات من بدء السيج (مع تنبيه مسبق قبل الفصل بـ 10 دقائق). التواجد خارج هذه الفترات محصور بقيادة التحالف والمستشارين للتخطيط.\n" +
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
