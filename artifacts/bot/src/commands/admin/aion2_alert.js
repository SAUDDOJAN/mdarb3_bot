import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} from "discord.js";
import { 
  TARGET_CHANNEL_ID, 
  publishSiegeAnnouncement 
} from "../../modules/aion2SiegeAlert.js";

export const data = new SlashCommandBuilder()
  .setName("aion2_alert")
  .setDescription("إرسال إعلان حصار AION 2 المربوط بتايمر شوقو التلقائي وروم الإعلانات")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(opt =>
    opt.setName("notes")
      .setDescription("توجيهات أو ملاحظات تكتيكية إضافية للكتيبة (اختياري)")
      .setRequired(false)
  )
  .addChannelOption(opt =>
    opt.setName("channel")
      .setDescription("القناة المستهدفة لإرسال الإعلان (افتراضياً: روم الإعلانات)")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
  )
  .addBooleanOption(opt =>
    opt.setName("force_send")
      .setDescription("إرسال الإعلان حتى لو لم يكن اليوم موعد سيج (افتراضياً: نعم عند التشغيل اليدوي)")
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
    const selectedChannel = interaction.options.getChannel("channel");
    const targetChannelId = selectedChannel ? selectedChannel.id : TARGET_CHANNEL_ID;
    const notes = interaction.options.getString("notes");
    const forceSendOption = interaction.options.getBoolean("force_send");
    const forceSend = forceSendOption !== null ? forceSendOption : true;

    const targetChannel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.editReply({ 
        content: `❌ تعذر العثور على القناة المستهدفة (<#${targetChannelId}>) أو أنها ليست قناة كتابية.` 
      });
    }

    const sentMessage = await publishSiegeAnnouncement(interaction.client, {
      channelId: targetChannelId,
      notes,
      forceSend
    });

    if (!sentMessage) {
      return interaction.editReply({
        content: "⚠️ **لم يتم إرسال الإعلان لأن اليوم ليس موعد سيج حسب شوقو.**\n(إذا كنت تريد إرساله للتجربة أو مبكراً، فعّل خيار `force_send: true`)."
      });
    }

    return interaction.editReply({
      content: `✅ **تم إرسال إعلان الحصار بنجاح في القناة:** <#${targetChannel.id}>\n🔗 [الانتقال للرسالة](${sentMessage.url})`
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
