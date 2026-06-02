import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getPoints } from "../../modules/management.js";
import { query } from "../../database/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("my_points")
    .setDescription("View your points balance and withdrawal count")
    .addUserOption((o) =>
      o.setName("user").setDescription("View another member's points (admin only)")
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const data = await getPoints(interaction.guildId, target.id);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🏆 نقاط M3RGEEN")
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "👤 اللاعب",          value: `<@${target.id}>`,              inline: true },
        { name: "⭐ إجمالي النقاط",    value: `**${data.total_points}**`,     inline: true },
        { name: "⚠️ الانسحابات",      value: `**${data.withdrawals}**`,       inline: true },
      )
      .setFooter({ text: "احصل على +10 نقاط بالبقاء 30 دقيقة في غرفة الحدث" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
