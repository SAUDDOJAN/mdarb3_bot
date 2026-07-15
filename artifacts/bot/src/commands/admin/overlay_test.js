import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { publishOverlayEvent } from "../../database/index.js";

export const data = new SlashCommandBuilder()
  .setName("overlay_test")
  .setDescription("إرسال جميع أنواع الأحداث لتجربة تطبيق الـ Overlay (مسؤول)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  await interaction.reply({ content: "⏳ جاري إرسال جميع الأحداث بالترتيب... راقب شاشة الـ Overlay! 🚀", ephemeral: true });

  const events = [
    { type: "Field Boss", name: "زعيم تجريبي (Field Boss)" },
    { type: "Arch Boss", name: "أرك بوس تجريبي (Arch Boss)" },
    { type: "Dynamic Event", name: "فعالية تجريبية (Dynamic Event)" },
    { type: "Gigantrite", name: "حوت تجريبي (Gigantrite)" },
    { type: "Guild Raid", name: "ريد قيلد تجريبي (Guild Raid)" },
    { type: "Tax Delivery", name: "ضريبة تجريبية (Tax Delivery)" },
    { type: "Castle Siege", name: "حصار تجريبي (Castle Siege)" }
  ];

  for (const ev of events) {
    await publishOverlayEvent(ev.type, ev.name, null, 15);
    // الانتظار لمدة 5 ثواني
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
