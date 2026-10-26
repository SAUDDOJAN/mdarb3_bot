import { 
  SlashCommandBuilder, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { query } from "../../database/index.js";
import { getCurrentMonthlyCycle } from "../../modules/aion2Lfg/utils/timeCycles.js";

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

const ITEMS_PER_PAGE = 15;

export async function fetchDungeonPointsData(guildFilter = 'ALL') {
  const { cycleId } = getCurrentMonthlyCycle();

  const res = await query(`
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

  let rows = res.rows;
  if (guildFilter === 'M3RGEEN') {
    rows = rows.filter(r => r.assigned_guild !== 'EMPEROR' && r.guild_type !== 'EARLY_ACCESS');
  } else if (guildFilter === 'EMPEROR') {
    rows = rows.filter(r => r.assigned_guild === 'EMPEROR' || r.guild_type === 'EARLY_ACCESS');
  }

  return {
    cycleId,
    rows,
    totalPlayers: rows.length,
    totalPoints: rows.reduce((sum, r) => sum + r.total_points, 0),
    totalDungeons: rows.reduce((sum, r) => sum + r.completed_dungeons, 0)
  };
}

export function renderDungeonPointsEmbed(data, pageIndex = 0, guildFilter = 'ALL') {
  const { cycleId, rows, totalPlayers, totalPoints, totalDungeons } = data;

  let guildTitleSuffix = "";
  if (guildFilter === 'M3RGEEN') guildTitleSuffix = " — قيلد معرقين 🪽";
  else if (guildFilter === 'EMPEROR') guildTitleSuffix = " — قيلد امبرور 👑";

  if (rows.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle(`🏆 لوحة نقاط الدنجنات | AION 2${guildTitleSuffix}`)
      .setColor(0x2f3136)
      .setDescription(
        `> لا توجد نقاط مسجلة بعد في الدورة الحالية (\`${cycleId}\`).\n\n` +
        `💡 تظهر النقاط للاعبين الذين أكملوا الدناجن وتأهلوا عبر نظام التصويت المعتمد.`
      )
      .setFooter({ 
        text: "M3RGEEN Community • نظام نقاط الدنجنات",
        iconURL: "https://cdn.discordapp.com/icons/861355983975874601/4bde8b28e28b5514360a88063424e48c.webp"
      })
      .setTimestamp();
    return { embed: emptyEmbed, totalPages: 1, page: 0 };
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const page = Math.max(0, Math.min(pageIndex, totalPages - 1));
  const chunk = rows.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const medals = ['🥇', '🥈', '🥉'];
  const formattedList = chunk.map((row, idx) => {
    const rank = page * ITEMS_PER_PAGE + idx + 1;
    const rankBadge = rank <= 3 ? medals[rank - 1] : `\`#${rank.toString().padStart(2, '0')}\``;

    let guildBadge = '🪽 **معرقين**';
    if (row.assigned_guild === 'EMPEROR' || row.guild_type === 'EARLY_ACCESS') {
      guildBadge = '👑 **امبرور**';
    }

    const classEmoji = CLASS_EMOJIS[row.selected_class] || '⚔️';
    const charName = row.character_name ? `**${row.character_name}**` : `<@${row.discord_id}>`;
    const userMention = row.character_name ? ` (<@${row.discord_id}>)` : '';

    return `${rankBadge} ${charName}${userMention} — ${classEmoji}\n` +
           `┗ 🎖️ **${row.total_points}** نقطة  •  🏰 **${row.completed_dungeons}** دنجن  •  ${guildBadge}`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle(`🏆 لوحة صدارة نقاط الدنجنات | AION 2${guildTitleSuffix}`)
    .setColor(guildFilter === 'EMPEROR' ? 0xf1c40f : 0x00d0ff)
    .setDescription(
      `> 📊 **إحصائيات الدورة الشهرية (\`${cycleId}\`):**\n` +
      `👥 **اللاعبين الحاصلين على نقاط:** \`${totalPlayers}\` لاعب\n` +
      `🎖️ **مجموع النقاط:** \`${totalPoints}\` نقطة  •  🏰 **الدناجن المكتملة:** \`${totalDungeons}\` دنجن\n` +
      `───────────────────────────────\n\n` +
      formattedList
    )
    .setFooter({ 
      text: `صفحة ${page + 1} من ${totalPages} • مجتمع M3RGEEN & EMPEROR`,
      iconURL: "https://cdn.discordapp.com/icons/861355983975874601/4bde8b28e28b5514360a88063424e48c.webp"
    })
    .setTimestamp();

  return { embed, totalPages, page };
}

export function buildDungeonPointsRow(page, totalPages, invokerId, guildFilter = 'ALL') {
  if (totalPages <= 1) return [];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dgpts_page:${page - 1}:${invokerId}:${guildFilter}`)
      .setLabel("◀️ السابق")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`dgpts_page:${page + 1}:${invokerId}:${guildFilter}`)
      .setLabel("التالي ▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );

  return [row];
}

export default {
  data: new SlashCommandBuilder()
    .setName("dungeon_points")
    .setDescription("عرض نقاط اللاعبين الذين شاركوا بالدنجنات ولديهم نقاط مرتبة في إمبد مميز")
    .addStringOption(option =>
      option.setName("guild")
        .setDescription("تصفية النتائج حسب القيلد (اختياري)")
        .setRequired(false)
        .addChoices(
          { name: "الكل (معرقين + امبرور)", value: "ALL" },
          { name: "🪽 معرقين فقط", value: "M3RGEEN" },
          { name: "👑 امبرور فقط", value: "EMPEROR" }
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();
    } catch (e) {
      console.error("[dungeon_points] Failed to deferReply:", e);
      return;
    }

    try {
      const guildFilter = interaction.options.getString("guild") || "ALL";
      const data = await fetchDungeonPointsData(guildFilter);
      const { embed, totalPages, page } = renderDungeonPointsEmbed(data, 0, guildFilter);
      const components = buildDungeonPointsRow(page, totalPages, interaction.user.id, guildFilter);

      return interaction.editReply({
        embeds: [embed],
        components
      });
    } catch (err) {
      console.error("[dungeon_points] Error executing command:", err);
      return interaction.editReply({
        content: "❌ حدث خطأ أثناء جلب نقاط الدنجنات: " + err.message
      });
    }
  }
};

export async function handleDungeonPointsPagination(interaction) {
  const parts = interaction.customId.split(":");
  const targetPage = parseInt(parts[1], 10);
  const invokerId = parts[2];
  const guildFilter = parts[3] || 'ALL';

  if (interaction.user.id !== invokerId) {
    return interaction.reply({
      content: "❌ عذراً، فقط الشخص الذي طلب القائمة يمكنه التنقل بين الصفحات.",
      flags: 64
    });
  }

  try {
    const data = await fetchDungeonPointsData(guildFilter);
    const { embed, totalPages, page } = renderDungeonPointsEmbed(data, targetPage, guildFilter);
    const components = buildDungeonPointsRow(page, totalPages, invokerId, guildFilter);

    return interaction.update({
      embeds: [embed],
      components
    });
  } catch (err) {
    console.error("[handleDungeonPointsPagination] Error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ حدث خطأ أثناء تصفح اللوحة: " + err.message, flags: 64 });
    }
  }
}

