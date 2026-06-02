import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup_static_teams")
    .setDescription("إعداد نظام الفرق الثابتة (للمشرفين فقط)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const isMainGuild = interaction.guildId === (process.env.MAIN_GUILD_ID || "861355983975874601");
    let targetChannel = null;
    if (isMainGuild) {
      const mainChannelId = "1496783131594723338";
      targetChannel = interaction.guild.channels.cache.get(mainChannelId) || 
                      await interaction.guild.channels.fetch(mainChannelId).catch(() => null);
    }
    if (!targetChannel) {
      targetChannel = interaction.channel;
    }
    const targetChannelId = targetChannel.id;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🛡️ نظام إنشاء الفرق الثابتة")
      .setDescription(
        "أهلاً بك في نظام إدارة الفرق الثابتة.\n\n" +
        "اضغط على الزر أدناه للبدء في إنشاء فريق جديد.\n" +
        "سيطلب منك النظام إدخال اسم الفريق أولاً."
      )
      .setFooter({ text: "M3RGEEN — Static Teams System" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("static_team:init")
        .setLabel("بدء إنشاء فريق جديد")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Primary)
    );

    await targetChannel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ تم نشر لوحة الإنشاء في <#${targetChannelId}>.`, flags: 64 });
  },
};
