import { EmbedBuilder } from "discord.js";
import { query } from "../database/index.js";
import { addPoints } from "../modules/management.js";

const SIEGE_VOICE_ID = "1507708086171992125";
const UNIFIED_CHAT_ID = "1507706953521041509";
const REPORT_CHANNEL_ID = "1508678825066762280";

const MONITOR_INTERVAL = 3 * 60 * 1000; // 3 minutes
const MAX_DURATION = 40 * 60 * 1000; // 40 minutes limit
const REQUIRED_CHECKS = 5; // 15 mins total (5 checks * 3 mins)
const POINTS_PER_CHECK = 10;
const ADMIN_ROLES = ["1507733275278577916", "1507733319989858435", "1507733404781645874", "1507733486671233175"];

let activeSiege = null;

export async function startSiegeMonitor(client, guildId) {
  if (activeSiege) return console.log("[SiegeMonitor] A siege is already active.");
  
  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return console.error("[SiegeMonitor] Guild not found.");
  
  const voiceChannel = guild.channels.cache.get(SIEGE_VOICE_ID) ?? await guild.channels.fetch(SIEGE_VOICE_ID).catch(() => null);
  if (!voiceChannel) return console.error("[SiegeMonitor] Voice channel not found.");

  await guild.members.fetch();
  
  // 1. Get snapshot of people currently in the VC
  const initialVcMembers = new Set(voiceChannel.members.keys());
  const initialCount = initialVcMembers.size;
  console.log(`[SiegeMonitor] Started! Initial VC count: ${initialCount}`);

  // Send warning about 1-hour voice channel termination
  const unifiedChat = guild.channels.cache.get(UNIFIED_CHAT_ID) ?? await guild.channels.fetch(UNIFIED_CHAT_ID).catch(() => null);
  if (unifiedChat) {
    await unifiedChat.send("⚠️ **Notice:** Voice channels will be automatically cleared for non-admins 1 hour (60 minutes) after the Siege starts.");
  }
  
  // Set 1-hour voice channel clearing timeout
  setTimeout(() => clearVoiceChannels(client, guild), 60 * 60 * 1000);

  // 2. Fetch all registered accepted members from DB
  const res = await query("SELECT user_id, discord_tag, guild_role_id, character_name FROM sage_recruitment WHERE status = 'accepted'");
  const registeredMembers = res.rows;
  
  // Track attendance
  const attendanceMap = new Map();
  for (const m of registeredMembers) {
    attendanceMap.set(m.user_id, {
      ...m,
      checks: 0,
      pointsAwarded: 0,
      status: initialVcMembers.has(m.user_id) ? "present" : "absent",
      everJoined: initialVcMembers.has(m.user_id),
      withdrawnAnnounced: false
    });
  }

  activeSiege = {
    guild,
    initialCount,
    attendanceMap,
    startTime: Date.now(),
    intervalId: setInterval(() => runCheck(client, guild, voiceChannel), MONITOR_INTERVAL)
  };
}

async function runCheck(client, guild, voiceChannel) {
  if (!activeSiege) return;
  const { initialCount, attendanceMap, startTime } = activeSiege;
  const now = Date.now();
  const elapsed = now - startTime;

  // Refresh VC members
  await guild.members.fetch();
  const currentVcCount = voiceChannel.members.size;
  const currentVcMembers = new Set(voiceChannel.members.keys());

  // Check end conditions: 40 mins passed or VC dropped below 25% of initial
  if (elapsed >= MAX_DURATION || currentVcCount < (initialCount * 0.25)) {
    return await endSiege(client, guild);
  }

  // Evaluate each registered member
  for (const [userId, record] of attendanceMap.entries()) {
    const inVc = currentVcMembers.has(userId);
    
    if (inVc) {
      record.everJoined = true;
      if (record.checks < REQUIRED_CHECKS) {
        record.checks += 1;
        
        // Award points
        try {
          await addPoints(client, guild.id, userId, POINTS_PER_CHECK);
          record.pointsAwarded += POINTS_PER_CHECK;
        } catch (e) {
          console.error(`[SiegeMonitor] Failed to award pts to ${userId}:`, e);
        }
      }
    } else {
      // If not in VC, but previously joined, and hasn't met the quota yet
      if (record.everJoined && record.checks < REQUIRED_CHECKS && !record.withdrawnAnnounced) {
        // Wait 5 extra minutes (until 20 mins elapsed) before immediate reporting
        if (elapsed >= 20 * 60 * 1000) {
          // Announce withdrawal
          record.withdrawnAnnounced = true;
          record.status = "withdrawn";
          
          const unifiedChat = guild.channels.cache.get(UNIFIED_CHAT_ID) ?? await guild.channels.fetch(UNIFIED_CHAT_ID).catch(() => null);
          if (unifiedChat) {
            await unifiedChat.send(`⚠️ Member <@${userId}> (${record.character_name}) has withdrawn from Siege early!`);
          }
        }
      }
    }
  }
}

async function endSiege(client, guild) {
  if (!activeSiege) return;
  clearInterval(activeSiege.intervalId);
  const { attendanceMap } = activeSiege;
  activeSiege = null;
  console.log("[SiegeMonitor] Ended. Generating report...");

  // Generate Report
  const reportChannel = guild.channels.cache.get(REPORT_CHANNEL_ID) ?? await guild.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
  if (!reportChannel) return console.error("[SiegeMonitor] Report channel not found.");

  // Group by guild_role_id
  const guildGroups = new Map();
  for (const [userId, record] of attendanceMap.entries()) {
    if (!record.guild_role_id) continue;
    
    if (!guildGroups.has(record.guild_role_id)) {
      guildGroups.set(record.guild_role_id, { absent: [], withdrawn: [], present: [], totalPoints: 0 });
    }
    
    const group = guildGroups.get(record.guild_role_id);
    if (!record.everJoined) {
      group.absent.push(userId);
    } else if (record.checks < REQUIRED_CHECKS) {
      group.withdrawn.push({ id: userId, points: record.pointsAwarded });
      group.totalPoints += record.pointsAwarded;
    } else {
      group.present.push({ id: userId, points: record.pointsAwarded });
      group.totalPoints += record.pointsAwarded;
    }
  }

  // Fetch guild leaders
  const guildRes = await query("SELECT discord_role_id, guild_leader_id, guild_name FROM sage_guilds");
  const guildInfo = new Map(guildRes.rows.map(r => [r.discord_role_id, { leaderId: r.guild_leader_id, name: r.guild_name }]));

  // Sort guilds by total points (competitive)
  const sortedGuilds = Array.from(guildGroups.entries()).sort((a, b) => b[1].totalPoints - a[1].totalPoints);

  let reportText = "";
  for (const [roleId, group] of sortedGuilds) {
    const info = guildInfo.get(roleId);
    const gName = info ? info.name : "Unknown Guild";
    const leaderMention = info && info.leaderId ? `<@${info.leaderId}>` : `<@&${roleId}>`;
    
    reportText += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportText += `🛡️ **${gName}**\n`;
    reportText += `👑 **القيادة:** ${leaderMention} | 🏅 **إجمالي نقاط القيلد:** \`${group.totalPoints}\`\n\n`;
    
    if (group.present.length > 0) {
      reportText += `✅ **الحضور (${group.present.length}):**\n` + group.present.map(p => `<@${p.id}> \`${p.points}pt\``).join(" ، ") + "\n\n";
    }
    if (group.withdrawn.length > 0) {
      reportText += `⚠️ **انسحاب مبكر (${group.withdrawn.length}):**\n` + group.withdrawn.map(p => `<@${p.id}> \`${p.points}pt\``).join(" ، ") + "\n\n";
    }
    if (group.absent.length > 0) {
      reportText += `❌ **غياب (${group.absent.length}):**\n` + group.absent.map(id => `<@${id}>`).join(" ، ") + "\n";
    }
  }

  if (reportText.length === 0) {
    reportText = "\n\n✅ لم يكن هناك أي قيلدات مسجلة في هذا السيج.";
  }

  // Split reportText into 4096 character chunks if needed
  const chunks = [];
  let currentChunk = "";
  const lines = reportText.split("\n");
  for (const line of lines) {
    if (currentChunk.length + line.length > 4000) {
      chunks.push(currentChunk);
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  for (let i = 0; i < chunks.length; i++) {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(i === 0 ? "📊 Siege Results & Leaderboard" : "📊 Siege Results (Cont.)")
      .setDescription(chunks[i])
      .setTimestamp();
    await reportChannel.send({ embeds: [embed] });
  }

  // ─── Update M3RGEEN Siege Embed with Aion 2 Guild member stats ───────────────────
  await updateM3RGEENSiegeEmbed(client, attendanceMap);

  // ─── Store siege results in DB for weekly report ─────────────────────────────
  const mainGuildId = process.env.MAIN_GUILD_ID || "861355983975874601";
  for (const [userId, record] of attendanceMap.entries()) {
    const status = !record.everJoined ? "absent" : record.checks >= REQUIRED_CHECKS ? "present" : "withdrawn";
    if (record.pointsAwarded > 0 || record.everJoined) {
      await query(
        `INSERT INTO siege_results (guild_id, user_id, points_awarded, status, event_date)
         VALUES ($1,$2,$3,$4,NOW())`,
        [mainGuildId, userId, record.pointsAwarded, status]
      ).catch(() => {});
    }
  }
}

async function updateM3RGEENSiegeEmbed(client, attendanceMap) {
  try {
    const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";
    const AION2_GUILD_ROLE_ID = "1401376073077231702"; // ⚔️ ┃ Aion 2 Guild
    const SAGE_GUILD_ID = process.env.SAGE_GUILD_ID || "1507696012410749030";

    const mainGuild = client.guilds.cache.get(MAIN_GUILD_ID) ?? await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null);
    if (!mainGuild) return console.error("[SiegeMonitor] M3RGEEN guild not found.");

    // Get the most recent active siege event from M3RGEEN server
    const eventRes = await query(
      "SELECT id, channel_id, message_id FROM point_events WHERE guild_id=$1 AND (name LIKE '%Siege%' OR name LIKE '%سيج%') ORDER BY id DESC LIMIT 1",
      [MAIN_GUILD_ID]
    );
    if (!eventRes.rows[0]) return console.log("[SiegeMonitor] No siege event found in M3RGEEN to update.");

    const { channel_id, message_id } = eventRes.rows[0];
    const eventChannel = mainGuild.channels.cache.get(channel_id) ?? await mainGuild.channels.fetch(channel_id).catch(() => null);
    if (!eventChannel) return;

    const eventMsg = await eventChannel.messages.fetch(message_id).catch(() => null);
    if (!eventMsg) return;

    // Fetch all members with Aion 2 Guild role
    await mainGuild.members.fetch();
    const aionMembers = mainGuild.roles.cache.get(AION2_GUILD_ROLE_ID)?.members;
    if (!aionMembers || aionMembers.size === 0) return;

    // Build attendance list from attendanceMap using Discord IDs
    const memberStats = [];
    for (const [memberId, member] of aionMembers) {
      const record = attendanceMap.get(memberId);
      const points = record?.pointsAwarded ?? 0;
      const status = !record || !record.everJoined ? "absent" : record.checks >= REQUIRED_CHECKS ? "present" : "withdrawn";
      memberStats.push({
        id: memberId,
        displayName: member.displayName || member.user.username,
        points,
        status
      });
    }

    // Sort: present first (by points desc), then withdrawn, then absent
    memberStats.sort((a, b) => {
      const order = { present: 0, withdrawn: 1, absent: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.points - a.points;
    });

    const totalPoints = memberStats.reduce((sum, m) => sum + m.points, 0);
    const presentCount = memberStats.filter(m => m.status === "present").length;
    const withdrawnCount = memberStats.filter(m => m.status === "withdrawn").length;
    const absentCount = memberStats.filter(m => m.status === "absent").length;

    // Build stats text
    let statsText = "";
    for (const m of memberStats) {
      const icon = m.status === "present" ? "✅" : m.status === "withdrawn" ? "⚠️" : "❌";
      statsText += `${icon} <@${m.id}> \`${m.points}pt\`\n`;
    }

    // Update or edit the siege embed with stats appended below the image
    const originalEmbed = eventMsg.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0x2b2d31)
      .addFields(
        {
          name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          value: "​",
          inline: false,
        },
        {
          name: `📊 إحصائية سيج اليوم — أعضاء Aion 2 Guild`,
          value:
            `✅ حضور: **${presentCount}** | ⚠️ انسحاب مبكر: **${withdrawnCount}** | ❌ غياب: **${absentCount}**\n` +
            `🏅 إجمالي نقاط القيلد: **${totalPoints}pt**`,
          inline: false,
        },
        {
          name: "👥 تفاصيل الأعضاء:",
          value: statsText || "لا يوجد بيانات.",
          inline: false,
        }
      );

    await eventMsg.edit({ embeds: [updatedEmbed], components: [] }).catch(err => {
      console.error("[SiegeMonitor] Failed to update M3RGEEN siege embed:", err.message);
    });

    console.log(`[SiegeMonitor] ✅ Updated M3RGEEN siege embed with ${memberStats.length} member stats.`);

    // ─── Send stats summary to سجل التفاعل ──────────────────────────────────────
    const INTERACT_LOG_ID = "1470406771318460426";
    const interactCh = mainGuild.channels.cache.get(INTERACT_LOG_ID)
      ?? await mainGuild.channels.fetch(INTERACT_LOG_ID).catch(() => null);
    if (interactCh) {
      const logEmbed = new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle("⚔️ إحصائيات السيج — أعضاء Aion 2 Guild")
        .setDescription(
          `✅ حضور: **${presentCount}** | ⚠️ انسحاب مبكر: **${withdrawnCount}** | ❌ غياب: **${absentCount}**\n` +
          `🏅 إجمالي نقاط القيلد: **${totalPoints}pt**\n\n` +
          `${statsText || 'لا يوجد بيانات.'}`
        )
        .setFooter({ text: "M3RGEEN Events System • سجل التفاعل" })
        .setTimestamp();
      await interactCh.send({ embeds: [logEmbed] });
    }
  } catch (err) {
    console.error("[SiegeMonitor] Error updating M3RGEEN siege embed:", err);
  }
}

async function clearVoiceChannels(client, guild) {
  try {
    const unifiedChat = guild.channels.cache.get(UNIFIED_CHAT_ID) ?? await guild.channels.fetch(UNIFIED_CHAT_ID).catch(() => null);
    if (unifiedChat) {
      await unifiedChat.send("⚠️ **Notice:** Voice sessions are now being terminated. Thank you for your efforts!");
    }
    
    await guild.members.fetch();
    const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
    
    let kickedCount = 0;
    for (const [, vc] of voiceChannels) {
      for (const [, member] of vc.members) {
        if (!member.user.bot) {
          const hasAdminRole = ADMIN_ROLES.some(roleId => member.roles.cache.has(roleId));
          if (!hasAdminRole) {
            await member.voice.disconnect().catch(() => {});
            kickedCount++;
          }
        }
      }
    }
    console.log(`[SiegeMonitor] Cleared ${kickedCount} non-admin members from voice channels.`);
  } catch (err) {
    console.error("[SiegeMonitor] Error clearing voice channels:", err);
  }
}
