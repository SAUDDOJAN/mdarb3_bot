import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType,
  AttachmentBuilder
} from "discord.js";
import { query, createNotification } from "../database/index.js";
import { emitNotification } from "../socket.js";
import fs from "fs";
import path from "path";

// Helper to resolve local boss image attachments
function getDungeonImageAttachment(dungeonName) {
  let fileName = dungeonName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  // Fix specific file names that have double underscores or mismatched names in git
  if (fileName === "dying_dramata_s_nest") fileName = "dying_dramata__s_nest";

  return {
    attachment: null,
    thumbnailUrl: `https://raw.githubusercontent.com/SAUDDOJAN/mdarb3_bot/main/artifacts/bot/assets/dungeons/${fileName}.jpg`,
    fileName: `${fileName}.jpg`
  };
}

// ─── Dungeon Data Configuration ──────────────────────────────────────────────
export const DUNGEON_DATA = {
  "Krao Cave": {
    stars: "⭐",
    level: 45,
    minCp: 1000,
    players: "1-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Draupnir": {
    stars: "⭐",
    level: 45,
    minCp: 1000,
    players: "1-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Urugugu Canyon": {
    stars: "⭐⭐",
    level: 45,
    minCp: 1600,
    players: "2-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Vakron Sky Island": {
    stars: "⭐⭐",
    level: 45,
    minCp: 1600,
    players: "2-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Fire Temple": {
    stars: "⭐⭐⭐",
    level: 45,
    minCp: 2200,
    players: "1-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Ferocious Horn Den": {
    stars: "⭐⭐⭐",
    level: 45,
    minCp: 2200,
    players: "1-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Dying Dramata’s Nest": {
    stars: "⭐⭐⭐⭐",
    level: 45,
    minCp: 2200,
    players: "2-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Cradle of Nihility": {
    stars: "⭐⭐⭐⭐",
    level: 45,
    minCp: 2800,
    players: "2-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Hall of Illusion": {
    stars: "⭐⭐⭐⭐⭐",
    level: 45,
    minCp: 3000,
    players: "2-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  },
  "Azure Breath Island": {
    stars: "⭐⭐⭐⭐⭐",
    level: 45,
    minCp: 3000,
    players: "2-5",
    icon: "https://i.imgur.com/8QhO9pL.png" // Placeholder URL
  }
};

// ─── Class Roles Configuration ────────────────────────────────────────────────
const DPS_CLASSES = new Set(["Sorcerer", "Ranger", "Spiritmaster", "Mentalist", "Assassin"]);

// ─── In-Memory General Chat Message Tracker ──────────────────────────────────
// Stores { timeoutId, messageId, channelId } per groupId for smart deletion
const generalMsgTimers = new Map();

// ─── Render Dungeon Setup Panel ──────────────────────────────────────────────
export async function sendDungeonPanel(interaction) {
  // Acknowledge the command execution
  await interaction.reply({ content: "⏳ جاري إرسال لوحة الدنجنات المستقلة...", flags: 64 });

  const channel = interaction.channel;

  // Send main System Message
  const systemEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("📌 نظام الدنجنات التلقائي")
    .setDescription(
      "يتم تحديد دورك تلقائياً عند الانضمام:\n" +
      "• **🛡️ تانك / 🏥 هيلر / ⚔️ DPS** (حسب تخصصك المسجل).\n" +
      "• **Gladiator**: تدخل كـ **DPS** تلقائياً، وتكون **تانك** فقط إذا كانت خانة التانك فارغة.\n" +
      "• **انضمام Templar**: إذا انضم تانك رئيسي، يُنقل الـ **Gladiator** تلقائياً إلى خانة الـ **DPS** الشاغرة."
    );

  await channel.send({ embeds: [systemEmbed] });

  // Send separate block message for each dungeon (ascending order)
  const dungeonKeys = Object.keys(DUNGEON_DATA);
  for (const name of dungeonKeys) {
    const d = DUNGEON_DATA[name];

    let starsTitle = "";
    if (d.stars === "⭐") starsTitle = "[⭐] دنجنات النجمة الواحدة";
    else if (d.stars === "⭐⭐") starsTitle = "[⭐⭐] دنجنات النجمتين";
    else if (d.stars === "⭐⭐⭐") starsTitle = "[⭐⭐⭐] دنجنات الثلاث نجوم";
    else if (d.stars === "⭐⭐⭐⭐") starsTitle = "[⭐⭐⭐⭐] دنجنات الأربع نجوم";
    else if (d.stars === "⭐⭐⭐⭐⭐") starsTitle = "[⭐⭐⭐⭐⭐] دنجنات الخمس نجوم";

    const localImg = getDungeonImageAttachment(name);

    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(starsTitle)
      .setDescription(
        `🔴 **${name}**\n\n` +
        `• **لفل:** ${d.level}\n` +
        `• **الـ CP المطلوب:** 🛡️ ${d.minCp.toLocaleString()}\n` +
        `• **عدد اللاعبين:** 👥 ${d.players} لاعبين`
      );

    if (localImg) {
      embed.setThumbnail(localImg.thumbnailUrl);
    } else {
      embed.setThumbnail(d.icon);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lfg:create:${name}:normal`)
        .setLabel("Normal")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`lfg:create:${name}:hard`)
        .setLabel("Hard")
        .setStyle(ButtonStyle.Danger)
    );

    const msgPayload = { embeds: [embed], components: [row] };
    if (localImg && localImg.attachment) {
      msgPayload.files = [localImg.attachment];
    }

    await channel.send(msgPayload);
  }

  await interaction.editReply({ content: "✅ تم إنشاء وإرسال جميع لوحات الدنجنات المستقلة بنجاح!" });
}

// ─── Core Interaction Router ──────────────────────────────────────────────────
export async function handleLfgInteraction(interaction) {
  try {
    const [, action, ...rest] = interaction.customId.split(":");

    if (action === "create") {
      await handleCreateGroup(interaction, rest[0], rest[1]);
    } else if (action === "join") {
      await handleJoinGroup(interaction, rest[0]);
    } else if (action === "leave") {
      await handleLeaveGroup(interaction, rest[0]);
    } else if (action === "close") {
      await handleCloseGroup(interaction, rest[0]);
    } else if (action === "voice") {
      await handleVoiceAccess(interaction, rest[0]);
    }
  } catch (err) {
    console.error("[LFG:Interaction] Error:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `❌ حدث خطأ: ${err.message}`, flags: 64 }).catch(() => {});
    } else {
      await interaction.editReply({ content: `❌ حدث خطأ: ${err.message}` }).catch(() => {});
    }
  }
}

// ─── 1. Group Creation ────────────────────────────────────────────────────────
async function handleCreateGroup(interaction, dungeonName, difficulty) {
  console.log(`[LFG:Debug] Starting handleCreateGroup for ${dungeonName} [${difficulty}]`);
  await interaction.deferReply({ flags: 64 });
  console.log(`[LFG:Debug] Deferred reply`);

  const dungeon = DUNGEON_DATA[dungeonName];
  if (!dungeon) {
    await interaction.editReply({ content: "❌ هذا الدنجن غير معروف." });
    return;
  }

  console.log(`[LFG:Debug] Fetching profile for ${interaction.user.id}`);
  const profile = await getPlayerProfile(interaction.guildId, interaction.user.id);
  console.log(`[LFG:Debug] Profile fetched:`, profile);
  if (!profile) {
    await interaction.editReply({ 
      content: "❌ لم نتمكن من العثور على بطاقة القوة الخاصة بك. يرجى التأكد من قبولك في القيلد وتسجيل ملفك الشخصي Shugo.gg أولاً!" 
    });
    return;
  }

  // CP Check
  if (profile.cp < dungeon.minCp) {
    await interaction.editReply({
      content: `❌ **مستواك القتالي (${profile.cp}) أقل من الحد الأدنى المطلوب لهذا الدنجن (${dungeon.minCp})!**\nعليك رفع مستواك وتطوير عتادك لتتمكن من التقديم.`
    });
    return;
  }

  // Anti-clustering check for DPS
  const isDps = DPS_CLASSES.has(profile.className);
  if (isDps) {
    const activeGroup = await query(
      "SELECT id FROM dungeon_lfg_groups WHERE guild_id=$1 AND dungeon_name=$2 AND status='open'",
      [interaction.guildId, dungeonName]
    );

    if (activeGroup.rows.length > 0) {
      await interaction.editReply({
        content: `❌ **هناك مجموعة مفتوحة بالفعل لدنجن ${dungeonName}!**\nبما أنك تلعب كلاس DPS، يرجى الانضمام للفريق الحالي وملء الفراغات أولاً لتجنب التشتت والتحزبات!`
      });
      return;
    }
  }

  console.log(`[LFG:Debug] Fetching guild config`);
  const configRes = await query(
    "SELECT event_lobby_channel_id, event_category_id, guild_role_id FROM guild_config WHERE guild_id = $1",
    [interaction.guildId]
  );
  console.log(`[LFG:Debug] Config fetched`);
  const config = configRes.rows[0] || {};
  const isMainGuild = interaction.guildId === (process.env.MAIN_GUILD_ID || "861355983975874601");

  // Create temporary voice channel
  const LFG_VOICE_CATEGORY = config.event_category_id || (isMainGuild ? "1496784996663431218" : null);

  let vc;
  try {
    console.log(`[LFG:Debug] Creating voice channel`);
    vc = await interaction.guild.channels.create({
      name: `🔊 LFG ${dungeonName} [${difficulty.toUpperCase()}]`,
      type: ChannelType.GuildVoice,
      parent: LFG_VOICE_CATEGORY,
      userLimit: 5
    });
    console.log(`[LFG:Debug] Voice channel created: ${vc.id}`);
  } catch (vcErr) {
    console.error("[LFG] VC Creation failed:", vcErr);
    await interaction.editReply({ content: "❌ فشل البوت في إنشاء الروم الصوتي المؤقت. يرجى التحقق من صلاحيات البوت الإدارية." });
    return;
  }

  // Create channel invite link (Arabic description)
  let inviteUrl = "";
  try {
    console.log(`[LFG:Debug] Creating invite`);
    const invite = await vc.createInvite({ maxAge: 0, maxUses: 0 }).catch(() => null);
    inviteUrl = invite ? invite.url : null;
    console.log(`[LFG:Debug] Invite created: ${inviteUrl}`);
  } catch (invErr) {
    console.warn("[LFG] Invite creation failed:", invErr);
    inviteUrl = `https://discord.com/channels/${interaction.guildId}/${vc.id}`;
  }

  // Set up Leader data
  const leaderData = {
    user_id: interaction.user.id,
    name: profile.name,
    className: profile.className,
    cp: profile.cp,
    avatar: profile.profileImage
      || (interaction.user.displayAvatarURL ? interaction.user.displayAvatarURL({ extension: 'png', size: 128 }) : null),
    is_leader: true
  };

  // Determine initial slot for leader
  let slot_tank = null;
  let slot_healer = null;
  let slot_dps1 = null;
  let slot_dps2 = null;
  let slot_dps3 = null;

  if (profile.className === "Templar" || profile.className === "Gladiator") {
    slot_tank = leaderData;
  } else if (profile.className === "Cleric" || profile.className === "Chanter") {
    slot_healer = leaderData;
  } else {
    slot_dps1 = leaderData;
  }

  // Post the active LFG Embed inside the current groups channel
  const groupsChannelId = config.event_lobby_channel_id || (isMainGuild ? "1496783538937135184" : null);
  console.log(`[LFG:Debug] Fetching groups channel: ${groupsChannelId}`);
  const groupsChannel = groupsChannelId ? await interaction.guild.channels.fetch(groupsChannelId).catch(() => null) : null;
  console.log(`[LFG:Debug] Groups channel fetched`);

  if (!groupsChannel) {
    await vc.delete().catch(() => {});
    await interaction.editReply({ content: `❌ قناة المجموعات الجارية (${groupsChannelId || 'غير مهيأة'}) غير موجودة أو لم نتمكن من الوصول إليها.` });
    return;
  }

  const localImg = getDungeonImageAttachment(dungeonName);
  const lfgEmbed = buildGroupEmbed(dungeonName, difficulty, dungeon, slot_tank, slot_healer, slot_dps1, null, null, inviteUrl, localImg);
  const rows = buildGroupButtons(null); // Will fill in later with group ID

  const guildRoleId = config.guild_role_id || (isMainGuild ? "1401376073077231702" : null);
  const pingContent = guildRoleId ? `<@&${guildRoleId}> ` : "";
  const diffAr = difficulty === 'hard' ? 'الصعب' : 'العادي';

  const msgPayload = {
    content: `${pingContent}🚨 **نداء النخبة! أبطال معرقين مطلوبون حالاً!** 🚨\nاللاعب <@${interaction.user.id}> يستعد لاقتحام الدنجن بمستوى الصعوبة **${diffAr}** ويبحث عن كواسر لتدعيم الفريق!\n*(دعمكم للفريق يمنحكم 5 نقاط نشاط إضافية)*`,
    embeds: [lfgEmbed],
    components: rows
  };
  if (localImg && localImg.attachment) {
    msgPayload.files = [localImg.attachment];
  }

  console.log(`[LFG:Debug] Sending groupMsg payload to channel ${groupsChannel.id}`);
  const groupMsg = await groupsChannel.send(msgPayload);
  console.log(`[LFG:Debug] Sent groupMsg: ${groupMsg.id}`);

  // Save to DB
  console.log(`[LFG:Debug] Saving to DB`);
  const dbRes = await query(
    `INSERT INTO dungeon_lfg_groups 
       (guild_id, dungeon_name, difficulty, leader_id, message_id, channel_id, voice_channel_id, voice_invite_url, slot_tank, slot_healer, slot_dps1, slot_dps2, slot_dps3, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'open')
     RETURNING id`,
    [
      interaction.guildId, dungeonName, difficulty, interaction.user.id,
      groupMsg.id, groupsChannelId, vc.id, inviteUrl,
      slot_tank ? JSON.stringify(slot_tank) : null,
      slot_healer ? JSON.stringify(slot_healer) : null,
      slot_dps1 ? JSON.stringify(slot_dps1) : null,
      null,
      null,
    ]
  );
  const groupId = dbRes.rows[0].id;
  console.log(`[LFG:Debug] Saved to DB with ID: ${groupId}`);

  // Create global Notification for the Mobile App
  const notificationData = {
    id: groupId,
    dungeon_name: dungeonName,
    difficulty: difficulty,
    leader: leaderData.name,
    avatar: leaderData.avatar
  };
  const notifMsg = `بواسطة ${leaderData.name}`;
  try {
    const notif = await createNotification("dungeon", `مجموعة دنجن جديدة: ${dungeonName}`, notifMsg, notificationData);
    emitNotification(notif);
    // NEW HOOK: Only send to users who opted in to AION notifications
    const { broadcastPushNotification } = await import("../services/push.js");
    await broadcastPushNotification(`مجموعة دنجن جديدة: ${dungeonName}`, notifMsg, { type: 'dungeon', id: groupId }, ['notify_aion2']);
  } catch (err) {
    console.error("[LFG] Failed to create global notification:", err);
  }

  // Update message to carry exact group ID inside buttons
  const updatedRows = buildGroupButtons(groupId, inviteUrl);
  await groupMsg.edit({ components: updatedRows });

  // Post creation announcement in general chat
  const generalChannelId = isMainGuild ? "1294312574162178200" : null;
  const generalChannel = generalChannelId ? await interaction.guild.channels.fetch(generalChannelId).catch(() => null) : null;
  if (generalChannel) {
    const creatorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const creatorName = creatorMember ? (creatorMember.displayName || creatorMember.user.username) : interaction.user.username;
    const creationMsg = await generalChannel.send({
      content: `${pingContent ? pingContent + " " : ""}مجموعة ${creatorName} يبغون يدخلون دجن ${dungeonName} الان الي يبي يدخل يلحق يضغط على الزر💪`
    }).catch(() => null);

    // Store message reference + set 10-min auto-delete timer
    if (creationMsg) {
      const deleteTimer = setTimeout(async () => {
        creationMsg.delete().catch(() => {});
        generalMsgTimers.delete(groupId);

        // Also delete the invite message from groups channel on 10-min expiry
        try {
          const expiredRes = await query("SELECT invite_message_id, channel_id FROM dungeon_lfg_groups WHERE id=$1", [groupId]);
          const expiredGroup = expiredRes.rows[0];
          if (expiredGroup?.invite_message_id && expiredGroup?.channel_id) {
            const grpCh = await interaction.guild.channels.fetch(expiredGroup.channel_id).catch(() => null);
            if (grpCh) {
              const invMsg = await grpCh.messages.fetch(expiredGroup.invite_message_id).catch(() => null);
              if (invMsg) await invMsg.delete().catch(() => {});
            }
          }
        } catch (e) { console.error("[LFG:10min] Failed to delete invite msg:", e); }
      }, 10 * 60 * 1000); // 10 minutes

      generalMsgTimers.set(groupId, {
        timeoutId: deleteTimer,
        messageId: creationMsg.id,
        channelId: generalChannelId,
        client: interaction.client,
        guildId: interaction.guildId
      });
    }
  }

  // Set 60-minute cleanup checker
  setTimeout(() => {
    cleanUpEmptyLfg(interaction.client, groupId).catch(console.error);
  }, 60 * 60 * 1000);

  console.log(`[LFG:Debug] Editing reply to user`);
  await interaction.editReply({
    content: `✅ تم إنشاء مجموعة دنجن **${dungeonName} [${difficulty.toUpperCase()}]** بنجاح!\nتم إرسال الإعلان في قناة <#${groupsChannelId}> وإنشاء الروم الصوتي المؤقت الخاص بكم.`
  });
  console.log(`[LFG:Debug] DONE`);
}

// ─── 2. Joining LFG Group ────────────────────────────────────────────────────
async function handleJoinGroup(interaction, groupId) {
  await interaction.deferReply({ flags: 64 });

  const res = await query("SELECT * FROM dungeon_lfg_groups WHERE id=$1", [groupId]);
  const group = res.rows[0];

  if (!group || group.status !== "open") {
    await interaction.editReply({ content: "❌ عذراً، هذه المجموعة لم تعد متاحة أو اكتملت بالفعل." });
    return;
  }

  const profile = await getPlayerProfile(interaction.guildId, interaction.user.id);
  if (!profile) {
    await interaction.editReply({ content: "❌ لم نتمكن من العثور على بطاقة القوة الخاصة بك. يرجى تسجيل Shugo.gg أولاً!" });
    return;
  }

  const dungeon = DUNGEON_DATA[group.dungeon_name];
  if (profile.cp < dungeon.minCp) {
    await interaction.editReply({ content: `❌ مستواك القتالي (${profile.cp}) أقل من الحد الأدنى المطلوب (${dungeon.minCp})!` });
    return;
  }

  // Parse Slots
  const slot_tank = group.slot_tank ? (typeof group.slot_tank === "string" ? JSON.parse(group.slot_tank) : group.slot_tank) : null;
  const slot_healer = group.slot_healer ? (typeof group.slot_healer === "string" ? JSON.parse(group.slot_healer) : group.slot_healer) : null;
  const slot_dps1 = group.slot_dps1 ? (typeof group.slot_dps1 === "string" ? JSON.parse(group.slot_dps1) : group.slot_dps1) : null;
  const slot_dps2 = group.slot_dps2 ? (typeof group.slot_dps2 === "string" ? JSON.parse(group.slot_dps2) : group.slot_dps2) : null;
  const slot_dps3 = group.slot_dps3 ? (typeof group.slot_dps3 === "string" ? JSON.parse(group.slot_dps3) : group.slot_dps3) : null;

  // Duplicate Check
  const userId = interaction.user.id;
  if (
    (slot_tank && slot_tank.user_id === userId) ||
    (slot_healer && slot_healer.user_id === userId) ||
    (slot_dps1 && slot_dps1.user_id === userId) ||
    (slot_dps2 && slot_dps2.user_id === userId) ||
    (slot_dps3 && slot_dps3.user_id === userId)
  ) {
    await interaction.editReply({ content: "❌ أنت مسجل في هذه المجموعة بالفعل!" });
    return;
  }

  // Enforce role assignment rules
  let updated_tank = slot_tank;
  let updated_healer = slot_healer;
  let updated_dps1 = slot_dps1;
  let updated_dps2 = slot_dps2;
  let updated_dps3 = slot_dps3;
  let success = false;
  let msg = "";

  const playerData = {
    user_id: userId,
    name: profile.name,
    className: profile.className,
    cp: profile.cp,
    avatar: profile.profileImage
      || (interaction.user.displayAvatarURL ? interaction.user.displayAvatarURL({ extension: 'png', size: 128 }) : null),
    is_leader: false
  };

  const className = profile.className;

  if (className === "Gladiator") {
    // Gladiator Fallback: Tank first, then DPS
    if (!updated_tank) {
      updated_tank = { ...playerData, className: "Gladiator (Aggro holder)" };
      success = true;
      msg = "تم تسجيلك كتانك للمجموعة (Aggro holder) بنجاح! 🛡️";
    } else if (!updated_dps1) {
      updated_dps1 = playerData;
      success = true;
      msg = "تم تسجيلك كـ DPS 1 بنجاح! ⚔️";
    } else if (!updated_dps2) {
      updated_dps2 = playerData;
      success = true;
      msg = "تم تسجيلك كـ DPS 2 بنجاح! ⚔️";
    } else if (!updated_dps3) {
      updated_dps3 = playerData;
      success = true;
      msg = "تم تسجيلك كـ DPS 3 بنجاح! ⚔️";
    } else {
      msg = "❌ عذراً، لا توجد أماكن شاغرة لكلاس Gladiator في المجموعة حالياً.";
    }
  } else if (className === "Templar") {
    // Templar original Tank
    if (!updated_tank) {
      updated_tank = playerData;
      success = true;
      msg = "تم تسجيلك كتانك رئيسي للمجموعة بنجاح! 🛡️";
    } else if (updated_tank.className.includes("Gladiator")) {
      // Dynamic Swap! Move Gladiator to empty DPS slot
      if (!updated_dps1) {
        updated_dps1 = { ...updated_tank, className: "Gladiator" };
        updated_tank = playerData;
        success = true;
        msg = "تم تسجيلك كتانك رئيسي للمجموعة، ونقل الـ Gladiator تلقائياً إلى خانة الـ DPS الشاغرة! 🔄🛡️";
      } else if (!updated_dps2) {
        updated_dps2 = { ...updated_tank, className: "Gladiator" };
        updated_tank = playerData;
        success = true;
        msg = "تم تسجيلك كتانك رئيسي للمجموعة، ونقل الـ Gladiator تلقائياً إلى خانة الـ DPS الشاغرة! 🔄🛡️";
      } else if (!updated_dps3) {
        updated_dps3 = { ...updated_tank, className: "Gladiator" };
        updated_tank = playerData;
        success = true;
        msg = "تم تسجيلك كتانك رئيسي للمجموعة، ونقل الـ Gladiator تلقائياً إلى خانة الـ DPS الشاغرة! 🔄🛡️";
      } else {
        msg = "❌ عذراً، خانة التانك محجوزة لـ Gladiator وخانات الـ DPS ممتلئة بالكامل ولا يتسع التيم لتبديل الأدوار.";
      }
    } else {
      msg = "❌ عذراً، خانة التانك ممتلئة بالفعل بكلاس Templar آخر ولا يمكن التكرار.";
    }
  } else if (className === "Cleric" || className === "Chanter") {
    // Healer Slot
    if (!updated_healer) {
      updated_healer = playerData;
      success = true;
      msg = `تم تسجيلك كداعم ومداوٍ للفريق (${className}) بنجاح! 🏥`;
    } else {
      msg = "❌ عذراً، خانة المعالج/الداعم ممتلئة بالفعل في هذا الفريق.";
    }
  } else if (DPS_CLASSES.has(className)) {
    // Standard DPS classes
    if (!updated_dps1) {
      updated_dps1 = playerData;
      success = true;
      msg = "تم تسجيلك كـ DPS 1 بنجاح! ⚔️";
    } else if (!updated_dps2) {
      updated_dps2 = playerData;
      success = true;
      msg = "تم تسجيلك كـ DPS 2 بنجاح! ⚔️";
    } else if (!updated_dps3) {
      updated_dps3 = playerData;
      success = true;
      msg = "تم تسجيلك كـ DPS 3 بنجاح! ⚔️";
    } else {
      msg = "❌ عذراً، خانات الـ DPS ممتلئة بالكامل في هذه المجموعة.";
    }
  } else {
    msg = "❌ هذا الكلاس غير مدعوم في توزيع مجموعات الدنجنات.";
  }

  if (!success) {
    await interaction.editReply({ content: msg });
    return;
  }

  // Count active players
  let count = 0;
  if (updated_tank) count++;
  if (updated_healer) count++;
  if (updated_dps1) count++;
  if (updated_dps2) count++;
  if (updated_dps3) count++;

  const isFull = count === 5;
  const newStatus = isFull ? "full" : "open";

  // Update DB
  await query(
    `UPDATE dungeon_lfg_groups 
     SET slot_tank=$1, slot_healer=$2, slot_dps1=$3, slot_dps2=$4, slot_dps3=$5, status=$6 
     WHERE id=$6`,
    [
      updated_tank ? JSON.stringify(updated_tank) : null,
      updated_healer ? JSON.stringify(updated_healer) : null,
      updated_dps1 ? JSON.stringify(updated_dps1) : null,
      updated_dps2 ? JSON.stringify(updated_dps2) : null,
      updated_dps3 ? JSON.stringify(updated_dps3) : null,
      newStatus,
      groupId
    ]
  );

  // Update Embed & Message
  const groupsChannel = await interaction.guild.channels.fetch(group.channel_id).catch(() => null);
  if (groupsChannel) {
    const localImg = getDungeonImageAttachment(group.dungeon_name);
    const updatedEmbed = buildGroupEmbed(group.dungeon_name, group.difficulty, dungeon, updated_tank, updated_healer, updated_dps1, updated_dps2, updated_dps3, group.voice_invite_url, localImg);
    const updatedButtons = buildGroupButtons(groupId, group.voice_invite_url, isFull);

    const mainMsg = await groupsChannel.messages.fetch(group.message_id).catch(() => null);
    if (mainMsg) {
      await mainMsg.edit({
        embeds: [updatedEmbed],
        components: updatedButtons
      });
    }

    // Ping all 4 players if group is full (4/4)
    if (isFull) {
      const allSlots = [updated_tank, updated_healer, updated_dps1, updated_dps2, updated_dps3].filter(Boolean);
      const pings = allSlots.map(s => `<@${s.user_id}>`).join(" ");

      await groupsChannel.send({
        content: `🚨 **[تنبيه النخبة]:** مجموعتكم لدنجن **${group.dungeon_name}** مكتملة وجاهزة الآن! نرجو من الجميع التوجه فوراً إلى الروم الصوتي المؤقت وبدء المعركة:\n${pings}\n🔗 **رابط الروم الصوتي:** ${group.voice_invite_url}`
      });

      // DM all members that the group is full
      for (const slot of allSlots) {
        const u = await interaction.client.users.fetch(slot.user_id).catch(() => null);
        if (u) {
          u.send(`🚨 **[تنبيه النخبة]:** مجموعتكم لدنجن **${group.dungeon_name}** اكتملت!\nالفريق جاهز، يرجى التوجه للروم الصوتي الآن عبر الرابط التالي وبدء المعركة:\n🔗 ${group.voice_invite_url}`).catch(() => {});
        }
      }

      // ─── Smart Conditional Deletion ────────────────────────────────────────

      const trackedMsg = generalMsgTimers.get(parseInt(groupId));
      if (trackedMsg) {
        // 1. Cancel the 10-minute auto-delete timer
        clearTimeout(trackedMsg.timeoutId);
        generalMsgTimers.delete(parseInt(groupId));

        // 2. Delete the creation message immediately
        try {
          const guildObj = interaction.guild;
          const genCh = await guildObj.channels.fetch(trackedMsg.channelId).catch(() => null);
          if (genCh) {
            const creationMsg = await genCh.messages.fetch(trackedMsg.messageId).catch(() => null);
            if (creationMsg) await creationMsg.delete().catch(() => {});

            // 3. Send completion message & auto-delete after 30 seconds
            const leaderMember = await guildObj.members.fetch(group.leader_id).catch(() => null);
            const creatorName = leaderMember ? (leaderMember.displayName || leaderMember.user.username) : "??";

            const completionMsg = await genCh.send({
              content: `مجموعة ${creatorName} داخلين دجن ${group.dungeon_name} الان حظ موفق 💪⚡`
            }).catch(() => null);

            if (completionMsg) {
              setTimeout(() => {
                completionMsg.delete().catch(() => {});
              }, 30 * 1000); // 30 seconds
            }
          }
        } catch (err) {
          console.error("[LFG:GeneralMsg] Error during smart deletion:", err);
        }
      }
    } else if (interaction.user.id !== group.leader_id) {
      // Send DM to creator when someone joins and the group is not full yet
      const leaderUser = await interaction.client.users.fetch(group.leader_id).catch(() => null);
      if (leaderUser) {
        leaderUser.send(`🔔 **تنبيه:** لقد انضم **${profile.name}** [${profile.className}] إلى مجموعتك لدنجن **${group.dungeon_name}**!\nتفقد قناة المجموعات لرؤية حالة فريقك.`).catch(() => {});
      }
    }
  }

  await interaction.editReply({ content: `✅ ${msg}` });
}

// ─── 3. Leaving LFG Group ────────────────────────────────────────────────────
async function handleLeaveGroup(interaction, groupId) {
  await interaction.deferReply({ flags: 64 });

  const res = await query("SELECT * FROM dungeon_lfg_groups WHERE id=$1", [groupId]);
  const group = res.rows[0];

  if (!group) {
    await interaction.editReply({ content: "❌ هذه المجموعة غير موجودة." });
    return;
  }

  // Parse Slots
  let slot_tank = group.slot_tank ? (typeof group.slot_tank === "string" ? JSON.parse(group.slot_tank) : group.slot_tank) : null;
  let slot_healer = group.slot_healer ? (typeof group.slot_healer === "string" ? JSON.parse(group.slot_healer) : group.slot_healer) : null;
  let slot_dps1 = group.slot_dps1 ? (typeof group.slot_dps1 === "string" ? JSON.parse(group.slot_dps1) : group.slot_dps1) : null;
  let slot_dps2 = group.slot_dps2 ? (typeof group.slot_dps2 === "string" ? JSON.parse(group.slot_dps2) : group.slot_dps2) : null;
  let slot_dps3 = group.slot_dps3 ? (typeof group.slot_dps3 === "string" ? JSON.parse(group.slot_dps3) : group.slot_dps3) : null;

  const userId = interaction.user.id;
  let found = false;

  if (slot_tank && slot_tank.user_id === userId) {
    slot_tank = null;
    found = true;
  } else if (slot_healer && slot_healer.user_id === userId) {
    slot_healer = null;
    found = true;
  } else if (slot_dps1 && slot_dps1.user_id === userId) {
    slot_dps1 = null;
  let slot_dps2 = null;
  let slot_dps3 = null;
    found = true;
  } else if ((slot_dps2 && slot_dps2.user_id === userId) || (slot_dps3 && slot_dps3.user_id === userId)) {
    slot_dps2 = null;
    found = true;
  }

  if (!found) {
    await interaction.editReply({ content: "❌ أنت غير مسجل في هذه المجموعة أساساً!" });
    return;
  }

  // Update DB (status returns back to 'open' since someone left)
  await query(
    `UPDATE dungeon_lfg_groups 
     SET slot_tank=$1, slot_healer=$2, slot_dps1=$3, slot_dps2=$4, slot_dps3=$5, status='open' 
     WHERE id=$5`,
    [
      slot_tank ? JSON.stringify(slot_tank) : null,
      slot_healer ? JSON.stringify(slot_healer) : null,
      slot_dps1 ? JSON.stringify(slot_dps1) : null,
      slot_dps2 ? JSON.stringify(slot_dps2) : null,
      slot_dps3 ? JSON.stringify(slot_dps3) : null,
      groupId
    ]
  );

  // Update Embed & Message
  const dungeon = DUNGEON_DATA[group.dungeon_name];
  const groupsChannel = await interaction.guild.channels.fetch(group.channel_id).catch(() => null);

  if (groupsChannel) {
    const localImg = getDungeonImageAttachment(group.dungeon_name);
    const updatedEmbed = buildGroupEmbed(group.dungeon_name, group.difficulty, dungeon, slot_tank, slot_healer, slot_dps1, slot_dps2, slot_dps3, group.voice_invite_url, localImg);
    const updatedButtons = buildGroupButtons(groupId, group.voice_invite_url, false);

    const mainMsg = await groupsChannel.messages.fetch(group.message_id).catch(() => null);
    if (mainMsg) {
      await mainMsg.edit({
        embeds: [updatedEmbed],
        components: updatedButtons
      });
    }
  }

  await interaction.editReply({ content: "✅ تم تسجيل مغادرتك من الفريق بنجاح." });
}

// ─── 3.5 Closing LFG Group (Leader Only) ─────────────────────────────────────
async function handleCloseGroup(interaction, groupId) {
  await interaction.deferReply({ flags: 64 });
  const res = await query("SELECT * FROM dungeon_lfg_groups WHERE id=$1", [groupId]);
  const group = res.rows[0];

  if (!group || group.status === "expired") {
    await interaction.editReply({ content: "❌ هذه المجموعة انتهت صلاحيتها أو تم إغلاقها مسبقاً." });
    return;
  }

  if (interaction.user.id !== group.leader_id) {
    await interaction.editReply({ content: "❌ عذراً، قائد المجموعة فقط هو من يمكنه إغلاقها." });
    return;
  }

  await interaction.editReply({ content: "✅ تم إغلاق الدنجن وإنهاء الفعالية بنجاح." });
  await query("UPDATE dungeon_lfg_groups SET status='expired' WHERE id=$1", [groupId]);

  const guild = interaction.guild;
  const vc = await guild.channels.fetch(group.voice_channel_id).catch(() => null);
  if (vc) {
    await vc.delete().catch(() => {});
  }

  const channel = await guild.channels.fetch(group.channel_id).catch(() => null);
  if (channel) {
    const msg = await channel.messages.fetch(group.message_id).catch(() => null);
    if (msg) {
      const { EmbedBuilder } = await import("discord.js");
      const expiredEmbed = new EmbedBuilder()
        .setColor(0x7289da)
        .setTitle(`✅ تم الانتهاء من الفعالية — ${group.dungeon_name}`)
        .setDescription("تم إغلاق هذا الدنجن من قبل القائد، وتم حذف الروم الصوتي المؤقت. شكراً لجميع المشاركين!");
      await msg.edit({ embeds: [expiredEmbed], components: [] }).catch(() => {});
    }
  }

  // Delete general invite message if it still exists
  const trackedMsg = generalMsgTimers.get(parseInt(groupId));
  if (trackedMsg) {
    clearTimeout(trackedMsg.timeoutId);
    try {
      const genChannel = await interaction.client.channels.fetch(trackedMsg.channelId).catch(() => null);
      if (genChannel) {
        const genMsg = await genChannel.messages.fetch(trackedMsg.messageId).catch(() => null);
        if (genMsg) await genMsg.delete().catch(() => {});
      }
    } catch (e) {}
    generalMsgTimers.delete(parseInt(groupId));
  }
}

// ─── 4. Voice State Tracking & Auto-cleanup ─────────────────────────────────────

export async function handleLfgVoiceJoin(member, channel) {
  const res = await query("SELECT id FROM dungeon_lfg_groups WHERE voice_channel_id=$1 AND status != 'expired'", [channel.id]);
  if (!res.rows[0]) return;
  const groupId = res.rows[0].id;

  // Record join
  await query(
    `INSERT INTO dungeon_vc_sessions (guild_id, user_id, lfg_group_id, channel_id, joined_at)
     VALUES ($1,$2,$3,$4,NOW())`,
    [member.guild.id, member.id, groupId, channel.id]
  ).catch(() => {});
  
  // Set VC status on first join
  if (channel.isVoiceBased() && channel.members.size === 1) {
    try {
      if (channel.setStatus) {
        await channel.setStatus("قاعدين نخلص الدنجن الان 💪🏼").catch(() => {});
      }
    } catch (e) {
      console.error("[LFG:Voice] Failed to set VC status:", e);
    }
  }

  console.log(`[LFG:Voice] ${member.user.tag} joined LFG VC ${channel.name}`);
}

export async function handleLfgVoiceLeave(client, member, channelId) {
  if (!channelId) return;
  const res = await query("SELECT id FROM dungeon_lfg_groups WHERE voice_channel_id=$1 AND status != 'expired'", [channelId]);
  if (!res.rows[0]) return;
  const groupId = res.rows[0].id;

  // Update session
  const sessRes = await query(
    `UPDATE dungeon_vc_sessions 
     SET left_at=NOW(), duration_minutes=EXTRACT(EPOCH FROM (NOW() - joined_at))/60
     WHERE guild_id=$1 AND user_id=$2 AND channel_id=$3 AND left_at IS NULL
     RETURNING duration_minutes, points_awarded`,
    [member.guild.id, member.id, channelId]
  );

  const session = sessRes.rows[0];
  if (session && !session.points_awarded && session.duration_minutes >= 8) {
    // Stayed for 8+ mins, award points immediately
    await awardLfgPoints(client, member.guild.id, member.id, groupId);
    console.log(`[LFG:Voice] Awarded 10pts to ${member.user.tag} for staying ${session.duration_minutes}m`);
  }

  const channel = member.guild.channels.cache.get(channelId);
  if (channel && channel.members.size === 0) {
    cleanUpEmptyLfg(client, groupId).catch(e => console.error("[LFG:Voice] Auto cleanup error:", e));
  }
}

export async function awardLfgPoints(client, guildId, userId, groupId) {
  const { addPoints } = await import("./management.js");
  const { sendPushNotification } = await import("../services/push.js");
  const DUNGEON_POINTS = 10;
  
  // Prevent double awarding
  const res = await query(
    "UPDATE dungeon_vc_sessions SET points_awarded=TRUE WHERE guild_id=$1 AND user_id=$2 AND lfg_group_id=$3 AND points_awarded=FALSE RETURNING id",
    [guildId, userId, groupId]
  );
  
  if (res.rowCount > 0) {
    const groupRes = await query("SELECT dungeon_name, difficulty FROM dungeon_lfg_groups WHERE id=$1", [groupId]);
    const group = groupRes.rows[0];
    if (!group) return;

    await addPoints(client, guildId, userId, DUNGEON_POINTS).catch(() => {});
    await query(
      `INSERT INTO dungeon_participations (guild_id, user_id, dungeon_name, difficulty, points_awarded)
       VALUES ($1,$2,$3,$4,$5)`,
      [guildId, userId, group.dungeon_name, group.difficulty, DUNGEON_POINTS]
    ).catch(() => {});
    
    // Send Push Notification
    await sendPushNotification(
      userId,
      "إضافة نقاط نشاط ⭐️",
      `حصلت على ${DUNGEON_POINTS} نقاط لمشاركتك في الدنجن. استمر بالتعاون مع أعضاء الجيلد للحصول على ترقيات وجوائز في المستقبل!`,
      { type: "dungeon_points" }
    ).catch(e => console.error("[LFG:Points] Push notification error:", e));
  }
}

export async function cleanUpEmptyLfg(client, groupId) {
  const res = await query("SELECT * FROM dungeon_lfg_groups WHERE id=$1", [groupId]);
  const group = res.rows[0];

  if (!group) return;

  const guild = await client.guilds.fetch(group.guild_id).catch(() => null);
  if (!guild) return;

  const vc = await guild.channels.fetch(group.voice_channel_id).catch(() => null);
  const isEmpty = !vc || vc.members.size === 0;

  if (group.status === "expired") {
    if (vc && isEmpty) {
      console.log(`[LFG:Cleanup] Deleting orphaned VC for expired group #${groupId}`);
      await vc.delete().catch(() => {});
    }
    return;
  }
  
  // Calculate elapsed time
  const elapsedMs = Date.now() - new Date(group.created_at).getTime();
  const hasHourPassed = elapsedMs >= 59 * 60 * 1000;

  // Quick Finish logic: If room is empty, but someone was in it before, consider it finished.
  let isQuickFinish = false;
  if (isEmpty) {
    const sessRes = await query("SELECT COUNT(*) as cnt FROM dungeon_vc_sessions WHERE lfg_group_id=$1", [groupId]);
    if (sessRes.rows[0] && parseInt(sessRes.rows[0].cnt) > 0) {
      isQuickFinish = true;
    }
  }

  const shouldExpire = hasHourPassed || (isEmpty && isQuickFinish);

  // Delete if 59 mins passed OR Quick Finish
  if (shouldExpire) {
    console.log(`[LFG:Cleanup] Expiring group #${groupId}. HourPassed: ${hasHourPassed}, QuickFinish: ${isQuickFinish}, Empty: ${isEmpty}`);
    
    if (vc && isEmpty) {
      await vc.delete().catch(() => {});
    } else if (!vc) {
      console.log(`[LFG:Cleanup] VC already deleted manually for group #${groupId}.`);
    }

    // Update DB status
    await query("UPDATE dungeon_lfg_groups SET status='expired' WHERE id=$1", [groupId]);

    // Handle Quick Finish Rewards and DMs for No-shows
    const parseSlot = (s) => s ? (typeof s === "string" ? JSON.parse(s) : s) : null;
    const slots = [
      parseSlot(group.slot_tank),
      parseSlot(group.slot_healer),
      parseSlot(group.slot_dps1),
      parseSlot(group.slot_dps2)
    ].filter(Boolean);

    for (const slot of slots) {
      const sessRes = await query(
        "SELECT id, points_awarded FROM dungeon_vc_sessions WHERE lfg_group_id=$1 AND user_id=$2",
        [groupId, slot.user_id]
      );
      
      if (sessRes.rows.length > 0) {
        // Participated
        if (isQuickFinish && !sessRes.rows[0].points_awarded) {
          await awardLfgPoints(client, group.guild_id, slot.user_id, groupId);
          console.log(`[LFG:Points] Awarded quick finish points to ${slot.user_id}`);
        }
      } else {
        // Never joined
        const member = await guild.members.fetch(slot.user_id).catch(() => null);
        if (member) {
          member.send(`⚠️ **تنبيه:** لقد قمت بحجز مكان في دنجن **${group.dungeon_name}** ولكنك لم تدخل الروم الصوتي! 
لقد تسببت في حجز مقعد وإزعاج باقي الأعضاء في الشات العام، ولم تحصل على نقاط النشاط لهذا الدنجن. يرجى الالتزام بالدخول مستقبلاً.`).catch(() => {});
          console.log(`[LFG:DM] Sent no-show DM to ${member.user.tag}`);
        }
      }
    }

    // Delete general invite message if it still exists
    const trackedMsg = generalMsgTimers.get(parseInt(groupId));
    if (trackedMsg) {
      clearTimeout(trackedMsg.timeoutId);
      try {
        const genChannel = await client.channels.fetch(trackedMsg.channelId).catch(() => null);
        if (genChannel) {
          const genMsg = await genChannel.messages.fetch(trackedMsg.messageId).catch(() => null);
          if (genMsg) await genMsg.delete().catch(() => {});
        }
      } catch (e) {}
      generalMsgTimers.delete(parseInt(groupId));
    }

    // Update/Delete original Discord message
    const channel = await guild.channels.fetch(group.channel_id).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(group.message_id).catch(() => null);
      if (msg) {
        const expiredEmbed = new EmbedBuilder()
          .setColor(0x7289da)
          .setTitle(`⏳ انتهى الوقت — ${group.dungeon_name}`)
          .setDescription("لقد انتهت صلاحية هذه المجموعة وتم إغلاق التسجيل وحذف الروم الصوتي لعدم اكتماله أو خلوه بعد ساعة.");
        
        await msg.edit({ embeds: [expiredEmbed], components: [] }).catch(() => {});
      }
    }
  }
}

// ─── Embed & Button Builders ──────────────────────────────────────────────────
function buildGroupEmbed(dungeonName, difficulty, dungeon, slot_tank, slot_healer, slot_dps1, slot_dps2, slot_dps3, inviteUrl, localImg) {
  const color = difficulty === "hard" ? 0x990000 : 0x2ecc71; // Red for Hard, Green for Normal
  
  const tankText = slot_tank ? `✅ **${slot_tank.name}** [${slot_tank.className}]` : "❌ *فارغ*";
  const healerText = slot_healer ? `✅ **${slot_healer.name}** [${slot_healer.className}]` : "❌ *فارغ*";
  const dps1Text = slot_dps1 ? `✅ **${slot_dps1.name}** [${slot_dps1.className}]` : "❌ *فارغ*";
  const dps2Text = slot_dps2 ? `✅ **${slot_dps2.name}** [${slot_dps2.className}]` : "❌ *فارغ*";
  const dps3Text = slot_dps3 ? `✅ **${slot_dps3.name}** [${slot_dps3.className}]` : "❌ *فارغ*";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${dungeon.stars} مجموعة اقتحام: ${dungeonName} [${difficulty.toUpperCase()}]`)
    .setDescription(
      `🔹 **الحد الأدنى للـ CP:** ${dungeon.minCp}\n` +
      `🔹 **المستوى المطلوب:** ${dungeon.level}\n` +
      `🔊 **الروم الصوتي المؤقت:** ${inviteUrl ? `[اضغط هنا للانضمام](${inviteUrl})` : "قيد الإنشاء..."}`
    )
    .addFields(
      { name: "🛡️ خانة التانك (Tank)", value: tankText, inline: false },
      { name: "🏥 خانة المعالج/الداعم (Healer)", value: healerText, inline: false },
      { name: "⚔️ خانة الهجوم (DPS 1)", value: dps1Text, inline: true },
      { name: "⚔️ خانة الهجوم (DPS 2)", value: dps2Text, inline: true },
      { name: "⚔️ خانة الهجوم (DPS 3)", value: dps3Text, inline: true }
    )
    .setTimestamp();

  if (localImg) {
    embed.setThumbnail(localImg.thumbnailUrl);
  } else {
    embed.setThumbnail(dungeon.icon);
  }

  return embed;
}

function buildGroupButtons(groupId, inviteUrl, isFull = false) {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`lfg:join:${groupId}`)
      .setLabel("الانضمام للمجموعة ⚔️")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(`lfg:leave:${groupId}`)
      .setLabel("مغادرة المجموعة 🚪")
      .setStyle(ButtonStyle.Secondary)
  );

  if (inviteUrl && groupId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`lfg:voice:${groupId}`)
        .setLabel("انضمام للصوت 🔊")
        .setStyle(ButtonStyle.Primary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`lfg:close:${groupId}`)
      .setLabel("إغلاق المجموعة ❌")
      .setStyle(ButtonStyle.Danger)
  );

  return [row];
}

// ─── Voice Access Control ────────────────────────────────────────────────
async function handleVoiceAccess(interaction, groupId) {
  const res = await query("SELECT * FROM dungeon_lfg_groups WHERE id=$1", [parseInt(groupId)]);
  const group = res.rows[0];

  if (!group) {
    await interaction.reply({ content: "❌ هذه المجموعة لم تعد موجودة.", flags: 64 });
    return;
  }

  // Parse slots
  const parseSlot = (s) => s ? (typeof s === "string" ? JSON.parse(s) : s) : null;
  const slots = [
    parseSlot(group.slot_tank),
    parseSlot(group.slot_healer),
    parseSlot(group.slot_dps1),
    parseSlot(group.slot_dps2),
    parseSlot(group.slot_dps3)
  ].filter(Boolean);

  const isMember = slots.some(s => s.user_id === interaction.user.id);

  if (!isMember) {
    await interaction.reply({
      content: "❌ عذراً! يجب عليك الانضمام للمجموعة أولاً عبر لوحة البحث لتتمكن من دخول الروم الصوتي.",
      flags: 64
    });
    return;
  }

  // Member confirmed — send invite URL as ephemeral
  await interaction.reply({
    content: `✅ تم التحقق من عضويتك! اضغط على الرابط أدناه للانضمام للروم الصوتي الخاص بدنجنك\n🔗 ${group.voice_invite_url}`,
    flags: 64
  });
}

// ─── Player profile helper ────────────────────────────────────────────────────
async function getPlayerProfile(guildId, userId) {
  // 1. Try power_cards first
  let res = await query(
    "SELECT character_name, class_name, combat_power, profile_image FROM power_cards WHERE guild_id=$1 AND user_id=$2",
    [guildId, userId]
  );
  if (res.rows[0]) {
    return {
      name: res.rows[0].character_name,
      className: res.rows[0].class_name,
      cp: res.rows[0].combat_power,
      profileImage: res.rows[0].profile_image
    };
  }

  // 2. Try recruits second
  res = await query(
    "SELECT character_name, class_name, combat_power, profile_image FROM recruits WHERE guild_id=$1 AND user_id=$2 AND status='accepted'",
    [guildId, userId]
  );
  if (res.rows[0]) {
    return {
      name: res.rows[0].character_name,
      className: res.rows[0].class_name,
      cp: res.rows[0].combat_power,
      profileImage: res.rows[0].profile_image
    };
  }

  return null;
}

// ─── API Integrations ────────────────────────────────────────────────────────
export async function apiJoinGroup(groupId, userId, role, client) {
  const { query } = await import("../database/index.js");
  const res = await query("SELECT guild_id FROM dungeon_lfg_groups WHERE id=$1", [groupId]);
  if (!res.rows[0]) return { success: false, error: "المجموعة غير موجودة" };
  const guildId = res.rows[0].guild_id;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { success: false, error: "البوت غير متصل بالسيرفر" };

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return { success: false, error: "المستخدم غير موجود" };

  let replyMessage = "";
  
  const mockInteraction = {
    user: user,
    guildId: guildId,
    guild: guild,
    client: client,
    deferReply: async () => {},
    editReply: async ({ content }) => {
      replyMessage = content;
    }
  };

  await handleJoinGroup(mockInteraction, groupId);

  if (replyMessage.includes("بنجاح")) {
    return { success: true, message: replyMessage };
  } else {
    return { success: false, error: replyMessage.replace("❌ ", "") };
  }
}
