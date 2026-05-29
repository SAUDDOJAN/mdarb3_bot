import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { query } from "../../database/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("points_leaderboard")
    .setDescription("View the top 10 members by event points"),

  async execute(interaction) {
    const res = await query(
      "SELECT user_id, total_points, withdrawals FROM points WHERE guild_id=$1 ORDER BY total_points DESC LIMIT 10",
      [interaction.guildId]
    );

    if (!res.rows.length) {
      await interaction.reply({ content: "لا توجد نقاط مسجلة بعد.", flags: 64 });
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = res.rows.map((r, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      return `${medal} <@${r.user_id}> — ⭐ **${r.total_points}** نقطة  |  ⚠️ ${r.withdrawals} انسحاب`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🏆 لوحة الصدارة — نقاط M3RGEEN")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "يتم تحديث النقاط تلقائياً بعد كل حدث" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
