import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from "discord.js";

const SAGE_GUILD_ID = "1507696012410749030";
const VERIFICATION_ROLE_ID = "1508444579488075868";
const RECRUIT_ROLE_ID = "1508443474960060487";

export async function handleGatekeeperButton(interaction) {
  if (interaction.guildId !== SAGE_GUILD_ID) return;

  const { customId } = interaction;

  if (customId === "sage_gate_agree") {
    await interaction.deferReply({ flags: 64 });
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: "❌ تعذر العثور على ملفك الشخصي في السيرفر." });
      return;
    }

    // 1. Swap roles
    try {
      await member.roles.remove(VERIFICATION_ROLE_ID).catch(() => {});
      await member.roles.add(RECRUIT_ROLE_ID).catch(() => {});
    } catch (err) {
      console.error("[Gatekeeper] Failed to update roles:", err.message);
    }

    // 2. Ephemeral welcome
    await interaction.editReply({
      content: "✅ **تم قبول البروتوكول والموافقة على الشروط بنجاح. أهلاً بك في تحالف الحصارات!**",
    });
  } else if (customId === "sage_gate_reject") {
    // Reject & Kick
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member) {
      // Send DM first
      await member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("❌ تم رفض الانضمام للتحالف")
            .setDescription("تم استبعادك من السيرفر نظراً لعدم الموافقة على بروتوكولات وشروط تحالف الحصارات.")
            .setFooter({ text: "تحالف الحصارات • Siege Alliance" })
            .setTimestamp()
        ]
      }).catch(() => {});

      // Kick member
      await member.kick("رفض الموافقة على شروط وبروتوكولات التحالف").catch(err => {
        console.error("[Gatekeeper] Failed to kick member:", err.message);
      });
    }

    // Acknowledge interaction
    await interaction.reply({ content: "تم تنفيذ الإجراء واستبعاد الحساب.", flags: 64 }).catch(() => {});
  }
}
