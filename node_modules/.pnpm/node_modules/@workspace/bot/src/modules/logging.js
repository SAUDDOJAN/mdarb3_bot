import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";

export async function getLogChannel(guild) {
  const res = await query(
    "SELECT log_channel_id FROM guild_config WHERE guild_id = $1",
    [guild.id]
  );
  const id = res.rows[0]?.log_channel_id;
  return id ? guild.channels.cache.get(id) : null;
}

export async function log(guild, embed) {
  const channel = await getLogChannel(guild);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}
