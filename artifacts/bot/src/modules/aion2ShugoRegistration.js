import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  PermissionFlagsBits
} from "discord.js";
import { query } from "../database/index.js";
import { scrapeProfile, classIconUrl } from "./scraper.js";
import fs from "fs";
import path from "path";
import { triggerAion2GuildStatsRefresh } from "./aion2GuildStats.js";

// ─── Test Channel & Flags ─────────────────────────────────────────────────────
export const TEST_APPLY_CHANNEL_ID = "1555583094898303026";
export const MEMBER_CARDS_CHANNEL_ID = "1556003754510389249";
export const REVIEW_CHANNELS = {
  EMPEROR: "1555964300827435050",
  M3RGEEN_GLOBAL: "1555640420942348469",
};
export const GLOBAL_GUILD_REGISTRATION_ENABLED = true;

// ─── Discord Roles Configuration (Final & Confirmed IDs) ──────────────────────
export const ROLES = {
  // عضوية مجتمع AION 2 العامة
  AION2_MEMBER: "1401376073077231702",
  // اللاعب يلعب Early Access، بغض النظر عن السيرفر
  AION2_EARLY_ACCESS: "1551161877017403412",
  // عضو فعلي في Guild Emperor على Zikel فقط (بعد Shugo + Admin Accept)
  EMPEROR_GUILD: "1555617021411065917",
  // قيادة Guild Emperor المصرح لها بمراجعة الطلبات
  EMPEROR_GUILD_LEADER: "1555965433058693220",
  // عضو فعلي في Guild M3RGEEN الخاص بالـ Global على سيرفر Ludra
  M3RGEEN_GUILD: "1555617080521269368",
};

export const AION2_MEMBER_ROLE_ID = ROLES.AION2_MEMBER;
export const EARLY_ACCESS_ROLE_ID = ROLES.AION2_EARLY_ACCESS;
export const EMPEROR_ROLE_ID = ROLES.EMPEROR_GUILD;
export const EMPEROR_GUILD_LEADER_ROLE_ID = ROLES.EMPEROR_GUILD_LEADER;
export const M3RGEEN_GUILD_ROLE_ID = ROLES.M3RGEEN_GUILD;

// Server Names
// In shugo, server 2002/2102/2202/2302/2402/2502 is "Zikel".
const CYCLE_SERVER_KEYWORDS = ["zikel", "سايكل", "زيكل", "زايكل"];
const LUDRA_SERVER_KEYWORDS = ["ludra", "لودرا"];

export const CLASS_EMOJIS = {
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Templar:      "<:Templar:1504472027724255414>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Spiritmaster: "<:Elementalist:1504471920219783209>",
  Elementalist: "<:Elementalist:1504471920219783209>",
};

function formatClassWithEmoji(className) {
  const rawClass = String(className || "").trim();
  const normalizedClass = Object.keys(CLASS_EMOJIS).find(c => c.toLowerCase() === rawClass.toLowerCase()) || rawClass;
  const emoji = CLASS_EMOJIS[normalizedClass] || "";
  return emoji ? `${emoji} ${normalizedClass}` : (rawClass || "—");
}

// Stat emojis & formatting
const STAT_DISPLAY = {
  str: { emoji: "💪", label: "Might" },
  dex: { emoji: "🏃", label: "Dexterity" },
  agi: { emoji: "🎯", label: "Precision" },
  wis: { emoji: "🛡️", label: "Willpower" },
  int: { emoji: "🧠", label: "Intelligence" },
  con: { emoji: "❤️", label: "Constitution" },
};

const numFmt = (n) => Number(n).toLocaleString("en-US");

function getSlotEmoji(slotName) {
  if (!slotName) return "🔹";
  const s = slotName.toLowerCase();
  if (s.includes("mainhand") || s.includes("weapon")) return "🗡️";
  if (s.includes("subhand") || s.includes("shield")) return "🛡️";
  if (s.includes("head") || s.includes("helmet")) return "🪖";
  if (s.includes("chest") || s.includes("torso") || s.includes("body")) return "🦺";
  if (s.includes("leg") || s.includes("pants")) return "👖";
  if (s.includes("glove")) return "🧤";
  if (s.includes("boot") || s.includes("shoe")) return "👢";
  if (s.includes("back") || s.includes("cape") || s.includes("cloak")) return "🧥";
  if (s.includes("neck")) return "📿";
  if (s.includes("ring")) return "💍";
  if (s.includes("earring")) return "💎";
  if (s.includes("belt") || s.includes("waist")) return "🥋";
  if (s.includes("bracelet")) return "🧿";
  if (s.includes("arcana")) return "🎴";
  if (s.includes("rune")) return "🪨";
  if (s.includes("orb") || s.includes("brooch")) return "🔮";
  if (s.includes("amulet")) return "📿";
  if (s.includes("wing")) return "🪽";
  return "🔹";
}

function fmtItem(item, showSlot = true) {
  const prefix = item.enchant > 0 ? `+${item.enchant} ` : "";
  const slot = showSlot && item.slot ? ` *(${item.slot})*` : "";
  const emoji = getSlotEmoji(item.slot);
  return `${emoji} ${prefix}**${item.name}**${slot}`;
}

function fmtGearSection(items, showSlot = true) {
  if (!items) return null;

  const list = Array.isArray(items)
    ? items
    : Object.values(items).flat().filter(Boolean);

  if (list.length === 0) return null;

  return list.map((it) => fmtItem(it, showSlot)).join("\n");
}

function fmtBaseStats(stats) {
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

function getClassAttachment(className) {
  let safeName = String(className || "").replace(/[^a-zA-Z0-9]/g, "");
  if (safeName.toLowerCase() === "spiritmaster") {
    safeName = "Elementalist";
  }
  const p = path.resolve(process.cwd(), "assets", "classeslogo", `${safeName}.png`);
  if (fs.existsSync(p)) {
    return new AttachmentBuilder(p, { name: `${safeName}.png` });
  }
  return null;
}

// ─── Helper: Safe Role Sync ───────────────────────────────────────────────────
async function safeAddRoles(guild, userId, roleIds) {
  if (!guild || !userId) return;
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    for (const rid of roleIds) {
      if (rid && !member.roles.cache.has(rid)) {
        await member.roles.add(rid).catch((e) => console.error(`[ShugoReg] Role add error (${rid}):`, e.message));
      }
    }
  } catch (err) {
    console.error(`[ShugoReg] Failed in safeAddRoles for ${userId}:`, err.message);
  }
}

// ─── 1. Send Test Registration Panel ──────────────────────────────────────────
export async function sendShugoTestPanel(interaction) {
  const channel = interaction.guild.channels.cache.get(TEST_APPLY_CHANNEL_ID) ||
                  await interaction.guild.channels.fetch(TEST_APPLY_CHANNEL_ID).catch(() => null);

  if (!channel) {
    return interaction.reply({ content: `❌ تعذر الوصول لروم الاختبار: ${TEST_APPLY_CHANNEL_ID}`, ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor("#2f3136")
    .setTitle("⚔️ الانضمام إلى M3RGEEN — AION 2 (تجريبي)")
    .setDescription(`هل أنت مستعد تنضم معنا؟

إن مجتمع **M3RGEEN** قائم على الاحترام، التعاون واللعب الجماعي.
قبل تقديم طلب الانضمام، اقرأ القوانين التالية بعناية؛ استمرارك في التقديم يعني موافقتك عليها والتزامك بها.

━━━━━━━━━━━━━━━━━━

🤝 1. الاحترام إلزامي
الاحترام بين جميع الأعضاء شرط أساسي. يمنع التجريح، الاستهزاء، الصراخ على الآخرين أو التقليل منهم. المزح مقبول ما دام الطرف الآخر متقبله، وأي تجاوز متكرر يعرض صاحبه للإبعاد من الجيلد.

🤝 2. التعاون وعدم الأنانية
الجيلد قائم على اللعب الجماعي، مو على مبدأ «نفسي نفسي». ساعد أعضاءك متى ما تقدر، وشارك معهم في المحتوى والفعاليات. اللي يدخل فقط لمصلحته ويتجاهل الفريق بشكل مستمر ما له مكان معنا.

📺 3. احترام البث واللاعبين
البث مو مكان للترصد أو الاستهزاء بأخطاء الآخرين. النقد والمزح مقبول باحترام، أما الشماتة، الاستفزاز، أو انتظار فشل عضو للسخرية منه فمرفوض.

⚔️ 4. الالتزام وقت الفعاليات
وقت الـPvP والـSiege والفعاليات المنظمة، الالتزام بتوجيهات القيادة والـShot Caller إلزامي. النقاش له وقته، لكن أثناء التنفيذ ما نبغى صراخ، مقاطعات أو اجتهادات فردية تضر الفريق.

🛡️ 5. لا للتسلط والشِلَل
ممنوع احتكار اللاعبين، تكوين شِلَل تضر بالجيلد، أو التعامل بفوقية بسبب القوة أو الرتبة. قوة اللاعب ما تعطيه أفضلية على غيره؛ نجاحنا كفريق أهم من أي اسم أو CP.

🎯 6. خذ وأعطِ مع الجيلد
الجيلد مو محطة خدمات. استفد من القروبات والمساعدة والفعاليات، لكن بالمقابل كن حاضرًا للفريق قدر استطاعتك. الاستفادة المستمرة بدون أي مشاركة أو تعاون قد تؤثر على استمرار عضويتك.

⚖️ 7. الخلافات ما تخرب الجيلد
الاختلاف طبيعي، لكن التصعيد، التحريض، نقل الكلام وصناعة المشاكل مرفوض. إذا عندك مشكلة مع عضو وما قدرتوا تحلونها بينكم، ارفعها للإدارة بدل ما تتحول لمشكلة بين أعضاء الجيلد.

⏳ 8. الغياب والنشاط
ما نطلب منك تكون موجود يوميًا، وحياتك الخاصة أولى. لكن إذا بتغيب فترة طويلة أو بتترك اللعبة، بلغ الإدارة. الغياب الطويل بدون تنبيه قد يؤدي لإخلاء مكانك داخل الجيلد للاعب نشط.

━━━━━━━━━━━━━━━━━━`)
    .setFooter({ text: "نظام تسجيل AION 2 النهائي (تجريبي) • تحالف M3RGEEN" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aion2_shugo_agree")
      .setLabel("✅ أوافق على قوانين الجيلد")
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [row] });
  return interaction.reply({ content: `✅ تم نشر لوحة تسجيل Shugo التجريبية في <#${TEST_APPLY_CHANNEL_ID}> بنجاح.`, ephemeral: true });
}

// ─── 2. Handle Interactions ───────────────────────────────────────────────────
export async function handleShugoInteraction(interaction) {
  const customId = interaction.customId || "";
  const userId = interaction.user.id;

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Click Agree on Rules
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId === "aion2_shugo_agree") {
    await interaction.deferReply({ ephemeral: true });

    // Check existing active application
    const appRes = await query(
      `SELECT * FROM aion2_global_applications 
       WHERE discord_id = $1 AND status = 'ACCEPTED' AND transition_status IS NULL 
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (appRes.rows.length > 0 && (appRes.rows[0].guild_app_status !== null || appRes.rows[0].assigned_guild !== null)) {
      const app = appRes.rows[0];

      // EXISTING EARLY ACCESS MEMBER
      if (app.guild_type === "EARLY_ACCESS") {
        await safeAddRoles(interaction.guild, userId, [ROLES.AION2_MEMBER, ROLES.AION2_EARLY_ACCESS]);

        // Check Guild Application & Membership State
        if (app.assigned_guild === "EMPEROR" && app.guild_app_status === "ACCEPTED") {
          return interaction.editReply({
            content: `👑 **أهلاً بك مجدداً يا بطل!**\n\nأنت عضو معتمد بالفعل في مجتمع **AION 2 Early Access** ومسجل رسمياً في **Guild Emperor** 👑.`
          });
        }

        if (app.guild_app_status === "PENDING" && app.guild_app_target === "EMPEROR") {
          return interaction.editReply({
            content: `⏳ **طلبك قيد المراجعة:**\n\nلديك طلب انضمام إلى **Guild Emperor** قيد المراجعة لدى قيادة القيلد حالياً.\nسيتم إشعارك فور اتخاذ القرار!`
          });
        }

        // Available to apply (null or REJECTED)
        const isReapply = app.guild_app_status === "REJECTED";
        const promptText = isReapply
          ? `👋 **مرحباً بك مجدداً <@${userId}>!**\n\nعضويتك في مجتمع **AION 2 Early Access** مفعلة وسارية.\n\n👑 **هل ترغب بإعادة التقديم على Guild Emperor على سيرفر Zikel؟**`
          : `👋 **مرحباً بك مجدداً <@${userId}>!**\n\nعضويتك في مجتمع **AION 2 Early Access** مفعلة وسارية.\n\n👑 **هل ترغب بالانضمام إلى Guild Emperor على سيرفر Zikel؟**`;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("aion2_shugo_emperor_apply")
            .setLabel("⚔️ نعم، أرغب بالانضمام")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("aion2_shugo_emperor_decline")
            .setLabel("🛡️ لا، أريد اللعب مع المجتمع فقط")
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({
          content: promptText,
          components: [row]
        });
      }

      // EXISTING GLOBAL MEMBER
      if (app.guild_type === "GLOBAL") {
        await safeAddRoles(interaction.guild, userId, [ROLES.AION2_MEMBER]);

        // Check Guild Application & Membership State
        if (app.assigned_guild === "M3RGEEN_GLOBAL" && app.guild_app_status === "ACCEPTED") {
          return interaction.editReply({
            content: `🪽 **أهلاً بك مجدداً يا بطل!**\n\nأنت عضو معتمد بالفعل في مجتمع **AION 2 Global** ومسجل رسمياً في **Guild M3RGEEN** 🪽.`
          });
        }

        if (app.guild_app_status === "PENDING" && app.guild_app_target === "M3RGEEN_GLOBAL") {
          return interaction.editReply({
            content: `⏳ **طلبك قيد المراجعة:**\n\nلديك طلب انضمام إلى **Guild M3RGEEN** قيد المراجعة لدى إدارة القيلد حالياً.\nسيتم إشعارك فور اتخاذ القرار!`
          });
        }

        // Available to apply (null or REJECTED)
        const isReapply = app.guild_app_status === "REJECTED";
        const promptText = isReapply
          ? `👋 **مرحباً بك مجدداً <@${userId}>!**\n\nعضويتك في مجتمع **AION 2 Global** مفعلة وسارية.\n\n🌍 **هل ترغب بإعادة التقديم على Guild M3RGEEN على سيرفر Ludra؟**`
          : `👋 **مرحباً بك مجدداً <@${userId}>!**\n\nعضويتك في مجتمع **AION 2 Global** مفعلة وسارية.\n\n🌍 **هل ترغب بالانضمام إلى Guild M3RGEEN على سيرفر Ludra؟**`;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("aion2_shugo_global_guild_apply")
            .setLabel("نعم")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("aion2_shugo_global_guild_decline")
            .setLabel("لا")
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({
          content: promptText,
          components: [row]
        });
      }
    }

    // NEW USER -> Show Rules Confirmation
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("aion2_shugo_rules_back")
        .setLabel("📜 برجع أقرأ القوانين")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("aion2_shugo_rules_confirm")
        .setLabel("✅ نعم، قرأتها وأوافق")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({
      content: `⚠️ **قبل ما تكمل**\n\nتأكد إنك قرأت قوانين الجيلد كاملة وفهمتها.\n\nإذا ما قرأتها، ارجع واقرأها الآن؛ لأن موافقتك تعني إنك ملتزم فيها، وأي مخالفة لاحقًا ما راح يكون عذرها:\n«ما كنت أدري».\n\nدخولك للجيلد يعني موافقتك على القوانين وتحملك مسؤولية الالتزام بها.`,
      components: [row]
    });
  }

  // Cancel reading rules
  if (customId === "aion2_shugo_rules_back") {
    await interaction.deferUpdate();
    return interaction.editReply({ content: "تم الإلغاء. يرجى قراءة القوانين بتمعن.", components: [] });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Choose Path (Early Access vs Global)
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId === "aion2_shugo_rules_confirm") {
    await interaction.deferUpdate();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("aion2_shugo_path:EARLY_ACCESS")
        .setLabel("⚡ Early Access")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("aion2_shugo_path:GLOBAL")
        .setLabel("🌍 Global")
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.editReply({
      content: `🛡️ **أين تلعب؟**\n\nاختر مسار انضمامك لمجتمع AION 2:`,
      components: [row]
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: Handle Path Choice -> Create Community Membership
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId === "aion2_shugo_path:EARLY_ACCESS") {
    await interaction.deferUpdate();

    // 1. Create or ensure Community Membership
    try {
      await query(`
        INSERT INTO aion2_global_applications 
          (discord_id, status, guild_type, assigned_guild, guild_app_status, guild_app_target, created_at, updated_at)
        VALUES ($1, 'ACCEPTED', 'EARLY_ACCESS', NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (discord_id) WHERE status IN ('PENDING', 'ACCEPTED', 'PROCESSING')
        DO UPDATE SET guild_type = 'EARLY_ACCESS', updated_at = CURRENT_TIMESTAMP
      `, [userId]);
    } catch (e) {
      console.error("[ShugoReg] Error upserting Early Access Community row:", e);
    }

    // 2. Assign Community Roles: AION 2 Member + AION 2 Early Access
    await safeAddRoles(interaction.guild, userId, [ROLES.AION2_MEMBER, ROLES.AION2_EARLY_ACCESS]);

    // 3. Ask Emperor Question
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("aion2_shugo_emperor_apply")
        .setLabel("⚔️ نعم، أرغب بالانضمام")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("aion2_shugo_emperor_decline")
        .setLabel("🛡️ لا، أريد اللعب مع المجتمع فقط")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({
      content: `🎉 **تم تفعيل عضويتك في مجتمع AION 2 Early Access بنجاح!**\n\n👑 **هل ترغب بالانضمام إلى Guild Emperor؟**`,
      components: [row]
    });
  }

  if (customId === "aion2_shugo_path:GLOBAL") {
    await interaction.deferUpdate();

    // 1. Create Community Membership: AION 2 Member (GLOBAL)
    try {
      await query(`
        INSERT INTO aion2_global_applications 
          (discord_id, status, guild_type, assigned_guild, guild_app_status, guild_app_target, created_at, updated_at)
        VALUES ($1, 'ACCEPTED', 'GLOBAL', NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (discord_id) WHERE status IN ('PENDING', 'ACCEPTED', 'PROCESSING')
        DO UPDATE SET guild_type = 'GLOBAL', updated_at = CURRENT_TIMESTAMP
      `, [userId]);
    } catch (e) {
      console.error("[ShugoReg] Error upserting Global Community row:", e);
    }

    // 2. Assign Role: AION 2 Member only
    await safeAddRoles(interaction.guild, userId, [ROLES.AION2_MEMBER]);

    // 3. Ask Global Guild Question
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("aion2_shugo_global_guild_apply")
        .setLabel("نعم")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("aion2_shugo_global_guild_decline")
        .setLabel("لا")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({
      content: `🎉 **تم تفعيل عضويتك في مجتمع AION 2 بنجاح!**\n\n🌍 **هل ترغب بالانضمام إلى Guild M3RGEEN في Global؟**`,
      components: [row]
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL GUILD RESPONSES
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId === "aion2_shugo_global_guild_decline") {
    await interaction.deferUpdate();
    return interaction.editReply({
      content: `✅ **تم تثبيت عضويتك في مجتمع AION 2.**\nنتمنى لك رحلة موفقة ولعباً ممتعاً مع المجتمع!`,
      components: []
    });
  }

  if (customId === "aion2_shugo_global_guild_apply") {
    await interaction.deferUpdate();
    if (!GLOBAL_GUILD_REGISTRATION_ENABLED) {
      return interaction.editReply({
        content: `ℹ️ **تم تفعيل عضويتك في مجتمع AION 2.**\n\nالتسجيل في **Guild M3RGEEN** للـ Global سيفتح بعد افتتاح السيرفرات واعتماد السيرفر الرسمي. تابع الإعلانات لمعرفة موعد الفتح!`,
        components: []
      });
    }

    // Protection: check if already pending or accepted in M3RGEEN Global
    const checkRes = await query(
      `SELECT guild_app_status, assigned_guild, guild_app_target FROM aion2_global_applications 
       WHERE discord_id = $1 AND status = 'ACCEPTED' AND transition_status IS NULL 
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (checkRes.rows.length > 0) {
      const rowData = checkRes.rows[0];
      if (rowData.guild_app_status === "PENDING" && rowData.guild_app_target === "M3RGEEN_GLOBAL") {
        return interaction.editReply({
          content: `⏳ **لديك طلب قيد المراجعة:**\nطلب انضمامك إلى **Guild M3RGEEN** معروض حالياً على إدارة القيلد. يرجى انتظار قرار الإدارة.`
        });
      }
      if (rowData.guild_app_status === "ACCEPTED" && rowData.assigned_guild === "M3RGEEN_GLOBAL") {
        return interaction.editReply({
          content: `🪽 أنت عضو بالفعل في **Guild M3RGEEN**.`
        });
      }
    }

    const playstyleOptions = [
      { label: "PvP", description: "⚔️ لاعب يركز على القتال والحروب ضد اللاعبين", value: "PVP" },
      { label: "PvE", description: "🛡️ لاعب يركز على الدنجنز والزعماء ومحتوى اللعبة", value: "PVE" },
      { label: "PvX", description: "🔥 لاعب متوازن بين PvP و PvE", value: "PVX" }
    ];

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("aion2_shugo_global_playstyle")
      .setPlaceholder("اختر أسلوب وتوجه لعبك في M3RGEEN")
      .addOptions(playstyleOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.editReply({
      content: `🎯 **اختر أسلوب لعبك الأساسي (Playstyle) في Guild M3RGEEN:**`,
      components: [row]
    });
  }

  // Playstyle selected for Global -> Show Shugo Instructions
  if (customId === "aion2_shugo_global_playstyle") {
    await interaction.deferUpdate();
    const playstyleChoice = interaction.values[0];

    const instructionsEmbed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🔗 خطوة إدخال رابط شخصيتك على Shugo.gg — M3RGEEN")
      .setDescription(`يرجى اتباع الخطوات التالية بدقة لجلب بيانات شخصيتك تلقائياً:\n
1️⃣ ادخل إلى موقع **Shugo.gg** الرسمي عبر الزر بالأسفل.
2️⃣ ابحث عن **اسم شخصيتك الأساسية (Main Character)** في شريط البحث.
3️⃣ افتح **صفحة البروفايل الكاملة** الخاصة بالشخصية.
4️⃣ **انسخ الرابط كاملاً** من شريط المتصفح العلوي.
5️⃣ اضغط على زر **«📝 إدخال الرابط ومتابعة التقديم»** بالأسفل والصق الرابط في الخانة.

⚠️ **تنبيهات مهمة:**
• يرجى إدخال رابط **الشخصية الأساسية (Main Character)** فقط وليس شخصية فرعية (Alt).
• المطلوب هو **رابط البروفايل الكامل** من المتصفح، وليس اسم الشخصية فقط!
• يشترط أن تكون الشخصية موجودة على سيرفر **Ludra** للانضمام إلى Guild M3RGEEN.`)
      .setFooter({ text: "تحالف M3RGEEN | ربط البيانات التلقائي (Global)" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🌐 فتح موقع Shugo.gg")
        .setStyle(ButtonStyle.Link)
        .setURL("https://shugo.gg/"),
      new ButtonBuilder()
        .setCustomId(`aion2_shugo_global_open_modal:${playstyleChoice}`)
        .setLabel("📝 إدخال الرابط ومتابعة التقديم")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({
      content: "",
      embeds: [instructionsEmbed],
      components: [row]
    });
  }

  // Open Shugo URL Modal for Global
  if (customId.startsWith("aion2_shugo_global_open_modal:")) {
    const playstyleChoice = customId.split(":")[1];

    const modal = new ModalBuilder()
      .setCustomId(`aion2_shugo_global_modal_submit:${playstyleChoice}`)
      .setTitle("رابط شخصية Shugo.gg — M3RGEEN Global");

    const urlInput = new TextInputBuilder()
      .setCustomId("shugo_url_input")
      .setLabel("رابط بروفايلك الكامل على Shugo.gg (Main)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://shugo.gg/character/global/eu-ludra/YourCharacterName")
      .setRequired(true)
      .setMinLength(15)
      .setMaxLength(400);

    const notesInput = new TextInputBuilder()
      .setCustomId("shugo_notes_input")
      .setLabel("ملاحظات للإدارة (اختياري)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(urlInput),
      new ActionRowBuilder().addComponents(notesInput)
    );

    return interaction.showModal(modal);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EMPEROR RESPONSES
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId === "aion2_shugo_emperor_decline") {
    await interaction.deferUpdate();
    return interaction.editReply({
      content: `✅ **تم تثبيت عضويتك في مجتمع AION 2 Early Access.**\n\nيمكنك الآن المشاركة في الفعاليات واستخدام نظام LFG واللعب مع مجتمع المعرقين.\nإذا رغبت بالانضمام إلى Emperor لاحقاً، يمكنك التقديم في أي وقت عبر لوحة التسجيل.`,
      components: []
    });
  }

  // User wants Emperor -> Validate Pending / Accepted first
  if (customId === "aion2_shugo_emperor_apply") {
    await interaction.deferUpdate();

    // Protection: check if already pending or accepted in Emperor
    const checkRes = await query(
      `SELECT guild_app_status, assigned_guild FROM aion2_global_applications 
       WHERE discord_id = $1 AND status = 'ACCEPTED' AND transition_status IS NULL 
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (checkRes.rows.length > 0) {
      const rowData = checkRes.rows[0];
      if (rowData.guild_app_status === "PENDING") {
        return interaction.editReply({
          content: `⏳ **لديك طلب قيد المراجعة:**\nطلب انضمامك إلى **Guild Emperor** معروض حالياً على قيادة القيلد. يرجى انتظار قرار الإدارة.`
        });
      }
      if (rowData.guild_app_status === "ACCEPTED" && rowData.assigned_guild === "EMPEROR") {
        return interaction.editReply({
          content: `👑 أنت عضو بالفعل في **Guild Emperor**.`
        });
      }
    }

    const playstyleOptions = [
      { label: "PvP", description: "⚔️ لاعب يركز على القتال والحروب ضد اللاعبين", value: "PVP" },
      { label: "PvE", description: "🛡️ لاعب يركز على الدنجنز والزعماء ومحتوى اللعبة", value: "PVE" },
      { label: "PvX", description: "🔥 لاعب متوازن بين PvP و PvE", value: "PVX" }
    ];

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("aion2_shugo_emperor_playstyle")
      .setPlaceholder("اختر أسلوب وتوجه لعبك في Emperor")
      .addOptions(playstyleOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.editReply({
      content: `🎯 **اختر أسلوب لعبك الأساسي (Playstyle) في Guild Emperor:**`,
      components: [row]
    });
  }

  // Playstyle selected -> Show Shugo Instructions
  if (customId === "aion2_shugo_emperor_playstyle") {
    await interaction.deferUpdate();
    const playstyleChoice = interaction.values[0];

    const instructionsEmbed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🔗 خطوة إدخال رابط شخصيتك على Shugo.gg")
      .setDescription(`يرجى اتباع الخطوات التالية بدقة لجلب بيانات شخصيتك تلقائياً:\n
1️⃣ ادخل إلى موقع **Shugo.gg** الرسمي عبر الزر بالأسفل.
2️⃣ ابحث عن **اسم شخصيتك** في شريط البحث.
3️⃣ افتح **صفحة البروفايل الكاملة** الخاصة بالشخصية.
4️⃣ **انسخ الرابط كاملاً** من شريط المتصفح العلوي.
5️⃣ اضغط على زر **«📝 إدخال الرابط ومتابعة التقديم»** بالأسفل والصق الرابط في الخانة.

⚠️ **تنبيه:**
• المطلوب هو **رابط البروفايل الكامل** من المتصفح، وليس اسم الشخصية فقط!
• يشترط أن تكون الشخصية موجودة على سيرفر **Zikel** للانضمام إلى Emperor.`)
      .setFooter({ text: "تحالف M3RGEEN | ربط البيانات التلقائي" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🌐 فتح موقع Shugo.gg")
        .setStyle(ButtonStyle.Link)
        .setURL("https://shugo.gg/"),
      new ButtonBuilder()
        .setCustomId(`aion2_shugo_open_modal:${playstyleChoice}`)
        .setLabel("📝 إدخال الرابط ومتابعة التقديم")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({
      content: "",
      embeds: [instructionsEmbed],
      components: [row]
    });
  }

  // Open Shugo URL Modal
  if (customId.startsWith("aion2_shugo_open_modal:")) {
    const playstyleChoice = customId.split(":")[1];

    const modal = new ModalBuilder()
      .setCustomId(`aion2_shugo_modal_submit:${playstyleChoice}`)
      .setTitle("رابط شخصية Shugo.gg — Emperor");

    const urlInput = new TextInputBuilder()
      .setCustomId("shugo_url_input")
      .setLabel("رابط بروفايلك الكامل على Shugo.gg")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://shugo.gg/character/global/eu-zikel/YourCharacterName")
      .setRequired(true)
      .setMinLength(15)
      .setMaxLength(400);

    const notesInput = new TextInputBuilder()
      .setCustomId("shugo_notes_input")
      .setLabel("ملاحظات للإدارة (اختياري)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(urlInput),
      new ActionRowBuilder().addComponents(notesInput)
    );

    return interaction.showModal(modal);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODAL SUBMIT & SHUGO SCRAPING & ZIKEL VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId.startsWith("aion2_shugo_modal_submit:")) {
    await interaction.deferReply({ ephemeral: true });
    const playstyleChoice = customId.split(":")[1];

    const shugoUrl = interaction.fields.getTextInputValue("shugo_url_input").trim();
    let notes = interaction.fields.getTextInputValue("shugo_notes_input")?.trim();
    if (!notes) notes = "لا توجد ملاحظات";

    await interaction.editReply({ content: "⏳ **جارٍ فحص الرابط والاتصال بـ Shugo.gg لجلب بيانات شخصيتك...**" });

    // Scrape Profile
    const scrapeRes = await scrapeProfile(shugoUrl);
    if (!scrapeRes.success) {
      return interaction.editReply({
        content: `❌ **تعذر جلب بيانات الشخصية من Shugo.gg.**\nتأكد من صحة الرابط وأن البروفايل متاح.\n\`\`\`${scrapeRes.error}\`\`\``
      });
    }

    const charData = scrapeRes.data;

    // ── ZIKEL VALIDATION ──
    const serverNameLower = String(charData.serverName || "").toLowerCase();
    const isZikel = CYCLE_SERVER_KEYWORDS.some((kw) => serverNameLower.includes(kw));

    if (!isZikel) {
      // Non-Zikel character:
      // DO NOT create guild application
      // guild_app_status remains NULL
      // guild_app_target remains NULL
      // assigned_guild remains NULL
      // status remains ACCEPTED
      return interaction.editReply({
        content: `⚠️ **تنبيه:** عضويتك في مجتمع Early Access مفعلة، لكن **Guild Emperor** موجود على سيرفر **Zikel** فقط، وشخصيتك في رابط Shugo تتبع سيرفر: **${charData.serverName}** (Server ID: ${charData.serverId ?? "—"}).\n\nلذلك هذه الشخصية غير مؤهلة للانضمام إلى Emperor.\nيمكنك الاستمرار في استخدام مجتمع Early Access بشكل طبيعي والمشاركة في LFG والفعاليات.`
      });
    }

    // ── DUPLICATE CHARACTER CHECK (Application Level) ──
    const dupCheck = await query(`
      SELECT discord_id, status FROM aion2_global_applications
      WHERE LOWER(character_name) = LOWER($1)
        AND server_name = $2
        AND status = 'ACCEPTED'
        AND discord_id != $3
      LIMIT 1
    `, [charData.characterName, charData.serverName, userId]);

    if (dupCheck.rowCount > 0) {
      return interaction.editReply({
        content: `❌ **هذه الشخصية (${charData.characterName}) مسجلة بالفعل بحساب ديسكورد آخر.**\nلا يمكن استخدام نفس شخصية Shugo من أكثر من حساب.`
      });
    }

    // ── UPDATE EXISTING ROW TO PENDING (Atomically on same row) ──
    let appId;
    try {
      const updateRes = await query(`
        UPDATE aion2_global_applications
        SET character_name = $1,
            character_level = $2,
            selected_class = $3,
            combat_power = $4,
            profile_image = $5,
            shugo_url = $6,
            race_name = $7,
            server_name = $8,
            character_data = $9,
            playstyle = $10,
            notes = $11,
            guild_app_status = 'PENDING',
            guild_app_target = 'EMPEROR',
            assigned_guild = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE discord_id = $12 AND status = 'ACCEPTED' AND transition_status IS NULL
        RETURNING id
      `, [
        charData.characterName,
        charData.characterLevel || 0,
        charData.className,
        charData.combatPower || 0,
        charData.profileImage,
        shugoUrl,
        charData.raceName || null,
        charData.serverName || null,
        JSON.stringify(charData),
        playstyleChoice,
        notes,
        userId
      ]);

      if (updateRes.rowCount === 0) {
        // Fallback: If no accepted row existed, create one
        const ins = await query(`
          INSERT INTO aion2_global_applications
            (discord_id, selected_class, status, playstyle, notes, guild_type,
             character_name, character_level, combat_power, profile_image, shugo_url,
             race_name, server_name, character_data, assigned_guild, guild_app_status, guild_app_target, created_at, updated_at)
          VALUES ($1, $2, 'ACCEPTED', $3, $4, 'EARLY_ACCESS', $5, $6, $7, $8, $9, $10, $11, $12, NULL, 'PENDING', 'EMPEROR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [
          userId,
          charData.className,
          playstyleChoice,
          notes,
          charData.characterName,
          charData.characterLevel || 0,
          charData.combatPower || 0,
          charData.profileImage,
          shugoUrl,
          charData.raceName || null,
          charData.serverName || null,
          JSON.stringify(charData)
        ]);
        appId = ins.rows[0].id;
      } else {
        appId = updateRes.rows[0].id;
      }
    } catch (dbErr) {
      console.error("[ShugoReg] DB Update Error:", dbErr);
      return interaction.editReply({ content: `❌ حدث خطأ أثناء تحديث بيانات الشخصية: ${dbErr.message}` });
    }

    // Submit Review Card to Target Management Channel
    await submitAdminReviewCard(interaction, appId, charData, "EARLY_ACCESS", playstyleChoice, notes, shugoUrl, "EMPEROR");

    // Trigger non-blocking debounced Guild Stats refresh
    try {
      triggerAion2GuildStatsRefresh(interaction.client);
    } catch (statsErr) {
      console.warn("[ShugoReg] Failed to trigger guild stats refresh:", statsErr.message);
    }

    return interaction.editReply({
      content: `✅ **تم استلام طلب انضمامك إلى Guild Emperor بنجاح!**\n\n👤 **الشخصية:** ${charData.characterName} (Lv.${charData.characterLevel} ${charData.className})\n🌍 **السيرفر:** ${charData.serverName}\n🎯 **التوجه:** ${playstyleChoice}\n⏳ **الحالة:** قيد المراجعة لدى قيادة القيلد (PENDING)\n\nسيتم إشعارك فور اتخاذ القرار.`
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODAL SUBMIT & SHUGO SCRAPING & LUDRA VALIDATION (GLOBAL)
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId.startsWith("aion2_shugo_global_modal_submit:")) {
    await interaction.deferReply({ ephemeral: true });
    const playstyleChoice = customId.split(":")[1];

    const shugoUrl = interaction.fields.getTextInputValue("shugo_url_input").trim();
    let notes = interaction.fields.getTextInputValue("shugo_notes_input")?.trim();
    if (!notes) notes = "لا توجد ملاحظات";

    await interaction.editReply({ content: "⏳ **جارٍ فحص الرابط والاتصال بـ Shugo.gg لجلب بيانات شخصيتك...**" });

    // Scrape Profile
    const scrapeRes = await scrapeProfile(shugoUrl);
    if (!scrapeRes.success) {
      return interaction.editReply({
        content: `❌ **تعذر جلب بيانات الشخصية من Shugo.gg.**\nتأكد من صحة الرابط وأن البروفايل متاح.\n\`\`\`${scrapeRes.error}\`\`\``
      });
    }

    const charData = scrapeRes.data;

    // ── LUDRA VALIDATION ──
    const serverNameLower = String(charData.serverName || "").trim().toLowerCase();
    const isLudra = LUDRA_SERVER_KEYWORDS.some((kw) => serverNameLower.includes(kw));

    if (!isLudra) {
      // Non-Ludra character:
      // DO NOT create guild application
      // guild_app_status remains NULL
      // guild_app_target remains NULL
      // assigned_guild remains NULL
      // status remains ACCEPTED
      return interaction.editReply({
        content: `⚠️ **تنبيه:** عضويتك في مجتمع AION 2 مفعلة، لكن **Guild M3RGEEN** موجود على سيرفر **Ludra** فقط، وشخصيتك في رابط Shugo تتبع سيرفر: **${charData.serverName || "غير محدد"}** (Server ID: ${charData.serverId ?? "—"}).\n\nلذلك هذه الشخصية غير مؤهلة للانضمام إلى M3RGEEN.\nيرجى التقديم باستخدام **شخصيتك الأساسية (Main Character)** الموجودة على سيرفر **Ludra**.\nيمكنك الاستمرار في استخدام مجتمع AION 2 بشكل طبيعي والمشاركة في الفعاليات.`
      });
    }

    // ── DUPLICATE CHARACTER CHECK (Application Level) ──
    const dupCheck = await query(`
      SELECT discord_id, status FROM aion2_global_applications
      WHERE LOWER(character_name) = LOWER($1)
        AND server_name = $2
        AND status = 'ACCEPTED'
        AND discord_id != $3
      LIMIT 1
    `, [charData.characterName, charData.serverName, userId]);

    if (dupCheck.rowCount > 0) {
      return interaction.editReply({
        content: `❌ **هذه الشخصية (${charData.characterName}) مسجلة بالفعل بحساب ديسكورد آخر.**\nلا يمكن استخدام نفس شخصية Shugo من أكثر من حساب.`
      });
    }

    // ── UPDATE EXISTING ROW TO PENDING (Atomically on same row) ──
    let appId;
    try {
      const updateRes = await query(`
        UPDATE aion2_global_applications
        SET character_name = $1,
            character_level = $2,
            selected_class = $3,
            combat_power = $4,
            profile_image = $5,
            shugo_url = $6,
            race_name = $7,
            server_name = $8,
            character_data = $9,
            playstyle = $10,
            notes = $11,
            guild_app_status = 'PENDING',
            guild_app_target = 'M3RGEEN_GLOBAL',
            assigned_guild = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE discord_id = $12 AND status = 'ACCEPTED' AND transition_status IS NULL
        RETURNING id
      `, [
        charData.characterName,
        charData.characterLevel || 0,
        charData.className,
        charData.combatPower || 0,
        charData.profileImage,
        shugoUrl,
        charData.raceName || null,
        charData.serverName || null,
        JSON.stringify(charData),
        playstyleChoice,
        notes,
        userId
      ]);

      if (updateRes.rowCount === 0) {
        // Fallback: If no accepted row existed, create one
        const ins = await query(`
          INSERT INTO aion2_global_applications
            (discord_id, selected_class, status, playstyle, notes, guild_type,
             character_name, character_level, combat_power, profile_image, shugo_url,
             race_name, server_name, character_data, assigned_guild, guild_app_status, guild_app_target, created_at, updated_at)
          VALUES ($1, $2, 'ACCEPTED', $3, $4, 'GLOBAL', $5, $6, $7, $8, $9, $10, $11, $12, NULL, 'PENDING', 'M3RGEEN_GLOBAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [
          userId,
          charData.className,
          playstyleChoice,
          notes,
          charData.characterName,
          charData.characterLevel || 0,
          charData.combatPower || 0,
          charData.profileImage,
          shugoUrl,
          charData.raceName || null,
          charData.serverName || null,
          JSON.stringify(charData)
        ]);
        appId = ins.rows[0].id;
      } else {
        appId = updateRes.rows[0].id;
      }
    } catch (dbErr) {
      console.error("[ShugoReg] DB Update Error (Global):", dbErr);
      return interaction.editReply({ content: `❌ حدث خطأ أثناء تحديث بيانات الشخصية: ${dbErr.message}` });
    }

    // Submit Review Card to Target Management Channel
    await submitAdminReviewCard(interaction, appId, charData, "GLOBAL", playstyleChoice, notes, shugoUrl, "M3RGEEN_GLOBAL");

    // Trigger non-blocking debounced Guild Stats refresh
    try {
      triggerAion2GuildStatsRefresh(interaction.client);
    } catch (statsErr) {
      console.warn("[ShugoReg] Failed to trigger guild stats refresh:", statsErr.message);
    }

    return interaction.editReply({
      content: `✅ **تم استلام طلب انضمامك إلى Guild M3RGEEN بنجاح!**\n\n👤 **الشخصية الأساسية:** ${charData.characterName} (Lv.${charData.characterLevel} ${charData.className})\n🌍 **السيرفر:** ${charData.serverName}\n🎯 **التوجه:** ${playstyleChoice}\n⏳ **الحالة:** قيد المراجعة لدى إدارة القيلد (PENDING)\n\nسيتم إشعارك فور اتخاذ القرار.`
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN DECISION (ACCEPT / REJECT)
  // ─────────────────────────────────────────────────────────────────────────────
  if (customId.startsWith("aion2_shugo_accept_")) {
    const appId = customId.split("_").pop();
    return handleAdminDecision(interaction, appId, "ACCEPT");
  }

  if (customId.startsWith("aion2_shugo_reject_")) {
    const appId = customId.split("_").pop();
    return handleAdminDecision(interaction, appId, "REJECT");
  }
}

// ─── 3. Detailed Review Card for Admin ────────────────────────────────────────
async function submitAdminReviewCard(interaction, appId, charData, pathChoice, playstyleChoice, notes, shugoUrl, guildAppTarget = "EMPEROR") {
  const targetChannelId = REVIEW_CHANNELS[guildAppTarget];
  if (!targetChannelId) {
    console.error(`[ShugoReg] Unsupported or unknown guild_app_target: "${guildAppTarget}". Aborting review card.`);
    return;
  }

  const adminChannel = interaction.client.channels.cache.get(targetChannelId) ||
                       await interaction.client.channels.fetch(targetChannelId).catch(() => null);

  if (!adminChannel) {
    console.error(`[ShugoReg] Target review channel not found for ${guildAppTarget}: ${targetChannelId}`);
    return;
  }

  const cpDisplay = charData.combatPower > 0 ? numFmt(charData.combatPower) : "—";
  const itemLevelDisplay = charData.itemLevel ? numFmt(charData.itemLevel) : "—";

  const PLAYSTYLE_MAP = {
    PVP: "بي في بي",
    PVE: "بي في إي",
    PVX: "بي في إكس"
  };
  const playstyleDisplay = PLAYSTYLE_MAP[playstyleChoice] || playstyleChoice;

  // showSlot = false لحذف الـ Slots الإنجليزية والاحتفاظ بالأيقونة واسم القطعة الأصلي
  const gearText = fmtGearSection(charData.gear, false) || "لا توجد بيانات عتاد";

  const classDisplay = formatClassWithEmoji(charData.className);

  let desc =
    `**اللاعب:** <@${interaction.user.id}>\n` +
    `**الشخصية:** ${charData.characterName}\n` +
    `**السيرفر:** ${charData.serverName}\n` +
    `**⚔️ الكلاس:** ${classDisplay}\n` +
    `**المستوى:** ${charData.characterLevel}\n` +
    `**قوة القتال:** ${cpDisplay}\n` +
    `**مستوى العتاد:** ${itemLevelDisplay}\n` +
    `**التوجه:** ${playstyleDisplay}\n\n` +
    `🔗 **[رابط Shugo.gg / عرض الملف](${shugoUrl})**`;

  const hasNotes = notes && notes.trim() && notes.trim() !== "لا توجد ملاحظات";
  if (hasNotes) {
    desc += `\n\n📝 **ملاحظات اللاعب:**\n${notes.trim()}`;
  }

  const isGlobal = guildAppTarget === "M3RGEEN_GLOBAL";
  const cardTitle = isGlobal ? "🪽 طلب انضمام إلى قيلد M3RGEEN" : "👑 طلب انضمام إلى قيلد إمبراطور";
  const cardColor = isGlobal ? "#3498db" : "#e67e22";

  const adminEmbed = new EmbedBuilder()
    .setColor(cardColor)
    .setTitle(cardTitle)
    .setDescription(desc)
    .addFields(
      { name: "🛡️ العتاد المجهز", value: gearText.slice(0, 1024), inline: false }
    )
    .setTimestamp();

  if (charData.profileImage) {
    adminEmbed.setThumbnail(charData.profileImage);
  } else {
    adminEmbed.setThumbnail(classIconUrl(charData.className));
  }

  const acceptLabel = isGlobal ? "قبول في M3RGEEN" : "قبول في إمبراطور";

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aion2_shugo_accept_${appId}`)
      .setLabel(acceptLabel)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`aion2_shugo_reject_${appId}`)
      .setLabel("رفض الطلب")
      .setStyle(ButtonStyle.Danger)
  );

  const payload = {
    embeds: [adminEmbed],
    components: [row]
  };

  if (guildAppTarget === "EMPEROR") {
    payload.content = `<@&${ROLES.EMPEROR_GUILD_LEADER}>`;
    payload.allowedMentions = {
      roles: [ROLES.EMPEROR_GUILD_LEADER],
      users: [],
      parse: []
    };
  }

  await adminChannel.send(payload);
}

// ─── 4. Admin Decision (Accept / Reject) ──────────────────────────────────────
async function handleAdminDecision(interaction, appId, decision) {
  // 1. Defer immediately to satisfy Discord's 3-second limit
  await interaction.deferUpdate().catch(() => {});

  const appRes = await query(`SELECT * FROM aion2_global_applications WHERE id = $1`, [appId]);
  const app = appRes.rows[0];

  if (!app) {
    return interaction.followUp({ content: "❌ هذا الطلب غير موجود.", ephemeral: true });
  }

  const target = app.guild_app_target;
  if (app.guild_app_status !== "PENDING" || (target !== "EMPEROR" && target !== "M3RGEEN_GLOBAL")) {
    return interaction.followUp({
      content: `⚠️ تمت معالجة هذا الطلب مسبقاً (حالة الطلب: ${app.guild_app_status ?? "غير محدد"}).`,
      ephemeral: true
    });
  }

  const isServerOwner = interaction.guild?.ownerId === interaction.user.id;
  const isAdministrator = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) === true;
  const hasRole = (roleId) => {
    if (!roleId) return false;
    const m = interaction.member;
    if (m?.roles?.cache) return m.roles.cache.has(roleId);
    if (Array.isArray(m?.roles)) return m.roles.includes(roleId);
    return false;
  };

  const MODERATOR_ROLE_ID = "1509497629564866680";
  const GUILD_LEADER_ROLE_ID = "1548343903307178024";

  // Security Check: By Guild Target
  if (target === "EMPEROR") {
    const isEmperorLeader = hasRole(ROLES.EMPEROR_GUILD_LEADER) || 
                            hasRole(MODERATOR_ROLE_ID) || 
                            hasRole(GUILD_LEADER_ROLE_ID);
    if (!isServerOwner && !isAdministrator && !isEmperorLeader) {
      return interaction.followUp({
        content: "❌ لا تملك صلاحية قبول أو رفض طلبات قيلد إمبراطور.",
        ephemeral: true
      });
    }
  } else if (target === "M3RGEEN_GLOBAL") {
    const isGlobalLeader = hasRole(MODERATOR_ROLE_ID) || 
                           hasRole(GUILD_LEADER_ROLE_ID);
    if (!isServerOwner && !isAdministrator && !isGlobalLeader) {
      return interaction.followUp({
        content: "❌ لا تملك صلاحية قبول أو رفض طلبات قيلد M3RGEEN Global.",
        ephemeral: true
      });
    }
  }

  const targetUserId = app.discord_id;
  const guild = interaction.guild;
  const member = await guild.members.fetch(targetUserId).catch(() => null);

  if (decision === "REJECT") {
    if (target === "EMPEROR") {
      // Emperor Rejected:
      // Community status remains ACCEPTED!
      // assigned_guild = NULL
      // guild_app_status = 'REJECTED'
      // guild_app_target = 'EMPEROR'
      // Community roles are untouched
      await query(`
        UPDATE aion2_global_applications
        SET assigned_guild = NULL,
            guild_app_status = 'REJECTED',
            guild_app_target = 'EMPEROR',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND guild_app_status = 'PENDING'
      `, [appId]);

      // Trigger non-blocking debounced Guild Stats refresh
      try {
        triggerAion2GuildStatsRefresh(interaction.client);
      } catch (statsErr) {
        console.warn("[ShugoReg] Failed to trigger guild stats refresh on REJECT:", statsErr.message);
      }

      // Update Admin Embed
      const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0xed4245)
        .setTitle(`❌ تم رفض طلب Emperor — ${app.character_name ?? targetUserId}`)
        .setDescription((interaction.message.embeds[0].description || "") + `\n\n> ⚠️ **القرار:** تم رفض الانضمام لـ Emperor. يستمر كعضو مجتمع Early Access.`)
        .setFooter({ text: `تم الرفض بواسطة ${interaction.user.tag} (Shugo Test)` });

      await interaction.editReply({ embeds: [oldEmbed], components: [] });

      // DM Member
      if (member) {
        await member.send({
          content: `عذراً **${app.character_name ?? "البطل"}**، لم تتم الموافقة على طلب انضمامك إلى فيلق **Emperor** حالياً.\nعضويتك في مجتمع Early Access مستمرة ويمكنك اللعب والمشاركة في الفعاليات العامة والـ LFG بشكل طبيعي.`
        }).catch(() => {});
      }
      return;
    }

    if (target === "M3RGEEN_GLOBAL") {
      // M3RGEEN Global Rejected:
      // Community status remains ACCEPTED!
      // assigned_guild = NULL
      // guild_app_status = 'REJECTED'
      // guild_app_target = 'M3RGEEN_GLOBAL'
      // Community roles are untouched
      await query(`
        UPDATE aion2_global_applications
        SET assigned_guild = NULL,
            guild_app_status = 'REJECTED',
            guild_app_target = 'M3RGEEN_GLOBAL',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND guild_app_status = 'PENDING'
      `, [appId]);

      // Trigger non-blocking debounced Guild Stats refresh
      try {
        triggerAion2GuildStatsRefresh(interaction.client);
      } catch (statsErr) {
        console.warn("[ShugoReg] Failed to trigger guild stats refresh on REJECT (Global):", statsErr.message);
      }

      // Update Admin Embed
      const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0xed4245)
        .setTitle(`❌ تم رفض طلب M3RGEEN Global — ${app.character_name ?? targetUserId}`)
        .setDescription((interaction.message.embeds[0].description || "") + `\n\n> ⚠️ **القرار:** تم رفض الانضمام لـ M3RGEEN Global. يستمر كعضو مجتمع AION 2.`)
        .setFooter({ text: `تم الرفض بواسطة ${interaction.user.tag} (Shugo Test)` });

      await interaction.editReply({ embeds: [oldEmbed], components: [] });

      // DM Member
      if (member) {
        await member.send({
          content: `عذراً **${app.character_name ?? "البطل"}**، لم تتم الموافقة على طلب انضمامك إلى فيلق **M3RGEEN (Global)** حالياً.\nعضويتك في مجتمع AION 2 مستمرة ويمكنك اللعب والمشاركة في الفعاليات العامة بشكل طبيعي.`
        }).catch(() => {});
      }
      return;
    }
  }

  // ACCEPT
  if (decision === "ACCEPT") {
    if (target === "EMPEROR") {
      // 1. Roles: Grant Emperor Guild Role
      if (member) {
        await safeAddRoles(guild, targetUserId, [
          ROLES.AION2_MEMBER,
          ROLES.AION2_EARLY_ACCESS,
          ROLES.EMPEROR_GUILD
        ]);
      }

      // 2. Set Server Nickname to character_name
      if (member && app.character_name) {
        await member.setNickname(app.character_name).catch((err) => {
          console.warn(`[ShugoReg] Failed to set nickname for ${member.user.tag}: ${err.message}`);
        });
      }

      // 3. Update Database:
      // Atomically set assigned_guild = 'EMPEROR', guild_app_status = 'ACCEPTED'
      // Keep status = 'ACCEPTED'
      // Do NOT alter historical reviewed_at if already set
      await query(`
        UPDATE aion2_global_applications
        SET assigned_guild = 'EMPEROR',
            guild_app_status = 'ACCEPTED',
            guild_app_target = 'EMPEROR',
            reviewed_by = COALESCE(reviewed_by, $1),
            reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND guild_app_status = 'PENDING'
      `, [interaction.user.id, appId]);

      // Trigger non-blocking debounced Guild Stats refresh
      try {
        triggerAion2GuildStatsRefresh(interaction.client);
      } catch (statsErr) {
        console.warn("[ShugoReg] Failed to trigger guild stats refresh on ACCEPT:", statsErr.message);
      }

      // 4. Update Admin Embed
      const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x2ecc71)
        .setTitle(`👑 مقبول في Guild Emperor — ${app.character_name}`)
        .setFooter({ text: `تم القبول بواسطة ${interaction.user.tag} (Shugo Test)` });

      await interaction.editReply({ embeds: [oldEmbed], components: [] });

      // 5. Send Member Card to Test Channel
      await sendTestMemberCard(interaction.client, { ...app, assigned_guild: "EMPEROR" });

      // 6. DM Member
      if (member) {
        await member.send({
          content: `🎉 **تهانينا يا بطل (${app.character_name})!**\nتمت الموافقة على انضمامك إلى **Guild Emperor** في AION 2 بنجاح! 👑🔥\nالكلاس: **${app.selected_class}** | السيرفر: **${app.server_name}**\nحياك الله بين المعرقين!`
        }).catch(() => {});
      }
      return;
    }

    if (target === "M3RGEEN_GLOBAL") {
      // 1. Roles: Grant AION 2 Member + M3RGEEN Guild ONLY (NO Early Access, NO Emperor)
      if (member) {
        await safeAddRoles(guild, targetUserId, [
          ROLES.AION2_MEMBER,
          ROLES.M3RGEEN_GUILD
        ]);
      }

      // 2. Set Server Nickname to character_name
      if (member && app.character_name) {
        await member.setNickname(app.character_name).catch((err) => {
          console.warn(`[ShugoReg] Failed to set nickname for ${member.user.tag}: ${err.message}`);
        });
      }

      // 3. Update Database:
      // Atomically set assigned_guild = 'M3RGEEN_GLOBAL', guild_app_status = 'ACCEPTED'
      // Keep status = 'ACCEPTED'
      // Do NOT alter historical reviewed_at if already set
      await query(`
        UPDATE aion2_global_applications
        SET assigned_guild = 'M3RGEEN_GLOBAL',
            guild_app_status = 'ACCEPTED',
            guild_app_target = 'M3RGEEN_GLOBAL',
            reviewed_by = COALESCE(reviewed_by, $1),
            reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND guild_app_status = 'PENDING'
      `, [interaction.user.id, appId]);

      // Trigger non-blocking debounced Guild Stats refresh
      try {
        triggerAion2GuildStatsRefresh(interaction.client);
      } catch (statsErr) {
        console.warn("[ShugoReg] Failed to trigger guild stats refresh on ACCEPT (Global):", statsErr.message);
      }

      // 4. Update Admin Embed
      const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x2ecc71)
        .setTitle(`🪽 مقبول في Guild M3RGEEN — ${app.character_name}`)
        .setFooter({ text: `تم القبول بواسطة ${interaction.user.tag} (Shugo Test)` });

      await interaction.editReply({ embeds: [oldEmbed], components: [] });

      // 5. Send Member Card to Central Channel
      await sendTestMemberCard(interaction.client, { ...app, assigned_guild: "M3RGEEN_GLOBAL" });

      // 6. DM Member
      if (member) {
        await member.send({
          content: `🎉 **تهانينا يا بطل (${app.character_name})!**\nتمت الموافقة على انضمامك إلى **Guild M3RGEEN (Global)** في AION 2 بنجاح! 🪽🔥\nالكلاس: **${app.selected_class}** | السيرفر: **${app.server_name}**\nحياك الله بين المعرقين!`
        }).catch(() => {});
      }
      return;
    }
  }
}

// ─── 5. Member Card in Central Channel ─────────────────────────────────────────
async function sendTestMemberCard(client, app) {
  const GUILD_TITLES = {
    EMPEROR: "👑 Guild Emperor",
    M3RGEEN_GLOBAL: "🪽 Guild M3RGEEN"
  };

  const guildTitle = GUILD_TITLES[app.assigned_guild];
  if (!guildTitle) {
    console.warn(`[ShugoReg] Cannot send member card: unknown or missing assigned_guild "${app.assigned_guild}" for app #${app.id}`);
    return;
  }

  const cardsChannel = client.channels.cache.get(MEMBER_CARDS_CHANNEL_ID) ||
                       await client.channels.fetch(MEMBER_CARDS_CHANNEL_ID).catch(() => null);

  if (!cardsChannel) {
    console.warn(`[ShugoReg] Member cards channel (${MEMBER_CARDS_CHANNEL_ID}) not found or bot lacks access.`);
    return;
  }

  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const classDisplay = formatClassWithEmoji(app.selected_class);

  const memberEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🎉 عضو جديد معتمد في ${guildTitle}!`)
    .setDescription(
      `ارحبوا بالبطل <@${app.discord_id}> وحياك الله معنا 🎉\n\n` +
      `**👤 الشخصية:** ${app.character_name ?? "—"}\n` +
      `**⚔️ الكلاس:** ${classDisplay}\n` +
      `**🎯 التوجه:** ${app.playstyle ?? "PvX"}\n` +
      `**📊 المستوى:** Lv. ${app.character_level ?? 0}\n` +
      `**💪 قوة القتال:** ${cpDisplay} CP\n` +
      `**🌍 السيرفر:** ${app.server_name ?? "—"}\n` +
      `🔗 **[عرض البروفايل على Shugo.gg](${app.shugo_url})**`
    )
    .setFooter({ text: "تحالف M3RGEEN | بطاقة العضو الرسمية" })
    .setTimestamp();

  if (app.profile_image) {
    memberEmbed.setThumbnail(app.profile_image);
  } else {
    memberEmbed.setThumbnail(classIconUrl(app.selected_class));
  }

  await cardsChannel.send({ embeds: [memberEmbed] }).catch(console.error);
}
