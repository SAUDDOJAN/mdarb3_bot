/**
 * M3RGEEN Ticket System — Dynamic Modal Builders
 * 
 * Provides tailored modals for all 8 ticket types,
 * ensuring no unnecessary information is asked.
 */

import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { GUILD_NAMES, TICKET_TYPES } from "./config.js";

/**
 * Build dynamic modal based on selected ticket type.
 */
export function buildTicketModal(ticketTypeId, options = {}) {
  const typeConfig = TICKET_TYPES[ticketTypeId.toUpperCase()] || 
                     Object.values(TICKET_TYPES).find(t => t.id === ticketTypeId);

  if (!typeConfig) {
    throw new Error(`Invalid ticket type: ${ticketTypeId}`);
  }

  let modalCustomId = `ticket_submit:${typeConfig.id}`;
  let modalTitle = typeConfig.title.substring(0, 45);

  if (typeConfig.id === "guild_join" && options.targetGuild) {
    modalCustomId = `ticket_submit:guild_join:${options.targetGuild}`;
    modalTitle = `مشكلة انضمام — ${options.targetGuild}`.substring(0, 45);
  } else if (typeConfig.id === "guild_transfer" && options.currentGuild && options.targetGuild) {
    modalCustomId = `ticket_submit:guild_transfer:${options.currentGuild}:${options.targetGuild}`;
    modalTitle = `نقل: ${options.currentGuild} ➔ ${options.targetGuild}`.substring(0, 45);
  }

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(modalTitle);

  switch (typeConfig.id) {
    case "guild_join": {
      const charName = new TextInputBuilder()
        .setCustomId("char_name")
        .setLabel("اسم الشخصية في اللعبة")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("مثال: MDARB3")
        .setRequired(true)
        .setMaxLength(50);

      const issue = new TextInputBuilder()
        .setCustomId("issue_description")
        .setLabel("شرح المشكلة في نظام طلبات الانضمام")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("شرح العطل أو المشكلة التي واجهتك أثناء التقديم أو الرد...")
        .setRequired(true)
        .setMaxLength(1000);

      const notes = new TextInputBuilder()
        .setCustomId("notes")
        .setLabel("ملاحظات إضافية")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("أي معلومات إضافية تود إضافتها...")
        .setRequired(false)
        .setMaxLength(500);

      const components = [
        new ActionRowBuilder().addComponents(charName),
        new ActionRowBuilder().addComponents(issue),
        new ActionRowBuilder().addComponents(notes),
      ];

      // If not pre-selected from dropdown, show guild input as fallback
      if (!options.targetGuild) {
        const guildChoice = new TextInputBuilder()
          .setCustomId("target_guild")
          .setLabel("الجيلد المعني بطلب الانضمام")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(GUILD_NAMES.join(" / "))
          .setRequired(true)
          .setMaxLength(32);
        components.splice(1, 0, new ActionRowBuilder().addComponents(guildChoice));
      }

      modal.addComponents(...components);
      break;
    }

    case "guild_transfer": {
      const charName = new TextInputBuilder()
        .setCustomId("char_name")
        .setLabel("اسم الشخصية")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("اسم شخصيتك في AION 2")
        .setRequired(true);

      const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("سبب طلب النقل")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("تغيير مواعيد التواجد، الانضمام لفريق ثابت، إلخ...")
        .setRequired(true)
        .setMaxLength(500);

      const components = [
        new ActionRowBuilder().addComponents(charName),
        new ActionRowBuilder().addComponents(reason),
      ];

      // If not pre-selected from dropdowns, show manual guild inputs as fallback
      if (!options.currentGuild || !options.targetGuild) {
        const currentGuild = new TextInputBuilder()
          .setCustomId("current_guild")
          .setLabel("جيلدك الحالي")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`أحد جيلدات التحالف: ${GUILD_NAMES.join(" / ")}`)
          .setRequired(true);

        const targetGuild = new TextInputBuilder()
          .setCustomId("target_guild")
          .setLabel("الجيلد المراد الانتقال إليه")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`اختر: ${GUILD_NAMES.join(" / ")}`)
          .setRequired(true);

        components.splice(1, 0, new ActionRowBuilder().addComponents(currentGuild), new ActionRowBuilder().addComponents(targetGuild));
      }

      modal.addComponents(...components);
      break;
    }

    case "tech_support": {
      const issue = new TextInputBuilder()
        .setCustomId("issue_description")
        .setLabel("شرح المشكلة في برنامج M3RGEEN")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("ما الذي حدث معك في برنامج المعرقين؟ ومتى ظهرت المشكلة؟")
        .setRequired(true)
        .setMaxLength(1000);

      const errorText = new TextInputBuilder()
        .setCustomId("error_details")
        .setLabel("نص رسالة الخطأ أو رابط صورة للمشكلة")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("الصق نص الخطأ هنا إن وجد أو رابط لقطة شاشة")
        .setRequired(false)
        .setMaxLength(500);

      const osInfo = new TextInputBuilder()
        .setCustomId("os_info")
        .setLabel("نظام التشغيل أو إصدار البرنامج")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("مثال: Windows 11 / Windows 10")
        .setRequired(false)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder().addComponents(issue),
        new ActionRowBuilder().addComponents(errorText),
        new ActionRowBuilder().addComponents(osInfo)
      );
      break;
    }

    case "ingame_help": {
      const charInfo = new TextInputBuilder()
        .setCustomId("char_info")
        .setLabel("اسم الشخصية والكلاس")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("مثال: Sorcerer Lv45")
        .setRequired(true);

      const helpTopic = new TextInputBuilder()
        .setCustomId("help_topic")
        .setLabel("المجال (عتاد / مهارات / دنجن / كويست)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("مثال: نصيحة لتطوير العتاد للوصول لـ 1400 iLvl")
        .setRequired(true);

      const details = new TextInputBuilder()
        .setCustomId("details")
        .setLabel("تفاصيل الاستفسار")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("اكتب استفسارك بالتفصيل ليساعدك المختصون...")
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(charInfo),
        new ActionRowBuilder().addComponents(helpTopic),
        new ActionRowBuilder().addComponents(details)
      );
      break;
    }

    case "admin_complaint": {
      const subject = new TextInputBuilder()
        .setCustomId("subject")
        .setLabel("موضوع الشكوى")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("مثال: مشكلة تنظيمية في قروب دنجن / نزاع غير حساس")
        .setRequired(true);

      const parties = new TextInputBuilder()
        .setCustomId("parties")
        .setLabel("الأطراف المعنية (منشن أو أسماء)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("أسماء الأشخاص المعنيين")
        .setRequired(false);

      const details = new TextInputBuilder()
        .setCustomId("details")
        .setLabel("تفاصيل ما حدث")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("شرح المشكلة بتجرد ووضوح...")
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(subject),
        new ActionRowBuilder().addComponents(parties),
        new ActionRowBuilder().addComponents(details)
      );
      break;
    }

    case "suggestion": {
      const title = new TextInputBuilder()
        .setCustomId("suggestion_title")
        .setLabel("عنوان الاقتراح")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("عنوان مختصر لفكرتك")
        .setRequired(true);

      const idea = new TextInputBuilder()
        .setCustomId("idea")
        .setLabel("شرح الاقتراح وآلية تطبيقه")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("اشرح فكرتك بالتفصيل وكيف يمكن تنفيذها...")
        .setRequired(true)
        .setMaxLength(1000);

      const benefit = new TextInputBuilder()
        .setCustomId("benefit")
        .setLabel("الفائدة المرجوة للتحالف أو السيرفر")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("كيف سيخدم هذا الاقتراح مجتمع M3RGEEN؟")
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(idea),
        new ActionRowBuilder().addComponents(benefit)
      );
      break;
    }

    case "general_inquiry": {
      const topic = new TextInputBuilder()
        .setCustomId("topic")
        .setLabel("موضوع الاستفسار")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("استفسار عن خدمات المجتمع أو الإدارة...")
        .setRequired(true);

      const question = new TextInputBuilder()
        .setCustomId("question")
        .setLabel("نص السؤال بالتفصيل")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("اكتب استفسارك هنا (تنويه: ليس مخصصاً لكلاسات اللعبة)...")
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(topic),
        new ActionRowBuilder().addComponents(question)
      );
      break;
    }

    case "confidential_report": {
      const reportType = new TextInputBuilder()
        .setCustomId("report_category")
        .setLabel("تصنيف البلاغ (تحرش / ابتزاز / تهديد / إساءة)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("حدد نوع المخالفة")
        .setRequired(true);

      const reportedParty = new TextInputBuilder()
        .setCustomId("reported_party")
        .setLabel("المشتكى عليه (اسمه أو معرف حسابه)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("اسم المستخدم أو الآيدي الخاص به")
        .setRequired(true);

      const incident = new TextInputBuilder()
        .setCustomId("incident_details")
        .setLabel("شرح الواقعة وما حدث بالتفصيل")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("يرجى ذكر التواريخ وما دار بالتفصيل...")
        .setRequired(true)
        .setMaxLength(1000);

      const evidence = new TextInputBuilder()
        .setCustomId("evidence_links")
        .setLabel("روابط الأدلة (صور، لقطات شاشة، رسائل)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("روابط Imgur أو Discord أو Google Drive للأدلة")
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(reportType),
        new ActionRowBuilder().addComponents(reportedParty),
        new ActionRowBuilder().addComponents(incident),
        new ActionRowBuilder().addComponents(evidence)
      );
      break;
    }
  }

  return modal;
}

/**
 * Modal to request information from ticket owner.
 */
export function buildRequestInfoModal(ticketNumber) {
  const modal = new ModalBuilder()
    .setCustomId("ticket_action_modal:request_info")
    .setTitle(`طلب معلومات — تذكرة #${ticketNumber}`);

  const questionInput = new TextInputBuilder()
    .setCustomId("question_text")
    .setLabel("ما هي المعلومات الإضافية المطلوبة؟")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("سيتم إرسال هذا السؤال للعضو وتغيير حالة التذكرة إلى (بانتظار رد العضو)...")
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(questionInput));
  return modal;
}

/**
 * Modal to close ticket with reason.
 */
export function buildCloseTicketModal(ticketNumber) {
  const modal = new ModalBuilder()
    .setCustomId("ticket_action_modal:close")
    .setTitle(`إغلاق تذكرة #${ticketNumber}`);

  const reasonInput = new TextInputBuilder()
    .setCustomId("close_reason")
    .setLabel("سبب إغلاق التذكرة")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("مثال: تم قبول العضو في الجيلد / تم حل المشكلة التقنية بنجاح...")
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}
