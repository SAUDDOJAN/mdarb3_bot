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

    // ── Throne and Liberty Member Count Sync ────────────────────────────────
    if (member.guild.id === "861355983975874601") {
      const TL_MEMBER_ROLE_ID = "1292754458492796982";
      if (member.roles.cache.has(TL_MEMBER_ROLE_ID)) {
        try {
          const { updateTLMemberCount } = await import("../modules/throneliberty.js");
          await updateTLMemberCount(client);
        } catch (err) {
          console.error("[TL] Error triggering count update from guildMemberRemove:", err);
        }
      }
    }

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
