import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";

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

// ─── الخطوة 5: الموافقة → إصدار بطاقة اللاعب ───────────────────────────────
async function handleAgree(interaction) {
  const data = userSelections.get(interaction.user.id);

  if (!data?.className || !data?.playstyle || !data?.status) {
    return interaction.update({
      content: "❌ انتهت صلاحية طلبك. يرجى الضغط على زر الانضمام من جديد.",
      components: [],
    });
  }

  await interaction.deferUpdate();

  // منح الرتبة إن وُجدت
  if (TL_MEMBER_ROLE_ID) {
    try {
      await interaction.member.roles.add(TL_MEMBER_ROLE_ID);
    } catch (e) {
      console.error("[TL] Failed to assign member role:", e.message);
    }
  }

  // بطاقة اللاعب
  const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 256 });

  const cardEmbed = new EmbedBuilder()
    .setColor("#8B0000")
    .setTitle("📋 بطاقة لاعب جديد — Throne and Liberty")
    .setThumbnail(avatarUrl)
    .setDescription([
      `انضم إلى الجيلد: <@${interaction.user.id}>`,
      ``,
      `**الاسم:** ${interaction.user.username}`,
      `**الكلاس:** ${data.className}`,
      `**الأسلحة:** ${data.weapons}`,
      `**أسلوب اللعب:** ${data.playstyle}`,
      `**الوضع الحالي:** ${data.status}`,
      `**القوانين:** ✅ وافق على قوانين الجيلد`,
    ].join("\n"))
    .setFooter({ text: "Throne and Liberty • M3RGEEN Gaming Community" })
    .setTimestamp();

  // إرسال البطاقة لروم الأعضاء
  try {
    const membersChannel = await interaction.client.channels.fetch(TL_MEMBERS_CHANNEL_ID);
    if (membersChannel) {
      await membersChannel.send({ embeds: [cardEmbed] });
      console.log(`[TL] Player card sent for ${interaction.user.username}`);
    }
  } catch (e) {
    console.error("[TL] Failed to send player card:", e.message);
  }

  // تنظيف البيانات المؤقتة
  userSelections.delete(interaction.user.id);

  await interaction.editReply({
    content: "✅ **تم إرسال طلب انضمامك بنجاح!**\nمرحباً بك في جيلد Throne and Liberty! 🏰⚔️",
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
      userId,
      "🎉 تم قبولك!",
      "تمت الموافقة على انضمامك لجيلد Throne and Liberty.",
      "throne_liberty"
    );
    emitNotification(userId, newNotif);
  } catch (e) {
    console.error("[TL] Could not emit socket notification:", e);
  }

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor("#57F287")
    .addFields({ name: "النتيجة", value: `✅ تم القبول بواسطة <@${interaction.user.id}>` });

  await interaction.editReply({ embeds: [embed], components: [] });

  // Update member count
  await updateTLMemberCount(interaction.client);

  // Send to members channel
  try {
    const membersChannel = await interaction.client.channels.fetch(TL_MEMBERS_CHANNEL_ID);
    if (membersChannel) {
      await membersChannel.send({ embeds: [embed] });
    }
  } catch (e) {}
}

// ─── رفض الطلب من الإدارة ──────────────────────────────────────────────────
async function handleAppReject(interaction, userId) {
  await interaction.deferUpdate();
  const { query } = await import("../database/index.js");
  const { emitNotification } = await import("../socket.js");

  const res = await query("SELECT * FROM tl_recruits WHERE user_id = $1 AND status = 'pending'", [userId]);
  if (res.rowCount === 0) {
    return interaction.editReply({ content: "❌ الطلب غير موجود أو تمت معالجته مسبقاً.", components: [] });
  }

  await query("UPDATE tl_recruits SET status='rejected', reviewed_by=$1 WHERE user_id=$2", [interaction.user.id, userId]);

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member) {
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("❌ تم رفض طلب الانضمام")
        .setDescription("نأسف، تم رفض طلب انضمامك لجيلد Throne and Liberty من قِبل الإدارة.")
        .setTimestamp();
      await member.send({ embeds: [dmEmbed] });
    } catch (e) {}
  }

  // Emit to App
  try {
    const { createNotification } = await import("../database/index.js");
    const newNotif = await createNotification(
      "tl_recruitment",
      userId,
      "❌ تم الرفض",
      "نأسف، تم رفض طلب انضمامك لجيلد Throne and Liberty.",
      "throne_liberty"
    );
    emitNotification(userId, newNotif);
  } catch (e) {}

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor("#ED4245")
    .addFields({ name: "النتيجة", value: `❌ تم الرفض بواسطة <@${interaction.user.id}>` });

  await interaction.editReply({ embeds: [embed], components: [] });
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

// ─── إزالة عضو من الإدارة عبر قائمة منسدلة ────────────────────────────────
async function handleMgmtRemoveUserSelect(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const userId = interaction.values[0];

  const { query } = await import("../database/index.js");

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
      `🗑️ تم حذف بياناته وتقدمه من قاعدة بيانات Throne and Liberty (إن وُجدت).\n${rolesRemovedText}`
    )
    .setFooter({ text: `تم الإجراء بواسطة: ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── عرض قائمة الأعضاء ──────────────────────────────────────────────────────
async function handleMgmtListButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const mainGuild = interaction.guild;
    if (!mainGuild) throw new Error("Main guild not found.");

    await mainGuild.members.fetch(); // Ensure all members are cached
    const tlRole = await mainGuild.roles.fetch(TL_MEMBER_ROLE_ID).catch(() => null);
    
    if (!tlRole) {
      return interaction.editReply("❌ لم أتمكن من العثور على رتبة Throne and Liberty.");
    }

    const members = tlRole.members.map(m => `• <@${m.id}> (\`${m.id}\`)`);
    const count = members.length;

    let description = `**عدد الأعضاء:** ${count}\n\n`;
    description += members.join("\n");

    // Discord embed limit is 4096 characters for description
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
    } else if (customId.startsWith("tl:reject:")) {
      await handleAppReject(interaction, customId.split(":")[2]);
    } else if (customId === "tl:mgmt:remove") {
      await handleMgmtRemoveButton(interaction);
    } else if (customId === "tl:mgmt:remove_modal") {
      await handleMgmtRemoveModal(interaction);
    } else if (customId === "tl:mgmt:user_select_remove") {
      await handleMgmtRemoveUserSelect(interaction);
    } else if (customId === "tl:mgmt:list") {
      await handleMgmtListButton(interaction);
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

    const mainGuild = membersChannel.guild;
    await mainGuild.members.fetch(); // Ensure cache is populated
    const tlRole = await mainGuild.roles.fetch(TL_MEMBER_ROLE_ID).catch(() => null);
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
        const reviewChannel = await client.channels.fetch("1511534262380265533").catch(() => null);
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
