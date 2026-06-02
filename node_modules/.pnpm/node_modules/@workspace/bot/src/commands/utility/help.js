import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all available commands"),
  async execute(interaction, client) {
    const categories = {};
    for (const [, cmd] of client.commands) {
      const cat = cmd.category ?? "Utility";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`\`/${cmd.data.name}\` — ${cmd.data.description}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("M3RGEEN Bot — Command List")
      .setDescription("Here are all available commands:")
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .setTimestamp();

    const commandList = [...client.commands.values()]
      .map((cmd) => `\`/${cmd.data.name}\` — ${cmd.data.description}`)
      .join("\n");

    embed.addFields({ name: "Commands", value: commandList || "No commands loaded." });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
