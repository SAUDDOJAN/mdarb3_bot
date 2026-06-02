import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("clean")
    .setDescription("تنظيف رسائل الروم (مسح إجباري بالعدد أو مسح كامل للروم)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("عدد الرسائل المراد مسحها (من 1 إلى 100)")
        .setRequired(false)
    )
    .addBooleanOption((o) =>
      o
        .setName("all")
        .setDescription("اختر True لمسح الروم بالكامل وإعادة إنشائه (يتخطى حد 14 يوم)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");
    const all = interaction.options.getBoolean("all");

    // 1. Clear all by cloning the channel
    if (all) {
      try {
        // We reply ephemerally first so the user knows it started
        await interaction.reply({
          content: "⏳ جاري مسح الروم بالكامل وإعادة إنشائه...",
          flags: 64,
        });

        const channel = interaction.channel;
        const position = channel.position;
        const parentId = channel.parentId;

        // Clone the channel with same settings & permissions
        const newChannel = await channel.clone({
          reason: `Purged all messages via /clean by ${interaction.user.tag}`,
        });

        // Delete the old channel
        await channel.delete(`Purged all messages via /clean by ${interaction.user.tag}`);

        // Re-position and link parent category
        if (parentId) {
          await newChannel.setParent(parentId, { lockPermissions: false });
        }
        await newChannel.setPosition(position);

        // Send a success message in the new channel
        await newChannel.send({
          content: `🧹 تم مسح الروم بالكامل وإعادة إنشائه بنجاح بواسطة <@${interaction.user.id}>.`,
        });
      } catch (err) {
        console.error("[Clean] Error cloning/deleting channel:", err);
        try {
          await interaction.followUp({
            content: "❌ حدث خطأ أثناء محاولة إعادة إنشاء الروم. يرجى التحقق من صلاحيات البوت.",
            flags: 64,
          });
        } catch (_) {}
      }
      return;
    }

    // 2. Clear specific amount of messages
    if (amount !== null) {
      if (amount < 1 || amount > 100) {
        await interaction.reply({
          content: "❌ يرجى تحديد عدد رسائل بين 1 و 100.",
          flags: 64,
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        // bulkDelete deletes messages, second parameter `true` filters messages older than 14 days
        const deleted = await interaction.channel.bulkDelete(amount, true);
        
        await interaction.editReply({
          content: `🧹 تم مسح \`${deleted.size}\` رسالة بنجاح. (تنبيه: ديسكورد يمنع البوتات من مسح الرسائل الأقدم من 14 يوم، لمسحها بالكامل استخدم خيار \`all: True\`)`,
        });
      } catch (err) {
        console.error("[Clean] Error during bulkDelete:", err);
        await interaction.editReply({
          content: "❌ فشل مسح الرسائل. يرجى التأكد من أن البوت يمتلك صلاحية `Manage Messages`.",
        });
      }
      return;
    }

    // 3. If neither option was specified
    await interaction.reply({
      content: "❌ يرجى تحديد خيار: إما إدخال عدد الرسائل في خيار `amount` أو اختيار `True` في خيار `all` لتطهير الروم بالكامل.",
      flags: 64,
    });
  },
};
