import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { query } from "../database/index.js";

// ─── Class Definitions ──────────────────────────────────────────────────────────

const FRONTLINE_CLASSES = ["Gladiator", "Templar"];
const DPS_CLASSES       = ["Sorcerer", "Spiritmaster", "Ranger", "Assassin"];
const SUPPORT_CLASSES   = ["Chanter", "Cleric"];

const CLASS_EMOJIS = {
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Templar:      "<:Templar:1504472027724255414>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Spiritmaster: "<:Elementalist:1504471920219783209>",
  Mentalist:    "<:Elementalist:1504471920219783209>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
};

const CLASS_OPTIONS = [
  { label: "Gladiator",    value: "Gladiator",    description: "Frontline — Tank/DPS",        emoji: "⚔️" },
  { label: "Templar",      value: "Templar",       description: "Frontline — Tank",            emoji: "🛡️" },
  { label: "Sorcerer",     value: "Sorcerer",      description: "DPS — Mage",                  emoji: "🔮" },
  { label: "Spiritmaster", value: "Spiritmaster",  description: "DPS — Spirit Mage",          emoji: "🌀" },
  { label: "Ranger",       value: "Ranger",        description: "DPS — Ranged",                emoji: "🏹" },
  { label: "Assassin",     value: "Assassin",      description: "DPS — Stealth Melee",         emoji: "🗡️" },
  { label: "Chanter",      value: "Chanter",       description: "Support — Buffer",            emoji: "🎵" },
  { label: "Cleric",       value: "Cleric",        description: "Support — Healer",            emoji: "✨" },
];

function getSlotType(className) {
  if (FRONTLINE_CLASSES.includes(className)) return "frontline";
  if (SUPPORT_CLASSES.includes(className))   return "support";
  return "dps";
}

// ─── Embed Renderer ─────────────────────────────────────────────────────────────

function renderSlot(slotData, pendingList, slotType, index, leaderId, noClasses) {
  const numEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
  const num = numEmojis[index] || "▪️";

  const slot = slotData ?? { status: "empty" };
  if (slot.status === "accepted") {
    const isLeader = slot.userId === leaderId;
    const crown = isLeader ? "👑 " : "";
    const emoji = noClasses ? "👤" : (CLASS_EMOJIS[slot.className] ?? "👤");
    const classTag = noClasses ? "" : ` **[${slot.className}]**`;
    return `${num} ${crown}<@${slot.userId}> ${emoji}${classTag} **تم ✅**`;
  }

  const pendingForType = pendingList.filter((p) => p.slotType === slotType);
  const pending = pendingForType[0];

  if (pending) {
    const emoji = noClasses ? "⏳" : (CLASS_EMOJIS[pending.className] ?? "⏳");
    const classTag = noClasses ? "" : ` **[${pending.className}]**`;
    return `${num} <@${pending.userId}> ${emoji}${classTag} **انتظار ⏳**`;
  }

  const typeLabel = noClasses ? "لاعب" : (slotType === "frontline" ? "Tanks" : slotType === "support" ? "Healers" : "DPS");
  return `${num} ▪️ **فارغ** (${typeLabel})`;
}

function buildGroupEmbed(group, leaderTag, isFull) {
  const pending = group.pending_applicants ?? [];
  
  // Fetch event name to determine type
  const eventNameFromDb = group.event_name_cached || ""; // We'll cache this soon or pass it
  const details = Object.values(EVENT_DETAILS).find(d => d.title === eventNameFromDb) || EVENT_DETAILS.farm_ap;
  const isForce = details.isForce || false;
  const maxMembers = details.maxMembers || 4;
  const noClasses = details.noClasses || false;
  const pointMins = details.pointMinutes || 30;

  const slots = [
    group.slot_frontline, // Index 0
    group.slot_dps1,      // Index 1
    group.slot_dps2,      // Index 2
    group.slot_support,   // Index 3
    group.slot_extra1,    // Index 4
    group.slot_extra2,    // Index 5
    group.slot_extra3,    // Index 6
    group.slot_extra4     // Index 7
  ];

  const acceptedCount = slots.filter(s => s?.status === 'accepted').length;

  let membersValue = "";
  if (isForce) {
    for (let i = 0; i < 8; i++) {
      membersValue += renderSlot(slots[i], [], "any", i, group.leader_id, noClasses) + "\n";
    }
  } else {
    // Original 4-slot layout with labels
    const fl = group.slot_frontline;
    const sup = group.slot_support;
    const dpsPending = pending.filter(p => p.slotType === 'dps');
    
    const d1 = group.slot_dps1 ?? { status: "empty" };
    const d2 = group.slot_dps2 ?? { status: "empty" };

    const renderDpsSlot = (slot, pIdx, num) => {
      if (slot.status === 'accepted') return `${num} <@${slot.userId}> ${CLASS_EMOJIS[slot.className] || "👤"} **تم ✅**`;
      if (dpsPending[pIdx]) return `${num} <@${dpsPending[pIdx].userId}> ${CLASS_EMOJIS[dpsPending[pIdx].className] || "⏳"} **انتظار ⏳**`;
      return `${num} ▪️ **فارغ** (DPS)`;
    };

    membersValue = 
      renderSlot(fl, pending.filter(p => p.slotType === 'frontline'), "frontline", 0, group.leader_id, false) + "\n" +
      renderDpsSlot(d1, 0, "2️⃣") + "\n" +
      renderDpsSlot(d2, 1, "3️⃣") + "\n" +
      renderSlot(sup, pending.filter(p => p.slotType === 'support'), "support", 3, group.leader_id, false);
  }

  const embed = new EmbedBuilder()
    .setColor(isFull ? 0x57f287 : (isForce ? 0x9b59b6 : 0x5865f2))
    .setTitle(isFull ? `✅ ${isForce ? "فورس كامل" : "مجموعة كاملة"}` : (isForce ? "⚔️ تحالف (Force) نشط" : "🏹 مجموعة نشطة"))
    .addFields(
      {
        name: "الأعضاء 👥",
        value: membersValue || "▪️ لا يوجد أعضاء بعد",
        inline: false,
      },
      {
        name: "قناة الصوت 🔊",
        value: details.voiceChannelId 
          ? `📢 **يجب على الجميع التوجه فوراً إلى:**\n🔊 <#${details.voiceChannelId}>\n*(هذا الحدث يتطلب التواجد الجماعي)*`
          : (group.vc_channel_id ? `<#${group.vc_channel_id}>` : "▫️ سيتم إنشاؤها عند اكتمال المجموعة"),
        inline: false,
      },
      {
        name: "شروط الحصول على النقاط 💎",
        value:
          `ابقَ في قناة الصوت لمدة **${pointMins} دقيقة** متواصلة للحصول على **+10 نقاط**.\n` +
          "المجموعة ستنتهي تلقائياً بعد **60 دقيقة**.",
        inline: false,
      }
    )
    .setFooter({ text: `معرّف ${isForce ? "التحالف" : "المجموعة"}: ${group.id}` })
    .setTimestamp();

  return embed;
}

// ─── DB Helpers ─────────────────────────────────────────────────────────────────

async function getGroup(groupId) {
  const res = await query("SELECT * FROM event_groups WHERE id=$1", [groupId]);
  return res.rows[0] ?? null;
}

async function updateGroupEmbed(client, group, leaderTag) {
  if (!group.group_embed_message_id || !group.group_embed_channel_id) return;
  const ch = client.channels.cache.get(group.group_embed_channel_id);
  if (!ch) return;
  const msg = await ch.messages.fetch(group.group_embed_message_id).catch(() => null);
  if (!msg) return;

  const embed = buildGroupEmbed(group, leaderTag, group.is_full);

  if (group.is_full) {
    await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
  } else {
    const joinBtn = new ButtonBuilder()
      .setCustomId(`event:join_group:${group.id}`)
      .setLabel("انضمام للمجموعة")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Primary);
    await msg.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(joinBtn)] }).catch(() => {});
  }
}

async function notifyLeader(client, group, leaderUser, applicantId, username, className) {
  const em = CLASS_EMOJIS[className] ?? "⚔️";
  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("📩 طلب انضمام جديد")
    .setDescription(`يريد <@${applicantId}> الانضمام إلى مجموعتك كـ **${em} ${className}**.`)
    .addFields({ name: "🆔 Group ID", value: `${group.id}`, inline: true })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:accept:${group.id}:${applicantId}`)
      .setLabel("✅ قبول")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`event:reject:${group.id}:${applicantId}`)
      .setLabel("❌ رفض")
      .setStyle(ButtonStyle.Danger)
  );

  let sent = false;
  try {
    await leaderUser.send({ embeds: [embed], components: [row] });
    sent = true;
  } catch { /* DMs disabled */ }

  if (!sent && group.group_embed_channel_id) {
    const ch = client.channels.cache.get(group.group_embed_channel_id);
    if (ch) {
      await ch.send({
        content: `<@${leaderUser.id}> — طلب انضمام جديد لمجموعتك:`,
        embeds: [embed],
        components: [row],
      });
    }
  }
}

// ─── Main Router ────────────────────────────────────────────────────────────────

export async function handleInteraction(interaction) {
  const parts  = interaction.customId.split(":");
  const action = parts[1];

  switch (action) {
    case "create_group":    return handleCreateGroup(interaction, parts[2]);
    case "join_group":      return handleJoinGroup(interaction, parts[2]);
    case "accept":          return acceptApplicant(interaction, parts[2], parts[3]);
    case "reject":          return rejectApplicant(interaction, parts[2], parts[3]);
    case "end":             return endEvent(interaction, parts[2]);
    default:
      console.warn(`[Events] Unknown action: ${action}`);
  }
}

// ─── Class Lookup ───────────────────────────────────────────────────────────────

async function getUserClass(guildId, userId) {
  const res = await query(
    "SELECT class_name FROM recruits WHERE guild_id=$1 AND user_id=$2 AND status='accepted' LIMIT 1",
    [guildId, userId]
  );
  return res.rows[0]?.class_name ?? null;
}

// ─── Event Panel ────────────────────────────────────────────────────────────────

const EVENT_DETAILS = {
  siege: {
    title: "حصار التحالف (Alliance Siege)",
    description: "السيج هو الركيزة الأساسية لسيادتنا وسيطرتنا على بوابات الأبيس (Abyss Gates). مشاركتك ليست مجرد خيار، بل هي واجب وطني لتعزيز قوة تحالفنا في السيرفر. الامتناع أو التكاسل يضعف شوكتنا أمام الخصوم!\n\n" +
      "📍 **مكان الفعالية:**\n" +
      "سيرفر تحالف المعرقين (M3RGEEN Alliance Server) - القنوات الصوتية المخصصة للسيج.\n\n" +
      "📜 **شروط المشاركة:**\n" +
      "1️⃣ التواجد والانضمام للقنوات الصوتية في سيرفر التحالف خلال وقت السيج.\n" +
      "2️⃣ الالتزام الكامل بتعليمات القادة والتعاون مع بقية الفورسز.",
    color: 0xc0392b,
    image: "attachment://siege.jpg",
    voiceChannelId: "1504419701642760292", // Shared Battle Room
    pointMinutes: 50,
    maxMembers: 8,
    isForce: true,
    noClasses: true,
    instantJoin: true,
    mentionRoleId: "1401376073077231702" // @AION 2 Guild
  },
  farm_ap: {
    title: "فارم ابيس بوينت (Farm AP)",
    description: "تنظيم حملات الفارم ضرورية لأعضاء قيلدنا لأنها تضخ كمية هائلة من القوة كتطوير مهارات الاستيقما وشراء دروع وأسلحة وإكسسوارات الابيس المطلوبة (End Game). مساهمتك تعني حرصك على قوة القيلد.",
    color: 0x2ecc71,
    image: "attachment://farm_ap.jpg",
    voiceChannelId: null, // Private VCs
    pointMinutes: 30,
    maxMembers: 4,
    isForce: false,
    noClasses: false,
    instantJoin: false
  }
};

export async function sendEventPanel(interaction, eventKey) {
  const details = EVENT_DETAILS[eventKey] || {
    title: eventKey,
    description: "**الحدث نشط الآن!**",
    color: 0xf1c40f,
    image: null
  };

  const maxMembers = details.maxMembers || 4;
  const pointMins = details.pointMinutes || 30;
  const groupLabel = details.isForce ? "فورس" : "مجموعة";
  const classText = details.noClasses ? "الانضمام مفتوح لكل الكلاسات" : "Frontline · DPS × 2 · Support";

  const isSiege = eventKey === "siege";

  const descriptionText = isSiege
    ? `${details.description}\n\n` +
      `🌐 **الموقع:** التواجد في سيرفر التحالف (Alliance Server)\n` +
      `⏱️ **المدة المطلوبة:** ابقَ **${pointMins} دقيقة** في القناة الصوتية للحصول على النقاط.\n` +
      `⚡ **النظام تلقائي:** يتم رصد الحضور واحتساب النقاط آلياً بالكامل فور انتهاء الفعالية.\n` +
      `⚠️ **تنبيه:** المغادرة قبل انتهاء الوقت المحدد تُسجَّل كـ **Withdrawal** وتلغي نقاطك.`
    : `${details.description}\n\n` +
      `🎮 اضغط **إنشاء ${groupLabel}** لتشكيل فريقك.\n` +
      `👥 كل ${groupLabel}: **${maxMembers} لاعبين** — ${classText}\n` +
      `⏱️ ابقَ **${pointMins} دقيقة** في الغرفة الصوتية للحصول على **+10 نقاط**.\n` +
      "⚠️ المغادرة المبكرة تُسجَّل كـ **Withdrawal**.";

  const embed = new EmbedBuilder()
    .setColor(details.color)
    .setTitle(`⚔️ ${details.title}`)
    .setDescription(descriptionText)
    .setFooter({ text: "M3RGEEN Events System" })
    .setTimestamp();

  const files = [];
  if (details.image && details.image.startsWith("attachment://")) {
    const fileName = details.image.replace("attachment://", "");
    const path = await import("path");
    const fs = await import("fs");
    const fullPath = path.join(process.cwd(), "src", "assets", fileName);
    if (fs.existsSync(fullPath)) {
      const { AttachmentBuilder } = await import("discord.js");
      files.push(new AttachmentBuilder(fullPath, { name: fileName }));
      embed.setImage(`attachment://${fileName}`);
    }
  } else if (details.image) {
    embed.setImage(details.image);
  }

  const placeholder = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("event:create_group:_TMP_").setLabel("إنشاء مجموعة").setEmoji("🎮").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("event:end:_TMP_").setLabel("إنهاء الحدث").setEmoji("🔴").setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  const isMainGuild = interaction.guildId === (process.env.MAIN_GUILD_ID || "861355983975874601");
  const configRes = await query("SELECT legion_role_id FROM guild_config WHERE guild_id=$1", [interaction.guildId]);
  const legionRoleId = configRes.rows[0]?.legion_role_id;
  
  const finalMentionId = (isMainGuild ? details.mentionRoleId : null) || legionRoleId;
  const mention = finalMentionId ? `<@&${finalMentionId}>` : "";

  // Siege events have NO group buttons — fully automated via siegeMonitor
  // isSiege is already declared above

  const msg = await interaction.channel.send({
    content: `${mention} **.بدأت فعالية جديدة! شكلوا مجموعاتكم الآن 🚀**`,
    embeds: [embed],
    components: isSiege ? [] : [placeholder],
    files: files
  });

  const evRes = await query(
    "INSERT INTO point_events (guild_id, name, channel_id, message_id, started_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [interaction.guildId, details.title, interaction.channelId, msg.id, interaction.user.id]
  );
  const eventId = evRes.rows[0].id;

  // Only add control buttons for non-siege events
  if (!isSiege) {
    const liveRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`event:create_group:${eventId}`).setLabel("إنشاء مجموعة").setEmoji("🎮").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`event:end:${eventId}`).setLabel("إنهاء الحدث").setEmoji("🔴").setStyle(ButtonStyle.Danger)
    );
    await msg.edit({ components: [liveRow] });
  }

  const isRealInteraction = interaction.deferred === false && typeof interaction.editReply === "function";
  if (isRealInteraction) {
    await interaction.editReply({ content: `✅ تم إطلاق الحدث **${details.title}** (#${eventId}).` });
  }

  console.log(`[Events] Event #${eventId} "${details.title}" started`);
}

// ─── Step 1: Leader picks class ─────────────────────────────────────────────────

// ─── Step 1: Create Group (Auto-Class) ──────────────────────────────────────────

async function handleCreateGroup(interaction, eventId) {
  const evRes = await query(
    "SELECT id FROM point_events WHERE id=$1 AND guild_id=$2 AND active=TRUE",
    [eventId, interaction.guildId]
  );
  if (!evRes.rows[0]) {
    await interaction.reply({ content: "❌ هذا الحدث لم يعد نشطاً.", flags: 64 });
    return;
  }

  const uid = interaction.user.id;
  const className = await getUserClass(interaction.guildId, uid);

  if (!className) {
    await interaction.reply({
      content: "⚠️ **عذراً، لا يمكنك إنشاء مجموعة.**\nيجب أن تكون عضواً مسجلاً ومقبولاً في القيلد أولاً (تأكد من مزامنة بياناتك من Shugo.gg).",
      flags: 64,
    });
    return;
  }

  const inGroup = await query(
    `SELECT id FROM event_groups WHERE event_id=$1 AND guild_id=$2
     AND (leader_id=$3
       OR (slot_frontline->>'userId')=$3
       OR (slot_dps1->>'userId')=$3
       OR (slot_dps2->>'userId')=$3
       OR (slot_support->>'userId')=$3
       OR pending_applicants @> $4::jsonb)`,
    [eventId, interaction.guildId, uid, JSON.stringify([{ userId: uid }])]
  );
  if (inGroup.rows.length > 0) {
    await interaction.reply({ content: "⚠️ أنت بالفعل في مجموعة لهذا الحدث.", flags: 64 });
    return;
  }

  await createGroupWithLeader(interaction, eventId, className);
}

async function createGroupWithLeader(interaction, eventId, className) {
  await interaction.deferReply({ flags: 64 });

  const slotType   = getSlotType(className);
  const leaderTag  = interaction.user.username;
  const uid        = interaction.user.id;

  const accepted = JSON.stringify({ status: "accepted", userId: uid, username: leaderTag, className });
  const empty    = JSON.stringify({ status: "empty" });

  const fl = slotType === "frontline" ? accepted : empty;
  const d1 = slotType === "dps"       ? accepted : empty;
  const d2 = empty;
  const su = slotType === "support"   ? accepted : empty;

  const eventRes = await query("SELECT name FROM point_events WHERE id=$1", [eventId]);
  const eventName = eventRes.rows[0]?.name || "Event";

  const res = await query(
    `INSERT INTO event_groups
       (guild_id, event_id, group_name, leader_id,
        slot_frontline, slot_dps1, slot_dps2, slot_support,
        slot_extra1, slot_extra2, slot_extra3, slot_extra4,
        event_name_cached, pending_applicants)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,'[]'::jsonb)
     RETURNING id`,
    [interaction.guildId, eventId, `Group-${leaderTag}`, uid, fl, d1, d2, su, empty, empty, empty, empty, eventName]
  );
  const groupId = res.rows[0].id;

  const group = await getGroup(groupId);
  const embed = buildGroupEmbed(group, leaderTag, false);

  const joinBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:join_group:${groupId}`)
      .setLabel("انضمام للمجموعة")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Primary)
  );

  const embedMsg = await interaction.channel.send({ embeds: [embed], components: [joinBtn] });

  await query(
    "UPDATE event_groups SET group_embed_channel_id=$1, group_embed_message_id=$2 WHERE id=$3",
    [interaction.channelId, embedMsg.id, groupId]
  );

  await interaction.editReply({
    content:
      `✅ تم إنشاء مجموعتك بنجاح كـ **${CLASS_EMOJIS[className] ?? ""} ${className}**!\n` +
      `بناءً على توزيع الفئات: **${slotType.toUpperCase()}**.\n` +
      `انتظر انضمام الأعضاء — ستُنشأ الغرفة الصوتية تلقائياً عند اكتمال المجموعة.`,
  });
}

// ─── Step 3: Applicant picks class ──────────────────────────────────────────────

// ─── Step 2: Join Group (Auto-Class) ────────────────────────────────────────────

async function handleJoinGroup(interaction, groupId) {
  const group = await getGroup(groupId);
  if (!group) {
    await interaction.reply({ content: "❌ هذه المجموعة غير موجودة.", flags: 64 });
    return;
  }
  if (group.is_full) {
    await interaction.reply({ content: "❌ هذه المجموعة ممتلئة بالفعل.", flags: 64 });
    return;
  }

  const uid = interaction.user.id;
  const className = await getUserClass(interaction.guildId, uid);

  if (!className) {
    await interaction.reply({
      content: "⚠️ **عذراً، لا يمكنك الانضمام.**\nيجب أن تكون عضواً مسجلاً ومقبولاً في القيلد أولاً.",
      flags: 64,
    });
    return;
  }

  const isLeader   = group.leader_id === uid;
  const isAccepted =
    group.slot_frontline?.userId === uid ||
    group.slot_dps1?.userId      === uid ||
    group.slot_dps2?.userId      === uid ||
    group.slot_support?.userId   === uid;
  const isPending  = (group.pending_applicants ?? []).some((p) => p.userId === uid);

  if (isLeader || isAccepted || isPending) {
    await interaction.reply({ content: "⚠️ أنت بالفعل في هذه المجموعة أو طلبك قيد المراجعة.", flags: 64 });
    return;
  }

  // Fetch details to check instantJoin
  const eventRes = await query("SELECT name FROM point_events WHERE id=$1", [group.event_id]);
  const details = Object.values(EVENT_DETAILS).find(d => d.title === eventRes.rows[0]?.name) || EVENT_DETAILS.farm_ap;

  if (details.instantJoin) {
    return addMemberDirectly(interaction, group, className);
  }

  await submitApplication(interaction, groupId, className);
}

async function addMemberDirectly(interaction, group, className) {
  await interaction.deferReply({ flags: 64 });

  const slots = [
    "slot_frontline", "slot_dps1", "slot_dps2", "slot_support",
    "slot_extra1", "slot_extra2", "slot_extra3", "slot_extra4"
  ];
  
  let targetCol = null;
  for (const col of slots) {
    if (!group[col] || group[col].status === 'empty') {
      targetCol = col;
      break;
    }
  }

  if (!targetCol) {
    await interaction.editReply({ content: "❌ عذراً، التحالف ممتلئ بالكامل." });
    return;
  }

  const slotVal = JSON.stringify({ status: "accepted", userId: interaction.user.id, username: interaction.user.username, className });
  await query(`UPDATE event_groups SET ${targetCol}=$1::jsonb WHERE id=$2`, [slotVal, group.id]);

  const updated = await getGroup(group.id);
  const leaderMbr = await interaction.guild.members.fetch(group.leader_id).catch(() => null);
  const leaderTag = leaderMbr?.user?.username ?? "Leader";

  // Check if full
  const eventRes = await query("SELECT name FROM point_events WHERE id=$1", [group.event_id]);
  const details = Object.values(EVENT_DETAILS).find(d => d.title === eventRes.rows[0]?.name) || EVENT_DETAILS.farm_ap;
  const max = details.maxMembers || 4;
  const current = [
    updated.slot_frontline, updated.slot_dps1, updated.slot_dps2, updated.slot_support,
    updated.slot_extra1, updated.slot_extra2, updated.slot_extra3, updated.slot_extra4
  ].filter(s => s?.status === 'accepted').length;

  if (current >= max) {
    await query("UPDATE event_groups SET is_full=TRUE WHERE id=$1", [group.id]);
    updated.is_full = true;
    await onGroupComplete(interaction, updated, leaderTag);
  } else {
    await updateGroupEmbed(interaction.client, updated, leaderTag);
  }

  await interaction.editReply({ content: "✅ تم انضمامك إلى التحالف بنجاح!" });
}

async function submitApplication(interaction, groupId, className) {
  await interaction.deferReply({ flags: 64 });

  const slotType  = getSlotType(className);
  const uid       = interaction.user.id;
  const username  = interaction.user.username;

  const group = await getGroup(groupId);
  if (!group || group.is_full) {
    await interaction.editReply({ content: "❌ المجموعة ممتلئة أو غير موجودة." });
    return;
  }

  const pendingForType   = (group.pending_applicants ?? []).filter((p) => p.slotType === slotType);
  const acceptedFrontline = group.slot_frontline?.status === "accepted";
  const acceptedSupport   = group.slot_support?.status === "accepted";
  const acceptedDpsCount  = [group.slot_dps1, group.slot_dps2].filter((s) => s?.status === "accepted").length;

  if (slotType === "frontline" && (acceptedFrontline || pendingForType.length >= 1)) {
    await interaction.editReply({ content: "❌ مقعد Frontline ممتلئ أو في انتظار موافقة قائد المجموعة." });
    return;
  }
  if (slotType === "support" && (acceptedSupport || pendingForType.length >= 1)) {
    await interaction.editReply({ content: "❌ مقعد Support ممتلئ أو في انتظار موافقة قائد المجموعة." });
    return;
  }
  if (slotType === "dps" && acceptedDpsCount + pendingForType.length >= 2) {
    await interaction.editReply({ content: "❌ مقاعد DPS ممتلئة أو في انتظار موافقة قائد المجموعة." });
    return;
  }

  const newPending = [
    ...(group.pending_applicants ?? []),
    { userId: uid, username, className, slotType, appliedAt: new Date().toISOString() },
  ];

  await query(
    "UPDATE event_groups SET pending_applicants=$1::jsonb WHERE id=$2",
    [JSON.stringify(newPending), groupId]
  );

  const updated    = await getGroup(groupId);
  const leaderMbr  = await interaction.guild.members.fetch(group.leader_id).catch(() => null);
  const leaderTag  = leaderMbr?.user?.username ?? "Leader";
  await updateGroupEmbed(interaction.client, updated, leaderTag);

  if (leaderMbr) {
    await notifyLeader(interaction.client, updated, leaderMbr.user, uid, username, className);
  }

  await interaction.editReply({
    content:
      `✅ تم إرسال طلبك كـ **${CLASS_EMOJIS[className] ?? ""} ${className}**.\n` +
      `سيتم إشعارك عند موافقة قائد المجموعة.`,
  });
}

// ─── Step 5a: Accept ────────────────────────────────────────────────────────────

async function acceptApplicant(interaction, groupId, applicantId) {
  await interaction.deferUpdate();

  const group     = await getGroup(groupId);
  if (!group) { await interaction.editReply({ content: "❌ المجموعة غير موجودة.", components: [] }); return; }

  const applicant = (group.pending_applicants ?? []).find((p) => p.userId === applicantId);
  if (!applicant) { await interaction.editReply({ content: "⚠️ الطلب لم يعد موجوداً.", components: [] }); return; }

  const { slotType, className, username } = applicant;
  const slotVal = JSON.stringify({ status: "accepted", userId: applicantId, username, className });

  let colName = null;
  if (slotType === "frontline" && group.slot_frontline?.status !== "accepted") colName = "slot_frontline";
  else if (slotType === "support" && group.slot_support?.status !== "accepted")   colName = "slot_support";
  else if (slotType === "dps") {
    if (group.slot_dps1?.status !== "accepted") colName = "slot_dps1";
    else if (group.slot_dps2?.status !== "accepted") colName = "slot_dps2";
  }

  if (!colName) {
    await interaction.editReply({ content: "❌ لا توجد مقاعد متاحة لهذه الفئة.", components: [] });
    return;
  }

  const newPending = (group.pending_applicants ?? []).filter((p) => p.userId !== applicantId);

  await query(
    `UPDATE event_groups SET ${colName}=$1::jsonb, pending_applicants=$2::jsonb WHERE id=$3`,
    [slotVal, JSON.stringify(newPending), groupId]
  );

  const updated   = await getGroup(groupId);
  const leaderMbr = await interaction.guild.members.fetch(group.leader_id).catch(() => null);
  const leaderTag = leaderMbr?.user?.username ?? "Leader";

  const allFilled = [updated.slot_frontline, updated.slot_dps1, updated.slot_dps2, updated.slot_support]
    .every((s) => s?.status === "accepted");

  if (allFilled) {
    await query("UPDATE event_groups SET is_full=TRUE WHERE id=$1", [groupId]);
    updated.is_full = true;
    await onGroupComplete(interaction, updated, leaderTag);
  } else {
    await updateGroupEmbed(interaction.client, updated, leaderTag);
  }

  const applicantUser = await interaction.client.users.fetch(applicantId).catch(() => null);
  if (applicantUser) {
    await applicantUser.send({
      content: `✅ تم قبولك في **Group — ${leaderTag}** كـ **${CLASS_EMOJIS[className] ?? ""} ${className}**!`,
    }).catch(() => {});
  }

  await interaction.editReply({ content: `✅ تم قبول **${username}**.`, components: [] });
}

// ─── Step 5b: Reject ────────────────────────────────────────────────────────────

async function rejectApplicant(interaction, groupId, applicantId) {
  await interaction.deferUpdate();

  const group = await getGroup(groupId);
  if (!group) { await interaction.editReply({ content: "❌ المجموعة غير موجودة.", components: [] }); return; }

  const applicant = (group.pending_applicants ?? []).find((p) => p.userId === applicantId);
  if (!applicant) { await interaction.editReply({ content: "⚠️ الطلب لم يعد موجوداً.", components: [] }); return; }

  const newPending = group.pending_applicants.filter((p) => p.userId !== applicantId);
  await query("UPDATE event_groups SET pending_applicants=$1::jsonb WHERE id=$2", [JSON.stringify(newPending), groupId]);

  const updated   = await getGroup(groupId);
  const leaderMbr = await interaction.guild.members.fetch(group.leader_id).catch(() => null);
  const leaderTag = leaderMbr?.user?.username ?? "Leader";
  await updateGroupEmbed(interaction.client, updated, leaderTag);

  const applicantUser = await interaction.client.users.fetch(applicantId).catch(() => null);
  if (applicantUser) {
    await applicantUser.send({
      content: `❌ تم رفض طلب انضمامك إلى **Group — ${leaderTag}**. يمكنك المحاولة مع مجموعة أخرى.`,
    }).catch(() => {});
  }

  await interaction.editReply({ content: `❌ تم رفض **${applicant.username}**.`, components: [] });
}

// ─── Group Complete → Create VC ─────────────────────────────────────────────────

async function onGroupComplete(interaction, group, leaderTag) {
  const eventRes = await query("SELECT name FROM point_events WHERE id=$1", [group.event_id]);
  const eventName = eventRes.rows[0]?.name;
  const details = Object.values(EVENT_DETAILS).find(d => d.title === eventName) || EVENT_DETAILS.farm_ap;

  const isMainGuild = interaction.guildId === (process.env.MAIN_GUILD_ID || "861355983975874601");
  let vcId = isMainGuild ? details.voiceChannelId : null;
  let vc = null;

  if (!vcId) {
    const configRes = await query(
      "SELECT event_category_id FROM guild_config WHERE guild_id=$1",
      [interaction.guildId]
    );
    const categoryId = configRes.rows[0]?.event_category_id ?? null;

    const slots    = [group.slot_frontline, group.slot_dps1, group.slot_dps2, group.slot_support].filter(Boolean);
    const memberIds = slots.map((s) => s.userId);

    vc = await interaction.guild.channels.create({
      name: `Group — ${leaderTag}`,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      userLimit: 4,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] },
        ...memberIds.map((id) => ({
          id,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
        })),
      ],
    });
    vcId = vc.id;
    await query("UPDATE event_groups SET vc_channel_id=$1 WHERE id=$2", [vcId, group.id]);
  } else {
    vc = interaction.guild.channels.cache.get(vcId) || await interaction.guild.channels.fetch(vcId).catch(() => null);
  }

  const slots = [group.slot_frontline, group.slot_dps1, group.slot_dps2, group.slot_support].filter(s => s?.status === 'accepted');
  for (const slot of slots) {
    await query(
      `INSERT INTO voice_sessions (guild_id, user_id, channel_id, event_id, group_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [group.guild_id, slot.userId, vcId, group.event_id, group.id]
    );
  }

  await updateGroupEmbed(interaction.client, group, leaderTag);

  const ch = interaction.client.channels.cache.get(group.group_embed_channel_id);
  if (ch) {
    const memberIds = slots.map((s) => s.userId);
    const mentions = memberIds.map((id) => `<@${id}>`).join(" ");
    await ch.send({
      content:
        `🎉 **اكتملت المجموعة!** ${mentions}\n` +
        `🔊 توجهوا إلى الغرفة الصوتية: ${vc || `<#${vcId}>`}\n` +
        `⏱️ ابقوا **${details.pointMinutes || 30} دقيقة** للحصول على **+10 نقاط** لكل لاعب!`,
    });
  }
}

// ─── End Event ──────────────────────────────────────────────────────────────────

async function endEvent(interaction, eventId) {
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "❌ ليس لديك صلاحية إنهاء الحدث.", flags: 64 });
    return;
  }
  await interaction.deferReply({ flags: 64 });

  await query(
    "UPDATE point_events SET active=FALSE, ended_at=NOW() WHERE id=$1 AND guild_id=$2",
    [eventId, interaction.guildId]
  );

  const groups = await query(
    "SELECT vc_channel_id FROM event_groups WHERE event_id=$1 AND guild_id=$2",
    [eventId, interaction.guildId]
  );
  for (const row of groups.rows) {
    if (!row.vc_channel_id) continue;
    const ch = interaction.guild.channels.cache.get(row.vc_channel_id);
    if (ch) await ch.delete().catch(() => {});
  }

  const endEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🔴 الحدث انتهى")
    .setDescription(`تم إنهاء الحدث بواسطة ${interaction.user}.\nتحقق من نقاطك بـ \`/my_points\``)
    .setTimestamp();

  await interaction.message.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
  await interaction.editReply({ content: `✅ تم إنهاء الحدث #${eventId} وحذف جميع الغرف.` });
}
