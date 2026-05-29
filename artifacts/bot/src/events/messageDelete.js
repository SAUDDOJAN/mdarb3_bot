import { EmbedBuilder, AuditLogEvent } from "discord.js";
import { query } from "../database/index.js";

export default {
  name: "messageDelete",
  once: false,
  async execute(message, client) {
    if (!message.guild || message.author?.bot) return;
    try {
      const res = await query(
        "SELECT log_channel_id FROM guild_config WHERE guild_id = $1",
        [message.guild.id]
      );
      const config = res.rows[0];
      if (!config?.log_channel_id) return;

      const channel = message.guild.channels.cache.get(config.log_channel_id) || await message.guild.channels.fetch(config.log_channel_id);
      if (!channel) return;

      let deletedBy = "Unknown (Self or Bot)";
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fetchedLogs = await message.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MessageDelete,
        });

        const deletionLog = fetchedLogs.entries.first();
        if (deletionLog && deletionLog.target.id === message.author.id) {
          if (Date.now() - deletionLog.createdTimestamp < 5000) {
            const { executor } = deletionLog;
            let roleString = "";
            try {
              const member = await message.guild.members.fetch(executor.id);
              const highestRole = member.roles.highest;
              if (highestRole && highestRole.name !== "@everyone") {
                roleString = ` | Role: <@&${highestRole.id}>`;
              }
            } catch (e) {}
            deletedBy = `${executor.tag} ( <@${executor.id}> )${roleString}`;
          }
        }
      } catch (err) {
        console.error("[Log] Error fetching audit logs:", err);
      }

      let description = `**Channel:** ${message.channel.name} ( <#${message.channelId}> )\n`;
      description += `**Message ID:** ${message.id}\n`;
      const authorTag = message.author?.tag ?? "Unknown";
      const authorId = message.author?.id ? `<@${message.author.id}>` : "Unknown";
      description += `**Message author:** ${authorTag} ( ${authorId} )\n`;
      description += `**Deleted by:** ${deletedBy}\n`;
      description += `**Message created:** <t:${Math.floor(message.createdTimestamp / 1000)}:R>\n\n`;
      description += `**Message**\n${message.content || ""}`;

      if (message.attachments.size > 0) {
        const attachmentNames = message.attachments.map(a => `📎 \`${a.name}\``).join("\n");
        description += `\n\n${attachmentNames}`;
      }

      const embed = new EmbedBuilder()
        .setColor("#ed4245")
        .setTitle("Message deleted")
        .setDescription(description)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("[Log] Error logging message delete:", err);
    }
  },
};
