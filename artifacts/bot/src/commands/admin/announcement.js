import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder 
} from "discord.js";

const PRESETS = {
  aion2_registration: {
    content: "<@&1551161877017403412>",
    allowedMentions: {
      roles: ["1551161877017403412"],
      users: [],
      parse: []
    },
    createEmbed: () => new EmbedBuilder()
      .setColor(0xD4AF37)
      .setTitle("🪽 تحديث مهم لأعضاء AION 2")
      .setDescription([
        "تم اعتماد نظام التسجيل الجديد لأعضاء AION 2، ونحتاج من جميع الأعضاء تحديث تسجيلهم من خلال النموذج الجديد.",
        "",
        "⚠️ **التسجيل الجديد إلزامي**",
        "حتى لو كنت مسجل معنا في النظام السابق، لازم تسجل من جديد حتى يتم اعتماد بياناتك في النظام الحالي واستمرار استخدامك للأنظمة والأقسام المخصصة لك.",
        "",
        "🎮 **استخدم شخصيتك الأساسية**",
        "عند التسجيل، استخدم شخصيتك الأساسية اللي تلعب عليها فعليًا **Main Character**.",
        "",
        "إذا عندك شخصيات إضافية **Alt**، لا تستخدمها في التسجيل.",
        "نحتاج الشخصية الأساسية لكل لاعب حتى تكون بيانات العضو والقيلد صحيحة.",
        "",
        "🔗 **التسجيل الجديد**",
        "https://discord.com/channels/861355983975874601/1555583094898303026",
        "",
        "❤️ التسجيل ما ياخذ وقت، وتحديث بياناتك ضروري لاستمرارك معنا واستخدام الأنظمة المرتبطة بعضويتك."
      ].join("\n"))
      .setFooter({ text: "M3RGEEN • جيش المعرقين" })
  }
};

export const data = new SlashCommandBuilder()
  .setName("announcement")
  .setDescription("إرسال إعلان رسمي في القناة الحالية (للإدارة فقط)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option =>
    option
      .setName("type")
      .setDescription("نوع الإعلان")
      .setRequired(true)
      .addChoices(
        { name: "تسجيل AION 2 (aion2_registration)", value: "aion2_registration" }
      )
  );

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (deferErr) {
    console.error("[announcement] Failed to deferReply:", deferErr);
    return;
  }

  try {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: "❌ لا تملك صلاحية لاستخدام هذا الأمر." });
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return interaction.editReply({ content: "❌ لا يمكن إرسال الإعلان في هذا النوع من القنوات." });
    }

    const type = interaction.options.getString("type");
    const preset = PRESETS[type];

    if (!preset) {
      return interaction.editReply({ content: "❌ نوع الإعلان غير مدعوم." });
    }

    const embed = preset.createEmbed();
    const sendPayload = { embeds: [embed] };
    if (preset.content) {
      sendPayload.content = preset.content;
    }
    if (preset.allowedMentions) {
      sendPayload.allowedMentions = preset.allowedMentions;
    }

    await channel.send(sendPayload);
    return interaction.editReply({ content: `✅ تم إرسال الإعلان بنجاح في القناة: <#${channel.id}>` });
  } catch (err) {
    console.error("[announcement] Error executing command:", err);
    return interaction.editReply({ 
      content: "❌ تعذر إرسال الإعلان. يرجى التأكد من صلاحيات البوت (Send Messages و Embed Links) في هذا الروم." 
    });
  }
}

export default {
  data,
  execute
};
