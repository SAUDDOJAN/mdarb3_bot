import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

export default {
  name: "messageUpdate",
  once: false,
  async execute(oldMessage, newMessage, client) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    try {
      const res = await query(
        "SELECT log_channel_id FROM guild_config WHERE guild_id = $1",
        [newMessage.guild.id]
      );
      const config = res.rows[0];
      if (!config?.log_channel_id) return;

      const channel = newMessage.guild.channels.cache.get(config.log_channel_id);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Message Edited")
        .setURL(newMessage.url)
        .addFields(
          { name: "Author", value: newMessage.author?.tag ?? "Unknown", inline: true },
          { name: "Channel", value: `<#${newMessage.channelId}>`, inline: true },
          { name: "Before", value: oldMessage.content?.slice(0, 512) || "*Unknown*" },
          { name: "After", value: newMessage.content?.slice(0, 512) || "*Empty*" }
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[Log] Error logging message update:", err);
    }
  },
};
