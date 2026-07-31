import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

async function sendTest() {
  const embed = new EmbedBuilder()
    .setTitle("🐋 الحوت (Gigantrite) - رسالة تجريبية")
    .setDescription("**الحوت سيظهر قريباً! (هذه رسالة اختبارية للنظام الجديد)**\n\n🕒 **الوقت المتبقي:** رسالة تجريبية")
    .setColor(0xf1c40f)
    .setTimestamp();

  const subscribeButton = new ButtonBuilder()
    .setCustomId(`alerts:subscribe:tl_whale`)
    .setLabel(`🔔 تفعيل/إلغاء التنبيه`)
    .setStyle(ButtonStyle.Secondary);
  
  const actionRow = new ActionRowBuilder().addComponents(subscribeButton);

  try {
    await rest.post(
      Routes.channelMessages("1526297989734334554"),
      {
        body: {
          content: " ",
          embeds: [embed.toJSON()],
          components: [actionRow.toJSON()]
        }
      }
    );
    console.log("Test alert sent successfully!");
  } catch(e) {
    console.error("Error sending test:", e);
  }
}
sendTest();
