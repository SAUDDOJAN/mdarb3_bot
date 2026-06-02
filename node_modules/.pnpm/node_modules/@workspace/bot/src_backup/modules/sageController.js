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

const numFmt = (n) => Number(n).toLocaleString("en-US");
const trunc = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));

// ─── /sage-join Command Handler ───────────────────────────────────────────────
/**
 * Handles the /sage-join slash command.
 * Sends the bilingual welcome embed with the "Join Now" button.
 */
export async function handleSageJoinCommand(interaction) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation

  const rulesEmbed = new EmbedBuilder()
    .setColor(0xd4af37) // Gold — premium feel
    .setTitle("⚔️ Siege Alliance — نظام الانضمام | Join System")
    .setDescription(
      [
        "**🇸🇦 مرحباً بك في تحالف القيلدات!**",
        "قبل الانضمام، تأكد من قراءة القوانين التالية بعناية.",
        "",
        "**📜 قوانين التحالف:**",
        "**١.** الاحترام المتبادل بين جميع الأعضاء في جميع الأوقات.",
        "**٢.** لا توجد مشادات علنية أو خلافات داخل قنوات السيرفر.",
        "**٣.** 🚨 **قانون الصفر تسامح:** أي مشادة علنية = **طرد فوري ودائم** بدون تحذير مسبق.",
        "**٤.** يُحسم أي خلاف عبر رسائل خاصة (DM) مع الإدارة فقط.",
        "**٥.** يجب ربط حسابك على shugo.gg للتحقق من شخصيتك.",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "**🇬🇧 Welcome to the Siege Alliance!**",
        "Please read all rules carefully before joining.",
        "",
        "**📜 Alliance Rules:**",
        "**1.** Mutual respect between all members at all times.",
        "**2.** No public arguments or conflicts in any server channel.",
        "**3.** 🚨 **Zero Tolerance Policy:** Any public conflict = **immediate permanent ban**, no prior warning.",
        "**4.** All disputes must be resolved via DM with staff only.",
        "**5.** You must link your shugo.gg profile for character verification.",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━",
        "*بالنقر على زر الانضمام فأنت توافق على جميع القوانين المذكورة أعلاه.*",
        "*By clicking Join Now, you agree to all rules listed above.*",
      ].join("\n")
    )
    .setFooter({ text: "Siege Alliance • نظام الانضمام الرسمي" })
    .setTimestamp();

  const joinRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sage:join_start")
      .setLabel("⚔️ انضم الآن | Join Now")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [rulesEmbed], components: [joinRow] });
}

// ─── Button: sage:join_start → Show Guild Select Menu ─────────────────────────
async function handleJoinStart(interaction) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation

  // Fetch all roles containing ⚔️ from the guild
  await interaction.guild.roles.fetch();
  const guildRoles = interaction.guild.roles.cache.filter(
    (r) => r.name.includes(GUILD_ROLE_SYMBOL)
  );

  if (guildRoles.size === 0) {
    await interaction.reply({
      content: "❌ لا توجد قيلدات مسجلة حالياً في السيرفر. تواصل مع الإدارة.",
      flags: 64,
    });
    return;
  }

  const options = guildRoles.map((role) => ({
    label: role.name.replace(GUILD_ROLE_SYMBOL, "").trim(),
    value: role.id,
    emoji: "⚔️",
  })).slice(0, 25); // Discord limit

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sage:select_guild")
      .setPlaceholder("اختر قيلدك | Select your Guild")
      .addOptions(options)
  );

  const selectEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("⚔️ اختر قيلدك | Select Your Guild")
    .setDescription(
      "اختر القيلد التي تنتمي إليها في لعبة Aion 2 من القائمة أدناه.\n" +
      "*(إذا لم تجد قيلدك، تواصل مع الإدارة لإضافتها.)*\n\n" +
      "Select the guild you belong to in Aion 2 from the list below.\n" +
      "*(If your guild is not listed, contact staff to add it.)*"
    );

  await interaction.reply({ embeds: [selectEmbed], components: [selectRow], flags: 64 });
}

// ─── Select Menu: sage:select_guild → Ask for Shugo URL ───────────────────────
async function handleGuildSelect(interaction) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation

  const selectedRoleId = interaction.values[0];
  const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);

  if (!selectedRole) {
    await interaction.reply({ content: "❌ القيلد غير موجودة، حاول مجدداً.", flags: 64 });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`sage:profile_modal:${selectedRoleId}`)
    .setTitle("Link Your Profile | ربط ملفك");

  const shugoInput = new TextInputBuilder()
    .setCustomId("sage_shugo_url")
    .setLabel("shugo.gg Profile URL | رابط الملف") // max 45 chars ✓
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://shugo.gg/character?id=...&server=...&region=TW&name=...")
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(shugoInput));

  await interaction.showModal(modal);
}

// ─── Modal Submit: sage:profile_modal → Scrape & Submit for Review ─────────────
async function handleProfileModal(interaction, selectedRoleId) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const shugoUrl = interaction.fields.getTextInputValue("sage_shugo_url").trim();
  await interaction.editReply({ content: "⏳ جارٍ جلب بيانات ملفك من shugo.gg..." });

  const result = await scrapeProfile(shugoUrl);

  if (!result.success) {
    await interaction.editReply({
      content:
        `❌ **فشل جلب الملف الشخصي.**\n` +
        `تأكد أن الرابط صحيح وأن الملف عام على shugo.gg.\n` +
        `\`\`\`${result.error}\`\`\``,
    });
    return;
  }

  const {
    characterName, characterLevel, className,
    combatPower, profileImage, raceName, serverName,
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
      .setLabel("نعم، متأكد | Yes, I am sure")
      .setStyle(ButtonStyle.Danger);

    await interaction.editReply({
      content: "⚠️ **تحذير: هذا الرابط مسجل مسبقاً لعضو آخر.**\nهل أنت متأكد من أن هذا الملف الشخصي يخص شخصيتك في اللعبة؟",
      components: [new ActionRowBuilder().addComponents(fraudConfirmBtn)],
    });
    return;
  }

  const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);
  const guildName = selectedRole?.name?.replace(GUILD_ROLE_SYMBOL, "").trim() ?? "Unknown";

  // Get source server if they joined via tracked invite
  const sourceRes = await query("SELECT source_server_name FROM sage_pending_source WHERE user_id = $1", [interaction.user.id]);
  const sourceDiscordServer = sourceRes.rows[0]?.source_server_name ?? null;

  // Check if this is the first person in the guild (Leader)
  const countRes = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2", [selectedRoleId, interaction.user.id]);
  const isLeader = parseInt(countRes.rows[0].count, 10) === 0;

  // Upsert into sage_recruitment (always pending initially)
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
      characterName, characterLevel, className,
      combatPower ?? 0, raceName, serverName,
      profileImage, shugoUrl,
      selectedRoleId, guildName,
      JSON.stringify(result.data),
      sourceDiscordServer,
    ]
  );

  const app = appRes.rows[0];

  // ─── Double Verification Routing ───────────────────────────────────
  if (isLeader) {
    // If they are the first, they are the leader. Send directly to Admin Leader Channel.
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
    // If not the first, they are a member. Send verification card to Guild Leaders channel.
    const GUILD_LEADERS_CHANNEL_ID = "1508696447674093608";
    const leaderRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 AND status = 'accepted' ORDER BY joined_at ASC LIMIT 1", [selectedRoleId]);
    
    // Fallback: If no accepted leader exists, just find the first applicant for this guild
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
      // If for some reason there's no leader at all, fallback to regular admin channel
      const ALL_APP_CHANNEL_ID = "1508451380560531586";
      const fallbackChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);
      if (fallbackChannel) {
        await sendToSageReview(interaction, app, fallbackChannel, false);
      }
    }
  }

  await interaction.editReply({
    content:
      `✅ **تم استلام طلبك بنجاح!**\n` +
      `الشخصية: **${characterName}** | القيلد: **${guildName}**\n` +
      `طلبك الآن قيد المراجعة، سيصلك إشعار بالخاص عند قبوله.`,
  });
}

// ─── Admin Review Embed ────────────────────────────────────────────────────────
async function sendToSageReview(interaction, app, targetChannel, isLeader) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const titlePrefix = isLeader ? "👑 طلب قيادة قيلد — Siege Alliance" : "📋 طلب انضمام جديد — Siege Alliance";

  const reviewEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(titlePrefix)
    .setDescription(
      `👑 المتقدم: ${interaction.user}\n` +
      `[🔗 عرض البروفايل على shugo.gg](${app.shugo_url})`
    )
    .addFields(
      { name: "⚔️ القيلد المختارة", value: app.guild_name ?? "—" },
      { name: "👤 الشخصية", value: app.character_name ?? "—" },
      { name: "📊 المستوى", value: String(app.character_level ?? "—") },
      { name: "🎮 الكلاس", value: app.class_name ?? "—" },
      { name: "🌍 السيرفر", value: app.server_name ?? "—" },
      { name: "⚡ قوة القتال (CP)", value: `★ **${cpDisplay}** ★` },
    )
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${interaction.user.id}  •  App DB ID: ${app.id}` })
    .setTimestamp();

  if (app.profile_image) reviewEmbed.setImage(app.profile_image);

  const reviewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:accept:${interaction.user.id}:${app.id}`)
      .setLabel("✅ قبول")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sage:reject:${interaction.user.id}:${app.id}`)
      .setLabel("❌ رفض")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`sage:ban:${interaction.user.id}:${app.id}`)
      .setLabel("🔨 باند فوري")
      .setStyle(ButtonStyle.Danger)
  );

  await targetChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
}

// ─── Accept Handler ────────────────────────────────────────────────────────────
async function handleSageAccept(interaction, targetUserId, appId) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    await interaction.editReply({ content: "❌ الطلب غير موجود في قاعدة البيانات." });
    return;
  }

  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ هذا الطلب تمت مراجعته بالفعل (${app.status}).` });
    return;
  }

  // 1. Assign guild role and nickname to the member
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member) {
    try {
      // Assign guild role
      if (app.guild_role_id) await member.roles.add(app.guild_role_id);

      // Check if this is the first accepted member (Leader)
      const countRes = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2 AND status = 'accepted'", [app.guild_role_id, targetUserId]);
      const isGuildLeader = parseInt(countRes.rows[0].count, 10) === 0;
      if (isGuildLeader) {
        const LEADER_ROLE_ID = "1507733486671233175";
        await member.roles.add(LEADER_ROLE_ID).catch(() => {});
      }

      // Change Nickname to character name
      if (app.character_name) await member.setNickname(app.character_name).catch(() => {});

      // Remove guest/visitor role if configured
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
  const rosterChannelId = SAGE_ROSTER_CHANNEL_ID;
  if (rosterChannelId) {
    const rosterChannel = interaction.guild.channels.cache.get(rosterChannelId);
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

  // 4. DM the member
  if (member) {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ تم قبولك في Siege Alliance!")
          .setDescription(
            `مرحباً **${app.character_name}**!\n\n` +
            `تم قبول طلب انضمامك في **${app.guild_name}** ضمن تحالف القيلدات.\n\n` +
            `🚨 تذكر: أي مشادة علنية = **طرد فوري ودائم** بدون تحذير.\n` +
            `💬 لأي خلاف، تواصل مع الإدارة عبر DM فقط.\n\n` +
            `Welcome to **${app.guild_name}** in the Siege Alliance!\n` +
            `🚨 Remember: Any public conflict = **immediate permanent ban**, no warning.`
          )
          .setTimestamp()
      ]
    }).catch(() => {}); // DM might fail if user has DMs disabled
  }

  // 5. Update Guild Stats Card immediately
  const statsChannelId = process.env.SAGE_GUILD_STATS_CHANNEL_ID;
  if (statsChannelId && app.guild_role_id) {
    const statsChannel = interaction.guild.channels.cache.get(statsChannelId) ?? await interaction.guild.channels.fetch(statsChannelId).catch(() => null);
    const role = interaction.guild.roles.cache.get(app.guild_role_id);
    if (statsChannel && role) {
      await updateGuildStatCard(interaction.guild, statsChannel, app.guild_role_id, role).catch(e => console.error("[SageController] Error updating guild stats card:", e));
    }
  }

  // 6. Update admin review message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x57f287)
    .setTitle(`✅ تم القبول — ${app.character_name} (${app.guild_name})`)
    .setFooter({ text: `قبله: ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({
    content: `✅ تم قبول **${app.character_name}** وتعيين رول **${app.guild_name}** بنجاح.`,
  });
}

// ─── Reject Handler ────────────────────────────────────────────────────────────
async function handleSageReject(interaction, targetUserId, appId) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    await interaction.editReply({ content: "❌ الطلب غير موجود." });
    return;
  }

  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ هذا الطلب تمت مراجعته بالفعل (${app.status}).` });
    return;
  }

  await query(
    "UPDATE sage_recruitment SET status='rejected', reviewed_by=$1, updated_at=NOW() WHERE id=$2",
    [interaction.user.id, appId]
  );

  // DM the rejected member
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member) {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ تم رفض طلب انضمامك — Siege Alliance")
          .setDescription(
            "للأسف، لم يتم قبول طلب انضمامك في الوقت الحالي.\n" +
            "للاستفسار، تواصل مع الإدارة عبر رسالة خاصة (DM).\n\n" +
            "Unfortunately, your application was not accepted at this time.\n" +
            "For inquiries, contact staff via DM only."
          )
          .setTimestamp()
      ]
    }).catch(() => {});
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xed4245)
    .setTitle(`❌ مرفوض — ${app.character_name}`)
    .setFooter({ text: `رفضه: ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({ content: `❌ تم رفض طلب **${app.character_name}** وإشعاره.` });
}

// ─── Ban Handler (Zero Tolerance) ─────────────────────────────────────────────
async function handleSageBan(interaction, targetUserId, appId) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  try {
    await interaction.guild.members.ban(targetUserId, {
      reason: `[Siege Alliance] Zero Tolerance Policy — Banned by ${interaction.user.tag}`,
    });
  } catch (banErr) {
    await interaction.editReply({ content: `❌ فشل تنفيذ الباند: ${banErr.message}` });
    return;
  }

  if (app) {
    await query(
      "UPDATE sage_recruitment SET status='banned', reviewed_by=$1, updated_at=NOW() WHERE id=$2",
      [interaction.user.id, appId]
    );
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xff0000)
    .setTitle(`🔨 محظور (باند) — ${app?.character_name ?? targetUserId}`)
    .setFooter({ text: `نفّذه: ${interaction.user.tag} — Zero Tolerance` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({
    content: `🔨 تم تنفيذ الباند الفوري على **${app?.character_name ?? targetUserId}** بموجب قانون الصفر تسامح.`,
  });
}

// ─── Roster Card Builder ───────────────────────────────────────────────────────
async function postRosterCard(channel, app, member) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
  const displayName = member?.displayName ?? app.discord_tag;

  const rosterEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`⚔️ ${app.character_name}`)
    .setDescription(
      `🎉 **نرحب بانضمامك لأسرة التحالف! نحن سعداء ومتحمسون جداً بوجودك معنا.** 🌟\n` +
      `🎊 **Welcome to the Alliance family! We're thrilled to have you here.** ✨\n\n` +
      `> 🏰 **القيلد | Guild:** ${app.guild_name}\n` +
      `> 👤 **ديسكورد | Discord:** <@${member?.id ?? app.user_id}>\n` +
      `> 📊 **المستوى | Level:** ${app.character_level ?? "—"}\n` +
      `> 🎮 **الكلاس | Class:** ${app.class_name ?? "—"}\n` +
      `> 🧬 **العرق | Race:** ${app.race_name ?? "—"}\n` +
      `> 🌍 **السيرفر | Server:** ${app.server_name ?? "—"}\n` +
      `> ⚡ **قوة القتال | CP:** ★ ${cpDisplay} ★\n\n` +
      `🔗 **[استعراض البروفايل الكامل | View Full Profile](${app.shugo_url})**`
    )
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: `Siege Alliance Roster • ${new Date().toLocaleDateString("ar-SA")}` })
    .setTimestamp();

  if (app.profile_image) rosterEmbed.setImage(app.profile_image);

  return await channel.send({ embeds: [rosterEmbed] });
}

// ─── Anti-Fraud Alert ────────────────────────────────────────────────────────
async function handleFraudConfirm(interaction, oldUserId) {
  await interaction.deferReply({ flags: 64 });
  
  try {
    const res = await query("SELECT character_name, shugo_url, discord_tag FROM sage_recruitment WHERE user_id = $1", [oldUserId]);
    if (res.rowCount === 0) {
      return await interaction.editReply({ content: "❌ تعذر العثور على بيانات العضو القديم في قاعدة البيانات." });
    }
    
    const oldUser = res.rows[0];
    const newMemberId = interaction.user.id;
    
    const alertEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🚨 بلاغ انتحال شخصية (Anti-Fraud Protocol)")
      .setDescription(
        `تم رصد محاولة تسجيل مكررة لرابط **Shugo.gg**!\n\n` +
        `👤 **اللاعب الذي يحاول التسجيل (المخالف):** <@${newMemberId}>\n` +
        `⚠️ **العضو القديم المسجل بالرابط:** <@${oldUserId}> (${oldUser.discord_tag})\n` +
        `🎮 **اسم الشخصية:** ${oldUser.character_name}\n` +
        `🔗 **الرابط المدخل:** ${oldUser.shugo_url}`
      )
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
      content: "✅ **تم تأكيد البلاغ.** تم إرسال رسالة عاجلة للقيادة للتحقق من الأمر وسيتم اتخاذ الإجراء اللازم. شكراً لتعاونك."
    });
  } catch (err) {
    console.error("[AntiFraud] Error processing alert:", err);
    await interaction.editReply({ content: "❌ حدث خطأ أثناء إرسال البلاغ." });
  }
}

// ─── Leader Verification System ────────────────────────────────────────────────
async function sendToLeaderVerification(interaction, app, targetChannel, leaderId) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const verifyEmbed = new EmbedBuilder()
    .setColor(0x3498db) // Blue for verification
    .setTitle("🛡️ طلب تحقق من هوية عضو (Leader Verification)")
    .setDescription(
      `مرحباً قائد القيلد <@${leaderId}>،\n` +
      `هناك عضو جديد يطلب الانضمام إلى قيلدك (**${app.guild_name}**). يرجى التحقق مما إذا كان هذا العضو تابعاً لكم حقاً.\n\n` +
      `👤 **المتقدم:** ${interaction.user}\n` +
      `[🔗 عرض البروفايل على shugo.gg](${app.shugo_url})`
    )
    .addFields(
      { name: "👤 الشخصية", value: app.character_name ?? "—", inline: true },
      { name: "📊 المستوى", value: String(app.character_level ?? "—"), inline: true },
      { name: "🎮 الكلاس", value: app.class_name ?? "—", inline: true },
      { name: "⚡ قوة القتال (CP)", value: `★ **${cpDisplay}** ★`, inline: false }
    )
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${interaction.user.id}  •  App DB ID: ${app.id}` })
    .setTimestamp();

  if (app.profile_image) verifyEmbed.setImage(app.profile_image);

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:leader_verify:${interaction.user.id}:${app.id}`)
      .setLabel("✅ تأكيد (من قيلدي)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sage:leader_reject:${interaction.user.id}:${app.id}`)
      .setLabel("❌ رفض (لا أعرفه)")
      .setStyle(ButtonStyle.Danger)
  );

  await targetChannel.send({ content: `<@${leaderId}>`, embeds: [verifyEmbed], components: [verifyRow] });
}

async function handleLeaderVerify(interaction, targetUserId, appId) {
  if (!isSageGuild(interaction.guildId)) return;
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    return await interaction.editReply({ content: "❌ الطلب غير موجود." });
  }
  if (app.status !== "pending") {
    return await interaction.editReply({ content: `⚠️ هذا الطلب تمت مراجعته مسبقاً (${app.status}).` });
  }

  // Update status temporarily (optional, or just forward to admin)
  // For simplicity, we can leave status as pending and just forward the card to admin

  // Forward to Admin Channel
  const ALL_APP_CHANNEL_ID = "1508451380560531586";
  const targetChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);

  if (targetChannel) {
    // Modify embed to show it was verified by leader
    const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
    const reviewEmbed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle("📋 طلب انضمام جديد (مُحقق منه) — Siege Alliance")
      .setDescription(
        `✅ **تم التحقق من هويته بواسطة قائد القيلد (${interaction.user.tag})**\n\n` +
        `👑 المتقدم: <@${app.user_id}>\n` +
        `[🔗 عرض البروفايل على shugo.gg](${app.shugo_url})`
      )
      .addFields(
        { name: "⚔️ القيلد المختارة", value: app.guild_name ?? "—" },
        { name: "👤 الشخصية", value: app.character_name ?? "—" },
        { name: "📊 المستوى", value: String(app.character_level ?? "—") },
        { name: "🎮 الكلاس", value: app.class_name ?? "—" },
        { name: "🌍 السيرفر", value: app.server_name ?? "—" },
        { name: "⚡ قوة القتال (CP)", value: `★ **${cpDisplay}** ★` },
      )
      .setThumbnail(classIconUrl(app.class_name))
      .setFooter({ text: `Discord ID: ${app.user_id}  •  App DB ID: ${app.id}` })
      .setTimestamp();

    if (app.profile_image) reviewEmbed.setImage(app.profile_image);

    const reviewRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sage:accept:${app.user_id}:${app.id}`)
        .setLabel("✅ موافقة نهائية")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sage:reject:${app.user_id}:${app.id}`)
        .setLabel("❌ رفض نهائي")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`sage:ban:${app.user_id}:${app.id}`)
        .setLabel("🔨 باند فوري")
        .setStyle(ButtonStyle.Danger)
    );

    await targetChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
  }

  // Update the leader message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x2ecc71)
    .setTitle("✅ تم تأكيد العضو وإرساله للإدارة");
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  
  await interaction.editReply({ content: "✅ تم تأكيد العضو وإرسال طلبه للإدارة للموافقة النهائية." });
}

async function handleLeaderReject(interaction, targetUserId, appId) {
  if (!isSageGuild(interaction.guildId)) return;
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) return await interaction.editReply({ content: "❌ الطلب غير موجود." });

  // Update DB
  await query("UPDATE sage_recruitment SET status='rejected', reviewed_by=$1, updated_at=NOW() WHERE id=$2", [interaction.user.id, appId]);

  // Update the leader message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xe74c3c)
    .setTitle("❌ تم رفض العضو بواسطة القائد");
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  // Send DM to applicant
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member && !member.user.bot) {
    const dmEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("❌ تحديث بخصوص طلب انضمامك (Siege Alliance)")
      .setDescription(
        `نأسف لإبلاغك بأنه تم **رفض** طلب انضمامك لقيلد **${app.guild_name}** من قِبل قائد القيلد.\n\n` +
        `إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع قائد القيلد لحل المشكلة.`
      )
      .setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  }

  await interaction.editReply({ content: "✅ تم رفض العضو وإشعاره بذلك." });
}

// ─── Main Interaction Router ───────────────────────────────────────────────────
export async function handleInteraction(interaction) {
  if (!isSageGuild(interaction.guildId)) return; // ← strict isolation (top-level)

  try {
    const [, action, ...rest] = interaction.customId.split(":");

    switch (action) {
      case "join_start":
        return await handleJoinStart(interaction);

      case "select_guild":
        return await handleGuildSelect(interaction);

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
      content: "❌ حدث خطأ أثناء معالجة طلبك في نظام تحالف القيلدات. حاول مجدداً.",
      flags: 64,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}
