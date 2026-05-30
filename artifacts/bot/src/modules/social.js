import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const NOTIFY_ROLE_ID = '1405203186389745885';

export async function handleInteraction(interaction) {
  if (interaction.customId === 'social:subscribe') {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    if (!member) {
      return interaction.editReply({ content: '❌ حدث خطأ، لا يمكن العثور على معلومات العضو.' });
    }

    try {
      console.log(`[SocialModule] User ${member.user.tag} toggling notification role.`);
      if (member.roles.cache.has(NOTIFY_ROLE_ID)) {
        await member.roles.remove(NOTIFY_ROLE_ID);
        await interaction.editReply({ content: '🔕 تم إزالة رتبة الإشعارات منك بنجاح.' });
      } else {
        await member.roles.add(NOTIFY_ROLE_ID);
        await interaction.editReply({ content: '🔔 تم إعطائك رتبة الإشعارات بنجاح!' });
      }
    } catch (error) {
      console.error('[SocialModule] Error updating role:', error);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء تعديل الرتبة. تأكد من أن رتبة البوت أعلى من رتبة الإشعارات في السيرفر (Role Hierarchy).' });
    }
  }
}
