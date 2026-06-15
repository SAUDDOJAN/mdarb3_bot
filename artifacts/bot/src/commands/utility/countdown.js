import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { query } from "../../database/index.js";
import { processCountdowns } from "../../tasks/countdownTimer.js";

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
          o.setName("voice_channel").setDescription("الروم الصوتي المستهدف للتحديث").setRequired(true)
        )
        .addChannelOption((o) =>
          o.setName("text_channel").setDescription("الروم النصي لإرسال الإعلان عند الانتهاء").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("game_name").setDescription("اسم اللعبة (مثال: AION 2)").setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName("minutes_from_now").setDescription("بعد كم دقيقة ينتهي المؤقت؟ (مثال: 5)").setRequired(true)
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
      const gameName = interaction.options.getString("game_name");
      const mins = interaction.options.getInteger("minutes_from_now");
      const role = interaction.options.getRole("mention_role");

      if (voiceChannel.type !== 2 && voiceChannel.type !== 13) {
        // Not a voice channel
        return interaction.reply({ content: "❌ يرجى اختيار روم صوتي (Voice Channel) صحيح.", flags: 64 });
      }

      const endTime = new Date(Date.now() + mins * 60 * 1000);
      const mentionStr = role ? `<@&${role.id}>` : "";

      await query(
        "INSERT INTO live_countdowns (guild_id, voice_channel_id, text_channel_id, game_name, mention_target, end_time) VALUES ($1, $2, $3, $4, $5, $6)",
        [interaction.guildId, voiceChannel.id, textChannel.id, gameName, mentionStr, endTime]
      );

      await interaction.reply({ content: `✅ تم إعداد المؤقت للعبة **${game_name}** بنجاح!\nسينتهي بعد ${mins} دقائق في الروم الصوتي ${voiceChannel}.` });
      
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
