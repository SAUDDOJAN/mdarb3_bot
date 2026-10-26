import { ChannelType } from 'discord.js';
import { pool } from '../../../database/index.js';
import { getCapacity } from '../utils/solvers.js';
import { startVoiceAtomic, linkVoiceAtomic, resetVoiceCreationAtomic, leaveGroupAtomic } from '../db/engine.js';
import { updateEventsCard } from '../eventsCard.js';
import { fetchGroupState } from '../eventsCard.js';

const AION_MEMBER_ROLE = '1401376073077231702';
const VOICE_CATEGORY_ID = '1552456426885087284';

export async function coreStartVoice(creatorId, groupId, client, guild = null) {
  const state = await fetchGroupState(groupId);
  if (!state) return { success: false, error: 'المجموعة غير موجودة.' };
  const { group, members } = state;

  if (String(group.creator_id) !== String(creatorId)) {
    return { success: false, error: 'منشئ المجموعة فقط يمكنه بدء الروم الصوتي.' };
  }

  const capacity = getCapacity(group.activity_type);
  if (members.length < capacity) {
    return { success: false, error: 'المجموعة غير مكتملة بعد.' };
  }

  if (group.voice_channel_id || group.voice_delivery_status === 'LINKED') {
    const guildId = guild ? guild.id : (process.env.DISCORD_GUILD_ID || '1288251216895283281');
    return { 
      success: true, 
      alreadyStarted: true, 
      voice_channel_id: group.voice_channel_id,
      voice_url: `https://discord.com/channels/${guildId}/${group.voice_channel_id}`
    };
  }

  if (group.voice_start_deadline && new Date() > new Date(group.voice_start_deadline)) {
    return { success: false, error: 'انتهت مهلة بدء الروم الصوتي للمجموعة.' };
  }

  if (!guild) {
    const guildId = process.env.DISCORD_GUILD_ID || '1288251216895283281';
    guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  }

  if (!guild) {
    return { success: false, error: 'تعذر الوصول إلى سيرفر Discord.' };
  }

  // Discord Eligibility Verification
  let anyIneligible = false;
  for (const mem of members) {
    try {
      const discordMember = await guild.members.fetch(mem.discord_id);
      if (!discordMember || !discordMember.roles.cache.has(AION_MEMBER_ROLE)) {
        await leaveGroupAtomic(groupId, mem.discord_id);
        anyIneligible = true;
      }
    } catch (err) {
      if (err.code === 10007) {
        await leaveGroupAtomic(groupId, mem.discord_id);
        anyIneligible = true;
      } else {
        return { success: false, error: 'حدث خطأ مؤقت في الاتصال بديسكورد للتحقق من الأعضاء. يرجى المحاولة بعد قليل.' };
      }
    }
  }

  if (anyIneligible) {
    await updateEventsCard(groupId).catch(() => {});
    return { success: false, error: 'تم اكتشاف أعضاء غير مؤهلين وتمت إزالتهم. يرجى الانتظار لاكتمال المجموعة مجدداً.' };
  }

  // Freeze Transaction
  const expectedMemberIds = members.map(m => m.discord_id);
  let token;
  try {
    token = await startVoiceAtomic(groupId, expectedMemberIds, capacity);
    await updateEventsCard(groupId).catch(() => {});
  } catch (err) {
    if (err.message === 'LINEUP_CHANGED') {
      return { success: false, error: 'تغيرت التشكيلة أثناء التحقق، يرجى المحاولة مرة أخرى إذا اكتملت.' };
    }
    throw err;
  }

  // Create Discord Voice Channel
  const creatorMember = await guild.members.fetch(group.creator_id).catch(() => null);
  const creatorName = creatorMember ? (creatorMember.displayName || creatorMember.user.username) : 'Creator';
  
  const safeActivityName = group.activity_name.replace(/_/g, ' ');
  const channelName = `${safeActivityName}・${creatorName}・${token}`;

  const overwrites = [
    {
      id: guild.id, // @everyone
      deny: ['ViewChannel', 'Connect']
    },
    {
      id: AION_MEMBER_ROLE,
      allow: ['ViewChannel'],
      deny: ['Connect']
    }
  ];

  for (const id of expectedMemberIds) {
    overwrites.push({
      id,
      allow: ['ViewChannel', 'Connect', 'Speak']
    });
  }

  let createdChannel;
  try {
    const capacity = getCapacity(group.activity_type);
    createdChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: VOICE_CATEGORY_ID,
      userLimit: capacity,
      permissionOverwrites: overwrites,
      reason: `M3RGEEN_LFG_VOICE:${group.group_uuid}`
    });
  } catch (e) {
    if (e.code === 50013 || e.code === 50024 || e.code === 50035) {
      await resetVoiceCreationAtomic(groupId, token);
      await updateEventsCard(groupId).catch(() => {});
      return { success: false, error: 'فشل إنشاء الروم الصوتي بسبب رفض من ديسكورد (نقص صلاحيات أو تنسيق غير صالح).' };
    } else {
      console.error("Ambiguous error during Voice Create:", e);
      return { success: false, error: 'حدث خطأ أثناء الاتصال بديسكورد لإنشاء الروم.' };
    }
  }

  // Link Channel in DB
  try {
    const linked = await linkVoiceAtomic(groupId, token, createdChannel.id);
    if (!linked) {
      console.warn(`VOICE_LINK_REQUIRES_RECOVERY: Group ${groupId} failed to link naturally. Leaving PENDING for reconciler.`);
      return { success: false, error: 'تم إنشاء الروم ولكن فشل التوثيق الفوري. جاري المتابعة في الخلفية.' };
    }
    await updateEventsCard(groupId).catch(() => {});
  } catch (e) {
    console.error(`VOICE_LINK_REQUIRES_RECOVERY: Group ${groupId} threw an exception during link:`, e);
    return { success: false, error: 'تم إنشاء الروم ولكن حدث خطأ في النظام أثناء التوثيق.' };
  }

  // Ping members in voice channel
  try {
    const mentions = expectedMemberIds.map(id => `<@${id}>`).join(' ');
    await createdChannel.send({
      content: `🔊 ${mentions}\n**بدأ الدنجن الآن!** أرجو الانتقال إلى هذا الروم الصوتي لبدء الدنجن.`
    }).catch(() => {});
  } catch(e) {}

  const voiceUrl = `https://discord.com/channels/${guild.id}/${createdChannel.id}`;

  // Insert In-App Notifications for all members
  try {
    for (const memId of expectedMemberIds) {
      await pool.query(`
        INSERT INTO aion2_notifications (user_id, title, message, link, type, created_at)
        VALUES ($1, $2, $3, $4, 'DUNGEON_VOICE', CURRENT_TIMESTAMP)
      `, [
        memId,
        '🔊 بدأ الدنجن الآن!',
        `بدأ الدنجن الآن (${safeActivityName}). أرجو الانتقال إلى الروم الصوتي الخاص بالجروب لبدء الدنجن.`,
        voiceUrl
      ]).catch(() => {});
    }
  } catch (notifErr) {
    console.error("Failed to insert voice start notifications:", notifErr);
  }

  return {
    success: true,
    voice_channel_id: createdChannel.id,
    voice_url: voiceUrl
  };
}

export async function handleStartVoice(interaction, groupId) {
  await interaction.deferUpdate();
  try {
    const res = await coreStartVoice(interaction.user.id, groupId, interaction.client, interaction.guild);
    if (!res.success) {
      return interaction.followUp({ content: res.error, ephemeral: true });
    }
  } catch (err) {
    console.error("Start Voice Error:", err);
    await interaction.followUp({ content: 'خطأ: ' + err.message, ephemeral: true });
  }
}
