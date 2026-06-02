import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";
import { removeMemberAllData } from "../modules/management.js";

export default {
  name: "guildMemberRemove",
  once: false,
  async execute(member, client) {
    await removeMemberAllData(client, member.guild, member.id).catch((e) =>
      console.error("[MemberRemove] Data cleanup error:", e)
    );

    try {
      const res = await query(
        "SELECT farewell_channel_id FROM guild_config WHERE guild_id = $1",
        [member.guild.id]
      );
      const config = res.rows[0];
      if (!config?.farewell_channel_id) return;

      const channel = member.guild.channels.cache.get(config.farewell_channel_id);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("A member has left")
        .setDescription(`**${member.user.tag}** has left **${member.guild.name}**.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[Farewell] Error sending farewell message:", err);
    }
  },
};
