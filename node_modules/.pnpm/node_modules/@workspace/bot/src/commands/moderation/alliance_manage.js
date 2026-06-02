import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { query } from "../../database/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("alliance-manage")
    .setDescription("إدارة أعضاء التحالف (Admin Only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const appRes = await query("SELECT id, character_name, combat_power FROM alliance_members WHERE guild_id=$1 AND status='accepted' ORDER BY combat_power DESC LIMIT 25", [interaction.guildId]);
    const members = appRes.rows;

    if (members.length === 0) {
      await interaction.editReply({ content: "❌ لا يوجد أعضاء معتمدين في التحالف لعرضهم." });
      return;
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("alliance_manage_select")
      .setPlaceholder("اختر العضو للإدارة...");

    for (const m of members) {
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${m.character_name}`)
          .setDescription(`CP: ${m.combat_power?.toLocaleString() ?? "Unknown"}`)
          .setValue(m.id.toString())
      );
    }

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.editReply({
      content: "🛡️ لوحة إدارة أعضاء التحالف\nيرجى اختيار العضو من القائمة بالأسفل:",
      components: [row]
    });

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.customId === "alliance_manage_select" && i.user.id === interaction.user.id,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      const selectedId = i.values[0];
      
      const memberRes = await query("SELECT * FROM alliance_members WHERE id=$1", [selectedId]);
      const app = memberRes.rows[0];

      if (!app) {
        await i.reply({ content: "❌ لم يتم العثور على العضو.", flags: 64 });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`إدارة العضو: ${app.character_name}`)
        .setDescription(`الاسم: **${app.character_name}**\nالمستوى: **${app.character_level}**\nCP: **${app.combat_power?.toLocaleString()}**`)
        .setThumbnail(app.profile_image)
        .setFooter({ text: `App ID: ${app.id}` });

      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`alliance:manage_update:${app.id}`)
          .setLabel("تحديث البطاقة")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`alliance:manage_remove:${app.id}`)
          .setLabel("حذف عضو")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger)
      );

      await i.update({ embeds: [embed], components: [row, buttonsRow] });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
