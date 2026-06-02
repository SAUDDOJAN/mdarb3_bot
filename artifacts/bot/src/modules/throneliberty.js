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
