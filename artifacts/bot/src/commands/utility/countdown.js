import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { query } from "../../database/index.js";
import { processCountdowns } from "../../tasks/countdownTimer.js";

const TIMEZONES = [
  { name: "KST (كوريا +9)", value: "KST" },
  { name: "JST (اليابان +9)", value: "JST" },
  { name: "AST (السعودية +3)", value: "AST" },
  { name: "UTC (جرينتش +0)", value: "UTC" },
  { name: "CET (أوروبا +1)", value: "CET" },
  { name: "EST (شرق أمريكا -5)", value: "EST" },
  { name: "PST (غرب أمريكا -8)", value: "PST" },
];

function parseDateToUTC(dateStr, timeStr, timezone) {
  const offsets = {
    "KST": 9, "JST": 9, "AST": 3, "UTC": 0,
    "CET": 1, "EST": -5, "PST": -8
  };
  const offset = offsets[timezone] || 0;
  
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute));
  d.setUTCHours(d.getUTCHours() - offset);
  return d;
}

export default {
  data: new SlashCommandBuilder()
    .setName("countdown")
    .setDescription("إدارة مؤقتات الرومات الصوتية (Live Countdowns)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("إنشاء مؤقت جديد")
        .addChannelOption((o) =>
          o.setName("voice_channel").setDescription("الروم الصوتي المستهدف للتحديث").setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        )
        .addChannelOption((o) =>
          o.setName("text_channel").setDescription("الروم النصي لإرسال الإعلان عند الانتهاء").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addStringOption((o) =>
          o.setName("game_full_name").setDescription("اسم اللعبة الكامل (للإعلان) - مثال: Throne and Liberty").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("game_short_name").setDescription("اختصار اسم اللعبة (للروم الصوتي) - مثال: TL").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("date").setDescription("تاريخ الحدث بصيغة YYYY-MM-DD (مثال: 2026-06-20)").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("time").setDescription("وقت الحدث بصيغة 24 ساعة HH:MM (مثال: 15:30)").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("timezone").setDescription("المنطقة الزمنية (Timezone)").setRequired(true).addChoices(...TIMEZONES)
        )
        .addRoleOption((o) =>
          o.setName("mention_role").setDescription("الرتبة المطلوب منشنتها عند الانتهاء (اختياري)").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("عرض المؤقتات النشطة")
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("إلغاء مؤقت نشط")
        .addIntegerOption((o) =>
          o.setName("id").setDescription("رقم المؤقت (من أمر list)").setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const voiceChannel = interaction.options.getChannel("voice_channel");
      const textChannel = interaction.options.getChannel("text_channel");
      const gameFullName = interaction.options.getString("game_full_name");
      const gameShortName = interaction.options.getString("game_short_name");
      const dateStr = interaction.options.getString("date");
      const timeStr = interaction.options.getString("time");
      const timezone = interaction.options.getString("timezone");
      const role = interaction.options.getRole("mention_role");

      if (voiceChannel.type !== 2 && voiceChannel.type !== 13) {
        return interaction.reply({ content: "❌ يرجى اختيار روم صوتي (Voice Channel) صحيح.", flags: 64 });
      }

      // Parse date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return interaction.reply({ content: "❌ صيغة التاريخ خاطئة! يرجى استخدام YYYY-MM-DD (مثال: 2026-06-20).", flags: 64 });
      }
      if (!/^\d{2}:\d{2}$/.test(timeStr)) {
        return interaction.reply({ content: "❌ صيغة الوقت خاطئة! يرجى استخدام 24-hour format HH:MM (مثال: 15:30).", flags: 64 });
      }

      const endTime = parseDateToUTC(dateStr, timeStr, timezone);
      
      if (isNaN(endTime.getTime())) {
        return interaction.reply({ content: "❌ حدث خطأ في معالجة التاريخ والوقت. تأكد من إدخال قيم صحيحة.", flags: 64 });
      }

      if (endTime.getTime() <= Date.now()) {
        return interaction.reply({ content: "❌ الوقت المدخل قد مضى بالفعل! يرجى اختيار وقت في المستقبل.", flags: 64 });
      }

      const mentionStr = role ? `<@&${role.id}>` : "";

      await query(
        "INSERT INTO live_countdowns (guild_id, voice_channel_id, text_channel_id, game_name, short_name, mention_target, end_time) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [interaction.guildId, voiceChannel.id, textChannel.id, gameFullName, gameShortName, mentionStr, endTime]
      );

      await interaction.reply({ content: `✅ تم إعداد المؤقت للعبة **${gameFullName}** بنجاح!\nسينتهي في <t:${Math.floor(endTime.getTime()/1000)}:F> داخل الروم الصوتي ${voiceChannel}.` });
      
      // Trigger a check immediately to update the name for the first time
      processCountdowns(client);
      return;
    }

    if (sub === "list") {
      const res = await query("SELECT id, game_name, end_time FROM live_countdowns WHERE guild_id = $1 AND status = 'active'", [interaction.guildId]);
      if (res.rows.length === 0) {
        return interaction.reply({ content: "لا توجد مؤقتات نشطة حالياً.", flags: 64 });
      }

      const listStr = res.rows.map(r => `**ID ${r.id}** | ${r.game_name} | ينتهي في: <t:${Math.floor(r.end_time.getTime()/1000)}:R>`).join("\n");
      return interaction.reply({ content: `**المؤقتات النشطة:**\n${listStr}`, flags: 64 });
    }

    if (sub === "delete") {
      const id = interaction.options.getInteger("id");
      const res = await query("UPDATE live_countdowns SET status = 'completed' WHERE id = $1 AND guild_id = $2 RETURNING id", [id, interaction.guildId]);
      if (res.rows.length > 0) {
        return interaction.reply({ content: `✅ تم إلغاء المؤقت رقم ${id} بنجاح.` });
      } else {
        return interaction.reply({ content: `❌ لم يتم العثور على مؤقت نشط بهذا الرقم.`, flags: 64 });
      }
    }
  }
};
