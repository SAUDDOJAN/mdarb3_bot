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
      let isSubscribed = member.roles.cache.has(NOTIFY_ROLE_ID);
      
      if (isSubscribed) {
        await member.roles.remove(NOTIFY_ROLE_ID);
        await interaction.editReply({ content: '🔕 تم إزالة رتبة الإشعارات منك بنجاح.' });
      } else {
        await member.roles.add(NOTIFY_ROLE_ID);
        await interaction.editReply({ content: '🔔 تم إعطائك رتبة الإشعارات بنجاح!' });
      }

      // Update the button with new count
      if (interaction.message && interaction.message.components.length > 0) {
        try {
          const role = interaction.guild.roles.cache.get(NOTIFY_ROLE_ID) || await interaction.guild.roles.fetch(NOTIFY_ROLE_ID);
          // Calculate count after role change. Since role.members.size might take a moment to update in cache,
          // we can adjust it manually based on cache or just fetch.
          let count = role ? role.members.size : 0;
          if (isSubscribed && role?.members.has(member.id)) count--;
          if (!isSubscribed && !role?.members.has(member.id)) count++;
          
          const actionRow = interaction.message.components[0];
          const oldButton = actionRow.components.find(c => c.customId === 'social:subscribe');
          
          if (oldButton) {
            const newButton = ButtonBuilder.from(oldButton)
              .setLabel(`🔔 اشترك بالإشعارات (${count})`);
            const newRow = new ActionRowBuilder().addComponents(newButton);
            await interaction.message.edit({ components: [newRow] });
          }
        } catch (msgErr) {
          console.error('[SocialModule] Error updating button message:', msgErr);
        }
      }

    } catch (error) {
      console.error('[SocialModule] Error updating role:', error);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء تعديل الرتبة. تأكد من أن رتبة البوت أعلى من رتبة الإشعارات في السيرفر (Role Hierarchy).' });
    }
  }
}
