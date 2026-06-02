import { SlashCommandBuilder } from "discord.js";
import { query } from "../../database/index.js";
import { buildProfileEmbed } from "../../modules/alliance.js";


export default {
  data: new SlashCommandBuilder()
    .setName("alliance-member")
    .setDescription("عرض بطاقة عضو في التحالف")
    .addUserOption((option) =>
      option.setName("user")
        .setDescription("العضو المراد عرض بطاقته (اتركه فارغاً لعرض بطاقتك)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    
    await interaction.deferReply();

    const appRes = await query(
      "SELECT * FROM alliance_members WHERE user_id=$1 AND guild_id=$2 AND status='accepted'", 
      [targetUser.id, interaction.guildId]
    );
    const app = appRes.rows[0];

    if (!app) {
      await interaction.editReply({ content: `❌ العضو ${targetUser} ليس مسجلاً كعضو معتمد في التحالف.` });
      return;
    }

    const memberData = typeof app.character_data === 'string' ? JSON.parse(app.character_data) : app.character_data;
    const embed = buildProfileEmbed(memberData, null, app, false);

    await interaction.editReply({ embeds: [embed] });
  },
};
