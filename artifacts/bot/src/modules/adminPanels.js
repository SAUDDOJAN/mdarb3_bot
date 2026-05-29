import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { query } from "../database/index.js";
import { removeMemberAllData } from "./management.js";
import { sendEventPanel } from "./events.js";
import { scrapeProfile } from "./scraper.js";
import { startBattleMonitor } from "../tasks/battleMonitor.js";

// ─── Guard ────────────────────────────────────────────────────────────────────
function isAdmin(interaction) {
  return interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

// ─── Class emojis for the select menu ─────────────────────────────────────────
const CLASS_EMOJI = {
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Templar:      "<:Templar:1504472027724255414>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Spiritmaster: "<:Elementalist:1504471920219783209>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
};

// ─── Shared formatting helpers ────────────────────────────────────────────────
const numFmt = (n) => Number(n).toLocaleString("en-US");

// ─── Main router ──────────────────────────────────────────────────────────────
export async function handleInteraction(interaction) {
  const parts  = interaction.customId.split(":");
  const action = parts[1];

  if (!isAdmin(interaction)) {
    const reply = { content: "❌ هذا الإجراء مخصص للمسؤولين فقط.", flags: 64 };
    if (interaction.replied || interaction.deferred)
      await interaction.followUp(reply).catch(() => {});
    else
      await interaction.reply(reply).catch(() => {});
    return;
  }

  switch (action) {
    case "start_event":       return handleStartEvent(interaction);
    case "event_select":      return handleEventSelect(interaction);
    case "reset_points":      return handleResetPointsPrompt(interaction);
    case "reset_confirm":     return handleResetConfirm(interaction);
    case "reset_cancel":      return handleResetCancel(interaction);
    case "open_member_mgmt":  return handleOpenMemberMgmt(interaction);
    case "member_select":     return handleMemberSelect(interaction);
    case "remove_member":     return handleRemoveMember(interaction, parts[2]);
    case "sync_member":       return handleSyncMember(interaction, parts[2]);
    case "cancel_member":     return handleCancelMember(interaction);
    default:
      console.warn(`[AdminPanels] Unknown action: ${action}`);
  }
}

// ─── Event Panel Launcher ─────────────────────────────────────────────────────
async function handleStartEvent(interaction) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("mgmt:event_select")
    .setPlaceholder("اختر نوع الفعالية لإطلاقها...")
    .addOptions(
      { label: "حصار التحالف (Alliance Siege)", value: "siege", emoji: "⚔️" },
      { label: "فارم ابيس بوينت (Farm AP)", value: "farm_ap", emoji: "💎" }
    );

  await interaction.reply({
    content: "🚀 **اختر نوع الفعالية التي ترغب في إطلاقها في قناة اللوبي:**",
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: 64,
  });
}

async function handleEventSelect(interaction) {
  await interaction.deferUpdate();
  const eventKey = interaction.values[0];

  const configRes = await query(
    "SELECT event_lobby_channel_id, legion_role_id FROM guild_config WHERE guild_id=$1",
    [interaction.guildId]
  );
  const config         = configRes.rows[0];
  const lobbyChannelId = config?.event_lobby_channel_id;
  const legionRoleId   = config?.legion_role_id;

  const targetChannel = lobbyChannelId
    ? interaction.guild.channels.cache.get(lobbyChannelId) ?? await interaction.guild.channels.fetch(lobbyChannelId).catch(() => null)
    : null;

  if (!targetChannel) {
    await interaction.editReply({
      content: "❌ لم يتم تحديد قناة إعلانات الفعاليات.\nاستخدم `/setup eventlobbychannel #القناة` أولاً.",
      components: [],
    });
    return;
  }

  if (legionRoleId) {
    await targetChannel.send({ content: `<@&${legionRoleId}>` }).catch(() => {});
  }

  const fakeInteraction = {
    guildId:   interaction.guildId,
    channelId: targetChannel.id,
    guild:     interaction.guild,
    user:      interaction.user,
    channel:   targetChannel,
    reply:     (opts) => targetChannel.send(opts).then(() => {}),
    editReply: () => {},
  };

  await sendEventPanel(fakeInteraction, eventKey);

  // ─── Auto-start Battle Monitor for Farm AP in M3RGEEN server ─────────────────
  const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";
  if (eventKey === "farm_ap" && interaction.guildId === MAIN_GUILD_ID) {
    // Get event ID just created
    const evRes = await query(
      "SELECT id, message_id FROM point_events WHERE guild_id=$1 ORDER BY id DESC LIMIT 1",
      [MAIN_GUILD_ID]
    ).catch(() => ({ rows: [] }));
    const eventId    = evRes.rows[0]?.id;
    const eventMsgId = evRes.rows[0]?.message_id;
    startBattleMonitor(interaction.client, eventId, eventMsgId)
      .catch(err => console.error("[AdminPanels] BattleMonitor start error:", err));
  }

  // Get the display name for the response
  const eventName = eventKey === "siege" ? "حصار التحالف (Alliance Siege)" : "فارم ابيس بوينت (Farm AP)";

  await interaction.editReply({
    content: `✅ تم إطلاق فعالية **${eventName}** في ${targetChannel}${legionRoleId ? " مع إشعار الدور" : ""}.`,
    components: [],
  });
}

// ─── Reset Points ─────────────────────────────────────────────────────────────
async function handleResetPointsPrompt(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("⚠️ تأكيد إعادة تعيين النقاط")
    .setDescription(
      "سيتم **مسح جميع نقاط اللاعبين** في هذا السيرفر نهائياً.\n\n" +
      "هذا الإجراء **لا يمكن التراجع عنه**. هل أنت متأكد؟"
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("mgmt:reset_confirm")
      .setLabel("✅ نعم، امسح كل النقاط")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("mgmt:reset_cancel")
      .setLabel("❌ إلغاء")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

async function handleResetConfirm(interaction) {
  await interaction.deferUpdate();
  await query("DELETE FROM points WHERE guild_id=$1",         [interaction.guildId]);
  await query("DELETE FROM voice_sessions WHERE guild_id=$1", [interaction.guildId]);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ تمت إعادة التعيين")
    .setDescription("تم مسح جميع نقاط الفعاليات وسجلات الجلسات الصوتية بنجاح.")
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });
  console.log(`[AdminPanels] All points reset in guild ${interaction.guildId} by ${interaction.user.tag}`);
}

async function handleResetCancel(interaction) {
  await interaction.update({ content: "❌ تم إلغاء العملية.", embeds: [], components: [] });
}

// ─── Member Management — Step 1: Select Menu from DB ─────────────────────────
async function handleOpenMemberMgmt(interaction) {
  await interaction.deferReply({ flags: 64 });

  // Fetch all accepted members from DB (max 25 — Discord StringSelect limit)
  const res = await query(
    `SELECT user_id, discord_tag, character_name, character_level, class_name,
            combat_power, shugo_url, accepted_at
     FROM recruits
     WHERE guild_id = $1 AND status = 'accepted'
     ORDER BY accepted_at DESC
     LIMIT 25`,
    [interaction.guildId]
  );

  if (res.rows.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("⚙️ إدارة الأعضاء")
          .setDescription("لا يوجد أعضاء مقبولون في السجل حتى الآن.\nيظهر الأعضاء هنا بعد قبول طلبات الانضمام من لوحة التجنيد.")
          .setTimestamp(),
      ],
    });
    return;
  }

  const options = res.rows.map((row) => {
    const rawEmoji   = CLASS_EMOJI[row.class_name] ?? "👤";
    const emojiMatch = rawEmoji.match(/:(\d+)>$/);
    const emojiObj   = emojiMatch ? { id: emojiMatch[1] } : rawEmoji;

    const cpVal     = Number(row.combat_power || 0);
    const cp        = cpVal > 0 ? ` • CP: ${cpVal.toLocaleString()}` : "";
    const label     = String(row.character_name || row.discord_tag || row.user_id || "Unknown").slice(0, 100);
    const desc      = String(`Lv.${row.character_level ?? 0} ${row.class_name ?? "—"}${cp}`).slice(0, 100);

    return new StringSelectMenuOptionBuilder()
      .setValue(String(row.user_id))
      .setLabel(label || "Member")
      .setDescription(desc || "No details")
      .setEmoji(emojiObj);
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("mgmt:member_select")
    .setPlaceholder("اختر عضواً لإدارته...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚙️ إدارة الأعضاء")
    .setDescription(
      `📋 يوجد **${res.rows.length}** عضو مقبول في السجل.\n\n` +
      "اختر العضو الذي تريد إدارته من القائمة أدناه.\n" +
      "سيتم عرض بطاقته مع خيارات الإجراءات."
    )
    .setFooter({ text: "يُعرض الأعضاء بترتيب تاريخ القبول (الأحدث أولاً)" })
    .setTimestamp();

  await interaction.editReply({
    embeds:     [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

// ─── Member Management — Step 2: Action Panel ─────────────────────────────────
async function handleMemberSelect(interaction) {
  await interaction.deferUpdate();
  const userId = interaction.values[0];

  // Fetch full recruit record
  const res = await query(
    `SELECT r.*, pc.message_id AS card_message_id, pc.channel_id AS card_channel_id,
            pc.last_updated AS card_last_updated
     FROM recruits r
     LEFT JOIN power_cards pc ON pc.guild_id = r.guild_id AND pc.user_id = r.user_id
     WHERE r.guild_id = $1 AND r.user_id = $2 AND r.status = 'accepted'
     LIMIT 1`,
    [interaction.guildId, userId]
  );

  if (!res.rows[0]) {
    await interaction.editReply({
      content: "❌ لم يتم العثور على سجل هذا العضو (ربما تم إزالته مسبقاً).",
      embeds: [], components: [],
    });
    return;
  }

  const rec  = res.rows[0];
  const member = await interaction.guild.members.fetch(userId).catch(() => null);

  // Points
  const ptsRes = await query(
    "SELECT total_points, withdrawals FROM points WHERE guild_id=$1 AND user_id=$2",
    [interaction.guildId, userId]
  );
  const pts = ptsRes.rows[0] ?? { total_points: 0, withdrawals: 0 };

  // Legion role check
  const cfgRes = await query(
    "SELECT legion_role_id FROM guild_config WHERE guild_id=$1",
    [interaction.guildId]
  );
  const legionRoleId  = cfgRes.rows[0]?.legion_role_id;
  const hasLegionRole = legionRoleId && member ? member.roles.cache.has(legionRoleId) : false;

  const cp         = rec.combat_power > 0 ? numFmt(rec.combat_power) : "—";
  const acceptedTs = rec.accepted_at
    ? `<t:${Math.floor(new Date(rec.accepted_at).getTime() / 1000)}:D>`
    : "—";
  const cardTs     = rec.card_last_updated
    ? `<t:${Math.floor(new Date(rec.card_last_updated).getTime() / 1000)}:R>`
    : "لم تُنشر بعد";
  const classEmoji = CLASS_EMOJI[rec.class_name] ?? "👤";
  const mention    = member ? `<@${userId}>` : `\`${rec.discord_tag}\``;

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`${classEmoji} ${rec.character_name ?? "غير معروف"}`)
    .setDescription(
      `> **${mention}** — سجل العضو\n` +
      `> \`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\``
    )
    .setThumbnail(
      rec.profile_image ??
      member?.user.displayAvatarURL({ dynamic: true }) ??
      null
    )
    .addFields(
      // Row 1 — character
      { name: "⚔️ الكلاس",          value: rec.class_name ?? "—",            inline: true },
      { name: "📊 المستوى",          value: `${rec.character_level ?? 0}`,    inline: true },
      { name: "💪 قوة القتال",       value: `\`${cp}\``,                      inline: true },
      // Row 2 — activity
      { name: "🎖️ دور Legion",       value: hasLegionRole ? "✅ موجود" : "❌ مفقود", inline: true },
      { name: "⭐ النقاط",           value: `${pts.total_points}`,            inline: true },
      { name: "⚠️ الانسحابات",       value: `${pts.withdrawals}`,             inline: true },
      // Row 3 — system
      { name: "📅 تاريخ القبول",     value: acceptedTs,                       inline: true },
      { name: "🃏 آخر تحديث بطاقة", value: cardTs,                            inline: true },
      { name: "🆔 Discord ID",        value: `\`${userId}\``,                  inline: true },
    );


  embed
    .setFooter({ text: "اختر الإجراء المناسب من الأزرار أدناه" })
    .setTimestamp();

  // Row 1 — destructive + sync
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mgmt:remove_member:${userId}`)
      .setLabel("إزالة العضو وحذف بياناته")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`mgmt:sync_member:${userId}`)
      .setLabel("مزامنة الإحصائيات")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary),
  );

  // Row 2 — view profile (link) + cancel
  const row2Components = [];

  if (rec.shugo_url) {
    row2Components.push(
      new ButtonBuilder()
        .setURL(rec.shugo_url)
        .setLabel("عرض البروفايل على Shugo.gg")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Link)
    );
  }

  row2Components.push(
    new ButtonBuilder()
      .setCustomId("mgmt:cancel_member")
      .setLabel("إغلاق")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );

  const rows = [row1, new ActionRowBuilder().addComponents(row2Components)];
  await interaction.editReply({ embeds: [embed], components: rows });
}

// ─── Remove Member ────────────────────────────────────────────────────────────
async function handleRemoveMember(interaction, userId) {
  await interaction.deferUpdate();

  if (!userId) {
    await interaction.editReply({ content: "❌ معرف العضو مفقود.", components: [], embeds: [] });
    return;
  }

  // Fetch record for logging
  const recRes = await query(
    "SELECT character_name FROM recruits WHERE guild_id=$1 AND user_id=$2",
    [interaction.guildId, userId]
  );
  const charName = recRes.rows[0]?.character_name ?? userId;

  const member = await interaction.guild.members.fetch(userId).catch(() => null);

  const configRes    = await query("SELECT legion_role_id FROM guild_config WHERE guild_id=$1", [interaction.guildId]);
  const legionRoleId = configRes.rows[0]?.legion_role_id;

  if (member && legionRoleId) {
    await member.roles
      .remove(legionRoleId, "Admin panel: member removal")
      .catch((e) => console.warn(`[AdminPanels] Role remove failed for ${userId}:`, e.message));
  }

  await removeMemberAllData(interaction.client, interaction.guild, userId);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ تمت إزالة العضو")
    .setDescription(
      `تم تنفيذ الإجراءات التالية على **${charName}** (<@${userId}>):\n\n` +
      `${legionRoleId ? "• ✅ تمت إزالة دور Legion\n" : ""}` +
      "• ✅ تم حذف بطاقة Power Radar\n" +
      "• ✅ تم مسح النقاط وسجل الفعاليات\n" +
      "• ✅ تم تحديث سجل التجنيد إلى `left`"
    )
    .setFooter({ text: `تم بواسطة ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });
  console.log(`[AdminPanels] ✅ Member ${charName} (${userId}) fully removed by ${interaction.user.tag}`);
}

// ─── Sync Member ──────────────────────────────────────────────────────────────
async function handleSyncMember(interaction, userId) {
  await interaction.deferUpdate();

  if (!userId) {
    await interaction.editReply({ content: "❌ معرف العضو مفقود.", components: [], embeds: [] });
    return;
  }

  // Fetch recruit record to get shugo_url
  const recRes = await query(
    "SELECT character_name, shugo_url FROM recruits WHERE guild_id=$1 AND user_id=$2 AND status='accepted'",
    [interaction.guildId, userId]
  );
  const rec = recRes.rows[0];

  if (!rec?.shugo_url) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ فشل المزامنة")
          .setDescription("لا يوجد رابط Shugo.gg مسجل لهذا العضو.\nلا يمكن مزامنة الإحصائيات بدون رابط.")
          .setTimestamp(),
      ],
      components: [],
    });
    return;
  }

  // Show "in progress" state
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔄 جارٍ مزامنة الإحصائيات...")
        .setDescription(
          `**${rec.character_name ?? userId}**\n\n` +
          "⏳ يتم الآن جلب أحدث البيانات من Shugo.gg...\n" +
          "قد يستغرق هذا بضع ثوانٍ."
        )
        .setTimestamp(),
    ],
    components: [],
  });

  console.log(`[AdminPanels] Syncing ${rec.character_name} (${userId}) via ${rec.shugo_url}`);
  const result = await scrapeProfile(rec.shugo_url);

  if (!result.success) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ فشل المزامنة")
          .setDescription(
            `**${rec.character_name ?? userId}**\n\n` +
            `تعذّر جلب البيانات من Shugo.gg:\n\`\`\`${result.error}\`\`\``
          )
          .setTimestamp(),
      ],
      components: [],
    });
    return;
  }

  const d = result.data;

  // ── Update recruits record ──────────────────────────────────────────────────
  await query(
    `UPDATE recruits
     SET character_name   = $1,
         character_level  = $2,
         class_name       = $3,
         combat_power     = $4,
         profile_image    = $5,
         race_name        = $6,
         server_name      = $7,
         abyss_rank       = $8,
         abyss_score      = $9,
         updated_at       = NOW()
     WHERE guild_id = $10 AND user_id = $11`,
    [
      d.characterName,
      d.characterLevel,
      d.className,
      d.combatPower      ?? 0,
      d.profileImage     ?? null,
      d.raceName         ?? null,
      d.serverName       ?? null,
      d.abyss?.rankName  ?? null,
      d.abyss?.score     ?? 0,
      interaction.guildId,
      userId,
    ]
  );

  // ── Update power_cards if it exists ────────────────────────────────────────
  await query(
    `UPDATE power_cards
     SET character_name  = $1,
         character_level = $2,
         class_name      = $3,
         combat_power    = $4,
         profile_image   = $5,
         abyss_rank      = $6,
         abyss_score     = $7,
         last_updated    = NOW()
     WHERE guild_id = $8 AND user_id = $9`,
    [
      d.characterName,
      d.characterLevel,
      d.className,
      d.combatPower      ?? 0,
      d.profileImage     ?? null,
      d.abyss?.rankName  ?? null,
      d.abyss?.score     ?? 0,
      interaction.guildId,
      userId,
    ]
  );

  // Also update the member's nickname to match the fresh character name
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member && d.characterName) {
    await member.setNickname(d.characterName).catch((e) =>
      console.warn(`[AdminPanels] Nickname update failed: ${e.message}`)
    );
  }

  const cp         = d.combatPower > 0 ? numFmt(d.combatPower) : "—";
  const classEmoji = CLASS_EMOJI[d.className] ?? "👤";

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`✅ تمت المزامنة — ${classEmoji} ${d.characterName}`)
    .setDescription(`> بيانات <@${userId}> محدّثة بنجاح من Shugo.gg\n> \`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\``)
    .setThumbnail(d.profileImage ?? null)
    .addFields(
      { name: "⚔️ الكلاس",    value: d.className            ?? "—",                         inline: true },
      { name: "📊 المستوى",   value: `${d.characterLevel    ?? 0}`,                          inline: true },
      { name: "💪 قوة القتال", value: `\`${cp}\``,                                            inline: true },
      { name: "🌍 السيرفر",   value: d.serverName           ?? "—",                         inline: true },
      { name: "🧬 العرق",     value: d.raceName             ?? "—",                         inline: true },
      { name: "🔄 تحديث",     value: `<t:${Math.floor(Date.now() / 1000)}:R>`,               inline: true },
    );


  embed
    .setFooter({ text: `تمت المزامنة بواسطة ${interaction.user.tag}` })
    .setTimestamp();

  // Add Shugo link row
  const linkRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setURL(rec.shugo_url)
      .setLabel("عرض البروفايل على Shugo.gg")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Link)
  );

  await interaction.editReply({ embeds: [embed], components: [linkRow] });
  console.log(
    `[AdminPanels] ✅ Synced ${d.characterName} (${userId}): ` +
    `Lv${d.characterLevel} ${d.className} • CP ${d.combatPower?.toLocaleString() ?? "—"}`
  );
}

// ─── Cancel ───────────────────────────────────────────────────────────────────
async function handleCancelMember(interaction) {
  await interaction.update({ content: "↩️ تم إغلاق لوحة إدارة الأعضاء.", embeds: [], components: [] });
}
