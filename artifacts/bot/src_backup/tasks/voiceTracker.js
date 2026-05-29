import { query } from "../database/index.js";
import { addPoints, addWithdrawal } from "../modules/management.js";

const POINTS_PER_SESSION = 10;
const QUALIFY_MINUTES = 30;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export async function handleVoiceJoin(member, newChannel) {
  const groupRes = await query(
    "SELECT id, event_id FROM event_groups WHERE vc_channel_id=$1 AND guild_id=$2",
    [newChannel.id, member.guild.id]
  );

  if (!groupRes.rows[0]) return;

  const { id: groupId, event_id: eventId } = groupRes.rows[0];

  const existing = await query(
    "SELECT id FROM voice_sessions WHERE guild_id=$1 AND user_id=$2 AND channel_id=$3 AND left_at IS NULL",
    [member.guild.id, member.id, newChannel.id]
  );
  if (existing.rows.length > 0) return;

  await query(
    "INSERT INTO voice_sessions (guild_id, user_id, channel_id, event_id, group_id, joined_at) VALUES ($1,$2,$3,$4,$5,NOW())",
    [member.guild.id, member.id, newChannel.id, eventId, groupId]
  );

  await query(
    `UPDATE event_groups SET members = (
       SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements_text(members) v
       UNION ALL SELECT to_jsonb($1::text)
     ) WHERE id=$2`,
    [member.id, groupId]
  ).catch(() => {});

  console.log(`[VoiceTracker] ${member.user.tag} joined event VC ${newChannel.name}`);
}

export async function handleVoiceLeave(client, member, oldChannel) {
  const res = await query(
    "SELECT vs.*, eg.event_id FROM voice_sessions vs LEFT JOIN event_groups eg ON eg.id = vs.group_id WHERE vs.guild_id=$1 AND vs.user_id=$2 AND vs.channel_id=$3 AND vs.left_at IS NULL",
    [member.guild.id, member.id, oldChannel.id]
  );

  if (!res.rows[0]) return;

  const session = res.rows[0];
  const now = new Date();
  const joinedAt = new Date(session.joined_at);
  const durationMs = now - joinedAt;
  const durationMin = Math.floor(durationMs / 60000);

  // Fetch event name to get dynamic minutes
  const evRes = await query("SELECT name FROM point_events WHERE id=$1", [session.event_id]);
  const eventName = evRes.rows[0]?.name || "Farm AP";
  
  // Minimal re-mapping of EVENT_DETAILS or just use a helper
  const pointMins = eventName.includes("Siege") ? 50 : 30;

  await query(
    "UPDATE voice_sessions SET left_at=NOW(), duration_minutes=$1 WHERE id=$2",
    [durationMin, session.id]
  );

  if (durationMin >= pointMins) {
    await addPoints(client, member.guild.id, member.id, POINTS_PER_SESSION);
    await query("UPDATE voice_sessions SET points_awarded=$1 WHERE id=$2", [POINTS_PER_SESSION, session.id]);
    console.log(`[VoiceTracker] +${POINTS_PER_SESSION} pts awarded to ${member.user.tag} (${durationMin} min)`);
  } else {
    await addWithdrawal(member.guild.id, member.id);
    await query("UPDATE voice_sessions SET withdrawal_logged=TRUE WHERE id=$2", [session.id]);
    await logWithdrawal(client, member, oldChannel, durationMin, pointMins, eventName);
    console.log(`[VoiceTracker] Withdrawal logged for ${member.user.tag} (${durationMin} min < ${pointMins})`);
  }

  const membersLeft = oldChannel.members.size;
  if (membersLeft === 0) {
    const groupCheck = await query("SELECT id FROM event_groups WHERE vc_channel_id=$1", [oldChannel.id]);
    if (groupCheck.rows.length > 0) {
      await oldChannel.delete().catch(() => {});
      console.log(`[VoiceTracker] Empty event VC deleted: ${oldChannel.name}`);
    }
  }
}

async function logWithdrawal(client, member, channel, durationMin, requiredMin, eventName) {
  try {
    const WITHDRAWAL_LOG_ID = "1502976886710730823"; // سجل الانسحابات
    const withdrawalCh = client.channels.cache.get(WITHDRAWAL_LOG_ID)
      ?? await client.channels.fetch(WITHDRAWAL_LOG_ID).catch(() => null);
    if (!withdrawalCh) return;

    // Arabic time of day (KSA = UTC+3)
    const now = new Date();
    const ksaHour = (now.getUTCHours() + 3) % 24;
    let timeOfDay;
    if      (ksaHour >= 5  && ksaHour < 12) timeOfDay = "الصباح ☀️";
    else if (ksaHour >= 12 && ksaHour < 13) timeOfDay = "الظهر 🌤️";
    else if (ksaHour >= 13 && ksaHour < 16) timeOfDay = "العصر 🌥️";
    else if (ksaHour >= 16 && ksaHour < 19) timeOfDay = "المغرب 🌆";
    else if (ksaHour >= 19 && ksaHour < 22) timeOfDay = "العشاء 🌙";
    else if (ksaHour >= 22 || ksaHour < 2)  timeOfDay = "منتصف الليل 🌃";
    else                                      timeOfDay = "آخر الليل 🌌";

    // Get total withdrawals for this member
    const { query: dbQuery } = await import("../database/index.js");
    await dbQuery(
      `INSERT INTO points (guild_id, user_id, withdrawals)
       VALUES ($1,$2,1)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET withdrawals = points.withdrawals + 1`,
      [member.guild.id, member.id]
    ).catch(() => {});
    const wRes = await dbQuery(
      "SELECT withdrawals FROM points WHERE guild_id=$1 AND user_id=$2",
      [member.guild.id, member.id]
    );
    const totalWithdrawals = wRes.rows[0]?.withdrawals ?? 1;

    const { EmbedBuilder } = await import("discord.js");
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`⚠️ انسحاب مبكر — ${eventName}`)
      .setDescription(`غادر العضو <@${member.id}> القناة الصوتية قبل اكتمال الوقت المطلوب.`)
      .addFields(
        { name: "👤 العضو",             value: `<@${member.id}> (${member.user.username})`, inline: true  },
        { name: "🕒 مدة البقاء",         value: `${durationMin} دقيقة`,                     inline: true  },
        { name: "⏰ وقت الانسحاب",       value: timeOfDay,                                   inline: true  },
        { name: "🛑 الوقت المطلوب",      value: `${requiredMin} دقيقة`,                     inline: true  },
        { name: "🔊 القناة",             value: channel.name,                                inline: true  },
        { name: "📊 إجمالي الانسحابات",  value: `${totalWithdrawals} انسحاب`,               inline: true  },
      )
      .setTimestamp();

    await withdrawalCh.send({ embeds: [embed] });
  } catch (e) {
    console.error("[VoiceTracker] Failed to log withdrawal:", e);
  }
}


export function startVoiceTracker(client) {
  console.log("[VoiceTracker] Background point-check loop started (every 5 min).");

  setInterval(async () => {
    try {
      // Dynamic check for points in background
      const res = await query(
        `SELECT vs.*, pe.name as event_name FROM voice_sessions vs
         LEFT JOIN point_events pe ON pe.id = vs.event_id
         WHERE vs.left_at IS NULL
           AND vs.points_awarded = 0`
      );

      for (const session of res.rows) {
        const now = new Date();
        const joinedAt = new Date(session.joined_at);
        const durationMin = Math.floor((now - joinedAt) / 60000);
        
        const requiredMin = session.event_name?.includes("Siege") ? 50 : 30;

        if (durationMin >= requiredMin) {
          await addPoints(client, session.guild_id, session.user_id, POINTS_PER_SESSION);
          await query(
            "UPDATE voice_sessions SET points_awarded=$1 WHERE id=$2",
            [POINTS_PER_SESSION, session.id]
          );
          console.log(`[VoiceTracker] Background: +${POINTS_PER_SESSION} pts for user ${session.user_id} (${durationMin} min >= ${requiredMin})`);
        }
      }
    } catch (e) {
      console.error("[VoiceTracker] Background check error:", e);
    }
  }, CHECK_INTERVAL_MS);

  // ─── LFG Background Check (every 1 min) ──────────────────────────────────
  setInterval(async () => {
    try {
      const { awardLfgPoints } = await import("../modules/dungeonLfg.js");
      const res = await query(
        `SELECT * FROM dungeon_vc_sessions 
         WHERE left_at IS NULL AND points_awarded = FALSE`
      );

      for (const session of res.rows) {
        const joinedAt = new Date(session.joined_at);
        const durationMin = Math.floor((Date.now() - joinedAt) / 60000);
        
        if (durationMin >= 8) {
          await awardLfgPoints(client, session.guild_id, session.user_id, session.lfg_group_id);
          console.log(`[LFG:Voice] Background: Awarded 10pts to user ${session.user_id} for staying 8+ mins`);
        }
      }
    } catch (e) {
      console.error("[VoiceTracker] LFG Background check error:", e);
    }
  }, 60 * 1000);

  // ─── LFG Expiration Cleanup (every 2 mins) ───────────────────────────────
  setInterval(async () => {
    try {
      const { cleanUpEmptyLfg } = await import("../modules/dungeonLfg.js");
      // Find groups that are not expired and were created > 59 mins ago
      const res = await query(
        `SELECT id FROM dungeon_lfg_groups 
         WHERE status != 'expired' 
           AND created_at <= NOW() - INTERVAL '59 minutes'`
      );

      for (const group of res.rows) {
        await cleanUpEmptyLfg(client, group.id);
      }
    } catch (e) {
      console.error("[VoiceTracker] LFG Expiration cleanup error:", e);
    }
  }, 2 * 60 * 1000);
}
