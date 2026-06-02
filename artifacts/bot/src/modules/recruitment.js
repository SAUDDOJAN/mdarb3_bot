import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} from "discord.js";
import { scrapeProfile, classIconUrl } from "./scraper.js";
import { query } from "../database/index.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const APPLY_CHANNEL_ID   = "1496296792885694495";
const REVIEW_CHANNEL_ID  = "1496262240058478792";
const WELCOME_CHANNEL_ID = "1496287963640758375";
export const POWER_RADAR_CHANNEL_ID = "1498360289446465636";

export async function getRecruitmentConfig(guildId) {
  const res = await query(
    "SELECT welcome_channel_id, admin_channel_id, powercard_channel_id FROM guild_config WHERE guild_id = $1",
    [guildId]
  );
  const config = res.rows[0] || {};
  const isMainGuild = guildId === (process.env.MAIN_GUILD_ID || "861355983975874601");

  return {
    applyChannelId: isMainGuild ? APPLY_CHANNEL_ID : null,
    reviewChannelId: config.admin_channel_id || (isMainGuild ? REVIEW_CHANNEL_ID : null),
    welcomeChannelId: isMainGuild ? WELCOME_CHANNEL_ID : (config.welcome_channel_id || null),
    powerRadarChannelId: config.powercard_channel_id || (isMainGuild ? POWER_RADAR_CHANNEL_ID : null)
  };
}

const MIN_LEVEL = 45;
const GENERIC_FALLBACK_THUMB =
  "https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png";

// ─── Stat display config (confirmed apiKey order from shugo.gg Fpe array) ─────
const STAT_DISPLAY = {
  str: { emoji: "💪", label: "Might"        },
  dex: { emoji: "🏃", label: "Dexterity"    },
  agi: { emoji: "🎯", label: "Precision"    },
  wis: { emoji: "🛡️", label: "Willpower"    },
  int: { emoji: "🧠", label: "Intelligence" },
  con: { emoji: "❤️", label: "Constitution" },
};

// ─── Formatting Helpers ───────────────────────────────────────────────────────

const trunc  = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const numFmt = (n)    => Number(n).toLocaleString("en-US");

/** Format one gear item: `+15 Item Name *(Slot)*` — no truncation, full name */
function fmtItem(item, showSlot = true) {
  const prefix = item.enchant > 0 ? `+${item.enchant} ` : "";
  const slot   = showSlot && item.slot ? ` *(${item.slot})*` : "";
  return `${prefix}${item.name}${slot}`;
}

/**
 * Format a gear section as plain text — one item per line, no code fences.
 * Each category lives in its own Embed Field which provides the gray framing.
 * Full embed width is available; nothing is squeezed into a monospace box.
 */
function fmtGearSection(items, showSlot = true) {
  if (!items || items.length === 0) return null;
  return items.map((it) => fmtItem(it, showSlot)).join("\n");
}

/** Base stats — 2-column emoji layout */
function fmtBaseStats(stats) {
  if (!stats) return null;
  const order   = ["str", "dex", "agi", "wis", "int", "con"];
  const entries = order
    .map((k) => ({ ...STAT_DISPLAY[k], value: stats[k]?.value ?? null }))
    .filter((e) => e.value !== null);
  if (entries.length === 0) return null;

  const lines = [];
  for (let i = 0; i < entries.length; i += 2) {
    const l = entries[i];
    const r = entries[i + 1];
    const left  = `${l.emoji} **${l.label}**: \`${numFmt(l.value)}\``;
    const right = r ? `　${r.emoji} **${r.label}**: \`${numFmt(r.value)}\`` : "";
    lines.push(left + right);
  }
  return lines.join("\n");
}

/** Title line: bold active title + owned count */
function fmtTitles(titles) {
  if (!titles) return null;
  const parts = [];
  if (titles.active)     parts.push(`**${trunc(titles.active, 50)}**`);
  if (titles.ownedCount) {
    const total = titles.totalCount ? `/${titles.totalCount}` : "";
    parts.push(`\`${titles.ownedCount}${total} ألقاب\``);
  }
  return parts.length > 0 ? parts.join("  •  ") : null;
}

// ─── Server-Side Image Proxy ──────────────────────────────────────────────────
async function fetchCharacterImageBuffer(imageUrl) {
  if (!imageUrl) return null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:  "image/avif,image/webp,image/apng,image/png,image/*,*/*;q=0.8",
          Referer: "https://shugo.gg/",
        },
        redirect: "follow",
        signal:   AbortSignal.timeout(8_000),
      });

      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.startsWith("image/")) {
        console.warn(`[ImageProxy] Attempt ${attempt}: non-image (${res.status} ${ct})`);
        return null;
      }

      const buf = await res.arrayBuffer();
      console.log(`[ImageProxy] ✅ ${buf.byteLength} bytes (attempt ${attempt})`);
      return Buffer.from(buf);
    } catch (err) {
      console.warn(`[ImageProxy] Attempt ${attempt}: ${err.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

// ─── Apply Panel ─────────────────────────────────────────────────────────────
export async function sendApplyPanel(interaction) {
  const targetChannel =
    interaction.guild.channels.cache.get(APPLY_CHANNEL_ID) ?? interaction.channel;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚔️ انضم إلى فيلق M3RGEEN")
    .setDescription(
      "**هل أنت مستعد للانضمام إلى صفوفنا؟**\n" +
      "بتقديمك لطلب الانضمام، أنت تنضم لمجتمع يعتمد على البيانات، النشاط، والاحترام المتبادل. نحن نؤمن بأن الجيلد القوي يُبنى بجهد أفراده والتزامهم.\n\n" +
      "**📜 دستور الانضمام لـ M3RGEEN**\n" +
      "⚖️ **السيادة والاحترام:** السيرفر بيئة احترافية خاصة، والاحترام المتبادل هو الدستور. أي تطاول يواجه بإجراء صارم وفوري.\n" +
      "🤝 **بيئة التعاون:** نحن هنا للعب الجماعي؛ لا مكان لسليطي اللسان. الانضباط الأخلاقي شرط أساسي للبقاء.\n" +
      "🏅 **الرتب والجدارة:** نظام الرتب يعتمد حصرياً على الجدارة، الأخلاق، والفاعلية في دعم الفريق.\n" +
      "🌐 **مجتمع آيون 2:** ستحصل على رتبة المجتمع بعد الموافقة، وهي رتبة أعضاء الفيلق داخل اللعبة.\n" +
      "⚔️ **قيلد اللعبة:** لدخول الفيلق داخل اللعبة، يُشترط أن يكون مستوى شخصيتك 45 كحد أدنى.\n" +
      "🚪 **الانضباط:** من يجد صعوبة في التأقلم مع أدب الجلسة فالباب مفتوح له. المخالفة تعني الخروج النهائي.\n\n" +
      "**✨ لماذا تنضم إلينا؟**\n" +
      "📡 **رادار القوة:** ربط تلقائي بـ shugo.gg لتحديث قوتك (CP) ومستواك يومياً.\n" +
      "📊 **الفحص الأسبوعي:** متابعة نموك؛ تنبيهات ذكية للمساعدة في حال وجود خمول.\n" +
      "🎖️ **رتبة الـ PvP:** نظام ترقيات حصري عند المشاركة في فعاليات الـ PvP.\n\n" +
      "**📝 طريقة التقديم**\n" +
      "1️⃣ ادخل إلى **shugo.gg** وابحث عن اسم شخصيتك.\n" +
      "2️⃣ انسخ رابط بروفايلك (URL).\n" +
      "3️⃣ اضغط على الزر بالأسفل والصق الرابط في النافذة المنبثقة.\n\n" +
      "*(سيتم مراجعة طلبك من قِبل الإدارة)*"
    )
    .setImage("https://media.discordapp.net/attachments/1290449971639881849/1504238725951914086/m3rgeenjoinbanner.jpg?ex=6a0642fb&is=6a04f17b&hm=24120601e3a57dd156c274ff1cc9c04cf5edbd8508d4dfd1cc039db39e9c4388&=&format=webp&width=2910&height=1637")
    .setFooter({ text: "M3RGEEN Recruitment System" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("recruit:apply")
      .setLabel("أرغب بالانضمام")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ content: `✅ تم نشر لوحة التقديم في ${targetChannel}.`, flags: 64 });
  await targetChannel.send({ embeds: [embed], components: [row] });
}

// ─── Interaction Router ───────────────────────────────────────────────────────
export async function handleInteraction(interaction) {
  try {
    const [, action, ...rest] = interaction.customId.split(":");

    if (action === "apply") {
      await showAgreementPanel(interaction);
    } else if (action === "agree") {
      await showBranchSelection(interaction);
    } else if (action === "cancel") {
      await handleCancelApplication(interaction);
    } else if (action === "branch") {
      await showApplyModal(interaction, rest[0]);
    } else if (action === "modal") {
      await processApplication(interaction, rest[0]);
    } else if (action === "accept") {
      await acceptApplicant(interaction, rest[0], rest[1]);
    } else if (action === "reject") {
      await rejectApplicant(interaction, rest[0], rest[1]);
    }
  } catch (err) {
    console.error(`[Recruit:Interaction] Error in ${interaction.customId}:`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ حدث خطأ غير متوقع أثناء معالجة طلبك.", flags: 64 }).catch(() => {});
    } else {
      await interaction.editReply({ content: "❌ حدث خطأ غير متوقع أثناء معالجة طلبك.", embeds: [], components: [] }).catch(() => {});
    }
  }
}

// ─── Step 1: Show Agreement Embed (الإقرار) ───────────────────────────────────
async function showAgreementPanel(interaction) {
  const existing = await query(
    "SELECT status FROM recruits WHERE guild_id=$1 AND user_id=$2 AND status IN ('pending', 'accepted')",
    [interaction.guildId, interaction.user.id]
  );

  if (existing.rows.length > 0) {
    const status = existing.rows[0].status;
    const msg = status === "accepted" 
      ? "✅ أنت مسجل كعضو مقبول في الفيلق بالفعل. لا يمكنك التقديم مرة أخرى."
      : "⏳ لديك طلب قيد المراجعة بالفعل. يرجى الانتظار حتى تتم مراجعته.";
    
    await interaction.reply({ content: msg, flags: 64 });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x8b0000) // Dark Red
    .setTitle("🛑 ميثاق وقوانين قيلد M3RGEEN — إقرار إلزامي")
    .setDescription(
      "انضمامك إلينا ليس مجرد دخول لسيرفر، بل هو التزام بـ منظومة صارمة. مجتمعنا مبني على الاحترام، ولن نسمح بأي سلوك يخرب هذه البيئة. بالموافقة، أنت تتعهد بالالتزام بالمواد التالية:\n\n" +
      "🚫 **منع التنمّر والتطفيش:** يُمنع منعاً باتاً الطقطقة على الأعضاء، أو تكريههم في اللعبة، أو ممارسة الأساليب النرجسية والفوقية والتعالي بعبارات 'هذا مو عاجبني'.\n\n" +
      "🔇 **ضبط النفس مع القروبات:** لغة الصراخ، واللوم، وصب الغضب على التيم (بسبب هيل أو حماية أو خطأ في اللعب) ممنوعة تماماً. السيناريوهات والدراما تعني طردك فوراً.\n\n" +
      "⚔️ **حسم اختيارك (PvP ضد PvE):** إذا اخترت قيلد الـ PvP، فالالتزام بالفعاليات إلزامي (ونعدك ألا تكون مرهقة). إذا كنت تبحث عن اللعب براحتك وبدون التزام، فمكانك الصحيح هو قيلد الـ PvE، ويمكنك التحويل للـ PvP لاحقاً بعد جمع 100 نقطة نشاط. التزامنا هو الضمان ليبقى قيلد الـ PvP في الصدارة.\n\n" +
      "⚠️ **تنبيه ومسؤولية كاملة:**\n" +
      "أنت مسؤول عن كل كلمة وفعل يصدر منك من هذه اللحظة. نظام الرقابة لدينا أوتوماتيكي والرد الإداري سيكون فورياً وحاسماً بالطرد النهائي تلافياً لخراب المجتمع."
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("recruit:agree")
      .setLabel("أوافق وألتزم")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("recruit:cancel")
      .setLabel("إلغاء التقديم")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

// ─── Step 2: Handle Cancel Application ─────────────────────────────────────────
async function handleCancelApplication(interaction) {
  await interaction.update({
    content: "❌ تم إلغاء طلب التقديم. يمكنك التقديم مجدداً في أي وقت.",
    embeds: [],
    components: []
  });
}

// ─── Step 3: Show Branch Selection (الاختيار بين قيلد PvP أو PvE) ───────────────
async function showBranchSelection(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2) // Blurple
    .setTitle("🧬 اختر قسم القيلد")
    .setDescription(
      "يرجى اختيار القسم الذي ترغب بالانضمام إليه في فيلق **M3RGEEN**:\n\n" +
      "⚔️ **قيلد PvP:** للمشاركة في المعارك والحروب والسيج (يتطلب نشاط عالي والالتزام بالفعاليات إلزامي).\n" +
      "🛡️ **قيلد PvE:** للتطوير والفارم والأنشطة العامة بدون التزام إجباري بفعاليات الـ PvP.\n\n" +
      "*ملاحظة: يمكنك التحويل من PvE إلى PvP لاحقاً بعد جمع 100 نقطة نشاط.*"
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("recruit:branch:pvp")
      .setLabel("⚔️ قيلد PvP")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("recruit:branch:pve")
      .setLabel("🛡️ قيلد PvE")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

// ─── Step 4: Show Modal ───────────────────────────────────────────────────────
async function showApplyModal(interaction, branch) {
  const modal = new ModalBuilder()
    .setCustomId(`recruit:modal:${branch}`)
    .setTitle("طلب الانضمام إلى M3RGEEN");

  const urlInput = new TextInputBuilder()
    .setCustomId("shugo_url")
    .setLabel("رابط ملفك على Shugo.gg")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://shugo.gg/character?id=...&server=...&region=TW&name=...")
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(300);

  modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
  await interaction.showModal(modal);
}

// ─── Step 5: Process Application & Submit directly to Review ──────────────────
async function processApplication(interaction, branch) {
  await interaction.deferReply({ flags: 64 });

  const shugoUrl = interaction.fields.getTextInputValue("shugo_url").trim();
  await interaction.editReply({ content: "⏳ جارٍ جلب بيانات ملفك الشخصي من Shugo.gg..." });

  const result = await scrapeProfile(shugoUrl);

  if (!result.success) {
    await interaction.editReply({
      content:
        `❌ **فشل في جلب الملف الشخصي.**\n` +
        `تأكد من أن الرابط صحيح وأن الملف عام.\n\`\`\`${result.error}\`\`\``,
    });
    return;
  }

  const {
    characterName, characterLevel, className, raceName,
    combatPower, profileImage, classIconUrl: iconUrl,
    serverName, stats, gear, titles,
  } = result.data;

  // ── Level gate ────────────────────────────────────────────────────────────
  if (characterLevel < MIN_LEVEL) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("❌ طلب مرفوض — المستوى غير كافٍ")
      .setDescription(
        `عذراً **${interaction.user}**، لا يمكن قبول طلبك في الوقت الحالي.\n\n` +
        `**السبب:** مستوى شخصيتك (**${characterLevel}**) أقل من الحد الأدنى المطلوب وهو **${MIN_LEVEL}**.\n\n` +
        "استمر في اللعب وحاول مجدداً عند الوصول للمستوى المطلوب. 💪"
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── Save with pending status and selected branch ───────────────────────────
  const appRes = await query(
    `INSERT INTO recruits
       (guild_id, user_id, discord_tag, character_name, character_level,
        class_name, combat_power, profile_image, shugo_url, status,
        race_name, server_name, character_data, guild_branch)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13)
     ON CONFLICT (guild_id, user_id) DO UPDATE 
       SET status='pending', discord_tag=$3, character_name=$4, character_level=$5, 
           class_name=$6, combat_power=$7, profile_image=$8, shugo_url=$9, 
           race_name=$10, server_name=$11, character_data=$12, guild_branch=$13, updated_at=NOW()
     RETURNING *`,
    [
      interaction.guildId, interaction.user.id, interaction.user.tag,
      characterName, characterLevel, className,
      combatPower, profileImage, shugoUrl,
      raceName   ?? null,
      serverName ?? null,
      JSON.stringify(result.data),
      branch,
    ]
  );
  const app = appRes.rows[0];

  console.log(`[Recruit] Application submitted by ${interaction.user.tag} (#${app.id}) for branch: ${branch}`);

  // Send for review
  await submitToReview(interaction, app);

  await interaction.editReply({
    content: `✅ تم إرسال طلبك للإدارة للمراجعة بنجاح.\nالقسم المطلوب: **${branch === 'pvp' ? '⚔️ PvP Guild' : '🛡️ PvE Guild'}**\nسنُعلمك بالنتيجة قريباً.`,
  });
}

async function submitToReview(interaction, app) {
  console.log(`[Recruit] Submitting review card for ${app.character_name}...`);
  const config = await getRecruitmentConfig(interaction.guildId);
  const reviewChannelId = config.reviewChannelId;
  const reviewChannel = reviewChannelId
    ? (interaction.guild.channels.cache.get(reviewChannelId) ?? await interaction.guild.channels.fetch(reviewChannelId).catch(() => null))
    : null;
  if (!reviewChannel) {
    console.error(`[Recruit] Review channel not found for guild: ${interaction.guildId}`);
    return;
  }

  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
  const branchLabel = app.guild_branch === 'pvp' ? "⚔️ PvP Guild" : "🛡️ PvE Guild";

  const description =
    `[🔗 عرض البروفايل على shugo.gg](${app.shugo_url})\n` +
    `👑 مقدم الطلب: ${interaction.user}\n` +
    `🚩 القسم المطلوب: **${branchLabel}**`;

  const infoBlock =
    `👤 الاسم: **${app.character_name}**\n` +
    `📊 المستوى: **${app.character_level}**\n` +
    `⚔️ الكلاس: **${app.class_name ?? "—"}**\n` +
    `🌍 السيرفر: **${app.server_name ?? "—"}**\n` +
    `🧬 العرق: **${app.race_name ?? "—"}**\n` +
    `🏆 الرتبة (Abyss): **${app.abyss_rank ?? "—"}** (${app.abyss_score?.toLocaleString() ?? 0})`;

  const fields = [
    { name: "معلومات الشخصية", value: infoBlock, inline: false },
    { name: "قوة القتال (Combat Power) ⚔️", value: `★  **${cpDisplay}**  ★`, inline: false },
  ];

  if (app.character_data) {
    const data = typeof app.character_data === 'string' ? JSON.parse(app.character_data) : app.character_data;
    
    const baseStats = fmtBaseStats(data.stats);
    if (baseStats) fields.push({ name: "الخصائص الأساسية (Base Stats)", value: baseStats, inline: false });

    const titles = fmtTitles(data.titles);
    if (titles) fields.push({ name: "الألقاب (Titles)", value: titles, inline: false });

    const gear = data.gear || {};
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

  fields.push({ name: "مقدّم الطلب", value: `👑 ${interaction.user}`, inline: false });

  const reviewEmbed = new EmbedBuilder()
    .setColor(app.guild_branch === 'pvp' ? 0xed4245 : 0x57f287)
    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
    .setTitle(`📋 طلب انضمام جديد (${branchLabel})`)
    .setDescription(description)
    .addFields(fields)
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${interaction.user.id}  •  App ID: ${app.id}` })
    .setTimestamp();

  if (app.profile_image) reviewEmbed.setImage(app.profile_image);

  const reviewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`recruit:accept:${interaction.user.id}:${app.id}`)
      .setLabel("✅ قبول")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`recruit:reject:${interaction.user.id}:${app.id}`)
      .setLabel("❌ رفض")
      .setStyle(ButtonStyle.Danger)
  );

  await reviewChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
}

// ─── Step 3: Accept ───────────────────────────────────────────────────────────
async function acceptApplicant(interaction, userId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM recruits WHERE id=$1 AND guild_id=$2", [appId, interaction.guildId]);
  const app    = appRes.rows[0];

  if (!app) { await interaction.editReply({ content: "❌ الطلب غير موجود." }); return; }
  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ هذا الطلب تمت مراجعته بالفعل (${app.status}).` });
    return;
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) { await interaction.editReply({ content: "❌ لم يتم العثور على العضو." }); return; }

  const configRes    = await query("SELECT guild_role_id, legion_role_id FROM guild_config WHERE guild_id=$1", [interaction.guildId]);
  const guildRoleId  = configRes.rows[0]?.guild_role_id;
  const legionRoleId = configRes.rows[0]?.legion_role_id;

  // Role assignment based on branch
  if (guildRoleId) {
    await member.roles.add(guildRoleId).catch((e) => {
      console.error("[Recruit] Guild role add failed (Missing Permissions?):", e.message);
    });
  }
  
  if (app.guild_branch === 'pvp' && legionRoleId) {
    await member.roles.add(legionRoleId).catch((e) => {
      console.error("[Recruit] Legion role add failed (Missing Permissions?):", e.message);
    });
  }

  await member.setNickname(app.character_name).catch((e) => {
    console.error(`[Recruit] Nickname change failed for ${member.user.tag}: ${e.message}`);
  });

  await query(
    "UPDATE recruits SET status='accepted', reviewed_by=$1, accepted_at=NOW(), power_card_posted=FALSE WHERE id=$2",
    [interaction.user.id, appId]
  );

  // DM accepted member
  const welcomeDm = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎉 تهانينا! تم قبولك في فيلق M3RGEEN")
    .setDescription(
      `أهلاً وسهلاً بك **${app.character_name}** في عائلة **M3RGEEN**! 🏆\n\n` +
      "لقد تم قبول طلب انضمامك رسمياً.\n\n" +
      "• التزم بقوانين الفيلق.\n• شارك في الأحداث بانتظام.\n• تواصل مع القادة لأي استفسار.\n\n" +
      "نتمنى لك تجربة ممتعة! ⚔️"
    )
    .setTimestamp();
  await member.send({ embeds: [welcomeDm] }).catch(() =>
    console.warn(`[Recruit] Could not DM ${userId}`)
  );

  // Public welcome
  const config = await getRecruitmentConfig(interaction.guildId);
  const welcomeChannelId = config.welcomeChannelId;
  const welcomeChannel = welcomeChannelId
    ? (interaction.guild.channels.cache.get(welcomeChannelId) ?? await interaction.guild.channels.fetch(welcomeChannelId).catch(() => null))
    : null;
  if (welcomeChannel) {
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("⚔️ بطل جديد انضم إلى الفيلق!")
      .setDescription(
        `ارحبوا بالبطل الجديد ${member} وحياك الله معنا 🎉\n\n` +
        `**الشخصية:** ${app.character_name}\n**الفئة:** ${app.class_name ?? "—"}\n` +
        `**القسم:** ${app.guild_branch === 'pvp' ? '⚔️ PvP Guild' : '🛡️ PvE Guild'}\n` +
        `**المستوى:** ${app.character_level}\n**قوة القتال:** ${app.combat_power?.toLocaleString() ?? "—"}\n\n` +
        `> *ستظهر بطاقة قوته في Power Radar خلال 24 ساعة.*`
      )
      .setFooter({ text: `تم القبول بواسطة ${interaction.user.tag}` })
      .setTimestamp();
    if (app.profile_image) welcomeEmbed.setThumbnail(app.profile_image);
    await welcomeChannel.send({ content: `ارحبوا بـ ${member} 🎉`, embeds: [welcomeEmbed] });
  }

  // Insert in-app notification
  await query("INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3)", [
    'recruitment',
    `تم قبول الانضمام! 🎉`,
    `تمت الموافقة على انضمام البطل ${app.character_name} لفيلق ${app.guild_branch === 'pvp' ? 'PvP' : 'PvE'}. أهلاً بك في العائلة! ⚔️`
  ]).catch(err => console.error("Notification insert error:", err));

  // Update review card
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x57f287)
    .setTitle(`✅ مقبول — ${app.character_name}`)
    .setFooter({ text: `تم القبول بواسطة ${interaction.user.tag} • Power Radar ستُنشر بعد 24 ساعة` });
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  await interaction.editReply({
    content:
      `✅ تم قبول **${app.character_name}** وتعيين الرتبة والنكنيم.\n` +
      `📡 بطاقة Power Radar ستُنشر تلقائياً بعد **24 ساعة**.`,
  });
  console.log(`[Recruit] #${appId} ${app.character_name} accepted by ${interaction.user.tag}`);
}

// ─── Step 4: Reject ───────────────────────────────────────────────────────────
async function rejectApplicant(interaction, userId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM recruits WHERE id=$1 AND guild_id=$2", [appId, interaction.guildId]);
  const app    = appRes.rows[0];

  if (!app) { await interaction.editReply({ content: "❌ الطلب غير موجود." }); return; }
  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ هذا الطلب تمت مراجعته بالفعل (${app.status}).` });
    return;
  }

  await query("UPDATE recruits SET status='rejected', reviewed_by=$1 WHERE id=$2", [interaction.user.id, appId]);

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member) {
    const rejectDm = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("نتيجة طلب الانضمام — M3RGEEN")
      .setDescription(
        `عذراً **${app.character_name}**، لم يتم قبول طلبك في الوقت الحالي.\n\n` +
        "يمكنك المحاولة مجدداً لاحقاً بعد تطوير شخصيتك.\nشكراً على اهتمامك بـ **M3RGEEN**. ⚔️"
      )
      .setTimestamp();
    await member.send({ embeds: [rejectDm] }).catch(() => {});
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xed4245)
    .setTitle(`❌ مرفوض — ${app.character_name ?? userId}`)
    .setFooter({ text: `تم الرفض بواسطة ${interaction.user.tag}` });
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({ content: `❌ تم رفض الطلب وإبلاغ المتقدم.` });
}
