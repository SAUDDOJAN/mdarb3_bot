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
      await interaction.editReply({ content: "❌ Cannot find your profile." });
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
      content: "✅ **Protocol accepted. Welcome to the Alliance.**",
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
            .setTitle("❌ تم رفض الانضمام")
            .setDescription("تم رفض الانضمام لعدم الموافقة على بروتوكولات الحلف.")
        ]
      }).catch(() => {});

      // Kick member
      await member.kick("رفض الموافقة على القوانين").catch(err => {
        console.error("[Gatekeeper] Failed to kick member:", err.message);
      });
    }

    // Acknowledge interaction without keeping the user thinking (since they are kicked)
    await interaction.reply({ content: "تم تنفيذ الإجراء.", flags: 64 }).catch(() => {});
  }
}


