import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { publishOverlayEvent } from "../database/index.js";

const TL_JOIN_CHANNEL_ID = "1509250363939880990";
const TL_MEMBERS_CHANNEL_ID = "1511464947425476799";
const TL_MEMBER_ROLE_ID = "1292754458492796982";

// تخزين بيانات اللاعب بين خطوات النموذج
const userSelections = new Map();

// ─── القوانين ───────────────────────────────────────────────────────────────
const RULES_TEXT = [
  "**📜 قوانين جيلد Throne and Liberty (على الخفيف):**\n",
  "١- 🎁 **اللوت لك:** القطعة اللي تطيح باسمك هي حلالك، إلا إذا حبيت تتنازل عنها أو تهديها لأحد أخوانك.",
  "٢- 🛡️ **تطوير الجيلد:** مشاركتك في أحداث وفعاليات الجيلد ضرورية عشان نرفع مستوانا وقوتنا مع بعض.",
  "٣- ⚔️ **فزعات الـ PvP:** وقت أحداث الجيلد الخاصة بالـ PvP، حضورك يفرق معنا كثير ونحتاجك بالصفوف الأولى.",
  "٤- 🎤 **إثبات النشاط:** الروم الصوتي هو مقرنا الأساسي، وتواجدك فيه هو اللي يحسب ويثبت نشاطك وتفاعلك.",
  "٥- 💤 **الغياب والخمول:** إذا بتوقف فترة أو تطلع، بس عطنا خبر. البوت مبرمج يطلع الحسابات الخاملة تلقائياً عشان نعطي فرصة للنشطين.\n",
  "📌 **طريقة الانضمام:**",
  "تأكد من اختيار الكلاس الصحيح لشخصيتك الموجودة **داخل الجيلد**، وليس لشخصياتك الثانية اللي برا الجيلد. أكمل الخطوات التالية لإصدار بطاقتك.",
].join("\n");

// ─── قوائم الكلاسات ──────────────────────────────────────────────────────────
const NEW_CLASSES = [
  { label: "Brawler",    value: "Brawler||Gauntlet + Greatsword",  description: "Gauntlet + Greatsword" },
  { label: "Ironclad",   value: "Ironclad||Gauntlet + Sword",      description: "Gauntlet + Sword" },
  { label: "Striker",    value: "Striker||Gauntlet + Dagger",      description: "Gauntlet + Dagger" },
  { label: "Vanguard",   value: "Vanguard||Gauntlet + Spear",      description: "Gauntlet + Spear" },
  { label: "Skirmisher", value: "Skirmisher||Gauntlet + Longbow",  description: "Gauntlet + Longbow" },
  { label: "Commando",   value: "Commando||Gauntlet + Crossbow",   description: "Gauntlet + Crossbow" },
  { label: "Geomancer",  value: "Geomancer||Gauntlet + Staff",     description: "Gauntlet + Staff" },
  { label: "Mystic",     value: "Mystic||Gauntlet + Wand",         description: "Gauntlet + Wand" },
  { label: "Kinetic",    value: "Kinetic||Gauntlet + Orb",         description: "Gauntlet + Orb" },
];

const CURRENT_CLASSES_1 = [
  { label: "Battleweaver", value: "Battleweaver||Crossbow + Staff",    description: "Crossbow + Staff" },
  { label: "Berserker",    value: "Berserker||Sword + Dagger",         description: "Sword + Dagger" },
  { label: "Cavalier",     value: "Cavalier||Spear + Crossbow",        description: "Spear + Crossbow" },
  { label: "Crucifix",     value: "Crucifix||Crossbow + Orb",          description: "Crossbow + Orb" },
  { label: "Crusader",     value: "Crusader||Greatsword + Sword",      description: "Greatsword + Sword" },
  { label: "Darkblighter", value: "Darkblighter||Wand + Dagger",       description: "Wand + Dagger" },
  { label: "Disciple",     value: "Disciple||Staff + Sword",           description: "Staff + Sword" },
  { label: "Enigma",       value: "Enigma||Staff + Orb",               description: "Staff + Orb" },
  { label: "Eradicator",   value: "Eradicator||Staff + Spear",         description: "Staff + Spear" },
  { label: "Fury",         value: "Fury||Crossbow + Wand",             description: "Crossbow + Wand" },
  { label: "Gladiator",    value: "Gladiator||Spear + Greatsword",     description: "Spear + Greatsword" },
  { label: "Guardian",     value: "Guardian||Orb + Sword",             description: "Orb + Sword" },
  { label: "Impaler",      value: "Impaler||Longbow + Spear",          description: "Longbow + Spear" },
  { label: "Infiltrator",  value: "Infiltrator||Longbow + Dagger",     description: "Longbow + Dagger" },
  { label: "Invocator",    value: "Invocator||Staff + Wand",           description: "Staff + Wand" },
  { label: "Justicar",     value: "Justicar||Greatsword + Orb",        description: "Greatsword + Orb" },
  { label: "Liberator",    value: "Liberator||Longbow + Staff",        description: "Longbow + Staff" },
  { label: "Lunarch",      value: "Lunarch||Orb + Dagger",             description: "Orb + Dagger" },
];

const CURRENT_CLASSES_2 = [
  { label: "Oracle",       value: "Oracle||Wand + Orb",               description: "Wand + Orb" },
  { label: "Outrider",     value: "Outrider||Greatsword + Crossbow",  description: "Greatsword + Crossbow" },
  { label: "Paladin",      value: "Paladin||Greatsword + Wand",       description: "Greatsword + Wand" },
  { label: "Polaris",      value: "Polaris||Spear + Orb",             description: "Spear + Orb" },
  { label: "Raider",       value: "Raider||Crossbow + Sword",         description: "Crossbow + Sword" },
  { label: "Ranger",       value: "Ranger||Greatsword + Longbow",     description: "Greatsword + Longbow" },
  { label: "Ravager",      value: "Ravager||Greatsword + Dagger",     description: "Greatsword + Dagger" },
  { label: "Scorpion",     value: "Scorpion||Crossbow + Dagger",      description: "Crossbow + Dagger" },
  { label: "Scout",        value: "Scout||Longbow + Crossbow",        description: "Longbow + Crossbow" },
  { label: "Scryer",       value: "Scryer||Longbow + Orb",            description: "Longbow + Orb" },
  { label: "Seeker",       value: "Seeker||Wand + Longbow",           description: "Wand + Longbow" },
  { label: "Sentinel",     value: "Sentinel||Greatsword + Staff",     description: "Greatsword + Staff" },
  { label: "Shadowdancer", value: "Shadowdancer||Spear + Dagger",     description: "Spear + Dagger" },
  { label: "Spellblade",   value: "Spellblade||Dagger + Staff",       description: "Dagger + Staff" },
  { label: "Steelheart",   value: "Steelheart||Spear + Sword",        description: "Spear + Sword" },
  { label: "Templar",      value: "Templar||Wand + Sword",            description: "Wand + Sword" },
  { label: "Voidlance",    value: "Voidlance||Spear + Wand",          description: "Spear + Wand" },
  { label: "Warden",       value: "Warden||Longbow + Sword",          description: "Longbow + Sword" },
];

// ─── إعداد نموذج الانضمام ───────────────────────────────────────────────────
export async function setupThroneJoinEmbed(interaction) {
  const channel = interaction.guild.channels.cache.get(TL_JOIN_CHANNEL_ID) ||
    await interaction.guild.channels.fetch(TL_JOIN_CHANNEL_ID).catch(() => null);

  if (!channel) {
    return interaction.reply({ content: "❌ لم يتم العثور على روم الانضمام.", ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle("⚔️ الانضمام لجيلد Throne and Liberty")
    .setDescription(RULES_TEXT)
    .setColor("#8B0000")
    .setFooter({ text: "Throne and Liberty • M3RGEEN Gaming Community" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("throne:join")
      .setLabel("الانضمام للجيلد ⚔️")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "✅ تم إرسال نموذج الانضمام بنجاح.", ephemeral: true });
}

// ─── الخطوة 1: زر الانضمام ──────────────────────────────────────────────────
async function handleJoinButton(interaction) {
  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("throne:class_new")
      .setPlaceholder("🆕 كلاسات جديدة (Gauntlet)")
      .addOptions(NEW_CLASSES)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("throne:class_cur1")
      .setPlaceholder("⚔️ كلاسات حالية — Battleweaver إلى Lunarch")
      .addOptions(CURRENT_CLASSES_1)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("throne:class_cur2")
      .setPlaceholder("⚔️ كلاسات حالية — Oracle إلى Warden")
      .addOptions(CURRENT_CLASSES_2)
  );

  await interaction.reply({
    content: "**الخطوة 1/4 — اختر كلاسك ⚔️**\n> اختر من إحدى القوائم أدناه حسب كلاسك داخل الجيلد.",
    components: [row1, row2, row3],
    ephemeral: true,
  });
}

// ─── الخطوة 2: اختيار الكلاس → عرض أسلوب اللعب ────────────────────────────
async function handleClassSelect(interaction) {
  const [className, weapons] = interaction.values[0].split("||");
  userSelections.set(interaction.user.id, { className, weapons });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("throne:playstyle")
      .setPlaceholder("اختر أسلوب لعبك...")
      .addOptions([
        { label: "PVP",  value: "PVP",  description: "المعارك بين اللاعبين",    emoji: "⚔️" },
        { label: "PVE",  value: "PVE",  description: "زنازين وبوسات وأحداث PvE", emoji: "🐉" },
        { label: "PVX",  value: "PVX",  description: "كل شيء! PvP + PvE",       emoji: "🌟" },
      ])
  );

  await interaction.update({
    content: `✅ الكلاس: **${className}** — ${weapons}\n\n**الخطوة 2/4 — اختر أسلوب لعبك:**`,
    components: [row],
  });
}

// ─── الخطوة 3: اختيار أسلوب اللعب → عرض وضع اللاعب ────────────────────────
async function handlePlaystyle(interaction) {
  const playstyle = interaction.values[0];
  const data = userSelections.get(interaction.user.id) || {};
  userSelections.set(interaction.user.id, { ...data, playstyle });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("throne:status")
      .setPlaceholder("اختر وضعك الحالي في اللعبة...")
      .addOptions([
        { label: "لاعب جديد في اللعبة",    value: "لاعب جديد في اللعبة",    description: "New Player",       emoji: "🌱" },
        { label: "لاعب راجع للعبة",         value: "لاعب راجع للعبة",         description: "Returning Player", emoji: "🔄" },
        { label: "مستمر باللعب إلى اليوم",  value: "مستمر باللعب إلى اليوم",  description: "Active Player",    emoji: "🔥" },
      ])
  );

  await interaction.update({
    content: `✅ أسلوب اللعب: **${playstyle}**\n\n**الخطوة 3/4 — ما هو وضعك الحالي في اللعبة؟**`,
    components: [row],
  });
}

// ─── الخطوة 4: اختيار الوضع → زر الموافقة النهائية ─────────────────────────
async function handleStatus(interaction) {
  const status = interaction.values[0];
  const data = userSelections.get(interaction.user.id) || {};
  userSelections.set(interaction.user.id, { ...data, status });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("throne:agree")
      .setLabel("أوافق على الانضمام والقوانين ✅")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.update({
    content: [
      `✅ الوضع: **${status}**\n`,
      `**الخطوة 4/4 — الموافقة النهائية:**`,
      `> بالضغط على الزر أدناه، تؤكد موافقتك على جميع قوانين الجيلد وتقدّم طلب انضمامك رسمياً.`,
    ].join("\n"),
    components: [row],
  });
}

// ─── الخطوة 5: الموافقة → إصدار طلب للإدارة ───────────────────────────────
async function handleAgree(interaction) {
  const data = userSelections.get(interaction.user.id);

  if (!data?.className || !data?.playstyle || !data?.status) {
    return interaction.update({
      content: "❌ انتهت صلاحية طلبك. يرجى الضغط على زر الانضمام من جديد.",
      components: [],
    });
  }

  await interaction.deferUpdate();

  const { query } = await import("../database/index.js");

  // Check if pending
  const existing = await query("SELECT status FROM tl_recruits WHERE user_id = $1", [interaction.user.id]);
  if (existing.rowCount > 0 && existing.rows[0].status === 'pending') {
     return interaction.editReply({ content: "❌ لديك طلب انضمام قيد المراجعة بالفعل.", components: [] });
  }

  // Insert or Update in DB
  const fullClassName = `${data.className} (${data.weapons})`;
  await query(
    `INSERT INTO tl_recruits (user_id, discord_tag, class_name, playstyle, game_status, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (user_id) DO UPDATE SET
       class_name = EXCLUDED.class_name,
       playstyle = EXCLUDED.playstyle,
       game_status = EXCLUDED.game_status,
       status = 'pending',
       reviewed_by = NULL`,
    [interaction.user.id, interaction.user.tag, fullClassName, data.playstyle, data.status]
  );

  // Send Admin Alert
  const resConfig = await query("SELECT tl_admin_channel_id FROM guild_config WHERE guild_id = $1", [interaction.guildId]);
  const adminChannelId = resConfig.rows[0]?.tl_admin_channel_id;

  const adminChannel = adminChannelId ? (interaction.guild.channels.cache.get(adminChannelId) || await interaction.guild.channels.fetch(adminChannelId).catch(() => null)) : null;

  if (adminChannel) {
    const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 256 });
    const embed = new EmbedBuilder()
      .setColor("#FFA500")
      .setTitle("🛡️ طلب انضمام جديد — Throne and Liberty")
      .setThumbnail(avatarUrl)
      .setDescription([
        `**اللاعب:** <@${interaction.user.id}> (${interaction.user.username})`,
        `**الكلاس:** ${data.className}`,
        `**الأسلحة:** ${data.weapons}`,
        `**أسلوب اللعب:** ${data.playstyle}`,
        `**الوضع الحالي:** ${data.status}`
      ].join("\n"))
      .setFooter({ text: "Throne and Liberty Recruitment" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tl:accept:${interaction.user.id}`)
        .setLabel("قبول")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tl:reject:${interaction.user.id}`)
        .setLabel("رفض")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await adminChannel.send({ embeds: [embed], components: [row] });
    await query("UPDATE tl_recruits SET message_id = $1 WHERE user_id = $2", [msg.id, interaction.user.id]);
  }

  // تنظيف البيانات المؤقتة
  userSelections.delete(interaction.user.id);

  await interaction.editReply({
    content: "✅ **تم إرسال طلب انضمامك بنجاح!**\nسيتم مراجعته من قبل قادة الجيلد وإبلاغك بالنتيجة قريباً. 🏰⚔️",
    components: [],
  });
}

// ─── قبول الطلب من الإدارة ──────────────────────────────────────────────────
async function handleAppAccept(interaction, userId) {
  await interaction.deferUpdate();
  const { query } = await import("../database/index.js");
  const { emitNotification } = await import("../socket.js");

  // Check if pending
  const res = await query("SELECT * FROM tl_recruits WHERE user_id = $1 AND status = 'pending'", [userId]);
  if (res.rowCount === 0) {
    return interaction.editReply({ content: "❌ الطلب غير موجود أو تمت معالجته مسبقاً.", components: [] });
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return interaction.editReply({ content: "❌ لم يتم العثور على العضو في السيرفر.", components: [] });
  }

  // Update DB
  await query("UPDATE tl_recruits SET status='accepted', reviewed_by=$1, accepted_at=NOW() WHERE user_id=$2", [interaction.user.id, userId]);

  // Give Role
  if (TL_MEMBER_ROLE_ID) {
    await member.roles.add(TL_MEMBER_ROLE_ID).catch(e => console.error("[TL] Role add error:", e));
  }

  // DM User
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("🎉 تهانينا! تم قبول طلبك")
      .setDescription("تم قبول انضمامك لجيلد Throne and Liberty رسمياً. مرحباً بك في الفيلق! ⚔️")
      .setTimestamp();
    await member.send({ embeds: [dmEmbed] });
  } catch (e) {
    console.error(`[TL] Could not DM user ${userId}`);
  }

  // Emit to App
  try {
    const { createNotification } = await import("../database/index.js");
    const newNotif = await createNotification(
      "tl_recruitment",
      "🎉 تم قبولك!",
      "تمت الموافقة على انضمامك لجيلد Throne and Liberty.",
      { target_user_id: userId }
    );
    emitNotification(userId, newNotif);
    const { sendPushNotification } = await import("../services/push.js");
    await sendPushNotification(userId, "🎉 تم قبولك!", "تمت الموافقة على انضمامك لجيلد Throne and Liberty.", { type: "alliance" });
  } catch (e) {
    console.error("[TL] Could not emit socket notification:", e);
  }

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor("#57F287")
    .addFields({ name: "النتيجة", value: `✅ تم القبول بواسطة <@${interaction.user.id}>` });

  await interaction.editReply({ embeds: [embed], components: [] });

  // Update member count
  await updateTLMemberCount(interaction.client);

  // Send player card to members channel
  try {
    const membersChannel = await interaction.client.channels.fetch(TL_MEMBERS_CHANNEL_ID);
    if (membersChannel) {
      const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
      const cardEmbed = new EmbedBuilder()
        .setColor("#8B0000")
        .setTitle("📋 بطاقة لاعب جديد — Throne and Liberty")
        .setThumbnail(avatarUrl)
        .setDescription([
          `انضم إلى الجيلد: <@${userId}>`,
          ``,
          `**الاسم:** ${member.user.username}`,
          `**الكلاس:** ${res.rows[0].class_name}`,
          `**أسلوب اللعب:** ${res.rows[0].playstyle}`,
          `**الوضع الحالي:** ${res.rows[0].game_status}`,
          `**القوانين:** ✅ وافق على قوانين الجيلد`,
        ].join("\n"))
        .setFooter({ text: "Throne and Liberty • M3RGEEN Gaming Community" })
        .setTimestamp();
      await membersChannel.send({ embeds: [cardEmbed] });
    }
  } catch (e) {
    console.error("[TL] Failed to send player card:", e);
  }
}

// ─── رفض الطلب من الإدارة ──────────────────────────────────────────────────
async function handleAppReject(interaction, userId) {
  await interaction.deferReply({ ephemeral: true });

  const { query } = await import("../database/index.js");
  const res = await query("SELECT * FROM tl_recruits WHERE user_id = $1 AND status = 'pending'", [userId]);
  
  if (res.rowCount === 0) {
    return interaction.editReply({ content: "❌ الطلب غير موجود أو تمت معالجته مسبقاً." });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tl:reject_reason:${userId}`)
      .setPlaceholder("اختر سبب الرفض...")
      .addOptions([
        { label: "العدد مكتمل", value: "full", description: "عذراً، العدد في الجيلد مكتمل حالياً.", emoji: "👥" },
        { label: "كلاس فائض", value: "class", description: "الكلاس الخاص بك متوفر بكثرة حالياً.", emoji: "⚔️" },
        { label: "قير سكور نازل مره", value: "gear", description: "مستوى العتاد الخاص بك منخفض جداً.", emoji: "🛡️" }
      ])
  );

  await interaction.editReply({
    content: "الرجاء تحديد سبب الرفض لإبلاغ اللاعب:",
    components: [row]
  });
}

// ─── معالجة سبب الرفض وإرسال الرسالة ───────────────────────────────────────
async function handleAppRejectReason(interaction, userId) {
  await interaction.deferUpdate();
  const reasonCode = interaction.values[0];
  
  let reasonMsg = "نأسف، تم رفض طلب انضمامك لجيلد Throne and Liberty من قِبل الإدارة.";
  const reasonTitle = "❌ تم رفض طلب الانضمام";
  let reasonLabel = "";
  
  if (reasonCode === "full") {
    reasonMsg = "نعتذر منك يا غالي، نود إبلاغك بأن العدد في الجيلد مكتمل حالياً. 👥\nنتشرف بوجودك معنا في الديسكورد، وراح نفتح التجنيد قريباً إن شاء الله.";
    reasonLabel = "العدد مكتمل";
  } else if (reasonCode === "class") {
    reasonMsg = "يعطيك العافية يا وحش، نعتذر منك لعدم قبول طلبك حالياً بسبب وجود فائض كبير في الكلاس الخاص بك. ⚔️\nبإمكانك التقديم لاحقاً إذا تغيرت المتطلبات، وحياك الله في الديسكورد.";
    reasonLabel = "كلاس فائض";
  } else if (reasonCode === "gear") {
    reasonMsg = "أهلاً بك يا غالي، نعتذر عن قبول طلبك حالياً لأن مستوى العتاد (Gear Score) أقل من المطلوب. 🛡️\nتقدر تطور عتادك وتقدم مره ثانية، والديسكورد ديسكوردك تفضل متى ما حبيت.";
    reasonLabel = "قير سكور نازل مره";
  }

  const { query } = await import("../database/index.js");
  const { emitNotification } = await import("../socket.js");

  await query("UPDATE tl_recruits SET status='rejected', reviewed_by=$1 WHERE user_id=$2", [interaction.user.id, userId]);

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member) {
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle(reasonTitle)
        .setDescription(reasonMsg)
        .setTimestamp();
      await member.send({ embeds: [dmEmbed] });
    } catch (e) {}
  }

  // Emit to App
  try {
    const { createNotification } = await import("../database/index.js");
    const newNotif = await createNotification(
      "tl_recruitment",
      "❌ تم الرفض",
      reasonMsg,
      { target_user_id: userId }
    );
    emitNotification(userId, newNotif);
    const { sendPushNotification } = await import("../services/push.js");
    await sendPushNotification(userId, "❌ تم الرفض", reasonMsg, { type: "alliance" });
  } catch (e) {}

  // Update original message
  try {
    const res = await query("SELECT message_id FROM tl_recruits WHERE user_id=$1", [userId]);
    const msgId = res.rows[0]?.message_id;
    if (msgId) {
      const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
      if (originalMsg) {
        const embed = EmbedBuilder.from(originalMsg.embeds[0])
          .setColor("#ED4245")
          .addFields({ name: "النتيجة", value: `❌ تم الرفض بواسطة <@${interaction.user.id}>\nالسبب: **${reasonLabel}**` });
        await originalMsg.edit({ embeds: [embed], components: [] });
      }
    }
  } catch (err) {
    console.error("[TL] Error updating original rejected message", err);
  }

  await interaction.editReply({ content: "✅ تم رفض الطلب وإبلاغ اللاعب بالسبب بنجاح.", components: [] });
}

// ─── إزالة عضو من الإدارة ──────────────────────────────────────────────────
async function handleMgmtRemoveButton(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import("discord.js");

  const modal = new ModalBuilder()
    .setCustomId("tl:mgmt:remove_modal")
    .setTitle("إزالة عضو من Throne and Liberty");

  const idInput = new TextInputBuilder()
    .setCustomId("userIdInput")
    .setLabel("أيدي العضو (Discord ID)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("مثال: 123456789012345678")
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(idInput));
  await interaction.showModal(modal);
}

// ─── معالجة المودل لإزالة عضو ────────────────────────────────────────────────
async function handleMgmtRemoveModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const userId = interaction.fields.getTextInputValue("userIdInput").trim();

  const { query } = await import("../database/index.js");

  // Fetch message_id to delete the embed card if it exists
  let embedDeletedText = "";
  try {
    const res = await query("SELECT message_id FROM tl_recruits WHERE user_id = $1", [userId]);
    const messageId = res.rows[0]?.message_id;
    
    if (messageId) {
      const channel = await interaction.client.channels.fetch(TL_MEMBERS_CHANNEL_ID).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (msg) {
          await msg.delete().catch(() => {});
          embedDeletedText = "\n🗑️ تم حذف بطاقة اللاعب من روم الأعضاء.";
        }
      }
    }
  } catch (err) {
    console.error("[TL] Error deleting recruit card message:", err);
  }

  // Wipe DB
  await query("DELETE FROM tl_recruits WHERE user_id = $1", [userId]);

  // Remove Role
  let rolesRemovedText = "";
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member) {
    if (TL_MEMBER_ROLE_ID && member.roles.cache.has(TL_MEMBER_ROLE_ID)) {
      await member.roles.remove(TL_MEMBER_ROLE_ID).catch(() => {});
      rolesRemovedText = "✅ تم سحب رتبة Throne and Liberty بنجاح.\n(العضو باقٍ برتبة المعرقين).";
    } else {
      rolesRemovedText = "⚠️ لم يتم العثور على رتبة Throne and Liberty لدى العضو.";
    }
  } else {
    rolesRemovedText = "⚠️ العضو غير متواجد في السيرفر حالياً ليتسنى سحب الرتبة منه.";
  }

  // Update Count
  await updateTLMemberCount(interaction.client);

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("✅ تمت إزالة العضو")
    .setDescription(
      `تم تنفيذ الإجراءات التالية على (<@${userId}>):\n\n` +
      `🗑️ تم حذف بياناته وتقدمه من قاعدة بيانات Throne and Liberty (إن وُجدت).\n${rolesRemovedText}${embedDeletedText}`
    )
    .setFooter({ text: `تم الإجراء بواسطة: ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── عرض قائمة الأعضاء ──────────────────────────────────────────────────────
async function handleMgmtListButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    await interaction.guild.members.fetch().catch(() => null);
    const tlRole = await interaction.guild.roles.fetch(TL_MEMBER_ROLE_ID).catch(() => null);

    if (!tlRole || tlRole.members.size === 0) {
      return interaction.editReply("❌ لا يوجد أي أعضاء يحملون رتبة Throne and Liberty حالياً.");
    }

    const members = tlRole.members.map(m => `• <@${m.id}> (\`${m.id}\`)`);
    const count = members.length;

    let description = `**عدد الأعضاء:** ${count}\n\n`;
    description += members.join("\n");

    if (description.length > 4000) {
      description = description.substring(0, 4000) + "\n... (تم قص القائمة لطولها)";
    }

    const embed = new EmbedBuilder()
      .setColor("#2B2D31")
      .setTitle("🛡️ أعضاء جيلد Throne and Liberty")
      .setDescription(description)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[TL] Error listing members:", err);
    await interaction.editReply(`❌ حدث خطأ أثناء محاولة جلب الأعضاء:\n\`\`\`js\n${err.message}\n\`\`\``);
  }
}

// ─── إرسال تنبيه مخصص ────────────────────────────────────────────────────────
async function handleAlertModal(interaction) {
  const title = interaction.fields.getTextInputValue("alertTitle");
  const message = interaction.fields.getTextInputValue("alertMessage");

  const channelId = "1526297989734334554";
  const roleId = "1292754458492796982";

  const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
  
  if (!channel) {
    return interaction.reply({ content: "❌ لم أتمكن من العثور على روم التنبيهات المخصص.", ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`📢 ${title}`)
    .setDescription(message)
    .setColor("#E74C3C")
    .setTimestamp()
    .setFooter({ text: `مرسل التنبيه: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await channel.send({
    content: `<@&${roleId}>`,
    embeds: [embed]
  });

  await interaction.reply({ content: "✅ تم إرسال التنبيه بنجاح!", ephemeral: true });
}

// ─── نظام الإعلانات والتنويهات ───────────────────────────────────────────────
import { recordAnnouncementRead, getAnnouncementReads } from "../database/index.js";

async function handleAnnounceRead(interaction) {
  const messageId = interaction.message.id;
  const userId = interaction.user.id;

  try {
    const record = await recordAnnouncementRead(messageId, userId);
    
    if (!record) {
      return interaction.reply({ content: "✅ أنت مسجل مسبقاً بأنك قرأت هذا التنويه.", ephemeral: true });
    }

    const reads = await getAnnouncementReads(messageId);
    const mentions = reads.map(r => `<@${r.user_id}>`).join("، ");

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    
    // Remove old read field if exists and add new one
    const fields = embed.data.fields || [];
    const filteredFields = fields.filter(f => !f.name.includes("قرأ التنويه"));
    
    filteredFields.push({
      name: `👁️ قرأ التنويه (${reads.length})`,
      value: mentions
    });

    embed.setFields(filteredFields);

    await interaction.message.edit({ embeds: [embed] });
    await interaction.reply({ content: "✅ شكراً لتفاعلك! تم تسجيل أنك قرأت التنويه.", ephemeral: true });
  } catch (err) {
    console.error("[Announce] Error recording read:", err);
    await interaction.reply({ content: "❌ حدث خطأ، يرجى المحاولة لاحقاً.", ephemeral: true });
  }
}

// ─── نظام تسجيل الريد (Raid Registration) ────────────────────────────────────
import { registerTlRaid, getTlRaidRegistrations } from "../database/index.js";

function isRaidExpired(messageDate) {
  const d = new Date(messageDate);
  let daysUntilThursday = 4 - d.getUTCDay();
  
  if (daysUntilThursday < 0 || (daysUntilThursday === 0 && d.getUTCHours() >= 11)) {
    daysUntilThursday += 7;
  }
  
  const deadline = new Date(d);
  deadline.setUTCDate(deadline.getUTCDate() + daysUntilThursday);
  deadline.setUTCHours(11, 0, 0, 0); // 11:00 UTC = 14:00 KSA
  
  return Date.now() > deadline.getTime();
}

async function closeRaidMessage(message) {
  if (!message || !message.embeds || message.embeds.length === 0) return;
  const embed = EmbedBuilder.from(message.embeds[0]);
  embed.setColor("#7f8c8d");
  
  if (!embed.data.title?.includes("(مغلق)")) {
    embed.setTitle((embed.data.title || "") + " (مغلق)");
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("throne:raid_reopen")
      .setLabel("إعادة فتح الريد")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔓")
  );

  await message.edit({ embeds: [embed], components: [row] }).catch(() => {});
}

async function handleRaidJoin(interaction) {
  if (isRaidExpired(interaction.message.createdAt)) {
    await closeRaidMessage(interaction.message);
    return interaction.reply({ content: "❌ عذراً، تم إغلاق التسجيل لهذا الريد (التسجيل ينتهي كل خميس الساعة 2 ظهراً بتوقيت مكة المكرمة).", ephemeral: true });
  }

  const raidMessageId = interaction.message.id;
  
  const daysMenu = new StringSelectMenuBuilder()
    .setCustomId(`throne:raid_days:${raidMessageId}`)
    .setPlaceholder("اختر الأيام المناسبة لك")
    .setMinValues(1)
    .setMaxValues(7)
    .addOptions(
      { label: "السبت", value: "السبت", emoji: "🗓️" },
      { label: "الأحد", value: "الأحد", emoji: "🗓️" },
      { label: "الإثنين", value: "الإثنين", emoji: "🗓️" },
      { label: "الثلاثاء", value: "الثلاثاء", emoji: "🗓️" },
      { label: "الأربعاء", value: "الأربعاء", emoji: "🗓️" },
      { label: "الخميس", value: "الخميس", emoji: "🗓️" },
      { label: "الجمعة", value: "الجمعة", emoji: "🗓️" }
    );

  const row = new ActionRowBuilder().addComponents(daysMenu);
  
  await interaction.reply({
    content: "📅 **الخطوة 1:** الرجاء تحديد الأيام التي يمكنك الحضور فيها:",
    components: [row],
    ephemeral: true
  });
}

async function handleRaidDays(interaction) {
  const raidMessageId = interaction.customId.split(":")[2];
  const selectedDays = interaction.values.join("، ");
  
  const timesMenu = new StringSelectMenuBuilder()
    .setCustomId(`throne:raid_times:${raidMessageId}:${encodeURIComponent(selectedDays)}`)
    .setPlaceholder("اختر الأوقات المناسبة لك")
    .setMinValues(1)
    .setMaxValues(4)
    .addOptions(
      { label: "العصر (3PM - 6PM)", value: "العصر", emoji: "🌇" },
      { label: "المغرب/العشاء (6PM - 9PM)", value: "المغرب-العشاء", emoji: "🌆" },
      { label: "الليل (9PM - 12AM)", value: "الليل", emoji: "🌃" },
      { label: "آخر الليل (12AM - 4AM)", value: "آخر الليل", emoji: "🌌" }
    );

  const row = new ActionRowBuilder().addComponents(timesMenu);

  await interaction.update({
    content: `✅ تم اختيار الأيام: **${selectedDays}**\n\n⏰ **الخطوة 2:** الرجاء تحديد الأوقات المناسبة لك في هذه الأيام:`,
    components: [row]
  });
}

async function handleRaidTimes(interaction) {
  const parts = interaction.customId.split(":");
  const raidMessageId = parts[2];
  const selectedDays = decodeURIComponent(parts[3]);
  const selectedTimes = interaction.values.join("، ");
  const userId = interaction.user.id;

  try {
    await registerTlRaid(raidMessageId, userId, selectedDays, selectedTimes);
    
    // Update the original message
    try {
      const originalMessage = await interaction.channel.messages.fetch(raidMessageId);
      if (originalMessage && originalMessage.embeds.length > 0) {
        const regs = await getTlRaidRegistrations(raidMessageId);
        const embed = EmbedBuilder.from(originalMessage.embeds[0]);
        
        const mentions = regs.map(r => `<@${r.user_id}>`).join("، ");
        
        let bestTimeStr = "لم يحدد بعد";
        if (regs.length > 0) {
          const tally = {};
          for (const r of regs) {
            const dList = r.days.split("، ");
            const tList = r.times.split("، ");
            for (const d of dList) {
              for (const t of tList) {
                const key = `${d} | ${t}`;
                tally[key] = (tally[key] || 0) + 1;
              }
            }
          }
          
          let maxCount = 0;
          let bestKeys = [];
          for (const [key, count] of Object.entries(tally)) {
            if (count > maxCount) {
              maxCount = count;
              bestKeys = [key];
            } else if (count === maxCount) {
              bestKeys.push(key);
            }
          }
          
          if (maxCount > 0) {
            const topKeys = bestKeys.slice(0, 2).map(k => `\`${k}\``).join(" أو ");
            bestTimeStr = `${topKeys} (يتناسب مع ${maxCount} لاعبين)`;
          }
        }
        
        embed.setFields([
          { name: `⭐️ أنسب وقت مقترح`, value: bestTimeStr },
          { name: `👥 المسجلين للحضور (${regs.length})`, value: mentions || "لا يوجد" }
        ]);
        
        await originalMessage.edit({ embeds: [embed] });
      }
    } catch (e) {
      console.error("[ThroneLiberty] Error updating original raid message:", e);
    }

    await interaction.update({
      content: `🎉 **تم تسجيل وقتك بنجاح!**\n\n🗓️ الأيام: ${selectedDays}\n⏰ الأوقات: ${selectedTimes}\n\nتم إضافة اسمك في قائمة المسجلين.`,
      components: []
    });
  } catch (err) {
    console.error("[ThroneLiberty] Error registering raid:", err);
    await interaction.update({
      content: "❌ حدث خطأ أثناء التسجيل، يرجى المحاولة لاحقاً.",
      components: []
    });
  }
}

async function handleRaidView(interaction) {
  if (isRaidExpired(interaction.message.createdAt)) {
    await closeRaidMessage(interaction.message);
  }

  // Check if admin or has manage guild
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "❌ لا تملك صلاحية لعرض المسجلين.", ephemeral: true });
  }

  const raidMessageId = interaction.message.id;
  try {
    const regs = await getTlRaidRegistrations(raidMessageId);
    
    if (regs.length === 0) {
      return interaction.reply({ content: "لا يوجد أي لاعب مسجل حتى الآن لهذا الريد.", ephemeral: true });
    }

    // Group by days and times
    const groups = {};
    for (const r of regs) {
      const key = `🗓️ ${r.days} | ⏰ ${r.times}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(`<@${r.user_id}>`);
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 ملخص أوقات المسجلين للريد")
      .setColor("#3498DB")
      .setTimestamp();

    let desc = `إجمالي المسجلين: **${regs.length}** لاعب\n\n`;
    for (const [key, users] of Object.entries(groups)) {
      desc += `**${key}** (${users.length} لاعب)\n${users.join("، ")}\n\n`;
    }

    embed.setDescription(desc);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    console.error("[ThroneLiberty] Error viewing raid registrations:", err);
    await interaction.reply({ content: "❌ حدث خطأ أثناء جلب البيانات.", ephemeral: true });
  }
}

async function handleRaidStart(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "❌ عذراً، الإدارة فقط يمكنها بدء الريد وإغلاق التسجيل.", ephemeral: true });
  }

  if (isRaidExpired(interaction.message.createdAt)) {
    return interaction.reply({ content: "⚠️ هذا الريد مغلق بالفعل.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const raidMessageId = interaction.message.id;
  const regs = await getTlRaidRegistrations(raidMessageId);

  await closeRaidMessage(interaction.message);

  // تفعيل الإشعار في تطبيق سطح المكتب عند بدء الريد فعلياً
  const embedTitle = interaction.message.embeds[0]?.title || "Guild Raid";
  const embedImage = interaction.message.embeds[0]?.image?.url || null;
  await publishOverlayEvent("Guild Raid", embedTitle, embedImage, 60);

  let successCount = 0;
  let failCount = 0;

  for (const r of regs) {
    try {
      const user = await interaction.client.users.fetch(r.user_id);
      if (user) {
        await user.send(`⚔️ **تنبيه بدء الريد!**\nالريد اللي سجلت فيه لـ (Throne and Liberty) بيبدأ الآن. يرجى التوجه للروم الصوتي وقاعة القيلد (Guild Hall) الآن للتجهيز!`);
        successCount++;
      }
    } catch (e) {
      failCount++;
    }
  }

  await interaction.editReply(`🔒 تم بدء الريد وإغلاق التسجيل بنجاح!\n📨 تم إرسال رسائل خاصة لـ **${successCount}** لاعب. (${failCount} مقفلين الخاص)`);
}

async function handleRaidReopen(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "❌ عذراً، الإدارة فقط يمكنها إعادة فتح الريد.", ephemeral: true });
  }

  if (isRaidExpired(interaction.message.createdAt)) {
    return interaction.reply({ content: "⚠️ لا يمكن إعادة فتح هذا الريد لأنه تجاوز موعد الإغلاق النهائي (الخميس 2 ظهراً).", ephemeral: true });
  }

  const message = interaction.message;
  const embed = EmbedBuilder.from(message.embeds[0]);
  embed.setColor("#E74C3C"); // Original red color
  
  if (embed.data.title?.includes(" (مغلق)")) {
    embed.setTitle(embed.data.title.replace(" (مغلق)", ""));
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("throne:raid_join")
      .setLabel("أرغب بالانضمام معكم (مطلوب تسجيل الوقت)")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⚔️"),
    new ButtonBuilder()
      .setCustomId("throne:raid_view")
      .setLabel("عرض الأوقات المسجلة")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📋"),
    new ButtonBuilder()
      .setCustomId("throne:raid_start")
      .setLabel("بدء الريد (إغلاق التسجيل)")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );

  await message.edit({ embeds: [embed], components: [row] }).catch(() => {});
  await interaction.reply({ content: "🔓 تم إعادة فتح التسجيل للريد بنجاح!", ephemeral: true });
}

// ─── نظام ريد كلنثيا (Calanthia Raid) ──────────────────────────────────────
async function handleCalanthiaRaidJoin(interaction) {
  if (isRaidExpired(interaction.message.createdAt)) {
    await closeCalanthiaRaidMessage(interaction.message);
    return interaction.reply({ content: "❌ عذراً، تم إغلاق التسجيل لهذا الريد (التسجيل ينتهي كل خميس الساعة 2 ظهراً بتوقيت مكة المكرمة).", ephemeral: true });
  }

  const raidMessageId = interaction.message.id;
  const timesMenu = new StringSelectMenuBuilder()
    .setCustomId(`throne:calanthia_raid_times:${raidMessageId}`)
    .setPlaceholder("اختر الأوقات المناسبة لك")
    .setMinValues(1)
    .setMaxValues(4)
    .addOptions(
      { label: "العصر (3PM - 6PM)", value: "العصر", emoji: "🌇" },
      { label: "المغرب/العشاء (6PM - 9PM)", value: "المغرب-العشاء", emoji: "🌆" },
      { label: "الليل (9PM - 12AM)", value: "الليل", emoji: "🌃" },
      { label: "آخر الليل (12AM - 4AM)", value: "آخر الليل", emoji: "🌌" }
    );

  const row = new ActionRowBuilder().addComponents(timesMenu);
  
  await interaction.reply({
    content: "⏰ الرجاء تحديد الأوقات المناسبة لك للحضور في الريد:",
    components: [row],
    ephemeral: true
  });
}

async function handleCalanthiaRaidTimes(interaction) {
  const parts = interaction.customId.split(":");
  const raidMessageId = parts[2];
  const selectedTimes = interaction.values.join("، ");
  const userId = interaction.user.id;

  try {
    await registerTlRaid(raidMessageId, userId, "ثابت", selectedTimes);
    
    // Update original message
    const originalMessage = await interaction.channel.messages.fetch(raidMessageId).catch(() => null);
    if (originalMessage && originalMessage.embeds.length > 0) {
      const regs = await getTlRaidRegistrations(raidMessageId);
      const embed = EmbedBuilder.from(originalMessage.embeds[0]);
      
      const timeGroups = {};
      for (const r of regs) {
        const tList = r.times.split("، ");
        for (const t of tList) {
          if (!timeGroups[t]) timeGroups[t] = [];
          timeGroups[t].push(`<@${r.user_id}>`);
        }
      }

      const newFields = [];
      for (const [t, users] of Object.entries(timeGroups)) {
        newFields.push({ name: `⏰ ${t} (${users.length} مسجلين)`, value: users.join("، ") || "لا يوجد" });
      }

      embed.setFields(newFields);
      await originalMessage.edit({ embeds: [embed] }).catch(() => {});
    }

    await interaction.update({ content: `✅ تم تسجيل وقتك بنجاح للريد!\nأوقاتك: **${selectedTimes}**`, components: [] });
  } catch (err) {
    console.error("[ThroneLiberty] Error registering calanthia raid time:", err);
    await interaction.update({ content: "❌ حدث خطأ أثناء التسجيل. يرجى المحاولة لاحقاً.", components: [] });
  }
}

async function handleCalanthiaRaidView(interaction) {
  const raidMessageId = interaction.message.id;
  try {
    const regs = await getTlRaidRegistrations(raidMessageId);
    if (regs.length === 0) {
      return interaction.reply({ content: "⚠️ لا يوجد مسجلين حتى الآن.", ephemeral: true });
    }

    const timeGroups = {};
    for (const r of regs) {
      const tList = r.times.split("، ");
      for (const t of tList) {
        if (!timeGroups[t]) timeGroups[t] = [];
        if (!timeGroups[t].includes(`<@${r.user_id}>`)) {
          timeGroups[t].push(`<@${r.user_id}>`);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 ملخص أوقات المسجلين في ريد كلنثيا")
      .setColor("#3498DB")
      .setTimestamp();

    let desc = `إجمالي المسجلين: **${regs.length}** لاعب\n\n`;
    for (const [t, users] of Object.entries(timeGroups)) {
      desc += `**${t}** (${users.length} لاعب)\n${users.join("، ")}\n\n`;
    }

    embed.setDescription(desc);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    console.error("[ThroneLiberty] Error viewing calanthia raid registrations:", err);
    await interaction.reply({ content: "❌ حدث خطأ أثناء جلب البيانات.", ephemeral: true });
  }
}

async function closeCalanthiaRaidMessage(message) {
  if (!message || !message.embeds || message.embeds.length === 0) return;
  const embed = EmbedBuilder.from(message.embeds[0]);
  embed.setColor("#7f8c8d");
  if (!embed.data.title?.includes("(مغلق)")) embed.setTitle((embed.data.title || "") + " (مغلق)");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("throne:calanthia_raid_reopen")
      .setLabel("إعادة فتح الريد")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔓")
  );
  await message.edit({ embeds: [embed], components: [row] }).catch(() => {});
}

async function handleCalanthiaRaidStart(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "❌ عذراً، الإدارة فقط يمكنها بدء الريد وإغلاق التسجيل.", ephemeral: true });
  }
  if (isRaidExpired(interaction.message.createdAt)) {
    return interaction.reply({ content: "⚠️ هذا الريد مغلق بالفعل.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const raidMessageId = interaction.message.id;
  const regs = await getTlRaidRegistrations(raidMessageId);

  await closeCalanthiaRaidMessage(interaction.message);

  const embedTitle = interaction.message.embeds[0]?.title || "Calanthia Raid";
  const embedImage = interaction.message.embeds[0]?.image?.url || null;
  await publishOverlayEvent("Calanthia Raid", embedTitle, embedImage, 60);

  const generalChannelId = "1294312574162178200";
  const generalChannel = await interaction.guild.channels.fetch(generalChannelId).catch(() => null);
  if (generalChannel) {
    try {
      const msgs = await generalChannel.messages.fetch({ limit: 50 });
      const oldMsg = msgs.find(m => m.author.id === interaction.client.user.id && m.content.includes("يا شباب حنسوي ريد كلنثيا"));
      if (oldMsg) await oldMsg.delete();
    } catch (e) {
      console.error("[ThroneLiberty] Error deleting old general chat message:", e);
    }
    await generalChannel.send("يا شباب إحنا بدينا نلعب ريد كلنثيا الآن وحنكري أعضاء الجيلد اللي حاب يخلص ريد كلنثيا يدخل الروم الصوتي");
  }

  let successCount = 0, failCount = 0;
  for (const r of regs) {
    try {
      const user = await interaction.client.users.fetch(r.user_id);
      if (user) {
        await user.send(`⚔️ **تنبيه بدء الريد!**\nالريد اللي سجلت فيه لـ (Throne and Liberty) بيبدأ الآن. يرجى التوجه للروم الصوتي وقاعة القيلد للتجهيز!`);
        successCount++;
      }
    } catch (e) {
      failCount++;
    }
  }
  await interaction.editReply(`🔒 تم بدء الريد وإغلاق التسجيل بنجاح!\n📨 تم إرسال رسائل خاصة لـ **${successCount}** لاعب. (${failCount} مقفلين الخاص)`);
}

async function handleCalanthiaRaidReopen(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "❌ عذراً، الإدارة فقط يمكنها إعادة فتح الريد.", ephemeral: true });
  }
  if (isRaidExpired(interaction.message.createdAt)) {
    return interaction.reply({ content: "⚠️ لا يمكن إعادة فتح هذا الريد لأنه تجاوز موعد الإغلاق النهائي (الخميس 2 ظهراً).", ephemeral: true });
  }

  const message = interaction.message;
  const embed = EmbedBuilder.from(message.embeds[0]);
  embed.setColor("#E74C3C");
  if (embed.data.title?.includes(" (مغلق)")) embed.setTitle(embed.data.title.replace(" (مغلق)", ""));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("throne:calanthia_raid_join")
      .setLabel("أرغب بالانضمام (التسجيل مفتوح)")
      .setStyle(ButtonStyle.Success)
      .setEmoji("⚔️"),
    new ButtonBuilder()
      .setCustomId("throne:calanthia_raid_view")
      .setLabel("عرض الأوقات المسجلة")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📋"),
    new ButtonBuilder()
      .setCustomId("throne:calanthia_raid_start")
      .setLabel("بدء الريد (إغلاق التسجيل)")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );
  await message.edit({ embeds: [embed], components: [row] }).catch(() => {});
  await interaction.reply({ content: "🔓 تم إعادة فتح التسجيل للريد بنجاح!", ephemeral: true });
}

// ─── الموجه الرئيسي ─────────────────────────────────────────────────────────
export async function handleInteraction(interaction) {
  const customId = interaction.customId;

  try {
    if (customId === "throne:join") {
      await handleJoinButton(interaction);
    } else if (["throne:class_new", "throne:class_cur1", "throne:class_cur2"].includes(customId)) {
      await handleClassSelect(interaction);
    } else if (customId === "throne:playstyle") {
      await handlePlaystyle(interaction);
    } else if (customId === "throne:status") {
      await handleStatus(interaction);
    } else if (customId === "throne:agree") {
      await handleAgree(interaction);
    } else if (customId.startsWith("tl:accept:")) {
      await handleAppAccept(interaction, customId.split(":")[2]);
    } else if (customId.startsWith("tl:reject_reason:")) {
      await handleAppRejectReason(interaction, customId.split(":")[2]);
    } else if (customId.startsWith("tl:reject:")) {
      await handleAppReject(interaction, customId.split(":")[2]);
    } else if (customId === "tl:mgmt:remove") {
      await handleMgmtRemoveButton(interaction);
    } else if (customId === "tl:mgmt:remove_modal") {
      await handleMgmtRemoveModal(interaction);
    } else if (customId === "tl:mgmt:list") {
      await handleMgmtList(interaction);
    } else if (customId === "tl:alert_modal") {
      await handleAlertModal(interaction);
    } else if (customId === "throne:raid_join") {
      await handleRaidJoin(interaction);
    } else if (customId === "throne:raid_view") {
      await handleRaidView(interaction);
    } else if (customId === "throne:raid_start") {
      await handleRaidStart(interaction);
    } else if (customId === "throne:raid_reopen") {
      await handleRaidReopen(interaction);
    } else if (customId === "tl:announce:read") {
      await handleAnnounceRead(interaction);
    } else if (customId.startsWith("throne:raid_days:")) {
      await handleRaidDays(interaction);
    } else if (customId.startsWith("throne:raid_times:")) {
      await handleRaidTimes(interaction);
    } else if (customId === "throne:calanthia_raid_join") {
      await handleCalanthiaRaidJoin(interaction);
    } else if (customId === "throne:calanthia_raid_view") {
      await handleCalanthiaRaidView(interaction);
    } else if (customId === "throne:calanthia_raid_start") {
      await handleCalanthiaRaidStart(interaction);
    } else if (customId === "throne:calanthia_raid_reopen") {
      await handleCalanthiaRaidReopen(interaction);
    } else if (customId.startsWith("throne:calanthia_raid_times:")) {
      await handleCalanthiaRaidTimes(interaction);
    }
  } catch (err) {
    console.error(`[TL] Error handling interaction "${customId}":`, err);
    const reply = { content: `❌ خطأ: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

// ─── تحديث اسم الروم لعدد الأعضاء ───────────────────────────────────────────
export async function updateTLMemberCount(client) {
  try {
    const membersChannel = await client.channels.fetch(TL_MEMBERS_CHANNEL_ID).catch(() => null);
    if (!membersChannel) return;

    // Use Discord role members count (same as GW2 system)
    const guild = membersChannel.guild;
    await guild.members.fetch().catch(() => null); // refresh cache, ignore rate limit
    const tlRole = await guild.roles.fetch(TL_MEMBER_ROLE_ID).catch(() => null);
    const count = tlRole ? tlRole.members.size : 0;

    await membersChannel.setName(`🔰｜ᵀʰʳᵒⁿᴺᴸᶦᵇʳᵗʸ-الاعضاء「${count}」`).catch(e => console.error("[TL] Name update err:", e));
  } catch (err) {
    console.error("[TL] Error updating member count:", err);
  }
}

// ─── Cron Job للحذف التلقائي ───────────────────────────────────────────────
export function startTlCleanupCron(client) {
  setInterval(async () => {
    try {
      const { query } = await import("../database/index.js");
      // Find rows where status is not pending and accepted_at is > 24 hours ago, and message_id is not null
      const res = await query(`
        SELECT user_id, message_id 
        FROM tl_recruits 
        WHERE status != 'pending' 
        AND message_id IS NOT NULL 
        AND accepted_at < NOW() - INTERVAL '24 hours'
      `);

      if (res.rowCount > 0) {
        // Fetch TL admin channel from DB
        const configRes = await query("SELECT tl_admin_channel_id FROM guild_config LIMIT 1");
        const tlAdminId = configRes.rows[0]?.tl_admin_channel_id;
        if (!tlAdminId) return;

        const reviewChannel = await client.channels.fetch(tlAdminId).catch(() => null);
        if (reviewChannel) {
          for (const row of res.rows) {
            try {
              const msg = await reviewChannel.messages.fetch(row.message_id);
              if (msg) await msg.delete();
            } catch (e) {
              // Message might be already deleted
            }
            await query("UPDATE tl_recruits SET message_id = NULL WHERE user_id = $1", [row.user_id]);
          }
        }
      }
    } catch (err) {
      console.error("[TL Cleanup Cron] Error:", err.message);
    }
  }, 60 * 60 * 1000); // Check every hour
}
