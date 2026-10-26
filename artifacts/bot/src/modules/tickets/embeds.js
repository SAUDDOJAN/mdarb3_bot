/**
 * M3RGEEN Ticket System — Embeds & Interface Components
 * 
 * Manages the persistent main panel, the living ticket embed,
 * action rows, and logging embeds.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { TICKET_TYPES, TICKET_STATUS } from "./config.js";

/**
 * Build the main persistent panel embed for the TICKET channel.
 */
export function buildTicketPanelComponents() {
  const embed = new EmbedBuilder()
    .setColor(0x00a8ff)
    .setTitle("مركز تذاكر ودعم تحالف M3RGEEN 🎫")
    .setDescription(
      "أهلاً بك في مركز الدعم والتذاكر الخاص بتحالف **M3RGEEN**.\n\n" +
      "يرجى اختيار القسم المناسب لطلبك من القائمة أدناه، ليتم إنشاء روم خاص بك والتواصل مع الفريق المخوّل:\n\n" +
      "⚔️ **مشاكل الانضمام والنقل بين الجيلدات:** تواصل مباشر مع قادة الجيلدات والمشرفين.\n" +
      "🛠️ **مشاكل برنامج المعرقين:** للأعطال والمشاكل التقنية في تطبيق M3RGEEN.\n" +
      "⚖️ **الشكاوى الإدارية والاقتراحات والاستفسارات:** لتحسين وتنظيم السيرفر والمجتمع.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "🔒 **للبلاغات السرية عن التحرش أو الإساءة:** اضغط الزر الأحمر أدناه (يصل إلى **قائد السيرفر فقط** وبسرية تامة ومشفّرة)."
    )
    .setFooter({ text: "تحالف M3RGEEN | نظام التذاكر الموحد" })
    .setTimestamp();

  // Regular tickets dropdown menu (filter out confidential and hidden types)
  const regularOptions = Object.values(TICKET_TYPES)
    .filter(t => !t.isConfidential && !t.hidden)
    .map(t =>
      new StringSelectMenuOptionBuilder()
        .setLabel(t.title)
        .setValue(`ticket_select:${t.id}`)
        .setDescription(t.description.substring(0, 100))
        .setEmoji(t.emoji)
    );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_open_menu")
      .setPlaceholder("📂 اختر نوع التذكرة العادية التي تريد فتحها...")
      .addOptions(regularOptions)
  );

  // Button row: Confidential Report (prominent & separated)
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open_btn:confidential_report")
      .setLabel("🔒 فتح بلاغ سري عن تحرش أو إساءة")
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [selectRow, buttonRow] };
}

/**
 * Format timestamp in Asia/Riyadh (UTC+3)
 */
function formatKSA(dateInput) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  const riyadhMs = date.getTime() + 3 * 3600 * 1000;
  const d = new Date(riyadhMs);
  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, "0");
  const D = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m} (KSA)`;
}

/**
 * Build the living embed for a ticket channel.
 */
export function buildLivingEmbed(ticket, auditLogs = []) {
  const typeConfig = Object.values(TICKET_TYPES).find(t => t.id === ticket.type) || {
    title: ticket.type,
    emoji: "🎫",
    isConfidential: ticket.is_confidential,
  };

  const statusConfig = TICKET_STATUS[ticket.status] || TICKET_STATUS.OPEN;
  const isClosed = ticket.status === "CLOSED";

  const embed = new EmbedBuilder()
    .setColor(ticket.is_confidential ? 0xe74c3c : statusConfig.color)
    .setTitle(`${typeConfig.emoji} تذكرة رقم #${String(ticket.ticket_number).padStart(4, "0")} — ${typeConfig.title}`)
    .setDescription(
      ticket.is_confidential
        ? "⚠️ **تنبيه:** هذا بلاغ سري وحساس. هذه القناة مرئية فقط لك ولمالك السيرفر ولن يطلع عليها أي مشرف أو قائد جيلد."
        : `أهلاً بك <@${ticket.owner_id}>! يرجى طرح أي معلومات إضافية هنا، وسيقوم الفريق المختص بمتابعة طلبك.`
    )
    .addFields(
      {
        name: "📌 الحالة الحالية",
        value: `${statusConfig.badge} **${statusConfig.label}**`,
        inline: true,
      },
      {
        name: "👤 صاحب التذكرة",
        value: `<@${ticket.owner_id}>`,
        inline: true,
      },
      {
        name: "🕒 تاريخ الإنشاء",
        value: formatKSA(ticket.created_at),
        inline: true,
      }
    );

  // Staff Assignment Section
  const assignedText = ticket.claimed_by ? `<@${ticket.claimed_by}>` : "*لم يتم الاستلام بعد*";
  const collaboratorsList = Array.isArray(ticket.collaborators) && ticket.collaborators.length > 0
    ? ticket.collaborators.map(id => `<@${id}>`).join(", ")
    : "*لا يوجد*";

  embed.addFields(
    {
      name: "🛡️ المشرف المسؤول",
      value: assignedText,
      inline: true,
    },
    {
      name: "👥 المشرفون المشاركون",
      value: collaboratorsList,
      inline: true,
    }
  );

  // Submitted Data Fields (Modal Data)
  if (ticket.modal_data && typeof ticket.modal_data === "object") {
    const entries = Object.entries(ticket.modal_data);
    if (entries.length > 0) {
      const dataLines = entries.map(([key, val]) => {
        const cleanKey = formatFieldLabel(key);
        return `**${cleanKey}:** ${val}`;
      }).join("\n");

      embed.addFields({
        name: "📋 تفاصيل الطلب المقدمة",
        value: dataLines.substring(0, 1024) || "—",
        inline: false,
      });
    }
  }

  // Close Info (if closed)
  if (isClosed) {
    embed.addFields(
      {
        name: "🔴 تفاصيل الإغلاق",
        value: `**أغلقت بواسطة:** ${ticket.closed_by ? `<@${ticket.closed_by}>` : "—"}\n**السبب:** ${ticket.close_reason || "تم الحل"}\n**تاريخ الإغلاق:** ${formatKSA(ticket.closed_at)}`,
        inline: false,
      }
    );
  }

  // Action Audit Trail in Embed
  if (Array.isArray(auditLogs) && auditLogs.length > 0) {
    const logLines = auditLogs.slice(0, 4).map(l => {
      const time = formatKSA(l.created_at).split(" ")[1]; // just HH:mm
      const actionName = formatActionName(l.action);
      return `• \`[${time}]\` ${actionName} (<@${l.actor_id}>)`;
    }).join("\n");

    embed.addFields({
      name: "📜 آخر التحديثات",
      value: logLines || "—",
      inline: false,
    });
  }

  embed.setFooter({
    text: `M3RGEEN Ticket System • المعرّف الداخلي: ${ticket.id}`,
  }).setTimestamp();

  return embed;
}

/**
 * Friendly label translation for modal keys
 */
function formatFieldLabel(key) {
  const map = {
    char_name: "اسم الشخصية",
    char_class_lvl: "الكلاس والمستوى",
    target_guild: "الجيلد المطلوب",
    current_guild: "الجيلد الحالي",
    notes: "ملاحظات وتواجد",
    reason: "السبب",
    service: "الخدمة أو التطبيق",
    issue_description: "شرح المشكلة",
    error_details: "نص الخطأ أو الصورة",
    char_info: "الشخصية والكلاس",
    help_topic: "مجال المساعدة",
    details: "التفاصيل",
    subject: "الموضوع",
    parties: "الأطراف المعنية",
    suggestion_title: "عنوان الاقتراح",
    idea: "فكرة الاقتراح",
    benefit: "الفائدة",
    topic: "الموضوع",
    question: "السؤال",
    report_category: "نوع البلاغ",
    reported_party: "المشتكى عليه",
    incident_details: "تفاصيل الواقعة",
    evidence_links: "روابط الأدلة",
  };
  return map[key] || key;
}

/**
 * Friendly translation for action logs
 */
function formatActionName(action) {
  const map = {
    OPENED: "فتح التذكرة",
    CLAIMED: "استلام التذكرة",
    TRANSFERRED: "إحالة التذكرة لمشرف آخر",
    COLLABORATOR_ADDED: "إضافة مسؤول مشارك",
    INFO_REQUESTED: "طلب معلومات إضافية من العضو",
    STATUS_CHANGED: "تحديث حالة التذكرة",
    CLOSED: "إغلاق التذكرة",
  };
  return map[action] || action;
}

/**
 * Build control action rows for the ticket channel.
 */
export function buildTicketActionRows(ticket) {
  const isClosed = ticket.status === "CLOSED";
  const isClaimed = Boolean(ticket.claimed_by);
  const collaboratorCount = Array.isArray(ticket.collaborators) ? ticket.collaborators.length : 0;
  const isMaxCollaborators = collaboratorCount >= 3;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_ctrl:claim")
      .setLabel(isClaimed ? "تم الاستلام" : "استلام التذكرة")
      .setEmoji("✋")
      .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(isClaimed || isClosed),

    new ButtonBuilder()
      .setCustomId("ticket_ctrl:transfer")
      .setLabel("إحالة لمشرف آخر")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isClosed),

    new ButtonBuilder()
      .setCustomId("ticket_ctrl:add_staff")
      .setLabel(isMaxCollaborators ? "المشاركون (مكتمل 3/3)" : "إضافة مسؤول مشارك")
      .setEmoji(isMaxCollaborators ? "👥" : "➕")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isClosed || isMaxCollaborators),

    new ButtonBuilder()
      .setCustomId("ticket_ctrl:request_info")
      .setLabel("طلب معلومات")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isClosed),

    new ButtonBuilder()
      .setCustomId("ticket_ctrl:close")
      .setLabel("إغلاق التذكرة")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isClosed)
  );

  return [row1];
}

/**
 * Build embed for REPORTS channel (1560176348524453988).
 * Sent strictly for confidential reports.
 */
export function buildReportsChannelEmbed(ticket, channelUrl) {
  const modalData = ticket.modal_data || {};
  const embed = new EmbedBuilder()
    .setColor(0xd63031)
    .setTitle(`🔒 بلاغ سري جديد: تذكرة #${String(ticket.ticket_number).padStart(4, "0")}`)
    .setDescription(
      `تم استلام بلاغ إداري سري وحساس جديد موجه إلى مالك السيرفر حصراً.\n\n` +
      `🔗 **رابط قناة البلاغ:** [اضغط هنا للانتقال للبلاغ](${channelUrl})`
    )
    .addFields(
      {
        name: "👤 صاحب البلاغ",
        value: `<@${ticket.owner_id}> (\`${ticket.owner_id}\`)`,
        inline: true,
      },
      {
        name: "🎯 المشتكى عليه",
        value: modalData.reported_party ? String(modalData.reported_party) : "*غير محدد*",
        inline: true,
      },
      {
        name: "🏷️ نوع المخالفة",
        value: modalData.report_category ? String(modalData.report_category) : "*غير محدد*",
        inline: true,
      },
      {
        name: "📝 شرح الواقعة",
        value: modalData.incident_details ? String(modalData.incident_details).substring(0, 1024) : "—",
        inline: false,
      },
      {
        name: "📎 روابط الأدلة",
        value: modalData.evidence_links ? String(modalData.evidence_links).substring(0, 500) : "*لم تُرفق روابط*",
        inline: false,
      }
    )
    .setFooter({ text: "سجل البلاغات السرية • M3RGEEN Administration" })
    .setTimestamp();

  return embed;
}

/**
 * Build embed for regular LOGS channel (1560176269117751336).
 * STRICTLY for non-confidential tickets.
 */
export function buildRegularLogsEmbed({ ticket, action, actorId, details = {} }) {
  if (ticket.is_confidential) {
    // Zero-leakage fail-safe
    return null;
  }

  const typeConfig = Object.values(TICKET_TYPES).find(t => t.id === ticket.type) || {
    title: ticket.type,
    emoji: "🎫",
  };

  const actionText = formatActionName(action);

  const embed = new EmbedBuilder()
    .setColor(action === "CLOSED" ? 0x95a5a6 : action === "OPENED" ? 0x2ecc71 : 0x3498db)
    .setTitle(`📋 سجل التذاكر العادية | ${actionText}`)
    .setDescription(
      `**رقم التذكرة:** #${String(ticket.ticket_number).padStart(4, "0")}\n` +
      `**النوع:** ${typeConfig.emoji} ${typeConfig.title}\n` +
      `**القناة:** <#${ticket.channel_id}>\n` +
      `**صاحب التذكرة:** <@${ticket.owner_id}>\n` +
      `**المنفّذ:** <@${actorId}>`
    )
    .setTimestamp();

  if (details.reason) {
    embed.addFields({ name: "سبب الإغلاق", value: String(details.reason), inline: false });
  }
  if (details.to) {
    embed.addFields({ name: "المحال إليه", value: `<@${details.to}>`, inline: true });
  }

  return embed;
}
