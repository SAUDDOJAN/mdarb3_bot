import { EmbedBuilder, AuditLogEvent, Events } from "discord.js";

const TARGET_GUILD_ID = "861355983975874601";
const TARGET_ROLE_ID = "1509497629564866680";
const LOG_CHANNEL_ID = "1290468734045261885";

// خريطة لترجمة الأرقام إلى نصوص واضحة
const actionNames = {
  [AuditLogEvent.GuildUpdate]: "تحديث إعدادات السيرفر",
  [AuditLogEvent.ChannelCreate]: "إنشاء روم",
  [AuditLogEvent.ChannelUpdate]: "تحديث روم",
  [AuditLogEvent.ChannelDelete]: "حذف روم",
  [AuditLogEvent.RoleCreate]: "إنشاء رتبة",
  [AuditLogEvent.RoleUpdate]: "تحديث رتبة",
  [AuditLogEvent.RoleDelete]: "حذف رتبة",
  [AuditLogEvent.MemberKick]: "طرد عضو (Kick)",
  [AuditLogEvent.MemberPrune]: "تنظيف الأعضاء (Prune)",
  [AuditLogEvent.MemberBanAdd]: "حظر عضو (Ban)",
  [AuditLogEvent.MemberBanRemove]: "فك حظر عضو (Unban)",
  [AuditLogEvent.MemberUpdate]: "تحديث حالة عضو",
  [AuditLogEvent.MemberRoleUpdate]: "تحديث رتب عضو",
  [AuditLogEvent.MemberMove]: "تحريك عضو (صوتي)",
  [AuditLogEvent.MemberDisconnect]: "فصل عضو من الصوتي",
  [AuditLogEvent.BotAdd]: "إضافة بوت",
  [AuditLogEvent.MessageDelete]: "حذف رسالة",
  [AuditLogEvent.MessageBulkDelete]: "حذف رسائل جماعي",
  [AuditLogEvent.MessagePin]: "تثبيت رسالة",
  [AuditLogEvent.MessageUnpin]: "إلغاء تثبيت رسالة",
  [AuditLogEvent.EmojiCreate]: "إنشاء إيموجي",
  [AuditLogEvent.EmojiUpdate]: "تحديث إيموجي",
  [AuditLogEvent.EmojiDelete]: "حذف إيموجي",
};

export default {
  name: Events.GuildAuditLogEntryCreate,
  once: false,
  async execute(auditLogEntry, guild, client) {
    if (guild.id !== TARGET_GUILD_ID) return;

    const { executorId, executor, targetId, action, changes, reason } = auditLogEntry;

    // استثناء عمليات البوت نفسه أو النظام
    if (!executor || executor.bot || executor.system) return;

    try {
      // التحقق من امتلاك المشرف للرتبة المطلوبة
      const member = await guild.members.fetch(executorId).catch(() => null);
      if (!member || !member.roles.cache.has(TARGET_ROLE_ID)) return;

      let actionLabel = actionNames[action] || `إجراء غير مسجل (${action})`;
      let details = "";

      // معالجة بعض التغييرات الخاصة لتوضيحها أكثر (مثل الميوت والتايم أوت)
      if (action === AuditLogEvent.MemberUpdate && changes) {
        const timeoutChange = changes.find(c => c.key === "communication_disabled_until");
        const muteChange = changes.find(c => c.key === "mute");
        const deafChange = changes.find(c => c.key === "deaf");

        if (timeoutChange) {
          actionLabel = timeoutChange.new ? "إعطاء تايم أوت (Timeout)" : "إزالة التايم أوت";
          details += timeoutChange.new ? `**المدة:** حتى <t:${Math.floor(new Date(timeoutChange.new).getTime() / 1000)}:R>\n` : "";
        } else if (muteChange) {
          actionLabel = muteChange.new ? "كتم سيرفر (Server Mute)" : "فك كتم السيرفر";
        } else if (deafChange) {
          actionLabel = deafChange.new ? "إعماء سيرفر (Server Deafen)" : "فك إعماء السيرفر";
        }
      } else if (action === AuditLogEvent.MemberMove && changes) {
         const channelChange = changes.find(c => c.key === "channel_id");
         if (channelChange && channelChange.new) {
            details += `**إلى روم:** <#${channelChange.new}>\n`;
         }
      }

      // إضافة التارجت (الضحية أو الشيء اللي تم التعديل عليه)
      if (targetId) {
        if (action === AuditLogEvent.MessageDelete) {
          details += `**صاحب الرسالة:** <@${targetId}>\n`;
        } else if (
          action === AuditLogEvent.MemberKick ||
          action === AuditLogEvent.MemberBanAdd ||
          action === AuditLogEvent.MemberBanRemove ||
          action === AuditLogEvent.MemberUpdate ||
          action === AuditLogEvent.MemberRoleUpdate ||
          action === AuditLogEvent.MemberMove ||
          action === AuditLogEvent.MemberDisconnect
        ) {
          details += `**اللاعب المستهدف:** <@${targetId}>\n`;
        } else if (action === AuditLogEvent.ChannelCreate || action === AuditLogEvent.ChannelUpdate || action === AuditLogEvent.ChannelDelete) {
           details += `**الروم المستهدف:** <#${targetId}>\n`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#00d0ff")
        .setAuthor({ name: "تتبع نشاط المشرفين", iconURL: executor.displayAvatarURL() })
        .setTitle(actionLabel)
        .setDescription(`**المشرف:** <@${executorId}>\n${details}`)
        .addFields({ name: "السبب المذكور", value: reason || "لا يوجد سبب (أو لم يكتبه المشرف)." })
        .setTimestamp()
        .setFooter({ text: "نظام المراقبة الأمنية 👁️" });

      const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID) || await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (logChannel) {
        await logChannel.send({ embeds: [embed] });
      }

    } catch (err) {
      console.error("[ModTracker] Error processing audit log entry:", err);
    }
  }
};
