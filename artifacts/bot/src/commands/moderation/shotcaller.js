import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";

const S_ADMIN_ROLE_ID = "1554242295384252427";
const SHOT_CALLER_ROLE_ID = "1498423320704585768";
const LOG_CHANNEL_ID = "1290468734045261885";

export default {
  data: new SlashCommandBuilder()
    .setName("shotcaller")
    .setDescription("إعطاء أو سحب رول Shot Caller فقط (مخصص لرتبة S-Admin)")
    .addUserOption((o) =>
      o.setName("user").setDescription("العضو المستهدف").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const hasSAdmin = member?.roles?.cache?.has(S_ADMIN_ROLE_ID);
    const isAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator);

    if (!hasSAdmin && !isAdmin) {
      return interaction.editReply({
        content: `🚫 ليس لديك صلاحية استخدام هذا الأمر. هذا الأمر مخصص لحاملي رول <@&${S_ADMIN_ROLE_ID}> فقط.`,
      });
    }

    const targetUser = interaction.options.getUser("user", true);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({
        content: "❌ تعذر العثور على العضو داخل السيرفر.",
      });
    }

    const hasRole = targetMember.roles.cache.has(SHOT_CALLER_ROLE_ID);

    try {
      if (hasRole) {
        await targetMember.roles.remove(
          SHOT_CALLER_ROLE_ID,
          `تم سحب رول Shot Caller بواسطة ${interaction.user.tag} (S-Admin)`
        );
      } else {
        await targetMember.roles.add(
          SHOT_CALLER_ROLE_ID,
          `تم إعطاء رول Shot Caller بواسطة ${interaction.user.tag} (S-Admin)`
        );
      }

      const actionText = hasRole ? "تم سحب" : "تم إعطاء";
      await interaction.editReply({
        content: `✅ ${actionText} رول <@&${SHOT_CALLER_ROLE_ID}> ${hasRole ? "من" : "إلى"} <@${targetMember.id}> بنجاح.`,
      });

      const logChannel =
        interaction.guild.channels.cache.get(LOG_CHANNEL_ID) ||
        (await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));

      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(hasRole ? "#f59e0b" : "#10b981")
          .setAuthor({
            name: "إدارة رول Shot Caller (S-Admin)",
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTitle(hasRole ? "❌ سحب رول Shot Caller" : "✅ إعطاء رول Shot Caller")
          .setDescription(
            `**المشرف:** <@${interaction.user.id}> (<@&${S_ADMIN_ROLE_ID}>)\n**العضو المستهدف:** <@${targetMember.id}>\n**الرول:** <@&${SHOT_CALLER_ROLE_ID}>`
          )
          .setTimestamp()
          .setFooter({ text: "نظام صلاحيات S-Admin المحدودة 🛡️" });

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      console.error("[ShotCaller Command] Error:", err);
      await interaction.editReply({
        content: `❌ حدث خطأ أثناء تعديل الرول: ${err.message}`,
      });
    }
  },
};
