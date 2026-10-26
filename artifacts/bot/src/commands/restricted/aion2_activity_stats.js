import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder 
} from "discord.js";
import { query } from "../../database/index.js";
import { buildInactiveView, buildMembersView, getAion2RoleMemberIds } from "../../modules/aion2Lfg/admin/pagination.js";

const AION2_MEMBER_ROLE_ID = "1401376073077231702";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_activity_stats")
    .setDescription("عرض إحصائيات استخدام ونشاط نظام LFG (إداري)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => 
      option.setName("view")
        .setDescription("نوع العرض المطلوب")
        .setRequired(false)
        .addChoices(
          { name: "ملخص عام (summary)", value: "summary" },
          { name: "الأعضاء غير النشطين (inactive)", value: "inactive" },
          { name: "قائمة كل الأعضاء (members)", value: "members" }
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (e) {
      console.error("[aion2_activity_stats] Failed to deferReply:", e);
      return;
    }

    try {
      if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply({ content: "❌ عذراً، هذا الأمر مخصص للإدارة العليا فقط." });
      }

      const view = interaction.options.getString("view") || "summary";

      // 1. Fetch Discord Guild Members with AION 2 Member Role safely via cache/snapshot
      const guild = await interaction.client.guilds.fetch(interaction.guildId || process.env.MAIN_GUILD_ID || "861355983975874601");
      const roleUserIds = await getAion2RoleMemberIds(guild);

      // 2. Fetch all Dungeon Member Participation Statistics
      const memberStatsRes = await query(`
        SELECT 
          m.discord_id,
          COUNT(DISTINCT m.group_id)::INT AS total_dungeons,
          COUNT(DISTINCT m.group_id) FILTER (WHERE g.state = 'COMPLETED')::INT AS completed_dungeons,
          COUNT(DISTINCT m.group_id) FILTER (WHERE g.state IN ('FAILED', 'EXPIRED', 'CANCELLED'))::INT AS unsuccessful_dungeons,
          COUNT(DISTINCT m.group_id) FILTER (WHERE g.state NOT IN ('COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED'))::INT AS active_dungeons
        FROM aion2_lfg_members m
        JOIN aion2_lfg_groups g ON m.group_id = g.id
        WHERE g.activity_type = 'DUNGEON' AND m.is_official_lineup = TRUE
        GROUP BY m.discord_id
      `);

      const memberStatsMap = new Map();
      memberStatsRes.rows.forEach(r => {
        memberStatsMap.set(r.discord_id, r);
      });

      // ──────────────────────────────────────────────
      // VIEW: SUMMARY
      // ──────────────────────────────────────────────
      if (view === "summary") {
        // Group-level statistics
        const groupStatsRes = await query(`
          SELECT 
            COUNT(*)::INT AS total_groups,
            COUNT(*) FILTER (WHERE state = 'COMPLETED')::INT AS completed_groups,
            COUNT(*) FILTER (WHERE state IN ('FAILED', 'EXPIRED', 'CANCELLED'))::INT AS unsuccessful_groups,
            COUNT(*) FILTER (WHERE state NOT IN ('COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED'))::INT AS active_groups
          FROM aion2_lfg_groups
          WHERE activity_type = 'DUNGEON'
        `);

        const gStats = groupStatsRes.rows[0] || { total_groups: 0, completed_groups: 0, unsuccessful_groups: 0, active_groups: 0 };
        const finishedGroups = gStats.completed_groups + gStats.unsuccessful_groups;
        const groupCompletionPct = finishedGroups > 0 ? Math.round((gStats.completed_groups / finishedGroups) * 100) : 0;

        // Role member participation counts
        const roleUsedCount = roleUserIds.filter(id => {
          const stats = memberStatsMap.get(id);
          return stats && stats.total_dungeons > 0;
        }).length;
        const roleZeroCount = roleUserIds.length - roleUsedCount;

        // Unique member participation overall
        const allParticipantsCount = memberStatsMap.size;
        const allCompletedCount = Array.from(memberStatsMap.values()).filter(s => s.completed_dungeons > 0).length;
        const allZeroCompletedCount = Array.from(memberStatsMap.values()).filter(s => s.completed_dungeons === 0).length;

        // Top 10 Dungeon Completions
        const top10 = Array.from(memberStatsMap.values())
          .filter(s => s.completed_dungeons > 0)
          .sort((a, b) => b.completed_dungeons - a.completed_dungeons || a.discord_id.localeCompare(b.discord_id))
          .slice(0, 10);

        let top10Text = "";
        if (top10.length === 0) {
          top10Text = "لا يوجد أعضاء أكملوا أي دنجن حتى الآن.\n";
        } else {
          top10.forEach((s, idx) => {
            const finished = s.completed_dungeons + s.unsuccessful_dungeons;
            const pct = finished > 0 ? Math.round((s.completed_dungeons / finished) * 100) : 0;
            top10Text += `**${idx + 1}.** <@${s.discord_id}>\n` +
                         `   مكتمل: \`${s.completed_dungeons}\` | غير مكتمل: \`${s.unsuccessful_dungeons}\` | الإجمالي: \`${s.total_dungeons}\` | النسبة: \`${pct}%\`\n`;
          });
        }

        const summaryEmbed = new EmbedBuilder()
          .setTitle("📊 إحصائيات نشاط الجيلد (نظام الدنجنز)")
          .setColor(0x00d0ff)
          .setDescription(
            `👥 **حالة أعضاء رتبة AION 2 Member:**\n` +
            `- إجمالي الأعضاء الحاليين في الرتبة: \`${roleUserIds.length}\`\n` +
            `- الأعضاء الذين استخدموا نظام الدنجنز: \`${roleUsedCount}\`\n` +
            `- الأعضاء بدون أي مشاركة في الدنجنز: \`${roleZeroCount}\`\n\n` +
            `⚔️ **إحصائيات مجموعات الدنجنز:**\n` +
            `- إجمالي المجموعات المنشأة: \`${gStats.total_groups}\`\n` +
            `- المجموعات المكتملة بنجاح: \`${gStats.completed_groups}\`\n` +
            `- المجموعات المنتهية غير المكتملة: \`${gStats.unsuccessful_groups}\`\n` +
            `- المجموعات الجارية حالياً: \`${gStats.active_groups}\`\n` +
            `- نسبة الإنجاز: \`${finishedGroups > 0 ? `${groupCompletionPct}%` : "0%"}\`\n\n` +
            `👤 **ملخص مشاركة الأعضاء الفريدة:**\n` +
            `- إجمالي الأعضاء الذين شاركوا في دنجن واحد على الأقل: \`${allParticipantsCount}\`\n` +
            `- إجمالي الأعضاء الذين أكملوا دنجن واحد على الأقل: \`${allCompletedCount}\`\n` +
            `- أعضاء شاركوا ولكن بنسبة إكمال 0 (لم يكملوا أي دنجن): \`${allZeroCompletedCount}\`\n` +
            `- أعضاء رتبة AION 2 بدون أي مشاركة إطلاقاً: \`${roleZeroCount}\`\n\n` +
            `🏆 **أكثر 10 أعضاء إكمالاً للدنجنز:**\n` +
            top10Text
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [summaryEmbed] });
      }

      // ──────────────────────────────────────────────
      // VIEW: INACTIVE
      // ──────────────────────────────────────────────
      if (view === "inactive") {
        const data = await buildInactiveView(guild, 0, interaction.user.id);
        return interaction.editReply({ embeds: [data.embed], components: data.components });
      }

      // ──────────────────────────────────────────────
      // VIEW: MEMBERS
      // ──────────────────────────────────────────────
      if (view === "members") {
        const data = await buildMembersView(guild, 0, interaction.user.id);
        return interaction.editReply({ embeds: [data.embed], components: data.components });
      }

    } catch (err) {
      console.error("[aion2_activity_stats] Error executing command:", err);
      return interaction.editReply({ content: "❌ حدث خطأ أثناء جلب إحصائيات النشاط: " + err.message });
    }
  }
};
