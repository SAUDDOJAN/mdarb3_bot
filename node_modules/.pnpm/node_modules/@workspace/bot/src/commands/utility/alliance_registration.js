import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("alliance-registration")
    .setDescription("التسجيل للانضمام إلى التحالف"),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId(`alliance:modal`)
      .setTitle("طلب الانضمام إلى التحالف");

    const urlInput = new TextInputBuilder()
      .setCustomId("shugo_url")
      .setLabel("رابط ملفك على Shugo.gg")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://shugo.gg/character?id=...&server=...")
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(300);

    modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
    await interaction.showModal(modal);
  },
};
