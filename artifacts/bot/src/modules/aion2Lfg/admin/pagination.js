import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  PermissionFlagsBits 
} from "discord.js";
import { query } from "../../../database/index.js";
import { getCurrentMonthlyCycle } from "../utils/timeCycles.js";

const AION2_MEMBER_ROLE_ID = "1401376073077231702";
const INACTIVE_PER_PAGE = 25;
const MEMBERS_PER_PAGE = 15;
const POINTS_PER_PAGE = 20;

export function buildPaginationRow(viewType, page, totalPages, invokerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aion2_page:${viewType}:${page - 1}:${invokerId}`)
      .setLabel("◀️ السابق")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`aion2_page:${viewType}:${page + 1}:${invokerId}`)
      .setLabel("التالي ▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

let cachedRoleUserIds = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getAion2RoleMemberIds(guild) {
  const now = Date.now();

  // 1. If we have a fresh snapshot (< 5 minutes old), reuse it directly
  if (cachedRoleUserIds && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedRoleUserIds;
  }

  // 2. Derive role members from Discord.js guild.members.cache
  // The bot has GatewayIntentBits.GuildMembers enabled and populates cache on startup
  const cachedMembers = Array.from(guild.members.cache.values())
    .filter(m => m.roles?.cache?.has(AION2_MEMBER_ROLE_ID) && !m.user?.bot);

  if (cachedMembers.length > 0) {
    cachedRoleUserIds = cachedMembers.map(m => m.id);
    lastCacheTime = now;
    return cachedRoleUserIds;
  }

  // 3. Fallback: only if cache has 0 members, attempt single safe fetch with catch for opcode-8 rate limit
  try {
    await guild.members.fetch();
    const fetched = Array.from(guild.members.cache.values())
      .filter(m => m.roles?.cache?.has(AION2_MEMBER_ROLE_ID) && !m.user?.bot);
    cachedRoleUserIds = fetched.map(m => m.id);
    lastCacheTime = now;
    return cachedRoleUserIds;
  } catch (err) {
    console.warn("[ActivityStats] guild.members.fetch rate-limited or failed, falling back to cache:", err.message);
    if (cachedRoleUserIds) return cachedRoleUserIds;
    return Array.from(guild.members.cache.values())
      .filter(m => m.roles?.cache?.has(AION2_MEMBER_ROLE_ID) && !m.user?.bot)
      .map(m => m.id);
  }
}

export async function buildInactiveView(guild, pageIndex, invokerId) {
  const roleUserIds = await getAion2RoleMemberIds(guild);

  const memberStatsRes = await query(`
    SELECT DISTINCT m.discord_id
    FROM aion2_lfg_members m
    JOIN aion2_lfg_groups g ON m.group_id = g.id
    WHERE g.activity_type = 'DUNGEON' AND m.is_official_lineup = TRUE
  `);
  const activeSet = new Set(memberStatsRes.rows.map(r => r.discord_id));

  const inactiveDiscordIds = roleUserIds.filter(id => !activeSet.has(id));

  if (inactiveDiscordIds.length === 0) {
    const allActiveEmbed = new EmbedBuilder()
      .setTitle("💤 الأعضاء غير النشطين في نظام الدنجنز")
      .setColor(0x2ecc71)
      .setDescription("🎉 جميع أعضاء رتبة AION 2 Member شاركوا في نظام الدنجنز على الأقل مرة واحدة!")
      .setTimestamp();
    return { embed: allActiveEmbed, page: 0, totalPages: 1, components: [] };
  }

  const totalPages = Math.max(1, Math.ceil(inactiveDiscordIds.length / INACTIVE_PER_PAGE));
  const page = Math.max(0, Math.min(pageIndex, totalPages - 1));

  const chunk = inactiveDiscordIds.slice(page * INACTIVE_PER_PAGE, (page + 1) * INACTIVE_PER_PAGE);
  let listText = "";
  chunk.forEach((id, idx) => {
    const num = page * INACTIVE_PER_PAGE + idx + 1;
    listText += `**${num}.** <@${id}> (\`${id}\`)\n`;
  });

  const embed = new EmbedBuilder()
    .setTitle("💤 أعضاء رتبة AION 2 بدون أي مشاركة في الدنجنز")
    .setColor(0xe74c3c)
    .setDescription(
      `**إجمالي الأعضاء غير المشاركين:** \`${inactiveDiscordIds.length}\` من أصل \`${roleUserIds.length}\`\n\n` +
      listText
    )
    .setFooter({ text: `صفحة ${page + 1} من ${totalPages}` })
    .setTimestamp();

  return {
    embed,
    page,
    totalPages,
    components: totalPages > 1 ? [buildPaginationRow('inactive', page, totalPages, invokerId)] : []
  };
}

export async function buildMembersView(guild, pageIndex, invokerId) {
  const roleUserIds = await getAion2RoleMemberIds(guild);

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
  memberStatsRes.rows.forEach(r => memberStatsMap.set(r.discord_id, r));

  const allRoleMemberStats = roleUserIds.map(id => {
    const stats = memberStatsMap.get(id) || {
      discord_id: id,
      total_dungeons: 0,
      completed_dungeons: 0,
      unsuccessful_dungeons: 0,
      active_dungeons: 0
    };
    const finished = stats.completed_dungeons + stats.unsuccessful_dungeons;
    const pct = finished > 0 ? Math.round((stats.completed_dungeons / finished) * 100) : 0;
    return {
      ...stats,
      completion_pct: pct
    };
  });

  allRoleMemberStats.sort((a, b) => 
    b.completed_dungeons - a.completed_dungeons || 
    b.total_dungeons - a.total_dungeons || 
    a.discord_id.localeCompare(b.discord_id)
  );

  if (allRoleMemberStats.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle("👥 إحصائيات نشاط جميع أعضاء رتبة AION 2")
      .setColor(0x00d0ff)
      .setDescription("لا يوجد أعضاء في هذه الرتبة حالياً.")
      .setTimestamp();
    return { embed: emptyEmbed, page: 0, totalPages: 1, components: [] };
  }

  const totalPages = Math.max(1, Math.ceil(allRoleMemberStats.length / MEMBERS_PER_PAGE));
  const page = Math.max(0, Math.min(pageIndex, totalPages - 1));

  const chunk = allRoleMemberStats.slice(page * MEMBERS_PER_PAGE, (page + 1) * MEMBERS_PER_PAGE);
  let listText = "";
  chunk.forEach((s, idx) => {
    const num = page * MEMBERS_PER_PAGE + idx + 1;
    listText += `**${num}.** <@${s.discord_id}>\n` +
                `   مكتمل: \`${s.completed_dungeons}\` | غير مكتمل: \`${s.unsuccessful_dungeons}\` | جاري: \`${s.active_dungeons}\` | الإجمالي: \`${s.total_dungeons}\` | النسبة: \`${s.completion_pct}%\`\n`;
  });

  const embed = new EmbedBuilder()
    .setTitle("👥 إحصائيات نشاط جميع أعضاء رتبة AION 2")
    .setColor(0x00d0ff)
    .setDescription(
      `**إجمالي الأعضاء:** \`${roleUserIds.length}\`\n\n` +
      listText
    )
    .setFooter({ text: `صفحة ${page + 1} من ${totalPages}` })
    .setTimestamp();

  return {
    embed,
    page,
    totalPages,
    components: totalPages > 1 ? [buildPaginationRow('members', page, totalPages, invokerId)] : []
  };
}

const CLASS_EMOJIS = {
  Gladiator:    '<:Gladiator:1504471947831017532>',
  Templar:      '<:Templar:1504472027724255414>',
  Cleric:       '<:Cleric:1504471892755611678>',
  Chanter:      '<:Chanter:1504471867141128272>',
  Ranger:       '<:Ranger:1504471982006341783>',
  Assassin:     '<:Assassin:1504471833695748156>',
  Sorcerer:     '<:Sorcerer:1504472006610124961>',
  Spiritmaster: '<:Elementalist:1504471920219783209>'
};

export async function buildPointsView(pageIndex, invokerId, guildFilter = null) {
  const { cycleId } = getCurrentMonthlyCycle();

  const rankingsRes = await query(`
    SELECT 
      l.discord_id,
      COALESCE(SUM(l.final_points), 0)::INT AS total_points,
      COUNT(l.id)::INT AS completed_dungeons,
      app.character_name,
      app.selected_class,
      app.assigned_guild,
      app.guild_type
    FROM aion2_lfg_ledger l
    LEFT JOIN (
      SELECT DISTINCT ON (discord_id) discord_id, character_name, selected_class, assigned_guild, guild_type
      FROM aion2_global_applications
      WHERE status = 'ACCEPTED'
      ORDER BY discord_id, id DESC
    ) app ON l.discord_id = app.discord_id
    WHERE l.monthly_cycle_id = $1 AND l.final_points > 0
    GROUP BY l.discord_id, app.character_name, app.selected_class, app.assigned_guild, app.guild_type
    ORDER BY total_points DESC, completed_dungeons DESC, l.discord_id ASC
  `, [cycleId]);

  let rankings = rankingsRes.rows;

  if (guildFilter) {
    if (guildFilter === 'M3RGEEN') {
      rankings = rankings.filter(r => r.assigned_guild !== 'EMPEROR' && r.guild_type !== 'EARLY_ACCESS');
    } else if (guildFilter === 'EMPEROR') {
      rankings = rankings.filter(r => r.assigned_guild === 'EMPEROR' || r.guild_type === 'EARLY_ACCESS');
    }
  }

  const playersCount = rankings.length;
  const totalPoints = rankings.reduce((acc, r) => acc + (r.total_points || 0), 0);
  const totalDungeons = rankings.reduce((acc, r) => acc + (r.completed_dungeons || 0), 0);

  if (rankings.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle("🏆 لوحة صدارة نقاط الدنجنات | AION 2")
      .setColor(0x2f3136)
      .setDescription(
        `> لا توجد نقاط مسجلة بعد في الدورة الحالية (\`${cycleId}\`).\n\n` +
        `💡 تظهر النقاط للاعبين الذين أكملوا الدناجن وتأهلوا عبر نظام التصويت المعتمد.`
      )
      .setFooter({ text: "مجتمع M3RGEEN • نظام مكافآت الدنجنات" })
      .setTimestamp();
    return { embed: emptyEmbed, page: 0, totalPages: 1, components: [] };
  }

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(rankings.length / pageSize));
  const page = Math.max(0, Math.min(pageIndex, totalPages - 1));

  const chunk = rankings.slice(page * pageSize, (page + 1) * pageSize);
  const medals = ['🥇', '🥈', '🥉'];

  const lines = chunk.map((row, idx) => {
    const globalRank = page * pageSize + idx + 1;
    const rankBadge = globalRank <= 3 ? medals[globalRank - 1] : `\`#${globalRank.toString().padStart(2, '0')}\``;

    let guildBadge = '🪽 **معرقين**';
    if (row.assigned_guild === 'EMPEROR' || row.guild_type === 'EARLY_ACCESS') {
      guildBadge = '👑 **امبرور**';
    }

    const classEmoji = CLASS_EMOJIS[row.selected_class] || '⚔️';
    const charName = row.character_name ? `**${row.character_name}**` : `<@${row.discord_id}>`;
    const userMention = row.character_name ? ` (<@${row.discord_id}>)` : '';

    return `${rankBadge} ${charName}${userMention} — ${classEmoji}\n` +
           `┗ 🎖️ **${row.total_points}** نقطة  •  🏰 **${row.completed_dungeons}** دنجن  •  ${guildBadge}`;
  });

  const pageEmbed = new EmbedBuilder()
    .setTitle("🏆 لوحة صدارة نقاط الدنجنات | AION 2 Leaderboard")
    .setColor(0xf1c40f)
    .setDescription(
      `> 📊 **إحصائيات الدورة الحالية (\`${cycleId}\`):**\n` +
      `👥 **اللاعبين الحاصلين على نقاط:** \`${playersCount}\` لاعب\n` +
      `🎖️ **إجمالي النقاط المكتسبة:** \`${totalPoints}\` نقطة\n` +
      `🏰 **إجمالي الدناجن المكتملة:** \`${totalDungeons}\` دنجن\n` +
      `───────────────────────────────\n\n` +
      lines.join('\n\n')
    )
    .setFooter({ 
      text: `صفحة ${page + 1} من ${totalPages} • مجتمع M3RGEEN & EMPEROR`,
      iconURL: "https://cdn.discordapp.com/icons/861355983975874601/4bde8b28e28b5514360a88063424e48c.webp"
    })
    .setTimestamp();

  return {
    embed: pageEmbed,
    page,
    totalPages,
    components: totalPages > 1 ? [buildPaginationRow('points', page, totalPages, invokerId)] : []
  };
}

export async function handleAion2Pagination(interaction) {
  const parts = interaction.customId.split(":");
  const viewType = parts[1];
  const targetPage = parseInt(parts[2], 10);
  const invokerId = parts[3];

  // Security: only the exact invoking Administrator can paginate
  if (interaction.user.id !== invokerId) {
    return interaction.reply({
      content: "❌ عذراً، فقط المسؤول الذي طلب التقرير يمكنه استخدام أزرار التنقل.",
      flags: 64
    });
  }

  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ عذراً، هذا الإجراء مخصص للإدارة العليا فقط.",
      flags: 64
    });
  }

  try {
    const guild = await interaction.client.guilds.fetch(interaction.guildId || process.env.MAIN_GUILD_ID || "861355983975874601");

    if (viewType === 'inactive') {
      const data = await buildInactiveView(guild, targetPage, invokerId);
      return interaction.update({ embeds: [data.embed], components: data.components });
    } else if (viewType === 'members') {
      const data = await buildMembersView(guild, targetPage, invokerId);
      return interaction.update({ embeds: [data.embed], components: data.components });
    } else if (viewType === 'points') {
      const data = await buildPointsView(targetPage, invokerId);
      return interaction.update({ embeds: [data.embed], components: data.components });
    }
  } catch (err) {
    console.error("[handleAion2Pagination] Error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ حدث خطأ أثناء تصفح التقرير: " + err.message, flags: 64 });
    }
  }
}
