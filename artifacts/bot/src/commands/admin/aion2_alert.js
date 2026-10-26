import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  AttachmentBuilder 
} from "discord.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { buildSiegeComponents } from "../../modules/aion2SiegeAlert.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET_CHANNEL_ID = "1548357027758219378";
const M3RGEEN_ROLE_ID = "1555617080521269368";

function getHourChoices() {
  const choices = [];
  for (let i = 1; i <= 12; i++) {
    const padded = String(i).padStart(2, "0");
    choices.push({ name: `${padded}:00 (الساعة ${i})`, value: i });
  }
  return choices;
}

export const data = new SlashCommandBuilder()
  .setName("aion2_alert")
  .setDescription("إرسال إعلان حصار AION 2 مع توقيت التجمع ورقم التليبورت وزر الحضور")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption(opt =>
    opt.setName("gathering_hour")
      .setDescription("ساعة التجمع للتليبورت (1 - 12)")
      .setRequired(true)
      .addChoices(...getHourChoices())
  )
  .addStringOption(opt =>
    opt.setName("gathering_minute")
      .setDescription("دقيقة التجمع")
      .setRequired(true)
      .addChoices(
        { name: "00 (تماماً)", value: "00" },
        { name: "15 (ربع)", value: "15" },
        { name: "30 (نصف)", value: "30" },
        { name: "45 (إلا ربع)", value: "45" }
      )
  )
  .addStringOption(opt =>
    opt.setName("gathering_period")
      .setDescription("الفترة للتجمع (مساءً أو صباحاً)")
      .setRequired(true)
      .addChoices(
        { name: "مساءً (PM)", value: "مساءً" },
        { name: "صباحاً (AM)", value: "صباحاً" }
      )
  )
  .addIntegerOption(opt =>
    opt.setName("siege_hour")
      .setDescription("ساعة الحضور وبدء الحصار (1 - 12)")
      .setRequired(true)
      .addChoices(...getHourChoices())
  )
  .addStringOption(opt =>
    opt.setName("siege_minute")
      .setDescription("دقيقة الحضور وبدء الحصار")
      .setRequired(true)
      .addChoices(
        { name: "00 (تماماً)", value: "00" },
        { name: "15 (ربع)", value: "15" },
        { name: "30 (نصف)", value: "30" },
        { name: "45 (إلا ربع)", value: "45" }
      )
  )
  .addStringOption(opt =>
    opt.setName("siege_period")
      .setDescription("الفترة للحصار (مساءً أو صباحاً)")
      .setRequired(true)
      .addChoices(
        { name: "مساءً (PM)", value: "مساءً" },
        { name: "صباحاً (AM)", value: "صباحاً" }
      )
  )
  .addIntegerOption(opt =>
    opt.setName("teleport_number")
      .setDescription("رقم التليبورت المتفق عليه (من 01 إلى 99)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(99)
  )
  .addStringOption(opt =>
    opt.setName("notes")
      .setDescription("توجيهات أو ملاحظات تكتيكية إضافية للكتيبة (اختياري)")
      .setRequired(false)
  );

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (deferErr) {
    console.error("[aion2_alert] Failed to deferReply:", deferErr);
    return;
  }

  try {
    const targetChannel = await interaction.client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null)
      || interaction.channel;

    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.editReply({ content: "❌ تعذر العثور على الروم المستهدف أو أن الروم ليس كتابياً." });
    }

    const gHour = interaction.options.getInteger("gathering_hour");
    const gMin = interaction.options.getString("gathering_minute");
    const gPeriod = interaction.options.getString("gathering_period");
    const gatheringFormatted = `${String(gHour).padStart(2, "0")}:${gMin} ${gPeriod}`;

    const sHour = interaction.options.getInteger("siege_hour");
    const sMin = interaction.options.getString("siege_minute");
    const sPeriod = interaction.options.getString("siege_period");
    const siegeFormatted = `${String(sHour).padStart(2, "0")}:${sMin} ${sPeriod}`;

    const tpNum = interaction.options.getInteger("teleport_number");
    const tpFormatted = String(tpNum).padStart(2, "0");

    const notes = interaction.options.getString("notes");

    // Resolve banner path
    const bannerPath = path.join(__dirname, "../../assets/aion2_siege_banner.jpg");
    const hasImage = fs.existsSync(bannerPath);

    // Build the rich Embed
    const embed = new EmbedBuilder()
      .setColor(0x992D22) // Royal Dark Crimson
      .setTitle("⚔️ إعلان حصار AION 2 | نداء الحرب لكتيبة M3RGEEN ⚔️")
      .setDescription([
        "**تعلن قيادة تحالف معرقين عن انطلاق عمليات الحصار.**",
        "على جميع المقاتلين الالتزام التام بالتوقيتات المحددة والتواجد في الروم الصوتي.",
        "",
        `📅 **اليوم:** \`اليوم\``,
        `🌀 **توقيت التجمع والتليبورت:** \`${gatheringFormatted}\``,
        `⚔️ **توقيت الحضور وبدء الحصار:** \`${siegeFormatted}\``,
        `📍 **رقم التليبورت:** \`تليبورت رقم [ ${tpFormatted} ]\``,
        "",
        ...(notes ? [`📝 **توجيهات القيادة والتكتيك:**\n${notes}`, ""] : []),
        "🛡️ **التعليمات والإرشادات:**",
        "• التواجد في الروم الصوتي الخاص بالقتال قبل موعد التجمع بـ 10 دقائق.",
        "• تجهيز كافة الجرع والأطعمة وبوفات الحرب والعتاد مسبقاً.",
        `• الانتقال الفوري لرقم التليبورت المحدد (\`${tpFormatted}\`) وقت التجمع دون تأخير.`,
        "",
        "👥 **عدد الحضور المؤكدين:** `0 لاعب`"
      ].join("\n"))
      .setFooter({ text: "تحالف M3RGEEN • جيش المعرقين • اضغط علامة الصح لتأكيد حضورك" })
      .setTimestamp();

    if (hasImage) {
      embed.setImage("attachment://aion2_siege_banner.jpg");
    }

    const row = buildSiegeComponents(0);

    const sendPayload = {
      content: `<@&${M3RGEEN_ROLE_ID}>`,
      allowedMentions: { roles: [M3RGEEN_ROLE_ID] },
      embeds: [embed],
      components: [row]
    };

    if (hasImage) {
      sendPayload.files = [new AttachmentBuilder(bannerPath, { name: "aion2_siege_banner.jpg" })];
    }

    const sentMessage = await targetChannel.send(sendPayload);

    // Add green checkmark reaction as well
    await sentMessage.react("✅").catch(err => {
      console.warn("[aion2_alert] Failed to add reaction:", err.message);
    });

    return interaction.editReply({
      content: `✅ **تم إرسال إعلان الحصار بنجاح في القناة:** <#${targetChannel.id}>`
    });
  } catch (err) {
    console.error("[aion2_alert] Error executing command:", err);
    return interaction.editReply({
      content: `❌ تعذر إرسال الإعلان: ${err.message || "خطأ غير متوقع"}`
    });
  }
}

export default {
  data,
  execute
};
