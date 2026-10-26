import * as leveling from "../modules/leveling.js";

// روم التايم اوت التلقائي (أسبوع كامل)
const AUTO_TIMEOUT_CHANNEL_ID = "1564210919053983834";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (604,800,000 ms)

export default {
  name: "messageCreate",
  once: false,
  async execute(message, client) {
    if (message.author.bot || !message.guild || message.webhookId) return;

    // ─── تايم اوت أسبوع تلقائياً لأي شخص يرسل في الروم 1564210919053983834 ───
    if (message.channel.id === AUTO_TIMEOUT_CHANNEL_ID) {
      try {
        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member && member.moderatable) {
          await member.timeout(ONE_WEEK_MS, "مخالفة: إرسال رسالة في الروم المحظور (تايم اوت تلقائي لمدة أسبوع)");
          console.log(`[AutoTimeout] تم إعطاء تايم اوت لمدة أسبوع للعضو ${member.user?.tag || member.id} (${member.id}) بسبب الإرسال في الروم ${message.channel.id}`);
        } else if (member && !member.moderatable) {
          console.warn(`[AutoTimeout] تعذر تطبيق التايم اوت على ${member.user?.tag || member.id} (رتبة العضو أعلى من رتبة البوت أو مالك السيرفر).`);
        }

        // حذف الرسالة للحفاظ على نظافة الروم
        await message.delete().catch((delErr) => {
          console.warn(`[AutoTimeout] تعذر حذف رسالة المخالفة:`, delErr?.message);
        });
      } catch (err) {
        console.error(`[AutoTimeout] خطأ أثناء تطبيق التايم اوت في الروم ${message.channel.id}:`, err);
      }
      return; // عدم احتساب نقاط XP لمن يرسل في هذا الروم
    }

    await leveling.handleXp(message);
  },
};
