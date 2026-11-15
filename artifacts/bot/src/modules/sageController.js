/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║              SAGE ALLIANCE CONTROLLER — ISOLATED MODULE             ║
 * ║  Guild ID: 1507696012410749030                                      ║
 * ║  ALL functions begin with a strict guild isolation guard.           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { scrapeProfile, classIconUrl } from "./scraper.js";
import { query } from "../database/index.js";
import { handleSageMgmtAction } from "./sageMgmtPanels.js";
import { updateGuildStatCard } from "../tasks/sageGuildStats.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const SAGE_GUILD_ID = "1507696012410749030";
const LEADER_USER_ID = "136371223209836544"; // Alliance Leader Discord ID (حساب القائد الأساسي)

// The role that marks guild roles in Sage server (roles containing ⚔️)
const GUILD_ROLE_SYMBOL = "⚔️";

// The role to remove upon guild selection (visitor/unaffiliated role)
const SAGE_GUEST_ROLE_ID = process.env.SAGE_GUEST_ROLE_ID ?? null;

// Channel where accepted member roster cards are posted
const SAGE_ROSTER_CHANNEL_ID = process.env.SAGE_ROSTER_CHANNEL_ID ?? null;

// Channel where admin review requests land
const SAGE_ADMIN_CHANNEL_ID = process.env.SAGE_ADMIN_CHANNEL_ID ?? null;

// ─── Isolation Guard Helper ────────────────────────────────────────────────────
function isSageGuild(guildId) {
  return guildId === SAGE_GUILD_ID;
}

function isSoloPlayerApp(app) {
  if (!app) return false;
  return (
    app.guild_role_id === "1519397169897935019" ||
    app.guild_name === "Solo Player" ||
    String(app.guild_name || "").includes("لاعب فردي")
  );
}

function canManageApplicant(interaction, app) {
  if (!isSoloPlayerApp(app)) return true;
  return interaction.user.id === LEADER_USER_ID || interaction.user.id === interaction.guild?.ownerId;
}

const numFmt = (n) => Number(n).toLocaleString("en-US");
const trunc = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));

// ─── /sage-join Command Handler ───────────────────────────────────────────────
/**
 * Handles the /sage-join slash command.
 * Sends the Arabic welcome embed with the "Join Now" button.
 */
export async function handleSageJoinCommand(interaction) {
  const rulesEmbed = new EmbedBuilder()
    .setColor(0xd4af37) // Gold — premium feel
    .setTitle("⚔️ تحالف الحصارات — نظام الانضمام | Siege Alliance")
    .setDescription(
      [
        "**👑 مرحباً بكم في تحالف الحصارات (Siege Alliance)!**",
        "يرجى قراءة جميع الشروط والتعليمات بعناية قبل البدء بعملية الانضمام.",
        "",
        "**📜 قوانين وشروط التحالف:**",
        "**1.** الاحترام المتبادل إلزامي بين كافة الأعضاء في جميع الأوقات.",
        "**2.** يُمنع منعاً باتاً أي جدال، دراما، أو نزاعات علنية في أي قناة بالسيرفر.",
        "**3.** 🚨 **سياسة الحزم التام (Zero Tolerance):** أي نزاع أو تجاوز علني = **حظر دائم وفوري** دون أي إنذار مسبق.",
        "**4.** جميع الخلافات والشكاوى تُحل حصرياً عبر الخاص (DM) مع إدارة التحالف فقط.",
        "**5.** يجب ربط وتوثيق بروفايلك على Shugo.gg بصيغة السيرفرات العالمية المعتمدة:",
        "`https://shugo.gg/character/global/eu-ludra/اسم_الشخصية`",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━",
        "*بالضغط على زر 'الانضمام الآن' أدناه، فإنك تقر وتوافق على جميع الشروط والقوانين المذكورة أعلاه.*",
      ].join("\n")
    )
    .setFooter({ text: "تحالف الحصارات • نظام الانضمام الرسمي" })
    .setTimestamp();

  const joinRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sage:join_start")
      .setLabel("⚔️ الانضمام الآن")
      .setStyle(ButtonStyle.Primary)
  );

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [rulesEmbed], components: [joinRow] });
  } else {
    await interaction.reply({ embeds: [rulesEmbed], components: [joinRow] });
  }
}

// ─── Guild Select Menu Builder (Dynamic & Auto-Updating) ───────────────────────
async function buildGuildSelectMenuData(guild, newlyAddedRoleId = null, newlyAddedGuildName = null) {
  await guild.roles.fetch();
  const guildRoles = guild.roles.cache.filter((r) => r.name.includes(GUILD_ROLE_SYMBOL));

  let guildOptions = [];
  guildRoles.forEach((role) => {
    const cleanName = role.name.replace(GUILD_ROLE_SYMBOL, "").trim();
    guildOptions.push({
      label: `قيلد ${cleanName}`,
      value: role.id,
      emoji: "⚔️",
      isNew: role.id === newlyAddedRoleId,
    });
  });

  // Sort guilds alphabetically, placing newly added guild at the very top
  guildOptions.sort((a, b) => {
    if (a.isNew) return -1;
    if (b.isNew) return 1;
    return a.label.localeCompare(b.label, "ar");
  });

  // Solo Player option placed at the bottom with strict security warning
  const soloOption = {
    label: "لاعب فردي (Solo Player — تدقيق أمني مشدد)",
    description: "تخضع حسابات اللاعبين الفرديين لتدقيق أمني صارم من قائد التحالف",
    value: "1519397169897935019",
    emoji: "⚠️",
  };

  const finalOptions = [...guildOptions.slice(0, 23), soloOption];

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sage:select_guild")
      .setPlaceholder("اختر القيلد الذي تنتمي إليه...")
      .addOptions(finalOptions)
  );

  const addGuildButtons = [];

  if (newlyAddedRoleId && newlyAddedGuildName) {
    addGuildButtons.push(
      new ButtonBuilder()
        .setCustomId(`sage:fast_select:${newlyAddedRoleId}`)
        .setLabel(`⚡ متابعة التسجيل بقيلد ${newlyAddedGuildName}`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  addGuildButtons.push(
    new ButtonBuilder()
      .setCustomId("sage:add_guild_start")
      .setLabel("➕ إضافة قيلد جديد")
      .setStyle(ButtonStyle.Success)
  );

  const addGuildRow = new ActionRowBuilder().addComponents(addGuildButtons);

  const selectEmbed = new EmbedBuilder()
    .setColor(newlyAddedGuildName ? 0x57f287 : 0xd4af37)
    .setTitle("⚔️ اختيار القيلد — تحالف الحصارات")
    .setDescription(
      newlyAddedGuildName
        ? `✅ **تمت إضافة قيلد "${newlyAddedGuildName}" بنجاح!**\nتم تحديث القائمة بالأسفل تلقائياً، يمكنك الآن اختياره مباشرة من القائمة أو الضغط على زر المتابعة السريعة أدناه.`
        : "اختر القيلد الذي تنتمي إليه في AION 2 من القائمة بالأسفل.\n*(إذا لم تجد قيلدك بالقائمة، اضغط على زر '➕ إضافة قيلد جديد' لإضافته فوراً وتحديث القائمة تلقائياً دون الحاجة لإعادة فتح الرسائل).* "
    );

  return { selectRow, addGuildRow, selectEmbed };
}

// ─── Button: sage:join_start → Show Guild Select Menu ─────────────────────────
async function handleJoinStart(interaction) {
  await interaction.deferReply({ flags: 64 });
  const { selectRow, addGuildRow, selectEmbed } = await buildGuildSelectMenuData(interaction.guild);
  await interaction.editReply({ embeds: [selectEmbed], components: [selectRow, addGuildRow] });
}

// ─── Button: sage:add_guild_start → Show Add Guild Modal ──────────────────────
async function handleAddGuildStart(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("sage:add_guild_modal")
    .setTitle("إضافة قيلد جديد للتحالف");

  const guildNameInput = new TextInputBuilder()
    .setCustomId("guild_name")
    .setLabel("اسم القيلد (Guild Name)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("مثال: M3RGEEN")
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(guildNameInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

// ─── Modal Submit: sage:add_guild_modal (Auto-Update Message Live) ─────────────
async function handleAddGuildModal(interaction) {
  const guildName = interaction.fields.getTextInputValue("guild_name").trim();

  try {
    await interaction.guild.roles.fetch();
    let targetRole = interaction.guild.roles.cache.find(
      (r) =>
        r.name.toLowerCase() === `${GUILD_ROLE_SYMBOL} ${guildName}`.toLowerCase() ||
        r.name.replace(GUILD_ROLE_SYMBOL, "").trim().toLowerCase() === guildName.toLowerCase()
    );

    if (!targetRole) {
      targetRole = await interaction.guild.roles.create({
        name: `${GUILD_ROLE_SYMBOL} ${guildName}`,
        reason: `Sage Recruitment - New Guild added by ${interaction.user.tag}`,
      });
    }

    const { selectRow, addGuildRow, selectEmbed } = await buildGuildSelectMenuData(
      interaction.guild,
      targetRole.id,
      guildName
    );

    await interaction.update({
      embeds: [selectEmbed],
      components: [selectRow, addGuildRow],
    });
  } catch (error) {
    console.error("Error creating/updating guild role:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `❌ حدث خطأ أثناء إضافة القيلد: ${error.message}`,
        flags: 64,
      }).catch(() => {});
    }
  }
}

// ─── Fast Select for Newly Added Guild ─────────────────────────────────────────
async function handleFastSelect(interaction, selectedRoleId) {
  const modal = new ModalBuilder()
    .setCustomId(`sage:profile_modal:${selectedRoleId}`)
    .setTitle("توثيق الشخصية عبر Shugo.gg");

  const urlInput = new TextInputBuilder()
    .setCustomId("sage_shugo_url")
    .setLabel("رابط ملفك على Shugo.gg")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://shugo.gg/character/global/eu-ludra/اسم_الشخصية")
    .setRequired(true)
    .setMinLength(15)
    .setMaxLength(300);

  modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
  await interaction.showModal(modal);
}

// ─── Select Menu: sage:select_guild → Open Shugo Profile Modal ────────────────
async function handleGuildSelect(interaction) {
  const selectedRoleId = interaction.values[0];

  // Open Shugo.gg Profile Modal directly as required for character verification
  const modal = new ModalBuilder()
    .setCustomId(`sage:profile_modal:${selectedRoleId}`)
    .setTitle("توثيق الشخصية عبر Shugo.gg");

  const urlInput = new TextInputBuilder()
    .setCustomId("sage_shugo_url")
    .setLabel("رابط ملفك على Shugo.gg")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://shugo.gg/character/global/eu-ludra/اسم_الشخصية")
    .setRequired(true)
    .setMinLength(15)
    .setMaxLength(300);

  modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
  await interaction.showModal(modal);
}

// ─── Manual Flow (Class -> Race -> Server -> Name) Fallbacks ───────────────────
async function handleClassSelect(interaction, guildId) {
  const selectedClass = interaction.values[0];

  const raceOptions = [
    { label: "أسموديان (Asmodians)", value: "Asmodians", emoji: "🦇" },
    { label: "إليوس (Elyos)", value: "Elyos", emoji: "🕊️" },
  ];

  const raceRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sage:select_race:${guildId}:${selectedClass}`)
      .setPlaceholder("اختر الشعب (الريس)...")
      .addOptions(raceOptions)
  );

  await interaction.update({
    content: `✅ تم اختيار التخصص: **${selectedClass}**\n**الخطوة 2:** اختر الشعب من القائمة أدناه:`,
    components: [raceRow],
  });
}

async function handleRaceSelect(interaction, guildId, selectedClass) {
  const selectedRace = interaction.values[0];

  const serverOptions = [
    { label: "لودرا (Ludra - Global EU)", value: "Ludra", emoji: "🌍" },
    { label: "زيكل (Zikel - Global EU)", value: "Zikel", emoji: "🌍" },
    { label: "ترينيل (Triniel - Global EU)", value: "Triniel", emoji: "🌍" },
    { label: "فايزل (Vaizel - Global EU)", value: "Vaizel", emoji: "🌍" },
    { label: "كايسنيل (Kaisenel - Global EU)", value: "Kaisenel", emoji: "🌍" },
    { label: "نيزيكان (Nezekan - Global EU)", value: "Nezekan", emoji: "🌍" },
  ];

  const serverRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sage:select_server:${guildId}:${selectedClass}:${selectedRace}`)
      .setPlaceholder("اختر سيرفر اللعبة...")
      .addOptions(serverOptions)
  );

  await interaction.update({
    content: `✅ تم اختيار الشعب: **${selectedRace}**\n**الخطوة 3:** اختر سيرفر اللعبة أدناه:`,
    components: [serverRow],
  });
}

async function handleServerSelect(interaction, guildId, selectedClass, selectedRace) {
  const selectedServer = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`sage:submit_name:${guildId}:${selectedClass}:${selectedRace}:${selectedServer}`)
    .setTitle("إدخال اسم الشخصية في اللعبة");

  const nameInput = new TextInputBuilder()
    .setCustomId("sage_char_name")
    .setLabel("اسم الشخصية (Character Name)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("مثال: MDARB3")
    .setRequired(true)
    .setMaxLength(30);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  await interaction.showModal(modal);
}

async function handleSubmitName(interaction, guildId, className, raceName, serverName) {
  await interaction.deferReply({ flags: 64 });

  const characterName = interaction.fields.getTextInputValue("sage_char_name").trim();
  const characterLevel = 0;
  const combatPower = 0;
  const profileImage = classIconUrl(className);
  const shugoUrl = `https://shugo.gg/character/global/eu-ludra/${encodeURIComponent(characterName)}`;

  const selectedRole = interaction.guild.roles.cache.get(guildId);
  let guildName = selectedRole?.name?.replace(GUILD_ROLE_SYMBOL, "").trim() ?? "Unknown";
  if (guildId === "1519397169897935019") guildName = "Solo Player";

  const sourceRes = await query("SELECT source_server_name FROM sage_pending_source WHERE user_id = $1", [interaction.user.id]);
  const sourceDiscordServer = sourceRes.rows[0]?.source_server_name ?? null;

  const countRes = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2", [guildId, interaction.user.id]);
  const isLeader = parseInt(countRes.rows[0].count, 10) === 0;

  const appRes = await query(
    `INSERT INTO sage_recruitment
       (user_id, discord_tag, character_name, character_level, class_name, combat_power,
        race_name, server_name, profile_image, shugo_url, guild_role_id, guild_name,
        status, character_data, source_discord_server, joined_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       discord_tag=$2, character_name=$3, character_level=$4, class_name=$5,
       combat_power=$6, race_name=$7, server_name=$8, profile_image=$9, shugo_url=$10,
       guild_role_id=$11, guild_name=$12, status='pending', character_data=$13,
       source_discord_server=COALESCE($14, sage_recruitment.source_discord_server),
       joined_at=NOW(), updated_at=NOW()
     RETURNING *`,
    [
      interaction.user.id,
      interaction.user.tag,
      characterName,
      characterLevel,
      className,
      combatPower,
      raceName,
      serverName,
      profileImage,
      shugoUrl,
      guildId,
      guildName,
      JSON.stringify({}),
      sourceDiscordServer,
    ]
  );

  const app = appRes.rows[0];

  // Double Verification Routing
  if (isLeader) {
    const LEADER_APP_CHANNEL_ID = "1508469394873913549";
    const targetChannel = interaction.guild.channels.cache.get(LEADER_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(LEADER_APP_CHANNEL_ID).catch(() => null);
    if (targetChannel) {
      try {
        await sendToSageReview(interaction, app, targetChannel, true);
      } catch (reviewErr) {
        console.warn(`[SageController] Could not send leader review: ${reviewErr.message}`);
      }
    }
  } else {
    const GUILD_LEADERS_CHANNEL_ID = "1508696447674093608";
    const leaderRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 AND status = 'accepted' ORDER BY joined_at ASC LIMIT 1", [guildId]);
    const fallbackRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 ORDER BY joined_at ASC LIMIT 1", [guildId]);
    const leaderId = leaderRes.rows[0]?.user_id || fallbackRes.rows[0]?.user_id;

    const leadersChannel = interaction.guild.channels.cache.get(GUILD_LEADERS_CHANNEL_ID) ?? await interaction.guild.channels.fetch(GUILD_LEADERS_CHANNEL_ID).catch(() => null);

    if (leadersChannel && leaderId) {
      try {
        await sendToLeaderVerification(interaction, app, leadersChannel, leaderId);
      } catch (err) {
        console.warn(`[SageController] Could not send verification to leaders channel: ${err.message}`);
      }
    } else if (!leaderId) {
      const ALL_APP_CHANNEL_ID = "1508451380560531586";
      const fallbackChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);
      if (fallbackChannel) {
        try {
          await sendToSageReview(interaction, app, fallbackChannel, false);
        } catch (err) {
          console.warn(`[SageController] Could not send fallback verification: ${err.message}`);
        }
      }
    }
  }

  await interaction.editReply({
    content: "✅ **تم إكمال التسجيل بنجاح!** تم إرسال طلبك للإدارة للتحقق والاعتماد.",
    components: [],
  });
}

// ─── Modal Submit: Shugo.gg Profile Modal ─────────────────────────────────────
async function handleProfileModal(interaction, selectedRoleId) {
  await interaction.deferReply({ flags: 64 });

  const shugoUrl = interaction.fields.getTextInputValue("sage_shugo_url").trim();
  await interaction.editReply({ content: "⏳ جارٍ جلب وتوثيق بيانات ملفك الشخصي من Shugo.gg..." });

  const result = await scrapeProfile(shugoUrl);

  if (!result.success) {
    await interaction.editReply({
      content:
        `❌ **تعذر جلب بيانات البروفايل من Shugo.gg.**\n` +
        `يرجى التأكد من كتابة الرابط بالصيغة العالمية المعتمدة:\n` +
        `\`https://shugo.gg/character/global/eu-ludra/اسم_الشخصية\`\n` +
        `والتأكد من أن ملفك الشخصي عام.\n\`\`\`${result.error}\`\`\``,
    });
    return;
  }

  const {
    characterName,
    characterLevel,
    className,
    combatPower,
    profileImage,
    raceName,
    serverName,
  } = result.data;

  // Anti-Fraud Protocol: Check for duplicates
  const duplicateCheck = await query(
    "SELECT user_id FROM sage_recruitment WHERE shugo_url = $1 AND user_id != $2",
    [shugoUrl, interaction.user.id]
  );

  if (duplicateCheck.rowCount > 0) {
    const oldUserId = duplicateCheck.rows[0].user_id;
    const fraudConfirmBtn = new ButtonBuilder()
      .setCustomId(`sage:fraud_confirm:${oldUserId}`)
      .setLabel("نعم، أنا متأكد أن هذه شخصيتي")
      .setStyle(ButtonStyle.Danger);

    await interaction.editReply({
      content: "⚠️ **تحذير أمني: هذا الرابط مسجل مسبقاً لعضو آخر بالتحالف!**\nهل أنت متأكد تماماً أن هذه الشخصية تعود لك داخل اللعبة؟",
      components: [new ActionRowBuilder().addComponents(fraudConfirmBtn)],
    });
    return;
  }

  const isSoloPlayer = selectedRoleId === "1519397169897935019";
  const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);
  let guildName = selectedRole?.name?.replace(GUILD_ROLE_SYMBOL, "").trim() ?? "Unknown";
  if (isSoloPlayer) guildName = "لاعب فردي (Solo Player)";

  // Get source server if they joined via tracked invite
  const sourceRes = await query("SELECT source_server_name FROM sage_pending_source WHERE user_id = $1", [interaction.user.id]);
  const sourceDiscordServer = sourceRes.rows[0]?.source_server_name ?? null;

  // Check if this is the first person in the guild (Leader) — Solo Player is NEVER leader!
  let isLeader = false;
  if (!isSoloPlayer) {
    const countRes = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2", [selectedRoleId, interaction.user.id]);
    isLeader = parseInt(countRes.rows[0].count, 10) === 0;
  }

  // Upsert into sage_recruitment
  const appRes = await query(
    `INSERT INTO sage_recruitment
       (user_id, discord_tag, character_name, character_level, class_name, combat_power,
        race_name, server_name, profile_image, shugo_url, guild_role_id, guild_name,
        status, character_data, source_discord_server, joined_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       discord_tag=$2, character_name=$3, character_level=$4, class_name=$5,
       combat_power=$6, race_name=$7, server_name=$8, profile_image=$9, shugo_url=$10,
       guild_role_id=$11, guild_name=$12, status='pending', character_data=$13,
       source_discord_server=COALESCE($14, sage_recruitment.source_discord_server),
       joined_at=NOW(), updated_at=NOW()
     RETURNING *`,
    [
      interaction.user.id,
      interaction.user.tag,
      characterName,
      characterLevel,
      className,
      combatPower ?? 0,
      raceName,
      serverName,
      profileImage,
      shugoUrl,
      selectedRoleId,
      guildName,
      JSON.stringify(result.data),
      sourceDiscordServer,
    ]
  );

  const app = appRes.rows[0];

  // ─── Double Verification Routing ───────────────────────────────────
  if (isSoloPlayer) {
    // Solo player applications land strictly in #all-application with security warning
    const ALL_APP_CHANNEL_ID = "1508451380560531586";
    const targetChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);
    if (targetChannel) {
      await sendSoloPlayerReview(interaction, app, targetChannel);
    }
  } else if (isLeader) {
    const LEADER_APP_CHANNEL_ID = "1508469394873913549";
    const targetChannel = interaction.guild.channels.cache.get(LEADER_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(LEADER_APP_CHANNEL_ID).catch(() => null);

    if (targetChannel) {
      try {
        await sendToSageReview(interaction, app, targetChannel, true);
      } catch (reviewErr) {
        console.warn(`[SageController] Could not send leader review: ${reviewErr.message}`);
      }
    }
  } else {
    const GUILD_LEADERS_CHANNEL_ID = "1508696447674093608";
    const leaderRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 AND status = 'accepted' ORDER BY joined_at ASC LIMIT 1", [selectedRoleId]);
    const fallbackRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 ORDER BY joined_at ASC LIMIT 1", [selectedRoleId]);
    const leaderId = leaderRes.rows[0]?.user_id || fallbackRes.rows[0]?.user_id;

    const leadersChannel = interaction.guild.channels.cache.get(GUILD_LEADERS_CHANNEL_ID) ?? await interaction.guild.channels.fetch(GUILD_LEADERS_CHANNEL_ID).catch(() => null);

    if (leadersChannel && leaderId) {
      try {
        await sendToLeaderVerification(interaction, app, leadersChannel, leaderId);
      } catch (err) {
        console.warn(`[SageController] Could not send verification to leaders channel: ${err.message}`);
      }
    } else if (!leaderId) {
      const ALL_APP_CHANNEL_ID = "1508451380560531586";
      const fallbackChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);
      if (fallbackChannel) {
        await sendToSageReview(interaction, app, fallbackChannel, false);
      }
    }
  }

  await interaction.editReply({
    content:
      `✅ **تم استلام طلبك وتوثيق شخصيتك بنجاح!**\n` +
      `الشخصية: **${characterName}** | القيلد: **${guildName}** | السيرفر: **${serverName}**\n` +
      `طلبك الآن قيد المراجعة والتحقق، وستصلك رسالة في الخاص فور قبوله.`,
  });
}

// ─── Solo Player Review Embed (Strict Security Review) ────────────────────────
async function sendSoloPlayerReview(interaction, app, targetChannel) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const description = [
    `🚨 **تدقيق أمني مشدد: طلب انضمام لاعب فردي (احتمال اشتباه / تجسس)** 🚨`,
    `⚠️ **تنبيه الإدارة:** هذا اللاعب تقدم كـ **"لاعب فردي (Solo Player)"** بدون قيلد، ويخضع للرقابة والتدقيق الأمني المباشر.`,
    `🔒 **صلاحية القرار:** محصورة حصراً بقائد التحالف (<@${LEADER_USER_ID}>). لا يمكن لأي مشرف آخر البت في هذا الطلب.`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `👤 **مقدم الطلب:** <@${app.user_id}> (${app.discord_tag ?? interaction.user.tag})`,
    `🏰 **القيلد المختار:** \`لاعب فردي (Solo Player)\``,
    "",
    "📋 **بيانات الشخصية والتوثيق:**",
    `👤 **اسم الشخصية:** \`${app.character_name ?? "—"}\``,
    `📊 **المستوى:** \`${app.character_level ?? "—"}\``,
    `🎮 **التخصص (Class):** \`${app.class_name ?? "—"}\``,
    `🧬 **الشعب (Race):** \`${app.race_name ?? "—"}\``,
    `🌍 **سيرفر اللعبة:** \`${app.server_name ?? "—"}\``,
    `⚡ **قوة القتال (CP):** ★ **${cpDisplay}** ★`,
    "",
    `🔗 **[عرض وتدقيق البروفايل على Shugo.gg](${app.shugo_url})**`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

  const soloEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🚨 تدقيق أمني مشدد: طلب انضمام لاعب فردي")
    .setDescription(description)
    .setThumbnail(app.profile_image || classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${app.user_id}  •  معرف الطلب: ${app.id}  •  تدقيق لاعب فردي` })
    .setTimestamp();

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:accept:${app.user_id}:${app.id}`)
      .setLabel("✅ قبول واعتماد اللاعب الفردي")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sage:reject:${app.user_id}:${app.id}`)
      .setLabel("❌ رفض الطلب")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setLabel("💬 مراسلة العضو (DM)")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${app.user_id}`),
    new ButtonBuilder()
      .setCustomId(`sage:ban:${app.user_id}:${app.id}`)
      .setLabel("🔨 حظر فوري (سياسة الحزم)")
      .setStyle(ButtonStyle.Danger)
  );

  await targetChannel.send({
    content: `⚠️ <@${LEADER_USER_ID}> **إشعار أمني: طلب انضمام لاعب فردي جديد في <#1508451380560531586> يتطلب قرارك الشخصي حصراً.**`,
    embeds: [soloEmbed],
    components: [actionRow],
  });
}

// ─── Admin Review Embed ────────────────────────────────────────────────────────
async function sendToSageReview(interaction, app, targetChannel, isLeader) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
  const titlePrefix = isLeader
    ? "👑 طلب اعتماد قائد قيلد — تحالف الحصارات"
    : "📋 طلب انضمام عضو جديد — تحالف الحصارات";

  const description = [
    `👑 **مقدم الطلب:** <@${app.user_id}> (${app.discord_tag ?? interaction.user.tag})`,
    `🏰 **القيلد المختار:** **${app.guild_name ?? "—"}**`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📋 **بيانات الشخصية والتوثيق:**",
    `👤 **اسم الشخصية:** \`${app.character_name ?? "—"}\``,
    `📊 **المستوى:** \`${app.character_level ?? "—"}\``,
    `🎮 **التخصص (Class):** \`${app.class_name ?? "—"}\``,
    `🧬 **الشعب (Race):** \`${app.race_name ?? "—"}\``,
    `🌍 **سيرفر اللعبة:** \`${app.server_name ?? "—"}\``,
    `⚡ **قوة القتال (CP):** ★ **${cpDisplay}** ★`,
    "",
    `🔗 **[عرض وتدقيق البروفايل على Shugo.gg](${app.shugo_url})**`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

  const reviewEmbed = new EmbedBuilder()
    .setColor(isLeader ? 0xd4af37 : 0x5865f2)
    .setTitle(titlePrefix)
    .setDescription(description)
    .setThumbnail(app.profile_image || classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${app.user_id}  •  معرف الطلب: ${app.id}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:accept:${app.user_id}:${app.id}`)
      .setLabel("✅ قبول الطلب")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sage:reject:${app.user_id}:${app.id}`)
      .setLabel("❌ رفض الطلب")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setLabel("💬 مراسلة العضو (DM)")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${app.user_id}`),
    new ButtonBuilder()
      .setCustomId(`sage:ban:${app.user_id}:${app.id}`)
      .setLabel("🔨 حظر فوري (سياسة الحزم)")
      .setStyle(ButtonStyle.Danger)
  );

  const components = [row1];

  if (isLeader) {
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sage:req_proof:${app.user_id}:${app.id}`)
        .setLabel("📩 إرسال طلب إثبات القيادة تلقائياً (DM)")
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(row2);
  }

  await targetChannel.send({ embeds: [reviewEmbed], components });
}

// ─── Accept Handler ────────────────────────────────────────────────────────────
async function handleSageAccept(interaction, targetUserId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    await interaction.editReply({ content: "❌ لم يتم العثور على الطلب في قاعدة البيانات." });
    return;
  }

  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ تمت مراجعة هذا الطلب مسبقاً (الحالة: ${app.status}).` });
    return;
  }

  // Security guard for Solo Player
  if (!canManageApplicant(interaction, app)) {
    await interaction.editReply({
      content: `⛔ **صلاحية محظورة (تدقيق أمني مشدد):**\nهذا الطلب يخص "لاعب فردي" (Solo Player)، والبت فيه محصور حصراً بقائد التحالف (<@${LEADER_USER_ID}>) لحماية التحالف من التجسس والاختراق.`,
    });
    return;
  }

  // 1. Assign guild role and nickname to the member
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

  // Check if this applicant is the guild leader (first accepted member of their guild)
  let isGuildLeader = false;
  if (!isSoloPlayerApp(app) && app.guild_role_id) {
    const countRes = await query(
      "SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2 AND status = 'accepted'",
      [app.guild_role_id, targetUserId]
    );
    isGuildLeader = parseInt(countRes.rows[0]?.count ?? "0", 10) === 0;
  }

  if (member) {
    try {
      // Assign the core Alliance Member role to give access to all alliance channels
      const ALLIANCE_MEMBER_ROLE_ID = "1571516616435302410";
      await member.roles.add(ALLIANCE_MEMBER_ROLE_ID).catch(() => {});

      if (app.guild_role_id && !isSoloPlayerApp(app)) {
        await member.roles.add(app.guild_role_id).catch(() => {});
      }

      if (isGuildLeader) {
        const LEADER_ROLE_ID = "1507733486671233175";
        await member.roles.add(LEADER_ROLE_ID).catch(() => {});
      }

      // Change Nickname to character name
      if (app.character_name) await member.setNickname(app.character_name).catch(() => {});

      // Remove visitor / onboarding roles upon acceptance
      const RECRUIT_ROLE_ID = "1508443474960060487";
      const VERIFICATION_ROLE_ID = "1508444579488075868";
      await member.roles.remove([RECRUIT_ROLE_ID, VERIFICATION_ROLE_ID]).catch(() => {});
      if (SAGE_GUEST_ROLE_ID) await member.roles.remove(SAGE_GUEST_ROLE_ID).catch(() => {});
    } catch (roleErr) {
      console.warn(`[SageController] Role/Nickname assignment failed for ${targetUserId}:`, roleErr.message);
    }
  }

  // 2. Update DB record
  await query(
    "UPDATE sage_recruitment SET status='accepted', reviewed_by=$1, joined_at=NOW(), updated_at=NOW() WHERE id=$2",
    [interaction.user.id, appId]
  );

  // 3. Post roster card to roster channel
  const rosterChannelId = SAGE_ROSTER_CHANNEL_ID || "1507703833223233567";
  if (rosterChannelId) {
    const rosterChannel = interaction.guild.channels.cache.get(rosterChannelId) ?? await interaction.guild.channels.fetch(rosterChannelId).catch(() => null);
    if (rosterChannel) {
      const rosterMsg = await postRosterCard(rosterChannel, app, member);
      if (rosterMsg) {
        await query(
          "UPDATE sage_recruitment SET roster_message_id=$1, roster_channel_id=$2 WHERE id=$3",
          [rosterMsg.id, rosterChannel.id, appId]
        );
      }
    }
  }

  // 3b. If applicant is Guild Leader, post their card to the dedicated Guild Leaders channel
  if (isGuildLeader && !isSoloPlayerApp(app)) {
    const GUILD_LEADERS_CHANNEL_ID = "1508696447674093608";
    const leadersChannel = interaction.guild.channels.cache.get(GUILD_LEADERS_CHANNEL_ID) ?? await interaction.guild.channels.fetch(GUILD_LEADERS_CHANNEL_ID).catch(() => null);
    if (leadersChannel) {
      await postGuildLeaderCard(leadersChannel, app, member).catch((err) => {
        console.warn(`[SageController] Could not post to guild leaders channel: ${err.message}`);
      });
    }
  }

  // 4. DM the member in Arabic
  if (member) {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ مرحباً بك في تحالف الحصارات | Siege Alliance!")
          .setDescription(
            `أهلاً بك يا بطل **${app.character_name}**! 🛡️\n\n` +
            `تم قبول طلب انضمامك إلى قيلد **${app.guild_name}** في تحالف الحصارات بنجاح.\n\n` +
            `🚨 **تذكير هام:** أي نزاع أو دراما علنية = **طرد وحظر فوري دائم** دون سابق إنذار.\n` +
            `💬 لأي استفسارات أو شكاوى، تواصل مع إدارة التحالف عبر الخاص فقط.`
          )
          .setFooter({ text: "تحالف الحصارات • Siege Alliance" })
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  // 5. Update Guild Stats Card immediately
  const statsChannelId = process.env.SAGE_GUILD_STATS_CHANNEL_ID || "1507703833223233567";
  if (statsChannelId && app.guild_role_id) {
    const statsChannel = interaction.guild.channels.cache.get(statsChannelId) ?? await interaction.guild.channels.fetch(statsChannelId).catch(() => null);
    const role = interaction.guild.roles.cache.get(app.guild_role_id);
    if (statsChannel && role) {
      await updateGuildStatCard(interaction.guild, statsChannel, app.guild_role_id, role).catch((e) => console.error("[SageController] Error updating guild stats card:", e));
    }
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x57f287)
    .setTitle(`✅ تم القبول — ${app.character_name} (${app.guild_name})`)
    .setFooter({ text: `تم الاعتماد بواسطة: ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({
    content: `✅ تم قبول **${app.character_name}** وإسناد رتبة **${app.guild_name}** بنجاح.`,
  });
}

// ─── Reject Handler ────────────────────────────────────────────────────────────
async function handleSageReject(interaction, targetUserId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    await interaction.editReply({ content: "❌ لم يتم العثور على الطلب." });
    return;
  }

  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ تمت مراجعة هذا الطلب مسبقاً (${app.status}).` });
    return;
  }

  // Security guard for Solo Player
  if (!canManageApplicant(interaction, app)) {
    await interaction.editReply({
      content: `⛔ **صلاحية محظورة (تدقيق أمني مشدد):**\nهذا الطلب يخص "لاعب فردي" (Solo Player)، والبت فيه محصور حصراً بقائد التحالف (<@${LEADER_USER_ID}>).`,
    });
    return;
  }

  await query(
    "UPDATE sage_recruitment SET status='rejected', reviewed_by=$1, updated_at=NOW() WHERE id=$2",
    [interaction.user.id, appId]
  );

  // Check if role needs to be deleted
  if (app.guild_role_id) {
    const roleCheck = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id=$1 AND status IN ('pending', 'accepted')", [app.guild_role_id]);
    if (parseInt(roleCheck.rows[0].count) === 0) {
      const roleToDelete = interaction.guild.roles.cache.get(app.guild_role_id);
      if (roleToDelete) await roleToDelete.delete("All applicants for this guild were rejected/banned").catch(() => {});
    }
  }

  // DM the rejected member in Arabic
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member) {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ تحديث بشأن طلب الانضمام — تحالف الحصارات")
          .setDescription(
            "نأسف لإبلاغك بأنه لم يتم قبول طلب انضمامك إلى التحالف في الوقت الحالي.\n" +
            "لأي استفسارات، تواصل مع إدارة السيرفر عبر الخاص فقط."
          )
          .setFooter({ text: "تحالف الحصارات • Siege Alliance" })
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xed4245)
    .setTitle(`❌ تم الرفض — ${app.character_name}`)
    .setFooter({ text: `تم الرفض بواسطة: ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({ content: `❌ تم رفض طلب العضو **${app.character_name}** بنجاح.` });
}

// ─── Ban Handler (Zero Tolerance) ─────────────────────────────────────────────
async function handleSageBan(interaction, targetUserId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  // Security guard for Solo Player
  if (!canManageApplicant(interaction, app)) {
    await interaction.editReply({
      content: `⛔ **صلاحية محظورة (تدقيق أمني مشدد):**\nهذا الطلب يخص "لاعب فردي" (Solo Player)، والبت فيه محصور حصراً بقائد التحالف (<@${LEADER_USER_ID}>).`,
    });
    return;
  }

  try {
    await interaction.guild.members.ban(targetUserId, {
      reason: `[تحالف الحصارات] سياسة الحزم التام — حظر فوري بواسطة ${interaction.user.tag}`,
    });
  } catch (banErr) {
    await interaction.editReply({ content: `❌ فشل تنفيذ الحظر: ${banErr.message}` });
    return;
  }

  if (app) {
    await query(
      "UPDATE sage_recruitment SET status='banned', reviewed_by=$1, updated_at=NOW() WHERE id=$2",
      [interaction.user.id, appId]
    );

    if (app.guild_role_id) {
      const roleCheck = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id=$1 AND status IN ('pending', 'accepted')", [app.guild_role_id]);
      if (parseInt(roleCheck.rows[0].count) === 0) {
        const roleToDelete = interaction.guild.roles.cache.get(app.guild_role_id);
        if (roleToDelete) await roleToDelete.delete("All applicants for this guild were rejected/banned").catch(() => {});
      }
    }
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xff0000)
    .setTitle(`🔨 تم الحظر — ${app?.character_name ?? targetUserId}`)
    .setFooter({ text: `تم التنفيذ بواسطة: ${interaction.user.tag} — سياسة الحزم التام` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({
    content: `🔨 تم تنفيذ الحظر الفوري على **${app?.character_name ?? targetUserId}** بموجب سياسة الحزم التام.`,
  });
}

// ─── Request Leader Proof via DM ──────────────────────────────────────────────
async function handleRequestLeaderProof(interaction, targetUserId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    return await interaction.editReply({ content: "❌ لم يتم العثور على الطلب في قاعدة البيانات." });
  }

  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (!member) {
    return await interaction.editReply({ content: "❌ تعذر العثور على العضو في السيرفر." });
  }

  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle("🛡️ تحالف الحصارات | طلب التحقق من قيادة القيلد")
      .setDescription(
        `مرحباً بك يا بطل **<@${targetUserId}>**! ⚔️\n\n` +
        `لقد تم استلام طلب اعتمادك كقائد لقيلد **${app.guild_name}** في تحالف الحصارات.\n\n` +
        `📋 **المطلوب للتحقق والاعتماد:**\n` +
        `يرجى تزويد إدارة التحالف بصورة (سكرين شوت) واضحة من داخل اللعبة تثبت أن شخصيتك **${app.character_name}** هي قائد القيلد (Guild Master) الحالي.\n\n` +
        `💬 يمكنك الرد هنا أو التواصل مع الإدارة: <@${interaction.user.id}>.\n\n` +
        `شكراً لتعاونكم في الحفاظ على تنظيم وأمان التحالف!`
      )
      .setFooter({ text: "تحالف الحصارات • Siege Alliance Verification" })
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] });

    await interaction.editReply({
      content: `✅ **تم إرسال طلب إثبات القيادة بنجاح إلى الخاص للعضو <@${targetUserId}>.**\nيمكنك أيضاً مراسلته مباشرة عبر زر **💬 مراسلة العضو (DM)**.`,
    });
  } catch (err) {
    console.warn(`[SageController] Proof request DM failed for ${targetUserId}:`, err.message);
    await interaction.editReply({
      content: `⚠️ تعذر إرسال رسالة في الخاص للعضو <@${targetUserId}> (الخاص لديه مغلق).\nيرجى الضغط على زر **💬 مراسلة العضو (DM)** لمراسلته مباشرة.`,
    });
  }
}

// ─── Roster Card Builder ───────────────────────────────────────────────────────
async function postRosterCard(channel, app, member) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const rosterEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`⚔️ ${app.character_name}`)
    .setDescription(
      `🎊 **أهلاً بك في عائلة تحالف الحصارات! سعداء بانضمامك معنا.** ✨\n\n` +
      `> 🏰 **القيلد:** ${app.guild_name}\n` +
      `> 👤 **الديسكورد:** <@${member?.id ?? app.user_id}>\n` +
      `> 🎮 **التخصص:** ${app.class_name ?? "—"}\n` +
      `> 🧬 **الشعب:** ${app.race_name ?? "—"}\n` +
      `> 🌍 **السيرفر:** ${app.server_name ?? "—"}\n` +
      `> ⚡ **قوة القتال:** ★ ${cpDisplay} ★\n\n` +
      (app.shugo_url && app.shugo_url.startsWith("http") ? `[🔗 عرض البروفايل على Shugo.gg](${app.shugo_url})` : "")
    )
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: `سجل تحالف الحصارات • Siege Alliance Roster` })
    .setTimestamp();

  if (app.profile_image) rosterEmbed.setImage(app.profile_image);

  return await channel.send({ embeds: [rosterEmbed] });
}

// ─── Guild Leader Card Builder (Dedicated Council Channel) ────────────────────
async function postGuildLeaderCard(channel, app, member) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const leaderEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`👑 قائد قيلد: ${app.character_name}`)
    .setDescription(
      `🛡️✨ **انضمام قائد قيلد رسمي إلى مجلس قيادة تحالف الحصارات!** ⚔️\n\n` +
      `> 🏰 **القيلد:** **${app.guild_name}**\n` +
      `> 👑 **قائد القيلد:** <@${member?.id ?? app.user_id}>\n` +
      `> 🎮 **التخصص:** ${app.class_name ?? "—"}\n` +
      `> 🧬 **الشعب:** ${app.race_name ?? "—"}\n` +
      `> 🌍 **السيرفر:** ${app.server_name ?? "—"}\n` +
      `> ⚡ **قوة القتال:** ★ ${cpDisplay} ★\n\n` +
      (app.shugo_url && app.shugo_url.startsWith("http") ? `[🔗 عرض وتدقيق البروفايل على Shugo.gg](${app.shugo_url})` : "")
    )
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: "مجلس قيادة تحالف الحصارات • Guild Leaders Council" })
    .setTimestamp();

  if (app.profile_image) leaderEmbed.setImage(app.profile_image);

  return await channel.send({
    content: `📢 **مرحباً بالقائد <@${member?.id ?? app.user_id}> في مجلس قيادة تحالف الحصارات!**`,
    embeds: [leaderEmbed],
  });
}

// ─── Anti-Fraud Alert ────────────────────────────────────────────────────────
async function handleFraudConfirm(interaction, oldUserId) {
  await interaction.deferReply({ flags: 64 });

  try {
    const res = await query("SELECT character_name, shugo_url, discord_tag FROM sage_recruitment WHERE user_id = $1", [oldUserId]);
    if (res.rowCount === 0) {
      return await interaction.editReply({ content: "❌ تعذر العثور على بيانات العضو السابق في قاعدة البيانات." });
    }

    const oldUser = res.rows[0];
    const newMemberId = interaction.user.id;

    const alertEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🚨 بلاغ انتحال شخصية (Anti-Fraud Protocol)")
      .setDescription(
        `تم رصد محاولة تسجيل مكررة لرابط **Shugo.gg**!\n\n` +
        `👤 **اللاعب الذي يحاول التسجيل (المنتحل):** <@${newMemberId}>\n` +
        `⚠️ **العضو السابق المسجل بهذا الرابط:** <@${oldUserId}> (${oldUser.discord_tag})\n` +
        `🎮 **اسم الشخصية:** ${oldUser.character_name}\n` +
        `🔗 **الرابط المدخل:** ${oldUser.shugo_url}`
      )
      .setFooter({ text: "تحالف الحصارات • نظام مكافحة الانتحال" })
      .setTimestamp();

    const leaderRoleId = "1507733275278577916";
    const councilRoleId = "1507733319989858435";
    const triageChannelId = "1508489408251171080";

    // Send to Triage Channel
    const triageChannel = interaction.guild.channels.cache.get(triageChannelId) ?? await interaction.guild.channels.fetch(triageChannelId).catch(() => null);
    if (triageChannel) {
      await triageChannel.send({ content: `<@&${leaderRoleId}> <@&${councilRoleId}>`, embeds: [alertEmbed] });
    }

    // Send DMs to Leaders and Council
    await interaction.guild.members.fetch();
    const leaders = interaction.guild.roles.cache.get(leaderRoleId)?.members;
    const council = interaction.guild.roles.cache.get(councilRoleId)?.members;

    const notifyMember = async (member) => {
      if (!member.user.bot) {
        await member.send({ embeds: [alertEmbed] }).catch(() => {});
      }
    };

    if (leaders) leaders.forEach(notifyMember);
    if (council) council.forEach(notifyMember);

    await interaction.editReply({
      content: "✅ **تم تأكيد البلاغ.** تم إرسال إشعار عاجل لقيادة التحالف للتحقق من الهوية واتخاذ الإجراء اللازم. شكراً لك.",
    });
  } catch (err) {
    console.error("[AntiFraud] Error processing alert:", err);
    await interaction.editReply({ content: "❌ حدث خطأ أثناء إرسال البلاغ." });
  }
}

// ─── Leader Verification System ────────────────────────────────────────────────
async function sendToLeaderVerification(interaction, app, targetChannel, leaderId) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const description = [
    `مرحباً بقائد القيلد <@${leaderId}>،`,
    `هناك عضو جديد يطلب الانضمام إلى قيلدكم (**${app.guild_name}**). يرجى التحقق مما إذا كان هذا العضو ينتمي إليكم بالفعل داخل اللعبة.\n`,
    `👑 **مقدم الطلب:** <@${app.user_id}> (${interaction.user.tag})`,
    `🏰 **القيلد المختار:** **${app.guild_name ?? "—"}**`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "📋 **بيانات الشخصية والتوثيق:**",
    `👤 **اسم الشخصية:** \`${app.character_name ?? "—"}\``,
    `📊 **المستوى:** \`${app.character_level ?? "—"}\``,
    `🎮 **التخصص (Class):** \`${app.class_name ?? "—"}\``,
    `🧬 **الشعب (Race):** \`${app.race_name ?? "—"}\``,
    `🌍 **سيرفر اللعبة:** \`${app.server_name ?? "—"}\``,
    `⚡ **قوة القتال (CP):** ★ **${cpDisplay}** ★`,
    "",
    `🔗 **[عرض وتدقيق البروفايل على Shugo.gg](${app.shugo_url})**`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

  const verifyEmbed = new EmbedBuilder()
    .setColor(0x3498db) // Blue for verification
    .setTitle("🛡️ طلب تحقق من هوية عضو (تحقق قائد القيلد)")
    .setDescription(description)
    .setThumbnail(app.profile_image || classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${interaction.user.id}  •  معرف الطلب: ${app.id}` })
    .setTimestamp();

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:leader_verify:${interaction.user.id}:${app.id}`)
      .setLabel("✅ تأكيد (ينتمي للقيلد)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sage:leader_reject:${interaction.user.id}:${app.id}`)
      .setLabel("❌ رفض (غير معروف)")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setLabel("💬 مراسلة العضو (DM)")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${app.user_id}`)
  );

  await targetChannel.send({ content: `<@${leaderId}>`, embeds: [verifyEmbed], components: [verifyRow] });
}

async function handleLeaderVerify(interaction, targetUserId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    return await interaction.editReply({ content: "❌ لم يتم العثور على الطلب." });
  }
  if (app.status !== "pending") {
    return await interaction.editReply({ content: `⚠️ تمت مراجعة هذا الطلب مسبقاً (${app.status}).` });
  }

  // Forward to Admin Channel
  const ALL_APP_CHANNEL_ID = "1508451380560531586";
  const targetChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);

  if (targetChannel) {
    const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
    const description = [
      `✅ **تم التحقق من هويته وتأكيده بواسطة قائد القيلد (<@${interaction.user.id}> - ${interaction.user.tag})**`,
      "",
      `👑 **المتقدم:** <@${app.user_id}>`,
      `🏰 **القيلد:** **${app.guild_name ?? "—"}**`,
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "📋 **بيانات الشخصية والتوثيق:**",
      `👤 **اسم الشخصية:** \`${app.character_name ?? "—"}\``,
      `📊 **المستوى:** \`${app.character_level ?? "—"}\``,
      `🎮 **التخصص (Class):** \`${app.class_name ?? "—"}\``,
      `🧬 **الشعب (Race):** \`${app.race_name ?? "—"}\``,
      `🌍 **سيرفر اللعبة:** \`${app.server_name ?? "—"}\``,
      `⚡ **قوة القتال (CP):** ★ **${cpDisplay}** ★`,
      "",
      `🔗 **[عرض وتدقيق البروفايل على Shugo.gg](${app.shugo_url})**`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ].join("\n");

    const reviewEmbed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle("📋 طلب انضمام جديد (مُحقق منه من قائد القيلد) — تحالف الحصارات")
      .setDescription(description)
      .setThumbnail(app.profile_image || classIconUrl(app.class_name))
      .setFooter({ text: `Discord ID: ${app.user_id}  •  معرف الطلب: ${app.id}` })
      .setTimestamp();

    const reviewRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sage:accept:${app.user_id}:${app.id}`)
        .setLabel("✅ اعتماد نهائي")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sage:reject:${app.user_id}:${app.id}`)
        .setLabel("❌ رفض نهائي")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setLabel("💬 مراسلة العضو (DM)")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${app.user_id}`),
      new ButtonBuilder()
        .setCustomId(`sage:ban:${app.user_id}:${app.id}`)
        .setLabel("🔨 حظر فوري")
        .setStyle(ButtonStyle.Danger)
    );

    await targetChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
  }

  // Update the leader message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x2ecc71)
    .setTitle("✅ تم تأكيد العضو وتحويل طلبه للإدارة للموافقة النهائية");
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  await interaction.editReply({ content: "✅ تم تأكيد هوية العضو وإرسال طلبه للإدارة للاعتماد النهائي." });
}

async function handleLeaderReject(interaction, targetUserId, appId) {
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) return await interaction.editReply({ content: "❌ لم يتم العثور على الطلب." });

  // Update DB
  await query("UPDATE sage_recruitment SET status='rejected', reviewed_by=$1, updated_at=NOW() WHERE id=$2", [interaction.user.id, appId]);

  // Update the leader message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xe74c3c)
    .setTitle("❌ تم رفض العضو من قبل قائد القيلد");
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  // Send DM to applicant in Arabic
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member && !member.user.bot) {
    const dmEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("❌ تحديث بشأن طلب انضمامك (تحالف الحصارات)")
      .setDescription(
        `نأسف لإبلاغك بأن طلب انضمامك إلى قيلد **${app.guild_name}** قد تم **رفضه** من قبل قائد القيلد.\n\n` +
        `إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع قائد قيلدك مباشرة لتوضيح الأمر.`
      )
      .setFooter({ text: "تحالف الحصارات • Siege Alliance" })
      .setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  }

  await interaction.editReply({ content: "✅ تم رفض العضو وإشعاره بنجاح." });
}

// ─── Main Interaction Router ───────────────────────────────────────────────────
export async function handleInteraction(interaction) {
  try {
    const [, action, ...rest] = interaction.customId.split(":");

    switch (action) {
      case "join_start":
        return await handleJoinStart(interaction);

      case "add_guild_start":
        return await handleAddGuildStart(interaction);

      case "add_guild_modal":
        return await handleAddGuildModal(interaction);

      case "fast_select":
        return await handleFastSelect(interaction, rest[0]);

      case "select_guild":
        return await handleGuildSelect(interaction);

      case "select_class":
        return await handleClassSelect(interaction, rest[0]);

      case "select_race":
        return await handleRaceSelect(interaction, rest[0], rest[1]);

      case "select_server":
        return await handleServerSelect(interaction, rest[0], rest[1], rest[2]);

      case "submit_name":
        return await handleSubmitName(interaction, rest[0], rest[1], rest[2], rest[3]);

      case "profile_modal":
        return await handleProfileModal(interaction, rest[0]);

      case "fraud_confirm":
        return await handleFraudConfirm(interaction, rest[0]);

      case "leader_verify":
        return await handleLeaderVerify(interaction, rest[0], rest[1]);

      case "leader_reject":
        return await handleLeaderReject(interaction, rest[0], rest[1]);

      case "accept":
        return await handleSageAccept(interaction, rest[0], rest[1]);

      case "reject":
        return await handleSageReject(interaction, rest[0], rest[1]);

      case "ban":
        return await handleSageBan(interaction, rest[0], rest[1]);

      case "req_proof":
        return await handleRequestLeaderProof(interaction, rest[0], rest[1]);

      case "open_member_mgmt":
      case "member_select":
      case "remove_member":
      case "sync_member":
      case "cancel_member":
        return await handleSageMgmtAction(action, interaction, rest);

      default:
        console.warn(`[SageController] Unknown action: "${action}"`);
    }
  } catch (err) {
    console.error(`[SageController] Error in ${interaction.customId}:`, err);
    const reply = {
      content: "❌ حدث خطأ أثناء معالجة طلبك في نظام التحالف. يرجى المحاولة مرة أخرى.",
      flags: 64,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

// ─── DM Proof Receiver for Guild Leaders ───────────────────────────────────────
export async function handleSageDmProof(message, client) {
  if (message.author?.bot || message.guild) return;

  if (message.partial) {
    await message.fetch().catch(() => {});
  }

  const userId = message.author.id;

  // Check if this user has an active pending application
  const appRes = await query(
    "SELECT * FROM sage_recruitment WHERE user_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [userId]
  );

  if (appRes.rowCount === 0) return;
  const app = appRes.rows[0];

  const attachments = Array.from(message.attachments?.values() || []);
  const imageAttachments = attachments.filter(
    (att) => att.contentType?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(att.name || "")
  );

  const LEADER_APP_CHANNEL_ID = "1508469394873913549";
  const guild = client.guilds.cache.get(SAGE_GUILD_ID) ?? await client.guilds.fetch(SAGE_GUILD_ID).catch(() => null);
  if (!guild) return;

  const targetChannel = guild.channels.cache.get(LEADER_APP_CHANNEL_ID) ?? await guild.channels.fetch(LEADER_APP_CHANNEL_ID).catch(() => null);
  if (!targetChannel) return;

  if (imageAttachments.length > 0) {
    const proofImageUrl = imageAttachments[0].url;
    const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

    const description = [
      `📸 **وصلت صورة إثبات قيادة جديدة من مقدم الطلب عبر الخاص (DM):**\n`,
      `👑 **مقدم الإثبات:** <@${app.user_id}> (${message.author.tag})`,
      `🏰 **القيلد:** **${app.guild_name ?? "—"}**`,
      `👤 **اسم الشخصية:** \`${app.character_name ?? "—"}\``,
      `🎮 **التخصص:** \`${app.class_name ?? "—"}\` | 📊 **المستوى:** \`${app.character_level ?? "—"}\``,
      `⚡ **قوة القتال (CP):** ★ **${cpDisplay}** ★`,
      app.shugo_url ? `🔗 **[عرض وتدقيق البروفايل على Shugo.gg](${app.shugo_url})**` : "",
      message.content?.trim() ? `\n💬 **ملاحظة مقدم الطلب:**\n> ${message.content.trim()}` : "",
    ].filter(Boolean).join("\n");

    const proofEmbed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(`📸 وصل إثبات قيادة القيلد — ${app.guild_name}`)
      .setDescription(description)
      .setImage(proofImageUrl)
      .setThumbnail(app.profile_image || classIconUrl(app.class_name))
      .setFooter({ text: `Discord ID: ${app.user_id}  •  معرف الطلب: ${app.id}  •  إثبات قيادة القيلد` })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sage:accept:${app.user_id}:${app.id}`)
        .setLabel("✅ قبول واعتماد القيلد")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sage:reject:${app.user_id}:${app.id}`)
        .setLabel("❌ رفض الطلب")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setLabel("💬 مراسلة العضو (DM)")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${app.user_id}`),
      new ButtonBuilder()
        .setCustomId(`sage:ban:${app.user_id}:${app.id}`)
        .setLabel("🔨 حظر فوري")
        .setStyle(ButtonStyle.Danger)
    );

    const extraFiles = imageAttachments.slice(1).map((a) => a.url);

    await targetChannel.send({
      content: `🔔 **إشعار وصول إثبات قيادة جديد من <@${app.user_id}>:**`,
      embeds: [proofEmbed],
      components: [actionRow],
      files: extraFiles,
    });

    try {
      const currentData = typeof app.character_data === "object" && app.character_data !== null ? app.character_data : {};
      currentData.proof_image_url = proofImageUrl;
      await query("UPDATE sage_recruitment SET character_data = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(currentData), app.id]);
    } catch (dbErr) {
      console.warn("[SageDM] Could not update character_data with proof url:", dbErr.message);
    }

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ تم استلام صورة الإثبات بنجاح!")
          .setDescription(
            `شكراً لك يا بطل **${app.character_name}**! 🛡️\n\n` +
            `تم استلام صورة إثبات قيادة قيلد **${app.guild_name}** بنجاح وتم إرسالها فوراً إلى إدارة تحالف الحصارات لمطابقتها واعتمادك.\n\n` +
            `⏳ ستصلك رسالة هنا فور إتمام التدقيق وقبول طلبك وتفعيل الرتبة.`
          )
          .setFooter({ text: "تحالف الحصارات • Siege Alliance" })
          .setTimestamp(),
      ],
    }).catch(() => {});
  } else if (message.content?.trim()) {
    await targetChannel.send({
      content: `💬 **رسالة عبر الخاص من مقدم الطلب <@${app.user_id}> (${message.author.tag}) — قيلد: ${app.guild_name}:**\n> ${message.content.trim()}`,
    }).catch(() => {});

    await message.reply({
      content:
        `📩 **تم إيصال رسالتك إلى إدارة التحالف بنجاح.**\n` +
        `📸 إذا كان لديك صورة (سكرين شوت) تثبت أنك قائد قيلد **${app.guild_name}** داخل اللعبة، يرجى إرسال الصورة هنا مباشرة في هذه المحادثة.`,
    }).catch(() => {});
  }
}
