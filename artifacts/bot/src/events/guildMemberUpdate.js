import { EmbedBuilder } from "discord.js";

const SAGE_GUILD_ID = "1507696012410749030";
const VISITOR_ROLE_ID = "1508443474960060487";
const DOC_CHANNEL_ID = "1508489408251171080";
const RULES_LINK = "https://discord.com/channels/1507696012410749030/1507701269035225188";

export default {
  name: "guildMemberUpdate",
  once: false,
  async execute(oldMember, newMember) {
    // ── 1. Isolation Protocol ──────────────────────────────────────────────────
    if (newMember.guild.id !== SAGE_GUILD_ID) return;

    // ── 2. Detect Onboarding / Rules Completion ────────────────────────────────
    // When a member passes the membership screening or onboarding, pending becomes false
    if (oldMember.pending === true && newMember.pending === false) {
      try {

        // 2.2 Send Documentation Embed to Triage Channel
        const docChannel = newMember.guild.channels.cache.get(DOC_CHANNEL_ID) 
          ?? await newMember.guild.channels.fetch(DOC_CHANNEL_ID).catch(() => null);

        if (docChannel) {
          const docEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle("📄 تقرير دخول جديد صامت")
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: "👤 العضو", value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
              { name: "📅 تاريخ إنشاء الحساب", value: `<t:${Math.floor(newMember.user.createdTimestamp / 1000)}:R>`, inline: true },
              { name: "📥 وقت الدخول", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false }
            )
            .setFooter({ text: `User ID: ${newMember.id} | ملاحظة: إجابات الأونبوردنج غير متاحة برمجياً عبر ديسكورد.` })
            .setTimestamp();

          await docChannel.send({ embeds: [docEmbed] });
        }

        // 2.3 Send Formal Welcome DM
        const welcomeEmbed = new EmbedBuilder()
          .setColor(0xd4af37)
          .setTitle("🛡️ مرحباً بك في تحالف Siege Alliance")
          .setDescription(
            `أهلاً بك **${newMember.user.username}** في سيرفر القيادة والعمليات.\n\n` +
            `تم منحك صلاحية الوصول المبدئية (زائر). يُرجى قراءة القوانين والتعليمات لتجنب المخالفات، حيث نطبق سياسة **Zero Tolerance** لأي مشادات علنية.\n\n` +
            `**[ 🔗 اضغط هنا لقراءة القوانين والتعليمات الميدانية ](${RULES_LINK})**`
          )
          .setFooter({ text: "إدارة تحالف Siege Alliance" })
          .setTimestamp();

        await newMember.send({ embeds: [welcomeEmbed] }).catch(() => {
          console.warn(`[SageOnboarding] Could not DM user ${newMember.id} (DMs might be closed).`);
        });

        console.log(`[SageOnboarding] Processed silent entry for ${newMember.user.tag}.`);
      } catch (error) {
        console.error("[SageOnboarding] Error during triage:", error);
      }
    }

    // ── 3. Throne and Liberty Member Count Sync ────────────────────────────────
    if (newMember.guild.id === "861355983975874601") {
      const TL_MEMBER_ROLE_ID = "1292754458492796982";
      const hadRole = oldMember.roles.cache.has(TL_MEMBER_ROLE_ID);
      const hasRole = newMember.roles.cache.has(TL_MEMBER_ROLE_ID);

      if (hadRole !== hasRole) {
        try {
          const { updateTLMemberCount } = await import("../modules/throneliberty.js");
          await updateTLMemberCount(newMember.client);
        } catch (err) {
          console.error("[TL] Error triggering count update from guildMemberUpdate:", err);
        }
      }
    }
  },
};
