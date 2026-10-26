import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, PermissionFlagsBits } from "discord.js";
import { query, pool } from "../database/index.js";
import fs from "fs";
import path from "path";
import { triggerAcceptanceAnnouncement, triggerMigrationAnnouncement } from "../tasks/aion2Announcer.js";
import { triggerAion2GuildStatsRefresh } from "./aion2GuildStats.js";

const ADMIN_CHANNEL_ID = process.env.AION2_GLOBAL_MANAGEMENT_CHANNEL_ID;
const MEMBERS_CHANNEL_ID = process.env.AION2_GLOBAL_MEMBERS_CHANNEL_ID;
const AION2_MEMBER_ROLE_ID = "1401376073077231702";
const EARLY_ACCESS_ROLE_ID = "1551161877017403412";
const EMPEROR_ROLE_ID = "1555617021411065917";
const M3RGEEN_GUILD_ROLE_ID = "1555617080521269368";
const ALL_AION2_ROLES = [AION2_MEMBER_ROLE_ID, EARLY_ACCESS_ROLE_ID, EMPEROR_ROLE_ID, M3RGEEN_GUILD_ROLE_ID];

const AION2_GUILD_LEADER_ROLE = "1548343903307178024";
const MODERATOR_ROLE = "1509497629564866680";
const ADMIN_ROLE = "1296029940520587264";

const TARGETS = {
  "Cleric": 23,
  "Templar": 16,
  "Chanter": 16,
  "Gladiator": 18,
  "Sorcerer": 16,
  "Ranger": 16,
  "Assassin": 15,
  "Spiritmaster": 8
};

const ALL_CLASSES = [
  "Cleric", "Templar", "Assassin", "Ranger", 
  "Sorcerer", "Chanter", "Gladiator", "Spiritmaster"
];

let globalClient = null;

export function hasReviewerPermission(member) {
  if (!member) return false;
  if (member.permissions && member.permissions.has("Administrator")) return true;
  
  const hasRole = (roleId) => {
    if (!roleId) return false;
    if (member.roles && member.roles.cache) return member.roles.cache.has(roleId);
    if (Array.isArray(member.roles)) return member.roles.includes(roleId);
    return false;
  };

  if (hasRole(ADMIN_ROLE)) return true;
  if (hasRole(MODERATOR_ROLE)) return true;
  if (hasRole(AION2_GUILD_LEADER_ROLE)) return true;
  return false;
}

function getClassAttachment(className) {
  let safeName = className.replace(/[^a-zA-Z0-9]/g, "");
  if (safeName.toLowerCase() === "spiritmaster") {
    safeName = "Elementalist";
  }
  const p = path.resolve(process.cwd(), "assets", "classeslogo", `${safeName}.png`);
  if (fs.existsSync(p)) {
    return new AttachmentBuilder(p, { name: `${safeName}.png` });
  }
  return null;
}

export async function recoverStuckProcessing(appId = null, client = null) {
  if (client && !globalClient) globalClient = client;
  let stuckRes;
  if (appId) {
    stuckRes = await query(`SELECT * FROM aion2_global_applications WHERE id = $1 AND status = 'PROCESSING' AND processing_started_at < NOW() - INTERVAL '5 minutes'`, [appId]);
  } else {
    stuckRes = await query(`SELECT * FROM aion2_global_applications WHERE status = 'PROCESSING' AND processing_started_at < NOW() - INTERVAL '5 minutes'`);
  }

  for (const row of stuckRes.rows) {
    const { id, discord_id, processing_action, processing_by, processing_started_at, selected_class } = row;
    
    if (processing_action === 'ACCEPT' && globalClient) {
      try {
        const guild = globalClient.guilds.cache.get("861355983975874601");
        if (guild) {
          const member = await guild.members.fetch(discord_id).catch(() => null);
          if (member && member.roles.cache.has(AION2_MEMBER_ROLE_ID)) {
            await query(`
              UPDATE aion2_global_applications 
              SET status = 'ACCEPTED', reviewed_by = $1, reviewed_at = $2, updated_at = CURRENT_TIMESTAMP, processing_started_at = NULL, processing_action = NULL, processing_by = NULL
              WHERE id = $3
            `, [processing_by, processing_started_at, id]);
            await triggerAcceptanceAnnouncement(globalClient, id, selected_class);
            continue;
          }
        }
      } catch (e) {
        console.error("Error during AION 2 recovery fetch:", e);
      }
    }

    await query(`
      UPDATE aion2_global_applications 
      SET status = 'PENDING', processing_started_at = NULL, processing_action = NULL, processing_by = NULL 
      WHERE id = $1
    `, [id]);
  }
}

async function checkMigrationEligibility(interaction, tableName, userId) {
  const checkRes = await query(`
    SELECT status, guild_type, transition_status 
    FROM ${tableName} 
    WHERE discord_id = $1 
      AND status IN ('ACCEPTED', 'PENDING', 'PROCESSING')
    ORDER BY id DESC LIMIT 1
  `, [userId]);

  if (checkRes.rowCount === 0) {
    const joinUrl = "https://discord.com/channels/861355983975874601/1548356201157369948";
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("🪽 بوابة الانضمام إلى AION 2")
        .setStyle(ButtonStyle.Link)
        .setURL(joinUrl)
    );

    await interaction.editReply({ 
      content: "❌ هذا الخيار مخصص للأعضاء المقبولين حاليًا في AION 2 فقط.\n\nإذا لم يسبق لك التسجيل والانضمام إلى AION 2، استخدم بوابة الانضمام أولًا.",
      components: [row]
    });
    return false;
  }

  const app = checkRes.rows[0];

  if (app.status === 'PENDING') {
    await interaction.editReply({ content: "❌ طلب انضمامك إلى AION 2 لا يزال قيد المراجعة.", components: [] });
    return false;
  }
  if (app.status === 'PROCESSING') {
    await interaction.editReply({ content: "❌ طلبك الحالي قيد المعالجة.", components: [] });
    return false;
  }
  if (app.transition_status === 'MIGRATING_TO_EARLY') {
    await interaction.editReply({ content: "❌ عملية انتقالك إلى Early Access قيد المعالجة بالفعل.", components: [] });
    return false;
  }
  if (app.guild_type === 'EARLY_ACCESS') {
    await interaction.editReply({ content: "✅ أنت مسجل بالفعل في Early Access.", components: [] });
    return false;
  }
  if (app.status === 'ACCEPTED' && app.guild_type === 'GLOBAL' && app.transition_status === null) {
    return true; // Eligible
  }

  await interaction.editReply({ content: "❌ عذراً، حسابك لا يستوفي شروط الانتقال." });
  return false;
}

export async function reserveGlobalAcceptanceAtomic(clientDB, adminUserId, appId) {
  // 1. Lock the GLOBAL roster
  const lockRes = await clientDB.query(
    `SELECT 1 FROM aion2_roster_locks WHERE roster_id = 'GLOBAL' FOR UPDATE`
  );
  if (lockRes.rowCount === 0) {
    throw new Error("Roster lock row for 'GLOBAL' is missing!");
  }

  // 2. Re-read the target application row inside the transaction with FOR UPDATE
  const checkApp = await clientDB.query(
    `SELECT id, discord_id, selected_class, playstyle, status, guild_type 
     FROM aion2_global_applications 
     WHERE id = $1 FOR UPDATE`,
    [appId]
  );
  if (checkApp.rowCount === 0 || checkApp.rows[0].status !== 'PENDING') {
    return { success: false, reason: 'ALREADY_PROCESSED' };
  }

  const targetApp = checkApp.rows[0];
  const selectedClass = targetApp.selected_class;

  // 3. Recalculate capacity holding the lock (ACCEPTED + active in-flight PROCESSING)
  const statsRes = await clientDB.query(`
    SELECT selected_class, COUNT(*) as count 
    FROM aion2_global_applications 
    WHERE (
      (status = 'ACCEPTED' AND guild_type = 'GLOBAL')
      OR 
      (status = 'PROCESSING' AND processing_action = 'ACCEPT' AND processing_started_at >= NOW() - INTERVAL '5 minutes' AND (guild_type = 'GLOBAL' OR guild_type IS NULL))
    )
    GROUP BY selected_class
  `);

  let totalAccepted = 0;
  const acceptedCounts = {};
  for (const row of statsRes.rows) {
    const c = parseInt(row.count, 10);
    acceptedCounts[row.selected_class] = c;
    totalAccepted += c;
  }

  // Check total capacity
  if (totalAccepted >= 128) {
    return { success: false, reason: 'TOTAL_CAPACITY_FULL', totalAccepted, targetClassCap: 128 };
  }

  // Check class capacity
  const currentClassCount = acceptedCounts[selectedClass] || 0;
  const targetClassCap = TARGETS[selectedClass];
  if (targetClassCap !== undefined && currentClassCount >= targetClassCap) {
    let missingText = "";
    for (const [cls, target] of Object.entries(TARGETS)) {
      const current = acceptedCounts[cls] || 0;
      const missing = Math.max(0, target - current);
      if (missing > 0) {
        missingText += `\n• **${cls}** (متبقي ${missing} مقاعد)`;
      }
    }
    return { 
      success: false, 
      reason: 'CLASS_CAPACITY_FULL', 
      selectedClass, 
      currentClassCount, 
      targetClassCap, 
      missingText 
    };
  }

  // Check reserved slots balance
  let totalMissingReserved = 0;
  for (const [cls, target] of Object.entries(TARGETS)) {
    const current = acceptedCounts[cls] || 0;
    totalMissingReserved += Math.max(0, target - current);
  }

  let newTotalAccepted = totalAccepted + 1;
  let newTotalMissingReserved = totalMissingReserved;
  if (TARGETS[selectedClass] !== undefined) {
    if (currentClassCount < targetClassCap) {
      newTotalMissingReserved -= 1;
    }
  }

  if (newTotalAccepted + newTotalMissingReserved > 128) {
    return { 
      success: false, 
      reason: 'RESERVED_SLOTS_FULL', 
      selectedClass 
    };
  }

  // 4. Atomically reserve by setting status = 'PROCESSING'
  await clientDB.query(`
    UPDATE aion2_global_applications 
    SET status = 'PROCESSING', processing_action = 'ACCEPT', processing_by = $1, processing_started_at = CURRENT_TIMESTAMP 
    WHERE id = $2 AND status = 'PENDING'
  `, [adminUserId, appId]);

  return { 
    success: true, 
    app: targetApp 
  };
}

export async function handleInteraction(interaction) {
  if (!globalClient) globalClient = interaction.client;
  const customId = interaction.customId;

  // --- Remove Member & Full Reset Slash Command Buttons ---
  if (customId.startsWith("temp_aion2_remove_cancel_")) {
    const parts = customId.split("_");
    const adminId = parts.pop();
    if (interaction.user.id !== adminId) {
      return interaction.reply({ content: "❌ عذراً، لا يمكنك النقر على هذا الزر.", ephemeral: true });
    }
    return interaction.update({ content: "❌ تم إلغاء العملية.", embeds: [], components: [] });
  }

  // ── FULL RESET CONFIRMATION ──
  if (customId.startsWith("temp_aion2_fullreset_confirm_")) {
    const parts = customId.split("_");
    const adminId = parts.pop();
    const targetUserId = parts.pop();

    if (interaction.user.id !== adminId) {
      return interaction.reply({ content: "❌ عذراً، لا يمكنك النقر على هذا الزر.", ephemeral: true });
    }

    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ هذا الإجراء مخصص للإدارة العليا فقط.", ephemeral: true });
    }

    await interaction.deferUpdate();

    // 1. Remove all 4 AION 2 roles safely and reset Server Nickname
    try {
      const guild = await interaction.client.guilds.fetch(process.env.MAIN_GUILD_ID || "861355983975874601").catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
          for (const roleId of ALL_AION2_ROLES) {
            try {
              if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
              }
            } catch (rErr) {
              console.warn(`[FullReset] Failed to remove role ${roleId} for ${targetUserId}: ${rErr.message}`);
            }
          }
          await member.setNickname(null).catch((nErr) => {
            console.warn(`[FullReset] Failed to reset nickname for ${targetUserId}: ${nErr.message}`);
          });
        }
      }
    } catch (e) {
      console.warn("[FullReset] Discord cleanup warning:", e.message);
    }

    // 2. Clean Active LFG state only (safe, non-destructive to history)
    try {
      await query(`DELETE FROM aion2_lfg_active_locks WHERE discord_id = $1`, [targetUserId]);
      await query(`UPDATE aion2_lfg_members SET status = 'LEFT', left_at = NOW() WHERE discord_id = $1 AND status = 'ACTIVE'`, [targetUserId]);
      await query(`UPDATE aion2_lfg_voice_sessions SET left_at = NOW() WHERE discord_id = $1 AND left_at IS NULL`, [targetUserId]);
    } catch (lfgErr) {
      console.warn(`[FullReset] LFG active state cleanup warning for ${targetUserId}:`, lfgErr.message);
    }

    // 3. Delete ALL application rows for this discord_id
    const delRes = await query(`DELETE FROM aion2_global_applications WHERE discord_id = $1 RETURNING id`, [targetUserId]);

    // Trigger non-blocking debounced Guild Stats refresh
    try {
      triggerAion2GuildStatsRefresh(interaction.client);
    } catch (statsErr) {
      console.warn("[FullReset] Failed to trigger guild stats refresh:", statsErr.message);
    }

    return interaction.editReply({ 
      content: `✅ **تمت إعادة ضبط العضو (<@${targetUserId}>) بالكامل بنجاح!**\n` +
               `• حُذفت جميع استمارات وتسجيلات AION 2 الخاصة به (${delRes.rowCount} سجل).\n` +
               `• سُحبت جميع رتب AION 2 الأربعة.\n` +
               `• أُعيد اسمه المستعار إلى اسمه الأصلي.\n` +
               `• حُررت أي أقفال أو حالات LFG نشطة.\n` +
               `• السجلات التاريخية والنقاط محفوظة.`, 
      embeds: [], 
      components: [] 
    });
  }

  // ── REMOVE CONFIRMATION (Soft Remove from roster) ──
  if (customId.startsWith("temp_aion2_remove_confirm_")) {
    const parts = customId.split("_");
    const adminId = parts.pop();
    const oldGuildTypeCompact = parts.pop();
    const targetUserId = parts.pop();
    const appId = parts.pop();
    const expectedGuildType = oldGuildTypeCompact === 'E' ? 'EARLY_ACCESS' : 'GLOBAL';

    if (interaction.user.id !== adminId) {
      return interaction.reply({ content: "❌ عذراً، لا يمكنك النقر على هذا الزر.", ephemeral: true });
    }

    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ هذا الإجراء مخصص للإدارة العليا فقط.", ephemeral: true });
    }

    await interaction.deferUpdate();

    // 1. Claim the removal operation atomically
    const claimRes = await query(`
      UPDATE aion2_global_applications 
      SET transition_status = 'REMOVING', transition_started_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'ACCEPTED' AND guild_type = $2 AND transition_status IS NULL
      RETURNING id, guild_type
    `, [appId, expectedGuildType]);

    if (claimRes.rowCount === 0) {
      return interaction.editReply({ content: "❌ لقد تغيرت حالة هذا العضو، أو العملية قيد التنفيذ حالياً. تم إلغاء العملية.", embeds: [], components: [] });
    }

    // 2. Remove all 4 AION 2 roles safely and reset Server Nickname
    let nicknameResetSuccess = true;
    let rolesCleared = false;
    let remainingRoles = [];

    try {
      const guild = await interaction.client.guilds.fetch(process.env.MAIN_GUILD_ID || "861355983975874601").catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(targetUserId).catch(() => null);
        if (member) {
          // Attempt removal of all 4 roles
          for (const roleId of ALL_AION2_ROLES) {
            try {
              if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
              }
            } catch (rErr) {
              console.warn(`[RemoveMember] Failed to remove role ${roleId} for ${targetUserId}: ${rErr.message}`);
            }
          }

          // Non-critical nickname reset
          await member.setNickname(null).catch((nErr) => {
            nicknameResetSuccess = false;
            console.warn(`[RemoveMember] Failed to reset nickname for ${targetUserId}: ${nErr.message}`);
          });

          // Verification: Force fetch member to ensure all 4 roles are stripped
          const verifyMember = await guild.members.fetch({ user: targetUserId, force: true }).catch(() => null);
          if (verifyMember) {
            remainingRoles = ALL_AION2_ROLES.filter(rId => verifyMember.roles.cache.has(rId));
            if (remainingRoles.length === 0) {
              rolesCleared = true;
            }
          } else {
            // Member left while removing
            rolesCleared = true;
          }
        } else {
          // Member not in server / left
          rolesCleared = true;
        }
      } else {
        console.error("[RemoveMember] Could not fetch guild " + (process.env.MAIN_GUILD_ID || "861355983975874601"));
      }
    } catch (e) {
      console.error("[RemoveMember] Critical Discord API error:", e);
    }

    // 3. Block DB removal if any of the 4 roles remain
    if (!rolesCleared) {
      const roleList = remainingRoles.map(r => `• <@&${r}> (\`${r}\`)`).join("\n");
      return interaction.editReply({
        content: `⚠️ **تعذر إكمال إزالة العضو بسبب فشل سحب الرتب التالية من ديسكورد:**\n${roleList}\n\n` +
                 `تأكد من أن رتبة البوت أعلى من هذه الرتب في إعدادات السيرفر، وأن لديه صلاحية Manage Roles.\n` +
                 `تم إيقاف تحويل حالة قاعدة البيانات لحماية التزامن بين الديسكورد وقاعدة البيانات.`,
        embeds: [],
        components: []
      });
    }

    // 4. Finalize removal in DB (Soft Remove with clean app/guild state)
    await query(`
      UPDATE aion2_global_applications 
      SET status = 'REMOVED', 
          transition_status = NULL, 
          transition_started_at = NULL, 
          guild_app_status = NULL,
          guild_app_target = NULL,
          assigned_guild = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [appId]);

    // Trigger non-blocking debounced Guild Stats refresh
    try {
      triggerAion2GuildStatsRefresh(interaction.client);
    } catch (statsErr) {
      console.warn("[RemoveMember] Failed to trigger guild stats refresh:", statsErr.message);
    }

    // 5. Trigger Statistics Announcement
    import("../tasks/aion2Announcer.js").then(({ triggerRemovalAnnouncement }) => {
      triggerRemovalAnnouncement(interaction.client, appId).catch(console.error);
    }).catch(console.error);

    const nickMsg = nicknameResetSuccess 
      ? "وسحب الرتب واسمه المستعار بنجاح" 
      : "وسحب الرتب بنجاح (تعذر إعادة اسمه المستعار بسبب صلاحيات ديسكورد)";

    return interaction.editReply({ 
      content: `✅ تم حذف العضو من الروستر ${nickMsg}، وتحديث الإحصائيات.`, 
      embeds: [], 
      components: [] 
    });
  }
  // ------------------------------------------------

  // 1. Rules Agree
  if (customId === "temp_aion2_global_agree") {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;
    await recoverStuckProcessing(null, globalClient); 

    const existing = await query(`SELECT status FROM aion2_global_applications WHERE discord_id = $1 AND status IN ('PENDING', 'ACCEPTED', 'PROCESSING')`, [userId]);
    if (existing.rows.length > 0) {
      const status = existing.rows[0].status;
      if (status === 'PENDING' || status === 'PROCESSING') {
        return interaction.editReply({ content: "❌ لديك طلب انضمام قيد المراجعة بالفعل." });
      } else if (status === 'ACCEPTED') {
        return interaction.editReply({ content: "✅ أنت عضو بالفعل في M3RGEEN — AION 2." });
      }
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("temp_aion2_global_back")
        .setLabel("📜 برجع أقرأ القوانين")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("temp_aion2_global_confirm")
        .setLabel("✅ نعم، قرأتها وأوافق")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({
      content: `⚠️ **قبل ما تكمل**\n\nتأكد إنك قرأت قوانين الجيلد كاملة وفهمتها.\n\nإذا ما قرأتها، ارجع واقرأها الآن؛ لأن موافقتك تعني إنك ملتزم فيها، وأي مخالفة لاحقًا ما راح يكون عذرها:\n«ما كنت أدري».\n\nدخولك للجيلد يعني موافقتك على القوانين وتحملك مسؤولية الالتزام بها.`,
      components: [row]
    });
    return;
  }

  // 2. Rules Back
  if (customId === "temp_aion2_global_back") {
    await interaction.update({
      content: "تم الإلغاء. يرجى قراءة القوانين بتمعن.",
      components: []
    });
    return;
  }

  // 3. Confirm Rules
  // 3. Confirm Rules -> Show Branch
    if (customId === "temp_aion2_global_confirm") {
      await interaction.deferUpdate();
  
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("temp_aion2_global_path_global")
          .setLabel("🌍 مسار Global")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("temp_aion2_global_path_early")
          .setLabel("⚡ مسار Early Access")
          .setStyle(ButtonStyle.Success)
      );
  
      await interaction.editReply({
        content: `🛡️ **اختر مسار الانضمام الخاص بك:**\n\n**🌍 مسار Global:**\nللمشاركة في اللعبة عبر سيرفرات الجلوبال. سيتطلب منك اختيار الكلاس وأسلوب اللعب وانتظار موافقة الإدارة.\n\n**⚡ مسار Early Access:**\nللدخول المباشر والحصري لسيرفرات الدخول المبكر (السعة المتبقية محدودة).`,
        components: [row]
      });
      return;
    }
  
    // 3.1. Path: Early Access (Direct Join)
    if (customId === "temp_aion2_global_path_early") {
      await interaction.deferUpdate();
      
      const userId = interaction.user.id;
      const EARLY_ACCESS_ROLE_ID = "1551161877017403412";
      const AION2_MEMBER_ROLE_ID = "1401376073077231702";
  
      // Re-verify duplicate protection before transaction
      const existing = await query(`SELECT status FROM aion2_global_applications WHERE discord_id = $1 AND status IN ('PENDING', 'ACCEPTED', 'PROCESSING')`, [userId]);
      if (existing.rows.length > 0) {
        return interaction.editReply({ content: "❌ لا يمكنك التقديم. لديك طلب أو عضوية فعالة حالياً.", components: [] });
      }
  
      const clientDB = await pool.connect();
      let appId = null;
      try {
        await clientDB.query('BEGIN');
        
        // Lock Early Access roster safely
        await clientDB.query(`SELECT 1 FROM aion2_roster_locks WHERE roster_id = 'EARLY_ACCESS' FOR UPDATE`);
        
        // Count existing early access
        const earlyRes = await clientDB.query(`SELECT COUNT(*) as count FROM aion2_global_applications WHERE status = 'ACCEPTED' AND guild_type = 'EARLY_ACCESS'`);
        const earlyCount = parseInt(earlyRes.rows[0].count, 10);
        
        if (earlyCount >= 128) {
          await clientDB.query('ROLLBACK');
          return interaction.editReply({ content: "❌ عذراً، اكتمل العدد في Early Access (128 عضو).", components: [] });
        }
        
        // Insert new direct early member
        const insertRes = await clientDB.query(`
          INSERT INTO aion2_global_applications (discord_id, status, guild_type, selected_class, playstyle) 
          VALUES ($1, 'ACCEPTED', 'EARLY_ACCESS', NULL, NULL) 
          RETURNING id
        `, [userId]);
        
        appId = insertRes.rows[0].id;
        
        await clientDB.query('COMMIT');
      } catch (e) {
        await clientDB.query('ROLLBACK');
        console.error("[CRITICAL] Direct Early Join transaction failed:", e);
        return interaction.editReply({ content: "❌ حدث خطأ داخلي أثناء تسجيلك في Early Access. حاول مجدداً.", components: [] });
      } finally {
        clientDB.release();
      }
      
      // Grant Roles
      const member = interaction.member;
      if (member) {
        try {
          await member.roles.add(AION2_MEMBER_ROLE_ID);
          await member.roles.add(EARLY_ACCESS_ROLE_ID);
        } catch (e) {
          console.error("Failed to add roles for Direct Early:", e);
        }
      }
      
      // Trigger Announcer
      try {
        await triggerDirectEarlyAnnouncement(interaction.client, appId);
      } catch (e) {
        console.error("Failed to trigger early announcement:", e);
      }
      
      await interaction.editReply({
        content: "⚡ **تم تسجيلك بنجاح في مسار Early Access!**\nتم منحك رتبة الدخول المبكر. حياك الله بين أخوانك في M3RGEEN.",
        components: []
      });
      return;
    }
  
    // 3.2 Path: Global (Proceeds to Class Selection)
    if (customId === "temp_aion2_global_path_global") {
      await interaction.deferUpdate();
      const res = await query(`SELECT selected_class, COUNT(*) as count FROM aion2_global_applications WHERE status = 'ACCEPTED' AND guild_type = 'GLOBAL' GROUP BY selected_class`);
    const acceptedCounts = {};
    for (const row of res.rows) {
      acceptedCounts[row.selected_class] = parseInt(row.count, 10);
    }

    const options = ALL_CLASSES.map(cls => {
      let description = "مطلوب";
      if (TARGETS[cls] !== undefined) {
        const target = TARGETS[cls];
        const current = acceptedCounts[cls] || 0;
        const remaining = target - current;
        
        if (remaining <= 0) {
          description = `مكتمل ${target}/${target}`;
        } else {
          description = `متبقي ${remaining} من ${target}`;
        }
      }

      return {
        label: cls,
        description,
        value: cls
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("temp_aion2_global_class_select")
      .setPlaceholder("اختر الكلاس الخاص بك")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      content: `⚠️ **تنبيه مهم قبل اختيار الكلاس**\n\nاختيارك هنا يعني اختيار الكلاس الأساسي المعتمد لك داخل الجيلد.\n\nاختر الكلاس الذي تنوي اللعب به بشكل أساسي، والذي ستقضي عليه أغلب وقتك، لأن الجيلد سيعتمد على هذا الاختيار في توزيع الكلاسات وتنظيم الأعضاء والقروبات والفعاليات.\n\n❌ **لا تختار كلاس مؤقت أو كلاس ناوي تجربه فقط.**\n❌ **لا تختار Alt أبدًا.**\n\nاختر فقط الكلاس الأساسي الذي ناوي تعتمد عليه فعليًا في AION 2 Global.\n\n✅ **الآن، يرجى اختيار الكلاس الأساسي الخاص بك:**`,
      components: [row]
    });
    return;
  }

  // 4. Handle Class Select Menu
  if (customId === "temp_aion2_global_class_select") {
    const selectedClass = interaction.values[0];

    // --- Capacity Validation Before Applying ---
    const statsRes = await query(`SELECT selected_class, COUNT(*) as count FROM aion2_global_applications WHERE status = 'ACCEPTED' AND guild_type = 'GLOBAL' GROUP BY selected_class`);
    let totalAccepted = 0;
    const acceptedCounts = {};
    for (const row of statsRes.rows) {
      const c = parseInt(row.count, 10);
      acceptedCounts[row.selected_class] = c;
      totalAccepted += c;
    }

    let totalMissingReserved = 0;
    for (const [cls, target] of Object.entries(TARGETS)) {
      const current = acceptedCounts[cls] || 0;
      totalMissingReserved += Math.max(0, target - current);
    }

    let newTotalAccepted = totalAccepted + 1;
    let newTotalMissingReserved = totalMissingReserved;
    if (TARGETS[selectedClass] !== undefined) {
      const current = acceptedCounts[selectedClass] || 0;
      if (current < TARGETS[selectedClass]) {
        newTotalMissingReserved -= 1;
      }
    }

    if (newTotalAccepted + newTotalMissingReserved > 128) {
      let missingText = "";
      for (const [cls, target] of Object.entries(TARGETS)) {
        const current = acceptedCounts[cls] || 0;
        const missing = Math.max(0, target - current);
        if (missing > 0) {
          missingText += `\n• **${cls}** (متبقي ${missing} مقاعد)`;
        }
      }

      return interaction.reply({
        content: `❌ **عذراً، لا يمكنك التقديم بكلاس (${selectedClass}).**\nالمقاعد المتاحة للكلاسات العامة امتلأت بالكامل.\n\nالجيلد حالياً متاح فقط للكلاسات التالية لإكمال التشكيلة المستهدفة:${missingText}\n\n*(إذا كنت تتقن أحد هذه الكلاسات، نرحب بتقديمك بها)*`,
        ephemeral: true
      });
    }
    // -------------------------------------------

    const playstyleOptions = [
      { label: "PvP", description: "⚔️ لاعب يعتمد على القتال ضد لاعبين آخرين", value: "PVP" },
      { label: "PvE", description: "🛡️ لاعب يعتمد على محاربة الوحوش وإنهاء الدنجنز", value: "PVE" },
      { label: "PvX", description: "🔥 لاعب متوازن بين PvP و PvE", value: "PVX" }
    ];

    const playstyleSelect = new StringSelectMenuBuilder()
      .setCustomId(`temp_aion2_global_playstyle_${selectedClass}`)
      .setPlaceholder("اختر توجهك الأساسي في اللعبة")
      .addOptions(playstyleOptions);

    const row = new ActionRowBuilder().addComponents(playstyleSelect);

    await interaction.update({
      content: `✅ تم اختيار الكلاس: **${selectedClass}**\nالآن، يرجى اختيار توجهك الأساسي في اللعبة:`,
      components: [row]
    });
    return;
  }

  // 4.5 Handle Playstyle Select Menu
  if (customId.startsWith("temp_aion2_global_playstyle_")) {
    const selectedClass = customId.replace("temp_aion2_global_playstyle_", "");
    const selectedPlaystyle = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`temp_aion2_global_form_${selectedClass}_${selectedPlaystyle}`)
      .setTitle("ملاحظات للإدارة - AION 2");

    const notesInput = new TextInputBuilder()
      .setCustomId("notesInput")
      .setLabel("هل عندك شيء تحب تضيفه للإدارة؟ (اختياري)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(notesInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // 5. Handle Modal Submit
  if (customId.startsWith("temp_aion2_global_form_")) {
    await interaction.deferReply({ ephemeral: true });
    const payload = customId.replace("temp_aion2_global_form_", "").split("_");
    const selectedClass = payload[0];
    const playstyle = payload[1];
    
    let notes = interaction.fields.getTextInputValue("notesInput");
    if (!notes || notes.trim() === "") notes = "لا توجد ملاحظات";
    
    const userId = interaction.user.id;
    const age = 0;
    const teamAnswer = "";

    let insertRes;
    try {
      insertRes = await query(`
        INSERT INTO aion2_global_applications 
        (discord_id, selected_class, status, age, playstyle, team_answer, notes) 
        VALUES ($1, $2, 'PENDING', $3, $4, $5, $6)
        RETURNING id
      `, [userId, selectedClass, age, playstyle, teamAnswer, notes]);
    } catch (e) {
      if (e.code === '23505') {
        return interaction.editReply({ content: "❌ لديك طلب انضمام قيد المراجعة أو معتمد بالفعل." });
      }
      throw e;
    }

    const appId = insertRes.rows[0].id;

    await interaction.editReply({
      content: "📨 **تم إرسال طلبك بنجاح**\nوصل طلب انضمامك إلى M3RGEEN — AION 2 للإدارة.\n\n❌ الحالة: قيد المراجعة\nسيتم إشعارك عند اتخاذ القرار."
    });

    const statsRes = await query(`SELECT selected_class, COUNT(*) as count FROM aion2_global_applications WHERE status = 'ACCEPTED' AND guild_type = 'GLOBAL' GROUP BY selected_class`);
    let acceptedCount = 0;
    const acceptedCounts = {};
    for (const row of statsRes.rows) {
      const c = parseInt(row.count, 10);
      acceptedCounts[row.selected_class] = c;
      acceptedCount += c;
    }

    let classStatus = "مطلوب";
    if (TARGETS[selectedClass] !== undefined) {
      const target = TARGETS[selectedClass];
      const current = acceptedCounts[selectedClass] || 0;
      const remaining = target - current;
      if (remaining <= 0) classStatus = `مكتمل ${target} / ${target}`;
      else classStatus = `${current} / ${target} Accepted\nمتبقي ${remaining}`;
    }

    if (!ADMIN_CHANNEL_ID) {
      console.error(`[CRITICAL] AION2_GLOBAL_MANAGEMENT_CHANNEL_ID environment variable is missing!`);
      return;
    }

    const adminChannel = await interaction.client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (adminChannel) {
      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("📨 طلب انضمام جديد — AION 2")
        .setDescription(`👤 **المتقدم:** <@${userId}>\n⚔️ **الكلاس:** ${selectedClass}\n🎯 **التوجه:** ${playstyle}\n\nف **الملاحظات الإضافية:**\n${notes}`)
        .addFields(
          { name: "📊 حالة الكلاس المستهدف", value: classStatus, inline: true },
          { name: "👥 أعضاء الجيلد المقبولون", value: `${acceptedCount} / 128`, inline: true }
        )
        .setFooter({ text: `🆔 Application ID: ${appId} | 🟡 PENDING` })
        .setTimestamp();
      
      const files = [];
      const attachment = getClassAttachment(selectedClass);
      if (attachment) {
        embed.setThumbnail(`attachment://${attachment.name}`);
        files.push(attachment);
      }

      const adminRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`temp_aion2_global_accept_${appId}`)
          .setLabel("✅ قبول")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`temp_aion2_global_reject_modalbtn_${appId}`)
          .setLabel("❌ رفض")
          .setStyle(ButtonStyle.Danger)
      );

      await adminChannel.send({ embeds: [embed], components: [adminRow], files }).catch(e => {
        console.error(`[CRITICAL] Failed to send management embed to channel ${ADMIN_CHANNEL_ID}:`, e);
      });
    } else {
      console.error(`[CRITICAL] AION2 Global Management Channel unavailable`);
    }
    return;
  }

  // 6. Admin Accept
  if (customId.startsWith("temp_aion2_global_accept_")) {
    if (!hasReviewerPermission(interaction.member)) {
      return interaction.reply({ content: "❌ لا تملك صلاحية للإدارة.", ephemeral: true });
    }

    await interaction.deferUpdate();
    const appId = customId.split("_").pop();
    await recoverStuckProcessing(appId, globalClient);

    const clientDB = await pool.connect();
    let reservationResult;
    try {
      await clientDB.query('BEGIN');
      reservationResult = await reserveGlobalAcceptanceAtomic(clientDB, interaction.user.id, appId);
      if (!reservationResult.success) {
        await clientDB.query('ROLLBACK');
      } else {
        await clientDB.query('COMMIT');
      }
    } catch (err) {
      await clientDB.query('ROLLBACK');
      console.error("[GlobalAccept] Atomic reservation transaction failed:", err);
      return interaction.followUp({ content: "❌ حدث خطأ داخلي أثناء حجز المقعد.", ephemeral: true });
    } finally {
      clientDB.release();
    }

    if (!reservationResult.success) {
      if (reservationResult.reason === 'ALREADY_PROCESSED') {
        return interaction.followUp({ content: "⚠️ تمت معالجة هذا الطلب مسبقًا.", ephemeral: true });
      } else if (reservationResult.reason === 'TOTAL_CAPACITY_FULL') {
        return interaction.followUp({ 
          content: "❌ **عذراً، اكتمل العدد في AION 2 Global (128 عضو).**\nلا يمكن قبول المزيد من الأعضاء حالياً.", 
          ephemeral: true 
        });
      } else if (reservationResult.reason === 'CLASS_CAPACITY_FULL') {
        return interaction.followUp({ 
          content: `❌ **لا يمكن قبول هذا العضو.**\nاكتمل العدد المستهدف لكلاس (${reservationResult.selectedClass}) وهو (${reservationResult.targetClassCap}/${reservationResult.targetClassCap}).\nالمقاعد المتبقية في الجيلد مخصصة حصرياً لإكمال النقص في الكلاسات المطلوبة:${reservationResult.missingText}`, 
          ephemeral: true 
        });
      } else if (reservationResult.reason === 'RESERVED_SLOTS_FULL') {
        return interaction.followUp({ 
          content: `❌ **لا يمكن قبول هذا العضو.**\nقبول كلاس (${reservationResult.selectedClass}) الآن سيأخذ مقعداً محجوزاً للكلاسات المستهدفة (Targets).\nالمقاعد المتبقية في الجيلد مخصصة حصرياً لإكمال النقص في الكلاسات المطلوبة.`, 
          ephemeral: true 
        });
      }
      return interaction.followUp({ content: "❌ لا يمكن قبول هذا الطلب حالياً.", ephemeral: true });
    }

    const { discord_id: targetUserId, selected_class: selectedClass, playstyle } = reservationResult.app;

    let member;
    try {
      member = await interaction.guild.members.fetch(targetUserId);
    } catch(e) {
      await query(`UPDATE aion2_global_applications SET status = 'PENDING', processing_action = NULL, processing_by = NULL, processing_started_at = NULL WHERE id = $1`, [appId]);
      return interaction.followUp({ content: "❌ العضو غادر السيرفر. تم التراجع عن العملية.", ephemeral: true });
    }

    try {
      await member.roles.add(AION2_MEMBER_ROLE_ID);
    } catch(e) {
      console.error(`[CRITICAL] Failed to add role to ${targetUserId}:`, e);
      await query(`UPDATE aion2_global_applications SET status = 'PENDING', processing_action = NULL, processing_by = NULL, processing_started_at = NULL WHERE id = $1`, [appId]);
      return interaction.followUp({ content: "❌ حدث خطأ أثناء إعطاء الرتبة للعضو (تحقق من الصلاحيات). تم التراجع عن العملية بأمان.", ephemeral: true });
    }

    try {
      await query(`
        UPDATE aion2_global_applications 
        SET status = 'ACCEPTED', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, processing_started_at = NULL, processing_action = NULL, processing_by = NULL 
        WHERE id = $2
      `, [interaction.user.id, appId]);
      await triggerAcceptanceAnnouncement(interaction.client, appId, selectedClass);
    } catch (e) {
      console.error(`[CRITICAL] Final DB UPDATE failed for accepted app ${appId}:`, e);
      return interaction.followUp({ content: "⚠️ نجح إعطاء الرتبة لكن فشل حفظ قاعدة البيانات. سيعمل نظام الـ Recovery على تصحيحها تلقائياً.", ephemeral: true });
    }

    const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
    oldEmbed.setColor("#00FF00")
      .setTitle("🟢 ACCEPTED - تم قبول العضو")
      .setDescription(`👤 **العضو:** <@${targetUserId}>\n⚔️ **الكلاس:** ${selectedClass}\n🎯 **التوجه:** ${playstyle}\n\n👑 **تمت المراجعة بواسطة:** <@${interaction.user.id}>\n🕒 **وقت المراجعة:** <t:${Math.floor(Date.now() / 1000)}:R>`)
      .setFields([])
      .setFooter({ text: `🆔 Application ID: ${appId} | 🟢 ACCEPTED` })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [oldEmbed], components: [] }).catch(console.error);

    const targetUser = member.user;
    const dmMsg = `🎉 تم قبولك في M3RGEEN — AION 2 🪽\n\nمبروك! تمت الموافقة على طلب انضمامك، ومن هذه اللحظة أنت واحد من M3RGEEN. ❌ف\n\nإحنا ما نبغى مجرد 128 اسم داخل الجيلد؛ نبغى 128 لاعب يلعبون لبعض، يساعدون بعض، ويفرحون بنجاح بعض.\n\nاخترناك عشان تكون جزء من هذا الفريق، ونتمنى نشوف منك نفس الروح اللي وعدتنا فيها وقت التقديم. ف\n\n⚔️ الكلاس: **${selectedClass}**\n🛡️ الرتبة: AION 2 Member\n\nالمشوار الحقيقي يبدأ مع إطلاق AION 2 Global، ومن هناك بنبني اسم M3RGEEN سوا خطوة بخطوة.\n\nنورت مكانك بيننا، وحياك الله بين المعرقين. 🪽🔥\n\nالفريق قبل الفرد، ونجاح واحد منا نجاح لنا كلنا.`;
    await targetUser.send({ content: dmMsg }).catch((e) => console.log("DM failed for", targetUserId, e));

    if (!MEMBERS_CHANNEL_ID) {
      console.error(`[CRITICAL] AION2_GLOBAL_MEMBERS_CHANNEL_ID environment variable is missing! Welcome card not posted.`);
      return;
    }

    const membersChannel = await interaction.client.channels.fetch(MEMBERS_CHANNEL_ID).catch(() => null);
    if (membersChannel) {
      const welcomeEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("🎉 عضو جديد انضم إلى M3RGEEN!")
        .setDescription(`👤 **العضو:** <@${targetUserId}>\n⚔️ **الكلاس:** ${selectedClass}\n🎯 **التوجه:** ${playstyle}\n\n🪽 مرحبًا بك بين المعرقين، ونشوفك معنا في AION 2 Global!`);
      
      const files = [];
      const attachment = getClassAttachment(selectedClass);
      if (attachment) {
        welcomeEmbed.setImage(`attachment://${attachment.name}`);
        files.push(attachment);
      }
      await membersChannel.send({ embeds: [welcomeEmbed], files }).catch(e => console.error(`[CRITICAL] Failed to send welcome card to ${MEMBERS_CHANNEL_ID}:`, e));
    } else {
      console.error(`[CRITICAL] AION2 Global Members Channel unavailable - Welcome card not posted`);
    }
    return;
  }

  // 7. Admin Reject Button -> Open Reject Modal
  if (customId.startsWith("temp_aion2_global_reject_modalbtn_")) {
    if (!hasReviewerPermission(interaction.member)) {
      return interaction.reply({ content: "❌ لا تملك صلاحية للإدارة.", ephemeral: true });
    }

    const appId = customId.split("_").pop();

    const modal = new ModalBuilder()
      .setCustomId(`temp_aion2_global_reject_submit_${appId}`)
      .setTitle("رفض طلب الانضمام");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reasonInput")
      .setLabel("سبب الرفض")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
    return;
  }

  // 8. Handle Reject Modal Submit
  if (customId.startsWith("temp_aion2_global_reject_submit_")) {
    await interaction.deferUpdate();
    const appId = customId.split("_").pop();
    const reason = interaction.fields.getTextInputValue("reasonInput");

    await recoverStuckProcessing(appId, globalClient);

    const claimRes = await query(`
      UPDATE aion2_global_applications 
      SET status = 'PROCESSING', processing_action = 'REJECT', processing_by = $1, processing_started_at = CURRENT_TIMESTAMP 
      WHERE id = $2 AND status = 'PENDING'
      RETURNING discord_id, selected_class
    `, [interaction.user.id, appId]);

    if (claimRes.rowCount === 0) {
      return interaction.followUp({ content: "⚠️ تمت معالجة هذا الطلب مسبقًا.", ephemeral: true });
    }

    const targetUserId = claimRes.rows[0].discord_id;
    const selectedClass = claimRes.rows[0].selected_class;

    await query(`
      UPDATE aion2_global_applications 
      SET status = 'REJECTED', rejection_reason = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, processing_started_at = NULL, processing_action = NULL, processing_by = NULL
      WHERE id = $3
    `, [reason, interaction.user.id, appId]);

    const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
    oldEmbed.setColor("#FF0000")
      .setTitle("🔴 REJECTED - تم رفض الطلب")
      .setDescription(`👤 **مقدم الطلب:** <@${targetUserId}>\n⚔️ **الكلاس:** ${selectedClass}\n\n👑 **تمت المراجعة بواسطة:** <@${interaction.user.id}>\n🕒 **وقت المراجعة:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n❌ **سبب الرفض:**\n\`\`\`text\n${reason}\n\`\`\``)
      .setFields([])
      .setFooter({ text: `🆔 Application ID: ${appId} | 🔴 REJECTED` })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [oldEmbed], components: [] }).catch(console.error);

    const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
    if (targetUser) {
      const dmMsg = `تمت مراجعة طلب انضمامك إلى M3RGEEN — AION 2.\n\nللأسف لم تتم الموافقة على طلبك حاليًا.\n\nسبب الإدارة:\n${reason}\n\nإذا احتجت توضيحًا، يمكنك التواصل مع الإدارة.`;
      await targetUser.send({ content: dmMsg }).catch(e => console.log("DM reject failed for", targetUserId, e));
    }
    return;
  }

  // --- MIGRATION PANEL (PART 1) ---
  
  // 9. Migration Panel Button
  if (customId === "temp_aion2_global_migration_panel") {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;
    
    // Eligibility check
    const isEligible = await checkMigrationEligibility(interaction, 'aion2_global_applications', userId);
    if (!isEligible) return;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("temp_aion2_global_migration_confirm")
        .setLabel("✅ نعم، انقلني إلى Early Access")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("temp_aion2_global_migration_cancel")
        .setLabel("❌ إلغاء")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      content: `⚠️ **تأكيد الانتقال إلى Early Access**\n\nهل أنت متأكد أنك ستبدأ معنا في Early Access؟\n\nبعد التأكيد سيتم إخراجك من قائمة Global وإتاحة مقعدك الحالي للاعب آخر، ونقلك إلى قائمة Early Access.`,
      components: [row]
    });
    return;
  }

  // 10. Migration Cancel
  if (customId === "temp_aion2_global_migration_cancel") {
    await interaction.update({
      content: "تم الإلغاء. بقيت في قائمة Global.",
      components: []
    });
    return;
  }

  // 11. Migration Confirm (PRODUCTION TRANSACTION)
  if (customId === "temp_aion2_global_migration_confirm") {
    const EARLY_ACCESS_ROLE_ID = process.env.AION2_EARLY_ACCESS_ROLE_ID;
    if (!EARLY_ACCESS_ROLE_ID) {
      return interaction.reply({ content: "⚠️ لم يتم إعداد رتبة Early Access في النظام بعد.", ephemeral: true });
    }
    await executeEarlyMigration(interaction, interaction.user.id, 'aion2_global_applications', 'EARLY_ACCESS', 128, EARLY_ACCESS_ROLE_ID);
    return;
  }
}

// Reusable Core Logic for Migration (Used by Production & Test)
export async function executeEarlyMigration(interaction, discordId, tableName, lockName, capacityLimit, roleId) {
  await interaction.deferUpdate();
  const clientDB = await pool.connect();
  let appId = null;
  let selectedClass = null;
  
  try {
    await clientDB.query('BEGIN');
    
    // 1. Lock the Roster
    await clientDB.query(`SELECT 1 FROM aion2_roster_locks WHERE roster_id = $1 FOR UPDATE`, [lockName]);
    
    // 2. Count current Early Access members + those currently transitioning
    const countRes = await clientDB.query(`
      SELECT COUNT(*) as count 
      FROM ${tableName} 
      WHERE (guild_type = 'EARLY_ACCESS' AND status = 'ACCEPTED')
         OR transition_status = 'MIGRATING_TO_EARLY'
    `);
    const earlyCount = parseInt(countRes.rows[0].count, 10);
    
    // 3. Verify capacity
    if (earlyCount >= capacityLimit) {
      await clientDB.query('ROLLBACK');
      return interaction.followUp({ content: `❌ عذراً، قائمة Early Access (${capacityLimit} مقعد) ممتلئة بالكامل حالياً.`, ephemeral: true });
    }

    // 4. Atomically claim the transition
    const claimRes = await clientDB.query(`
      UPDATE ${tableName}
      SET transition_status = 'MIGRATING_TO_EARLY', transition_started_at = NOW()
      WHERE discord_id = $1 
        AND status = 'ACCEPTED' 
        AND guild_type = 'GLOBAL' 
        AND transition_status IS NULL
      RETURNING id, selected_class
    `, [discordId]);

    if (claimRes.rowCount !== 1) {
      await clientDB.query('ROLLBACK');
      return interaction.followUp({ content: "⚠️ لم يتم العثور على طلب لك. تأكد من أنك لست مسجلاً مسبقاً وأنك في مسار Global.", ephemeral: true });
    }

    appId = claimRes.rows[0].id;
    selectedClass = claimRes.rows[0].selected_class;
    
    // 5. Commit the reservation
    await clientDB.query('COMMIT');
  } catch (err) {
    await clientDB.query('ROLLBACK');
    console.error(`[Migration] Transaction Error on ${tableName}:`, err);
    return interaction.followUp({ content: "❌ حدث خطأ داخلي أثناء حجز مقعدك. يرجى المحاولة لاحقاً.", ephemeral: true });
  } finally {
    clientDB.release();
  }

  // 6. Outside of transaction, attempt Discord role assignment
  try {
    await interaction.member.roles.add(roleId);
  } catch (err) {
    console.error(`[Migration] Failed to add role ${roleId} to ${discordId}:`, err);
    await query(`UPDATE ${tableName} SET transition_status = NULL, transition_started_at = NULL WHERE id = $1`, [appId]);
    return interaction.followUp({ content: "❌ حدث خطأ أثناء إعطائك رتبة الديسكورد (تأكد من صلاحيات البوت). تم إلغاء حجزك بأمان.", ephemeral: true });
  }

  // 7. Finalize DB
  try {
    await query(`
      UPDATE ${tableName} 
      SET guild_type = 'EARLY_ACCESS', transition_status = NULL, transition_started_at = NULL 
      WHERE id = $1
    `, [appId]);
  } catch (err) {
    console.error(`[Migration] Final DB UPDATE failed on ${tableName} for app ${appId}:`, err);
    return interaction.followUp({ content: "⚠️ تمت إضافة رتبة الديسكورد لكن حدث خطأ أثناء تحديث قاعدة البيانات. سيقوم النظام بحل المشكلة تلقائياً.", ephemeral: true });
  }

  // 8. Announcement (isolated from DB finalization and user response)
  try {
    await triggerMigrationAnnouncement(interaction.client, appId, selectedClass);
  } catch (err) {
    console.error(`[Migration] Announcement failed on ${tableName} for app ${appId}:`, err);
  }

  // 9. Send success message to user
  await interaction.editReply({
    content: `✅ **تم انتقالك بنجاح إلى قائمة Early Access!**\n\nتذكر أنه يمكنك استعادة مسارك في Global لاحقاً إذا غيرت رأيك.`,
    components: []
  });
}

export async function recoverEarlyTransitions(client) {
  // Production Recovery
  await doRecovery(client, 'aion2_global_applications', null);
}

async function doRecovery(client, tableName, testUserId) {
  try {
    const res = await query(`SELECT discord_id, id, selected_class FROM ${tableName} WHERE transition_status = 'MIGRATING_TO_EARLY'`);
    if (res.rowCount === 0) return;
    
    console.log(`[Early Recovery] Found ${res.rowCount} stuck transitions in ${tableName}.`);
    const EARLY_ACCESS_ROLE_ID = process.env.AION2_EARLY_ACCESS_ROLE_ID;
    
    for (const row of res.rows) {
      if (testUserId && row.discord_id !== testUserId) continue; // Safety
      
      const guild = client.guilds.cache.get(process.env.MAIN_GUILD_ID || "861355983975874601");
      if (guild && EARLY_ACCESS_ROLE_ID) {
        const member = await guild.members.fetch(row.discord_id).catch(() => null);
        if (member && member.roles.cache.has(EARLY_ACCESS_ROLE_ID)) {
          await query(`UPDATE ${tableName} SET guild_type = 'EARLY_ACCESS', transition_status = NULL, transition_started_at = NULL WHERE id = $1`, [row.id]);
          await triggerMigrationAnnouncement(client, row.id, row.selected_class);
          console.log(`[Early Recovery] Finalized migration for ${row.discord_id} in ${tableName}`);
        } else {
          await query(`UPDATE ${tableName} SET transition_status = NULL, transition_started_at = NULL WHERE id = $1`, [row.id]);
          console.log(`[Early Recovery] Rolled back migration for ${row.discord_id} in ${tableName}`);
        }
      }
    }
  } catch (err) {
    console.error(`[Early Recovery] Error on ${tableName}:`, err);
  }
}



export async function recoverStuckRemovals(client) {
  try {
    const res = await query(`SELECT id, discord_id FROM aion2_global_applications WHERE transition_status = 'REMOVING'`);
    if (res.rowCount === 0) return;
    
    console.log(`[Removal Recovery] Found ${res.rowCount} stuck removals.`);
    const AION2_MEMBER_ROLE_ID = "1401376073077231702";
    const EARLY_ACCESS_ROLE_ID = "1551161877017403412";
    
    for (const row of res.rows) {
      const guild = client.guilds.cache.get(process.env.MAIN_GUILD_ID || "861355983975874601");
      if (guild) {
        const member = await guild.members.fetch(row.discord_id).catch(() => null);
        let canFinalize = false;
        
        if (!member) {
          canFinalize = true; // Left the server
        } else {
          try {
            if (member.roles.cache.has(AION2_MEMBER_ROLE_ID)) await member.roles.remove(AION2_MEMBER_ROLE_ID);
          } catch(e) {}
          try {
            if (member.roles.cache.has(EARLY_ACCESS_ROLE_ID)) await member.roles.remove(EARLY_ACCESS_ROLE_ID);
          } catch(e) {}
          
          const verify = await guild.members.fetch({ user: row.discord_id, force: true }).catch(() => null);
          if (verify && !verify.roles.cache.has(AION2_MEMBER_ROLE_ID) && !verify.roles.cache.has(EARLY_ACCESS_ROLE_ID)) {
             canFinalize = true;
          }
        }
        
        if (canFinalize) {
          await query(`
            UPDATE aion2_global_applications 
            SET status = 'REMOVED', transition_status = NULL, transition_started_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [row.id]);
          
          import("../tasks/aion2Announcer.js").then(({ triggerRemovalAnnouncement }) => {
            triggerRemovalAnnouncement(client, row.id).catch(console.error);
          }).catch(console.error);
          console.log(`[Removal Recovery] Finalized removal for ${row.discord_id}`);
        } else {
          console.log(`[Removal Recovery] Could not finalize removal for ${row.discord_id}`);
        }
      }
    }
  } catch (err) {
    console.error(`[Removal Recovery] Error:`, err);
  }
}
