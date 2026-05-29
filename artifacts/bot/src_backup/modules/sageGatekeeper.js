import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from "discord.js";

const SAGE_GUILD_ID = "1507696012410749030";
const VERIFICATION_ROLE_ID = "1508444579488075868";
const RECRUIT_ROLE_ID = "1508443474960060487";

export async function handleGatekeeperButton(interaction) {
  if (interaction.guildId !== SAGE_GUILD_ID) return;

  const { customId } = interaction;

  if (customId === "sage_gate_agree") {
    // Show Modal
    const modal = new ModalBuilder()
      .setCustomId("sage_gate_modal")
      .setTitle("إقرار التزام | Protocol Agreement");

    const input = new TextInputBuilder()
      .setCustomId("gate_agree_input")
      .setLabel("اكتب 'أوافق' أو 'Agree' للتأكيد:")
      .setPlaceholder("أقر بقراءة القوانين وأتعهد بالالتزام | I agree...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
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

export async function handleGatekeeperModal(interaction) {
  if (interaction.guildId !== SAGE_GUILD_ID) return;
  if (interaction.customId !== "sage_gate_modal") return;

  await interaction.deferReply({ flags: 64 });

  const inputVal = interaction.fields.getTextInputValue("gate_agree_input").trim().toLowerCase();
  
  // Accept standard words
  const validAnswers = ["موافق", "نعم", "yes", "أوافق", "اوافق", "agree", "i agree"];

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: "❌ تعذر العثور على ملفك في السيرفر." });
    return;
  }

  if (validAnswers.includes(inputVal)) {
    // 1. Swap roles
    try {
      await member.roles.remove(VERIFICATION_ROLE_ID).catch(() => {});
      await member.roles.add(RECRUIT_ROLE_ID).catch(() => {});
    } catch (err) {
      console.error("[Gatekeeper] Failed to update roles:", err.message);
    }

    // 2. Ephemeral welcome
    await interaction.editReply({
      content: "✅ **تم توثيق التزامك. أهلاً بك في الميدان.**",
    });
  } else {
    // Failed declaration -> Kick
    await interaction.editReply({ content: "❌ الإقرار غير صحيح. سيتم اتخاذ الإجراء اللازم." });
    
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ تم رفض الانضمام")
          .setDescription("تم رفض الانضمام لعدم إدخال الإقرار الصحيح بقوانين الحلف.")
      ]
    }).catch(() => {});

    await member.kick("إدخال إقرار خاطئ للقوانين").catch(err => {
      console.error("[Gatekeeper] Failed to kick member:", err.message);
    });
  }
}
