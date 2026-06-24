import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { query } from "../../database/index.js";
import { processCountdowns } from "../../tasks/countdownTimer.js";

const TIMEZONES = [
  { name: "KST (كوريا +9)", value: "KST" },
  { name: "JST (اليابان +9)", value: "JST" },
  { name: "BDT (المحيط الهندي +6)", value: "BDT" },
  { name: "IST (الهند +5:30)", value: "IST" },
  { name: "AST (السعودية +3)", value: "AST" },
  { name: "UTC (جرينتش +0)", value: "UTC" },
  { name: "CET (أوروبا +1)", value: "CET" },
  { name: "EST (شرق أمريكا -5)", value: "EST" },
  { name: "PST (غرب أمريكا -8)", value: "PST" },
  { name: "PDT (المحيط الهادئ الصيفي -7)", value: "PDT" },
];

function parseDateToUTC(dateStr, timeStr, timezone) {
  const offsets = {
    "KST": 9, "JST": 9, "BDT": 6, "IST": 5.5, "AST": 3, "UTC": 0,
    "CET": 1, "EST": -5, "PST": -8, "PDT": -7
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
        .addStringOption((o) =>
          o.setName("image_url").setDescription("رابط صورة للإعلان (اختياري)").setRequired(false)
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
          o.setName("id").setDescription("رقم المؤقت (اختر من القائمة)").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("تعديل مؤقت نشط")
        .addIntegerOption((o) =>
          o.setName("id").setDescription("رقم المؤقت (اختر من القائمة)").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((o) =>
          o.setName("game_full_name").setDescription("اسم اللعبة الكامل (اختياري)")
        )
        .addStringOption((o) =>
          o.setName("game_short_name").setDescription("اختصار اللعبة (اختياري)")
        )
        .addStringOption((o) =>
          o.setName("date").setDescription("تاريخ جديد YYYY-MM-DD (اختياري)")
        )
        .addStringOption((o) =>
          o.setName("time").setDescription("وقت جديد HH:MM (اختياري)")
        )
        .addStringOption((o) =>
          o.setName("timezone").setDescription("المنطقة الزمنية (مطلوب إذا وضعت تاريخ ووقت)").addChoices(...TIMEZONES)
        )
        .addStringOption((o) =>
          o.setName("image_url").setDescription("رابط صورة جديد (اختياري)")
        )
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "delete" || sub === "edit") {
      const focusedValue = interaction.options.getFocused();
      try {
        const res = await query("SELECT id, game_name FROM live_countdowns WHERE guild_id = $1 AND status = 'active'", [interaction.guildId]);
        let choices = res.rows.map(r => ({
          name: `ID: ${r.id} | ${r.game_name}`,
          value: r.id
        }));
        
        if (focusedValue) {
          choices = choices.filter(c => c.name.toLowerCase().includes(focusedValue.toString().toLowerCase()));
        }
        await interaction.respond(choices.slice(0, 25));
      } catch (err) {
        console.error("[Countdown] Autocomplete Error:", err);
        await interaction.respond([]);
      }
    }
  },

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
      const imageUrl = interaction.options.getString("image_url");

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
        "INSERT INTO live_countdowns (guild_id, voice_channel_id, text_channel_id, game_name, short_name, mention_target, end_time, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [interaction.guildId, voiceChannel.id, textChannel.id, gameFullName, gameShortName, mentionStr, endTime, imageUrl]
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

    if (sub === "edit") {
      const id = interaction.options.getInteger("id");
      const gameFullName = interaction.options.getString("game_full_name");
      const gameShortName = interaction.options.getString("game_short_name");
      const dateStr = interaction.options.getString("date");
      const timeStr = interaction.options.getString("time");
      const timezone = interaction.options.getString("timezone");
      const imageUrl = interaction.options.getString("image_url");

      const resCheck = await query("SELECT * FROM live_countdowns WHERE id = $1 AND guild_id = $2 AND status = 'active'", [id, interaction.guildId]);
      if (resCheck.rows.length === 0) {
        return interaction.reply({ content: `❌ لم يتم العثور على مؤقت نشط بهذا الرقم.`, flags: 64 });
      }

      const countdown = resCheck.rows[0];
      
      let newEndTime = countdown.end_time;
      if (dateStr || timeStr) {
        if (!dateStr || !timeStr || !timezone) {
          return interaction.reply({ content: "❌ لتعديل الوقت يجب إدخال (التاريخ، الوقت، والمنطقة الزمنية) معاً.", flags: 64 });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return interaction.reply({ content: "❌ صيغة التاريخ خاطئة! يرجى استخدام YYYY-MM-DD.", flags: 64 });
        if (!/^\d{2}:\d{2}$/.test(timeStr)) return interaction.reply({ content: "❌ صيغة الوقت خاطئة! يرجى استخدام HH:MM.", flags: 64 });

        newEndTime = parseDateToUTC(dateStr, timeStr, timezone);
        if (isNaN(newEndTime.getTime()) || newEndTime.getTime() <= Date.now()) {
          return interaction.reply({ content: "❌ تأكد من أن التاريخ والوقت في المستقبل.", flags: 64 });
        }
      }

      const updatedFullName = gameFullName || countdown.game_name;
      const updatedShortName = gameShortName || countdown.short_name;
      const updatedImageUrl = imageUrl !== null ? imageUrl : countdown.image_url;

      await query(
        "UPDATE live_countdowns SET game_name = $1, short_name = $2, end_time = $3, image_url = $4 WHERE id = $5",
        [updatedFullName, updatedShortName, newEndTime, updatedImageUrl, id]
      );

      await interaction.reply({ content: `✅ تم تعديل المؤقت رقم ${id} بنجاح!\nالاسم: ${updatedFullName}\nوقت الانتهاء: <t:${Math.floor(newEndTime.getTime()/1000)}:F>` });
      processCountdowns(client);
      return;
    }
  }
};
