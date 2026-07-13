import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("tl_alert")
  .setDescription("إرسال تنبيه مخصص لروم إشعارات Throne and Liberty")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  // Create the modal
  const modal = new ModalBuilder()
    .setCustomId("tl:alert_modal")
    .setTitle("إرسال تنبيه Throne and Liberty");

  // Create text input components
  const titleInput = new TextInputBuilder()
    .setCustomId("alertTitle")
    .setLabel("عنوان التنبيه")
    .setPlaceholder("مثال: تجميع لقتل زعيم الأرك")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const messageInput = new TextInputBuilder()
    .setCustomId("alertMessage")
    .setLabel("نص التنبيه")
    .setPlaceholder("مثال: تعالوا روم الصوت الآن، التجميع في المدينة...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  // Add inputs to action rows
  const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
  const secondActionRow = new ActionRowBuilder().addComponents(messageInput);

  // Add action rows to modal
  modal.addComponents(firstActionRow, secondActionRow);

  // Show the modal to the user
  await interaction.showModal(modal);
}
