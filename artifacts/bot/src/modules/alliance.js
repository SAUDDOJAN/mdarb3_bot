import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { scrapeProfile, classIconUrl } from "./scraper.js";
import { query } from "../database/index.js";

// ─── Stat display config ───────────────────────────────────────────────────────
const STAT_DISPLAY = {
  str: { emoji: "💪", label: "Might" },
  dex: { emoji: "🏃", label: "Dexterity" },
  agi: { emoji: "🎯", label: "Precision" },
  wis: { emoji: "🛡️", label: "Willpower" },
  int: { emoji: "🧠", label: "Intelligence" },
  con: { emoji: "❤️", label: "Constitution" },
};

const trunc = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const numFmt = (n) => Number(n).toLocaleString("en-US");

function fmtItem(item, showSlot = true) {
  const prefix = item.enchant > 0 ? `+${item.enchant} ` : "";
  const slot = showSlot && item.slot ? ` *(${item.slot})*` : "";
  return `${prefix}${item.name}${slot}`;
}

export function fmtGearSection(items, showSlot = true) {
  if (!items || items.length === 0) return null;
  return items.map((it) => fmtItem(it, showSlot)).join("\n");
}

export function fmtBaseStats(stats) {
  if (!stats) return null;
  const order = ["str", "dex", "agi", "wis", "int", "con"];
  const entries = order
    .map((k) => ({ ...STAT_DISPLAY[k], value: stats[k]?.value ?? null }))
    .filter((e) => e.value !== null);
  if (entries.length === 0) return null;

  const lines = [];
  for (let i = 0; i < entries.length; i += 2) {
    const l = entries[i];
    const r = entries[i + 1];
    const left = `${l.emoji} **${l.label}**: \`${numFmt(l.value)}\``;
    const right = r ? `　${r.emoji} **${r.label}**: \`${numFmt(r.value)}\`` : "";
    lines.push(left + right);
  }
  return lines.join("\n");
}

export function fmtTitles(titles) {
  if (!titles) return null;
  const parts = [];
  if (titles.active) parts.push(`**${trunc(titles.active, 50)}**`);
  if (titles.ownedCount) {
    const total = titles.totalCount ? `/${titles.totalCount}` : "";
    parts.push(`\`${titles.ownedCount}${total} ألقاب\``);
  }
  return parts.length > 0 ? parts.join("  •  ") : null;
}

// ─── Interaction Router ───────────────────────────────────────────────────────
export async function handleInteraction(interaction) {
  try {
    const [, action, ...rest] = interaction.customId.split(":");

    if (action === "modal") {
      await processApplication(interaction);
    } else if (action === "accept") {
      await acceptApplicant(interaction, rest[0], rest[1]);
    } else if (action === "reject") {
      await rejectApplicant(interaction, rest[0], rest[1]);
    } else if (action === "manage_update") {
      await updateMemberCard(interaction, rest[0]);
    } else if (action === "manage_remove") {
      await removeMember(interaction, rest[0]);
    }
  } catch (err) {
    console.error(`[Alliance:Interaction] Error in ${interaction.customId}:`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ حدث خطأ غير متوقع أثناء معالجة طلبك.", flags: 64 }).catch(() => {});
    } else {
      await interaction.editReply({ content: "❌ حدث خطأ غير متوقع أثناء معالجة طلبك.", embeds: [], components: [] }).catch(() => {});
    }
  }
}

// ─── Step 1: Process Application Modal ─────────────────────────────────────────
async function processApplication(interaction) {
  await interaction.deferReply({ flags: 64 });

  const shugoUrl = interaction.fields.getTextInputValue("shugo_url").trim();
  await interaction.editReply({ content: "⏳ جارٍ جلب بيانات ملفك الشخصي من Shugo.gg..." });

  const result = await scrapeProfile(shugoUrl);

  if (!result.success) {
    await interaction.editReply({
      content: `❌ **فشل في جلب الملف الشخصي.**\nتأكد من أن الرابط صحيح وأن الملف عام.\n\`\`\`${result.error}\`\`\``,
    });
    return;
  }

  const {
    characterName, characterLevel, className,
    combatPower, profileImage,
    stats, gear, titles,
  } = result.data;

  // Insert or update pending application
  const appRes = await query(
    `INSERT INTO alliance_members
       (guild_id, user_id, character_name, character_level, class_name, combat_power, profile_image, shugo_url, status, character_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
     ON CONFLICT (guild_id, user_id) DO UPDATE 
       SET status='pending', character_name=$3, character_level=$4, class_name=$5, combat_power=$6, profile_image=$7, shugo_url=$8, character_data=$9, updated_at=NOW()
     RETURNING *`,
    [
      interaction.guildId, interaction.user.id, characterName, characterLevel, className,
      combatPower, profileImage, shugoUrl, JSON.stringify(result.data)
    ]
  );
  const app = appRes.rows[0];

  // Fetch admin channel
  const configRes = await query("SELECT alliance_admin_channel_id FROM guild_config WHERE guild_id=$1", [interaction.guildId]);
  const adminChannelId = process.env.ALLIANCE_ADMIN_CHANNEL_ID || configRes.rows[0]?.alliance_admin_channel_id;

  if (!adminChannelId) {
    await interaction.editReply({
      content: "❌ تم حفظ الطلب، لكن لم يتم تعيين قناة الإدارة (ALLIANCE_ADMIN_CHANNEL_ID) في الإعدادات لتلقي الطلب."
    });
    return;
  }

  const adminChannel = interaction.guild.channels.cache.get(adminChannelId);
  if (!adminChannel) {
    await interaction.editReply({
      content: "❌ تم حفظ الطلب، لكن قناة الإدارة المحددة غير موجودة في هذا السيرفر."
    });
    return;
  }

  await submitToReview(interaction, app, adminChannel);

  await interaction.editReply({
    content: `✅ تم إرسال طلب انضمامك للتحالف باسم **${characterName}** للإدارة للمراجعة بنجاح.\nسنُعلمك بالنتيجة قريباً.`,
  });
}

export function buildProfileEmbed(memberData, interactionUser, app, isReview = false) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
  
  let itemLevel = "—";
  let rankingsText = "—";
  let titlesText = "—";

  if (memberData) {
    if (memberData.itemLevel) itemLevel = numFmt(memberData.itemLevel);
    
    if (memberData.rankings && memberData.rankings.length > 0) {
      rankingsText = memberData.rankings.map(r => `• ${r.name}: ${r.rank} (${numFmt(r.point || 0)})`).join("\n");
    } else {
      rankingsText = `• Abyss: ${app.abyss_rank ?? "—"} (${app.abyss_score?.toLocaleString() ?? 0})`;
    }

    if (memberData.equippedTitles && memberData.equippedTitles.length > 0) {
      titlesText = memberData.equippedTitles.map(t => `• **${t.category}:** ${t.name}`).join("\n");
    } else if (memberData.titles && memberData.titles.active) {
      titlesText = memberData.titles.active;
    }
  }

  let description = `[🔗 عرض البروفايل](${app.shugo_url})\n`;
  if (isReview) {
    description += `👑 مقدم الطلب: ${interactionUser}`;
  }

  const infoBlock =
    `👤 الاسم: **${app.character_name}**\n` +
    `📊 المستوى: **${app.character_level}**\n` +
    `⚔️ الكلاس: **${app.class_name ?? "—"}**\n` +
    `🌍 السيرفر: **${app.server_name ?? "—"}**\n` +
    `🧬 العرق: **${app.race_name ?? "—"}**`;

  const fields = [
    { name: "معلومات الشخصية", value: infoBlock, inline: false },
    { name: "🏆 الرتب (Rankings)", value: rankingsText, inline: false },
    { name: "🎖️ الألقاب المجهزة (Titles)", value: titlesText, inline: false },
    { name: "قوة القتال (Combat Power) ⚔️", value: `★  **${cpDisplay}**  ★  *(Item Level: ${itemLevel})*`, inline: false },
  ];

  if (memberData) {
    const baseStats = fmtBaseStats(memberData.stats);
    if (baseStats) fields.push({ name: "الخصائص الأساسية (Base Stats)", value: baseStats, inline: false });

    const titles = fmtTitles(memberData.titles);
    if (titles) fields.push({ name: "الألقاب (Titles)", value: titles, inline: false });

    const gear = memberData.gear || {};
    const weapons = fmtGearSection(gear.weapons);
    if (weapons) fields.push({ name: "⚔️ الأسلحة (Weapons)", value: weapons, inline: false });

    const armor = fmtGearSection(gear.armor);
    if (armor) fields.push({ name: "🛡️ الدروع (Armor)", value: armor, inline: false });

    const acc = fmtGearSection(gear.accessories);
    if (acc) fields.push({ name: "💍 الإكسسوارات (Accessories)", value: acc, inline: false });

    const arcana = fmtGearSection(gear.arcana, false);
    if (arcana) fields.push({ name: "🔮 الأركانا (Arcana)", value: arcana, inline: false });

    const runes = fmtGearSection(gear.runes, false);
    if (runes) fields.push({ name: "💎 الرونز (Runes)", value: runes, inline: false });
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(isReview ? `📋 طلب انضمام للتحالف جديد` : `بطاقة عضو التحالف: ${app.character_name}`)
    .setDescription(description)
    .addFields(fields)
    .setThumbnail(classIconUrl(app.class_name))
    .setTimestamp();

  if (isReview && interactionUser) {
    embed.setAuthor({ name: interactionUser.tag, iconURL: interactionUser.displayAvatarURL() });
    embed.setFooter({ text: `Discord ID: ${interactionUser.id}  •  App ID: ${app.id}` });
  }

  if (app.profile_image) embed.setImage(app.profile_image);

  return embed;
}

async function submitToReview(interaction, app, adminChannel) {
  const memberData = typeof app.character_data === 'string' ? JSON.parse(app.character_data) : app.character_data;
  const reviewEmbed = buildProfileEmbed(memberData, interaction.user, app, true);

  const reviewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`alliance:accept:${interaction.user.id}:${app.id}`)
      .setLabel("✅ قبول")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`alliance:reject:${interaction.user.id}:${app.id}`)
      .setLabel("❌ رفض")
      .setStyle(ButtonStyle.Danger)
  );

  await adminChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
}

// ─── Step 2: Accept/Reject ───────────────────────────────────────────────────
async function acceptApplicant(interaction, userId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM alliance_members WHERE id=$1 AND guild_id=$2", [appId, interaction.guildId]);
  const app = appRes.rows[0];

  if (!app) { await interaction.editReply({ content: "❌ الطلب غير موجود." }); return; }
  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ هذا الطلب تمت مراجعته بالفعل (${app.status}).` });
    return;
  }

  await query("UPDATE alliance_members SET status='accepted', updated_at=NOW() WHERE id=$1", [appId]);

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x57f287)
    .setTitle(`✅ تم القبول في التحالف — ${app.character_name}`)
    .setFooter({ text: `تم القبول بواسطة ${interaction.user.tag}` });
  
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({ content: `✅ تم قبول **${app.character_name}** كعضو في التحالف بنجاح.` });
}

async function rejectApplicant(interaction, userId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM alliance_members WHERE id=$1 AND guild_id=$2", [appId, interaction.guildId]);
  const app = appRes.rows[0];

  if (!app) { await interaction.editReply({ content: "❌ الطلب غير موجود." }); return; }
  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ هذا الطلب تمت مراجعته بالفعل (${app.status}).` });
    return;
  }

  await query("UPDATE alliance_members SET status='rejected', updated_at=NOW() WHERE id=$1", [appId]);

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xed4245)
    .setTitle(`❌ مرفوض من التحالف — ${app.character_name}`)
    .setFooter({ text: `تم الرفض بواسطة ${interaction.user.tag}` });
  
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({ content: `❌ تم رفض الطلب بنجاح.` });
}

// ─── Step 3: Admin Management ────────────────────────────────────────────────
async function updateMemberCard(interaction, memberId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM alliance_members WHERE id=$1 AND guild_id=$2", [memberId, interaction.guildId]);
  const app = appRes.rows[0];

  if (!app) { await interaction.editReply({ content: "❌ العضو غير موجود في التحالف." }); return; }

  const result = await scrapeProfile(app.shugo_url);
  if (!result.success) {
    await interaction.editReply({ content: `❌ فشل تحديث بيانات البطاقة:\n\`\`\`${result.error}\`\`\`` });
    return;
  }

  const {
    characterName, characterLevel, className,
    combatPower, profileImage,
  } = result.data;

  await query(
    `UPDATE alliance_members 
     SET character_name=$1, character_level=$2, class_name=$3, combat_power=$4, profile_image=$5, character_data=$6, updated_at=NOW() 
     WHERE id=$7`,
    [characterName, characterLevel, className, combatPower, profileImage, JSON.stringify(result.data), memberId]
  );

  await interaction.editReply({ content: `✅ تم تحديث بطاقة **${characterName}** بنجاح.` });
}

async function removeMember(interaction, memberId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT character_name FROM alliance_members WHERE id=$1 AND guild_id=$2", [memberId, interaction.guildId]);
  const app = appRes.rows[0];

  if (!app) { await interaction.editReply({ content: "❌ العضو غير موجود في التحالف." }); return; }

  await query("DELETE FROM alliance_members WHERE id=$1", [memberId]);

  await interaction.message.delete().catch(() => {});
  await interaction.editReply({ content: `🗑️ تم حذف عضو التحالف **${app.character_name}** نهائياً من قاعدة البيانات.` });
}
