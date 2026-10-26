import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} from "discord.js";
import { query } from "../database/index.js";

export const CONFIRMATION_CHANNEL_ID = "1553393417491578982";

export const TARGETS = {
  "Cleric": 23,
  "Templar": 16,
  "Chanter": 16,
  "Gladiator": 18,
  "Sorcerer": 16,
  "Ranger": 16,
  "Assassin": 15,
  "Spiritmaster": 8
};

export async function initConfirmationDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_roster_confirmation_campaigns (
      id SERIAL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS aion2_roster_confirmations (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES aion2_roster_confirmation_campaigns(id),
      discord_id TEXT NOT NULL,
      confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(campaign_id, discord_id)
    );
  `);
}

export async function getActiveCampaign() {
  const res = await query(`
    SELECT * FROM aion2_roster_confirmation_campaigns
    WHERE status = 'ACTIVE'
    ORDER BY id DESC
    LIMIT 1
  `);
  return res.rows[0] || null;
}

export async function getLatestCampaign() {
  const res = await query(`
    SELECT * FROM aion2_roster_confirmation_campaigns
    ORDER BY id DESC
    LIMIT 1
  `);
  return res.rows[0] || null;
}

export async function getConfirmationStats(campaignId, tableName = 'aion2_global_applications') {
  // 1. Fetch current eligible members
  const membersRes = await query(`
    SELECT id, discord_id, selected_class, guild_type, reviewed_at
    FROM ${tableName}
    WHERE status = 'ACCEPTED'
      AND transition_status IS NULL
      AND guild_type IN ('GLOBAL', 'EARLY_ACCESS')
    ORDER BY reviewed_at ASC, id ASC
  `);

  // 2. Fetch existing confirmations for this campaign
  const confRes = await query(`
    SELECT discord_id, confirmed_at
    FROM aion2_roster_confirmations
    WHERE campaign_id = $1
  `, [campaignId]);

  const confirmedMap = new Map();
  for (const row of confRes.rows) {
    confirmedMap.set(row.discord_id, row.confirmed_at);
  }

  // 3. Classify dynamic reserve for Global members
  const globalMembers = membersRes.rows.filter(m => m.guild_type === 'GLOBAL');
  globalMembers.sort((a, b) => {
    const diff = new Date(a.reviewed_at) - new Date(b.reviewed_at);
    if (diff !== 0) return diff;
    return parseInt(a.id, 10) - parseInt(b.id, 10);
  });

  const globalClassCounters = {};
  const memberReserveMap = new Map();
  for (const m of globalMembers) {
    const cls = m.selected_class || "Unknown";
    globalClassCounters[cls] = (globalClassCounters[cls] || 0) + 1;
    const target = TARGETS[cls] || 0;
    const isReserve = globalClassCounters[cls] > target;
    memberReserveMap.set(m.discord_id, isReserve);
  }

  // 4. Assemble confirmed and unconfirmed member arrays
  const confirmedList = [];
  const unconfirmedList = [];

  for (const m of membersRes.rows) {
    const isConfirmed = confirmedMap.has(m.discord_id);
    const isReserve = memberReserveMap.get(m.discord_id) || false;
    const item = {
      id: m.id,
      discordId: m.discord_id,
      selectedClass: m.selected_class,
      guildType: m.guild_type,
      isReserve,
      reviewedAt: m.reviewed_at,
      confirmedAt: isConfirmed ? confirmedMap.get(m.discord_id) : null
    };

    if (isConfirmed) {
      confirmedList.push(item);
    } else {
      unconfirmedList.push(item);
    }
  }

  // Sort confirmedList by confirmedAt ASC
  confirmedList.sort((a, b) => new Date(a.confirmedAt) - new Date(b.confirmedAt));

  const totalEligible = membersRes.rows.length;
  const totalConfirmed = confirmedList.length;
  const totalUnconfirmed = unconfirmedList.length;

  const globalTotal = globalMembers.length;
  const globalConfirmed = confirmedList.filter(m => m.guildType === 'GLOBAL').length;
  const globalUnconfirmed = unconfirmedList.filter(m => m.guildType === 'GLOBAL').length;

  const earlyMembers = membersRes.rows.filter(m => m.guildType === 'EARLY_ACCESS');
  const earlyTotal = earlyMembers.length;
  const earlyConfirmed = confirmedList.filter(m => m.guildType === 'EARLY_ACCESS').length;
  const earlyUnconfirmed = unconfirmedList.filter(m => m.guildType === 'EARLY_ACCESS').length;

  return {
    totalEligible,
    totalConfirmed,
    totalUnconfirmed,
    globalTotal,
    globalConfirmed,
    globalUnconfirmed,
    earlyTotal,
    earlyConfirmed,
    earlyUnconfirmed,
    confirmedList,
    unconfirmedList
  };
}

export function buildPublicConfirmationEmbed(campaign, confirmedCount, unconfirmedCount) {
  const endUnix = Math.floor(new Date(campaign.ends_at).getTime() / 1000);
  const isExpired = new Date() >= new Date(campaign.ends_at);

  const timeDisplay = isExpired
    ? "🔴 انتهت مهلة التأكيد"
    : `<t:${endUnix}:R>`;

  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle("📢 تأكيد الاستمرار مع قيلد M3RGEEN | أيون 2")
    .setDescription(`يا شباب، مع قرب الانطلاق بدأنا تأكيد المسجلين الحاليين عشان نتأكد من الأشخاص اللي ما زالوا مستمرين معنا، ونقدر ننظم المقاعد المتاحة للاعبين المنتظرين.

التأكيد يشمل جميع المسجلين:
🌍 القلوبال
⚡ الإيرلي
🟡 الاحتياط

إذا أنت مستمر معنا، المطلوب منك فقط الضغط على الزر بالأسفل.

ما تحتاج تعيد التسجيل أو ترسل بياناتك من جديد.

⚠️ بعد انتهاء المهلة، أي تسجيل لم يتم تأكيده سيُعتبر غير مؤكد، ويحق للإدارة إتاحة المقعد للاعب آخر.

إذا عندك ظرف يمنعك من التأكيد خلال المهلة، تواصل مع الإدارة قبل انتهاء الوقت.`)
    .addFields(
      {
        name: "📊 حالة التأكيد الحالية",
        value: `🟢 أكدوا استمرارهم: **${confirmedCount}**\n⏳ لم يؤكدوا بعد: **${unconfirmedCount}**\n\n⏰ الوقت المتبقي للتأكيد: ${timeDisplay}`
      }
    )
    .setFooter({ text: "تحالف M3RGEEN | AION 2" })
    .setTimestamp();
}

export function buildPublicConfirmationRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aion2_conf_btn_confirm")
      .setLabel("✅ أنا موجود ومستمر")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

export function buildAdminStatsEmbed(campaign, stats) {
  const endUnix = Math.floor(new Date(campaign.ends_at).getTime() / 1000);
  const isExpired = new Date() >= new Date(campaign.ends_at);

  const timeDisplay = isExpired
    ? "🔴 انتهت مهلة التأكيد"
    : `<t:${endUnix}:R>`;

  return new EmbedBuilder()
    .setColor(isExpired ? "#E74C3C" : "#3498DB")
    .setTitle("📋 إحصائية تأكيد الاستمرار")
    .setDescription(`👥 **المطلوب منهم التأكيد:** ${stats.totalEligible}\n✅ **أكدوا:** ${stats.totalConfirmed}\n⏳ **لم يؤكدوا:** ${stats.totalUnconfirmed}\n\n🌍 **القلوبال**\n✅ أكدوا: ${stats.globalConfirmed}\n⏳ لم يؤكدوا: ${stats.globalUnconfirmed}\n\n⚡ **الإيرلي**\n✅ أكدوا: ${stats.earlyConfirmed}\n⏳ لم يؤكدوا: ${stats.earlyUnconfirmed}\n\n⏰ **الوقت المتبقي:** ${timeDisplay}`)
    .setFooter({ text: `معرف الحملة: ${campaign.id} | الحالة: ${isExpired ? "منتهية" : "نشطة"}` })
    .setTimestamp();
}

export function buildAdminStatsRow(confirmedCount, unconfirmedCount) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aion2_conf_list_confirmed:0")
      .setLabel(`✅ المؤكدون (${confirmedCount})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("aion2_conf_list_unconfirmed:0")
      .setLabel(`⏳ غير المؤكدين (${unconfirmedCount})`)
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function refreshPublicConfirmationMessage(client, campaignId) {
  try {
    const campRes = await query(`
      SELECT * FROM aion2_roster_confirmation_campaigns WHERE id = $1
    `, [campaignId]);
    if (campRes.rowCount === 0) return;
    const campaign = campRes.rows[0];

    const stats = await getConfirmationStats(campaign.id);
    const channel = client.channels.cache.get(campaign.channel_id) || await client.channels.fetch(campaign.channel_id).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(campaign.message_id).catch(() => null);
    if (!message) return;

    const isExpired = new Date() >= new Date(campaign.ends_at);
    const embed = buildPublicConfirmationEmbed(campaign, stats.totalConfirmed, stats.totalUnconfirmed);
    const row = buildPublicConfirmationRow(isExpired);

    await message.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error(`[Confirmation] Error refreshing public message for campaign ${campaignId}:`, err);
  }
}

export async function handleInteraction(interaction) {
  const customId = interaction.customId || "";

  // 1. Public confirmation button
  if (customId === "aion2_conf_btn_confirm") {
    return handleConfirmButton(interaction);
  }

  // 2. Admin list pagination: aion2_conf_list_confirmed:<page> or aion2_conf_list_unconfirmed:<page>
  if (customId.startsWith("aion2_conf_list_")) {
    return handleAdminListPagination(interaction);
  }

  // 3. Admin back to stats: aion2_conf_back_stats
  if (customId === "aion2_conf_back_stats") {
    return handleAdminBackStats(interaction);
  }
}

async function handleConfirmButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  // 1. Get active campaign
  const campRes = await query(`
    SELECT * FROM aion2_roster_confirmation_campaigns 
    WHERE status = 'ACTIVE' 
    ORDER BY id DESC LIMIT 1
  `);

  if (campRes.rowCount === 0) {
    return interaction.editReply({ content: "❌ لا توجد حملة تأكيد نشطة حالياً." });
  }
  const campaign = campRes.rows[0];

  // 2. Server-side deadline check
  if (new Date() >= new Date(campaign.ends_at)) {
    await query(`UPDATE aion2_roster_confirmation_campaigns SET status = 'EXPIRED' WHERE id = $1`, [campaign.id]).catch(() => {});
    return interaction.editReply({ content: "⏰ انتهت مهلة تأكيد الاستمرار." });
  }

  // 3. Eligibility check
  const memberRes = await query(`
    SELECT id, discord_id, status, guild_type, selected_class
    FROM aion2_global_applications
    WHERE discord_id = $1
      AND status = 'ACCEPTED'
      AND transition_status IS NULL
      AND guild_type IN ('GLOBAL', 'EARLY_ACCESS')
    LIMIT 1
  `, [interaction.user.id]);

  if (memberRes.rowCount === 0) {
    return interaction.editReply({
      content: "❌ لم يتم العثور على تسجيل نشط ومقبول لك في روستر القيلد (Global أو Early Access)."
    });
  }

  // 4. Atomic Insert Confirmation
  const insertRes = await query(`
    INSERT INTO aion2_roster_confirmations (campaign_id, discord_id, confirmed_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (campaign_id, discord_id) DO NOTHING
    RETURNING id
  `, [campaign.id, interaction.user.id]);

  if (insertRes.rowCount === 0) {
    return interaction.editReply({ content: "✅ أنت مؤكد بالفعل." });
  }

  // 5. Successful first-time confirmation!
  await interaction.editReply({ content: "✅ تم تأكيد استمرارك بنجاح." });

  // 6. Background refresh of public counts
  refreshPublicConfirmationMessage(interaction.client, campaign.id).catch(console.error);
}

async function handleAdminListPagination(interaction) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "❌ لا تملك صلاحية للإدارة.", ephemeral: true });
  }

  const customId = interaction.customId || "";
  const parts = customId.replace("aion2_conf_list_", "").split(":");
  const type = parts[0]; // "confirmed" or "unconfirmed"
  const page = parseInt(parts[1] || "0", 10);

  const campaign = await getLatestCampaign();
  if (!campaign) {
    return interaction.reply({ content: "❌ لا توجد حملة تأكيد.", ephemeral: true });
  }

  const stats = await getConfirmationStats(campaign.id);
  const list = type === "confirmed" ? stats.confirmedList : stats.unconfirmedList;
  const title = type === "confirmed" ? "✅ قائمة المؤكدين" : "⏳ قائمة غير المؤكدين";

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageItems = list.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  let desc = "";
  if (pageItems.length === 0) {
    desc = "*لا يوجد أعضاء في هذه القائمة حالياً.*";
  } else {
    for (const item of pageItems) {
      const member = interaction.guild?.members.cache.get(item.discordId);
      const name = member ? (member.displayName || member.user?.username) : item.discordId;

      let badge = "";
      if (item.guildType === "GLOBAL") {
        badge = `🌍 قلوبال — ${item.selectedClass || "بدون كلاس"}${item.isReserve ? " — 🟡 احتياط" : ""}`;
      } else {
        badge = `⚡ إيرلي${item.selectedClass ? ` — ${item.selectedClass}` : ""}`;
      }

      desc += `**${name}** (${item.discordId})\n${badge}`;
      if (item.confirmedAt) {
        const unix = Math.floor(new Date(item.confirmedAt).getTime() / 1000);
        desc += `\n🕒 أكد: <t:${unix}:f>`;
      }
      desc += "\n\n";
    }
  }

  const embed = new EmbedBuilder()
    .setColor(type === "confirmed" ? "#2ECC71" : "#E67E22")
    .setTitle(`${title} (${list.length}) — صفحة ${safePage + 1} من ${totalPages}`)
    .setDescription(desc.trimEnd())
    .setFooter({ text: `معرف الحملة: ${campaign.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aion2_conf_list_${type}:${safePage - 1}`)
      .setLabel("⬅️ السابق")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId("aion2_conf_back_stats")
      .setLabel("🔙 الإحصائيات")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`aion2_conf_list_${type}:${safePage + 1}`)
      .setLabel("التالي ➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleAdminBackStats(interaction) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "❌ لا تملك صلاحية للإدارة.", ephemeral: true });
  }

  const campaign = await getLatestCampaign();
  if (!campaign) {
    return interaction.reply({ content: "❌ لا توجد حملة تأكيد.", ephemeral: true });
  }

  const stats = await getConfirmationStats(campaign.id);
  const embed = buildAdminStatsEmbed(campaign, stats);
  const row = buildAdminStatsRow(stats.totalConfirmed, stats.totalUnconfirmed);

  await interaction.update({ embeds: [embed], components: [row] });
}
