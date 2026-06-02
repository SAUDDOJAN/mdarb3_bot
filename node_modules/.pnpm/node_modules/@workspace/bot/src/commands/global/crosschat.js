import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { saveSyncedChannel, removeSyncedChannel } from "../../database/radar.js";

const SAGE_GUILD_ID = "1507696012410749030";

export default {
  data: new SlashCommandBuilder()
    .setName("crosschat")
    .setDescription("ربط وإدارة الشات الموحد للتحالف (Crosschat) في هذا السيرفر.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Requires Administrator globally
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("تفعيل الشات الموحد في هذا الروم، وربطه بروم التحالف الرسمي.")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("الروم الذي سيتم إرسال واستقبال رسائل التحالف فيه.")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("إلغاء تفعيل الشات الموحد وفك الربط من هذا السيرفر.")
    ),

  async execute(interaction, client) {
    // 1. First condition: Must have Administrator (already handled by defaultMemberPermissions)
    
    // 2. Second condition: Must be a member of the Sage Server
    let isSageMember = false;
    try {
      const sageGuild = client.guilds.cache.get(SAGE_GUILD_ID);
      if (sageGuild) {
        // Fetch the user from the Sage guild to see if they are a member
        const memberInSage = await sageGuild.members.fetch(interaction.user.id);
        if (memberInSage) isSageMember = true;
      } else {
        // If the bot isn't caching the guild properly, we can't verify, but this shouldn't happen
        console.warn("[Crosschat] Sage Guild not found in cache!");
      }
    } catch (err) {
      // Fetch will throw an error if the user is not found in the guild (Unknown Member)
      isSageMember = false;
    }

    if (!isSageMember) {
      return interaction.reply({
        content: "❌ **عذراً!** لا يمكنك ربط الشات.\nلتثبيت وتفعيل الشات الموحد في سيرفرك، يجب أن تمتلك صلاحيات `Administrator` هنا، **وأن تكون عضواً متواجداً في سيرفر سيج (Sage Alliance)**.",
        ephemeral: true,
      });
    }

    // 3. Process the subcommand
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "enable") {
      const targetChannel = interaction.options.getChannel("channel");

      // Verify it's a text channel
      if (!targetChannel.isTextBased()) {
        return interaction.reply({
          content: "❌ يجب اختيار روم كتابي صالح.",
          ephemeral: true,
        });
      }

      saveSyncedChannel(interaction.guild.id, targetChannel.id);

      return interaction.reply({
        content: `✅ **تم ربط السيرفر بنجاح!**\nالآن أي رسالة تُكتب في ${targetChannel} سيتم إرسالها لروم التحالف الرسمي، والرسائل من التحالف ستصل هنا.`,
        ephemeral: true,
      });
    }

    if (subcommand === "disable") {
      const removed = removeSyncedChannel(interaction.guild.id);

      if (removed) {
        return interaction.reply({
          content: "✅ **تم إلغاء الربط بنجاح.** لن يتم استقبال أو إرسال رسائل التحالف من هذا السيرفر بعد الآن.",
          ephemeral: true,
        });
      } else {
        return interaction.reply({
          content: "⚠️ **هذا السيرفر غير مربوط أصلاً بالشات الموحد.**",
          ephemeral: true,
        });
      }
    }
  },
};
