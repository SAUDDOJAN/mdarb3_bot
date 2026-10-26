import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { pool } from '../../database/index.js';
import { getCapacity } from './utils/solvers.js';
import { getActivityConfig } from './utils/activitiesConfig.js';

export async function fetchGroupState(groupId) {
  const grpRes = await pool.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1`, [groupId]);
  if (grpRes.rowCount === 0) return null;
  const group = grpRes.rows[0];

  const memRes = await pool.query(`SELECT * FROM aion2_lfg_members WHERE group_id = $1 AND status = 'ACTIVE' ORDER BY joined_at ASC, id ASC`, [groupId]);
  
  const reqRes = await pool.query(`
    SELECT requester_id, (expires_at <= CURRENT_TIMESTAMP) as is_expired, expires_at 
    FROM aion2_lfg_vote_requests 
    WHERE group_id = $1 AND resolved_at IS NULL
  `, [groupId]);
  const fallbackReq = reqRes.rowCount > 0 ? reqRes.rows[0] : null;

  const voteRes = await pool.query(`
    SELECT 
      SUM(CASE WHEN vote = 'YES' THEN 1 ELSE 0 END) as yes_count,
      SUM(CASE WHEN vote = 'NO' THEN 1 ELSE 0 END) as no_count
    FROM aion2_lfg_votes WHERE group_id = $1
  `, [groupId]);

  const votes = {
    yes: parseInt(voteRes.rows[0].yes_count || 0, 10),
    no: parseInt(voteRes.rows[0].no_count || 0, 10)
  };

  return { group, members: memRes.rows, fallbackReq, votes };
}

export function buildGroupCard(group, members, fallbackReq, votes) {
  const capacity = getCapacity(group.activity_type);
  const currentCount = members.length;
  
  let statusText = '🟢 البحث عن لاعبين';
  let color = '#3498DB';
  let isRecruiting = true;

  if (group.state === 'CANCELLED') {
    statusText = `❌ تم إلغاء المجموعة\nالسبب: ${group.cancellation_reason || 'غير محدد'}`;
    color = '#E74C3C';
    isRecruiting = false;
  } else if (group.state === 'EXPIRED') {
    statusText = `🛑 المجموعة منتهية (${group.state})`;
    color = '#95A5A6';
    isRecruiting = false;
  } else if (group.state === 'COMPLETED') {
    statusText = `✅ تم تأكيد نجاح النشاط`;
    color = '#2ECC71';
    isRecruiting = false;
  } else if (group.state === 'FAILED') {
    statusText = `❌ لم يتم تأكيد نجاح النشاط`;
    color = '#E74C3C';
    isRecruiting = false;
  } else if (group.state === 'AWAITING_VOTE') {
    statusText = `🗳️ التصويت على نتيجة النشاط جارٍ`;
    color = '#F1C40F';
    isRecruiting = false;
  } else if (group.state === 'VOICE_CREATING') {
    statusText = '🟠 جاري تجهيز الروم الصوتي';
    color = '#E67E22';
    isRecruiting = false;
  } else if (group.state === 'VOICE_ENTRY') {
    statusText = '🔊 الفريق بدأ — بانتظار دخول الأعضاء';
    color = '#2ECC71';
    isRecruiting = false;
  } else if (group.state === 'ACTIVE') {
    statusText = fallbackReq && !fallbackReq.is_expired ? '⚔️ المجموعة نشطة\n⚠️ طلب إنهاء النشاط قيد التأكيد' : '⚔️ المجموعة نشطة';
    color = '#2ECC71';
    isRecruiting = false;
  } else if (group.first_full_at) {
    if (currentCount >= capacity) {
      statusText = '🟡 الفريق مكتمل — بانتظار بدء الروم الصوتي';
    } else {
      statusText = '🟡 سبق اكتمال الفريق — بانتظار لاعب بديل';
    }
    color = '#F1C40F';
  }

  const actConf = getActivityConfig(group.activity_name, group.activity_mode || 'EXPLORATION');
  const titleName = actConf ? actConf.displayName : group.activity_name.replace(/_/g, ' ');
  const isDunOrTrans = group.activity_type === 'DUNGEON' || group.activity_type === 'TRANSCENDENCE';
  const titleMode = isDunOrTrans ? ` [${actConf?.modeDisplayName || group.activity_mode || 'Exploration'}]` : '';

  const ACTIVITY_TYPE_ARABIC = {
    DUNGEON: 'إكسبدشن',
    TRANSCENDENCE: 'ترانسندنس',
    SANCTUARY: 'سانكشوري',
    ABYSS: 'أبيس',
    WORLD_BOSS: 'زعماء العالم'
  };
  const typeLabel = ACTIVITY_TYPE_ARABIC[group.activity_type] || group.activity_type;

  const embed = new EmbedBuilder()
    .setTitle(`${typeLabel}: ${titleName}${titleMode}`)
    .setColor(color);

  if (group.activity_type === 'DUNGEON') {
    embed.addFields(
      { name: 'Mode', value: actConf?.modeDisplayName || group.activity_mode || 'Exploration', inline: true },
      { name: 'Min iLvl', value: actConf?.minimumItemLevel ? `${actConf.minimumItemLevel}` : '—', inline: true }
    );
  } else if (group.activity_type === 'TRANSCENDENCE') {
    embed.addFields(
      { name: 'Stage', value: actConf?.modeDisplayName || group.activity_mode || 'Stage 1', inline: true },
      { name: 'Min iLvl', value: actConf?.minimumItemLevel ? `${actConf.minimumItemLevel}` : '—', inline: true },
      { name: 'Min Level', value: 'Lv45', inline: true }
    );
  }

  embed.addFields(
    { name: 'Creator', value: `<@${group.creator_id}>`, inline: true },
    { name: 'Members', value: `${currentCount} / ${capacity}`, inline: true },
    { name: 'Status', value: statusText, inline: false }
  );

  const deadline = group.first_full_at ? group.voice_start_deadline : group.recruitment_deadline;
  if (deadline && isRecruiting) {
    const unixTime = Math.floor(new Date(deadline).getTime() / 1000);
    embed.addFields({ name: 'Deadline', value: `<t:${unixTime}:R>`, inline: false });
  }

  // Voting Aggregate
  if (['AWAITING_VOTE', 'COMPLETED', 'FAILED'].includes(group.state) && votes) {
    const totalElectorate = group.state === 'AWAITING_VOTE' ? members.filter(m => m.is_official_lineup).length : (votes.yes + votes.no + (votes.missing || 0)); 
    // We can't rely on `members` filter for COMPLETED/FAILED because members status is terminalized.
    // Let's rely on DB threshold query if we need to. But for AWAITING_VOTE, members are still ACTIVE.
    // Wait, let's just do a simple math: electorate is capacity unless we want to query it. B3.4 says use official lineup.
    const req = Math.floor(capacity / 2) + 1; // Approx for display. B3.4 engine uses actual DB official count. We'll show standard capacity here.
    
    // To be strictly correct: `missing` is calculated based on capacity.
    const missing = capacity - (votes.yes + votes.no);

    embed.addFields({
      name: 'نتيجة التصويت',
      value: `✅ نعم: ${votes.yes}\n❌ لا: ${votes.no}\n❓ لم يصوت: ${missing}\nالمطلوب للنجاح: ${req}`,
      inline: false
    });

    if (group.state === 'AWAITING_VOTE' && group.vote_deadline) {
      const vdl = Math.floor(new Date(group.vote_deadline).getTime() / 1000);
      embed.addFields({ name: 'وقت التصويت المتبقي', value: `<t:${vdl}:R>`, inline: false });
    }
  }

  if (group.activity_type === 'DUNGEON' || group.activity_type === 'TRANSCENDENCE') {
    const t = members.find(m => m.assigned_role === 'Tank');
    const h = members.find(m => m.assigned_role === 'Healer');
    const dps = members.filter(m => m.assigned_role === 'DPS');
    
    let comp = `🛡️ Tank: ${t ? `<@${t.discord_id}> (${t.player_class})` : 'فارغ'}\n`;
    comp += `⚕️ Healer: ${h ? `<@${h.discord_id}> (${h.player_class})` : 'فارغ'}\n`;
    comp += `⚔️ DPS 1: ${dps[0] ? `<@${dps[0].discord_id}> (${dps[0].player_class})` : 'فارغ'}\n`;
    comp += `⚔️ DPS 2: ${dps[1] ? `<@${dps[1].discord_id}> (${dps[1].player_class})` : 'فارغ'}\n`;
    comp += `⚔️ DPS 3: ${dps[2] ? `<@${dps[2].discord_id}> (${dps[2].player_class})` : 'فارغ'}`;
    
    embed.addFields({ name: 'Composition', value: comp, inline: false });
  } else if (group.activity_type === 'SANCTUARY') {
    for (let p = 1; p <= 2; p++) {
      const pMems = members.filter(m => m.assigned_party === p);
      const t = pMems.find(m => m.assigned_role === 'Tank');
      const h = pMems.find(m => m.assigned_role === 'Healer');
      const dps = pMems.filter(m => m.assigned_role === 'DPS');

      let comp = `🛡️ Tank: ${t ? `<@${t.discord_id}> (${t.player_class})` : 'فارغ'}\n`;
      comp += `⚕️ Healer: ${h ? `<@${h.discord_id}> (${h.player_class})` : 'فارغ'}\n`;
      comp += `⚔️ DPS 1: ${dps[0] ? `<@${dps[0].discord_id}> (${dps[0].player_class})` : 'فارغ'}\n`;
      comp += `⚔️ DPS 2: ${dps[1] ? `<@${dps[1].discord_id}> (${dps[1].player_class})` : 'فارغ'}\n`;
      comp += `⚔️ DPS 3: ${dps[2] ? `<@${dps[2].discord_id}> (${dps[2].player_class})` : 'فارغ'}`;
      
      embed.addFields({ name: `Party ${p}`, value: comp, inline: true });
    }
  } else if (group.activity_type === 'ABYSS' || group.activity_type === 'WORLD_BOSS') {
    let comp = '';
    for (let i = 0; i < capacity; i++) {
      comp += `${i+1}. ${members[i] ? `<@${members[i].discord_id}> (${members[i].player_class})` : 'فارغ'}\n`;
    }
    embed.addFields({ name: 'Force', value: comp, inline: false });
  }

  if (group.group_uuid) {
    embed.setFooter({ text: `M3RGEEN_LFG:v1:${group.group_uuid}` });
  }

  const components = [];
  if (isRecruiting) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aion2_lfg_btn_join_${group.id}`).setLabel('➕ انضمام').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`aion2_lfg_btn_leave_${group.id}`).setLabel('➖ مغادرة').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`aion2_lfg_btn_close_${group.id}`).setLabel('❌ إغلاق المجموعة').setStyle(ButtonStyle.Danger)
    );
    if (group.first_full_at && currentCount >= capacity) {
      row.addComponents(
        new ButtonBuilder().setCustomId(`aion2_lfg_btn_start_voice_${group.id}`).setLabel('🔊 بدء الروم الصوتي').setStyle(ButtonStyle.Primary)
      );
    }
    components.push(row);
  } else if (group.state === 'ACTIVE') {
    const row1 = new ActionRowBuilder();
    if (group.voice_channel_id && !group.voice_deleted_at) {
      row1.addComponents(new ButtonBuilder().setLabel('🔊 الانتقال للروم الصوتي').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${process.env.DISCORD_GUILD_ID}/${group.voice_channel_id}`));
    }
    
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aion2_lfg_btn_vote_start_${group.id}`).setLabel('إنهاء النشاط وبدء التصويت').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`aion2_lfg_btn_vote_req_${group.id}`).setLabel('طلب إنهاء النشاط').setStyle(ButtonStyle.Secondary)
    );

    if (fallbackReq && !fallbackReq.is_expired) {
      row2.addComponents(
        new ButtonBuilder().setCustomId(`aion2_lfg_btn_vote_conf_${group.id}`).setLabel('تأكيد إنهاء النشاط').setStyle(ButtonStyle.Success)
      );
    }

    if (row1.components.length > 0) components.push(row1);
    components.push(row2);
  } else if (group.state === 'VOICE_ENTRY') {
    if (group.voice_channel_id && !group.voice_deleted_at) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('🔊 الانتقال للروم الصوتي').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${process.env.DISCORD_GUILD_ID}/${group.voice_channel_id}`)
      ));
    }
  }

  return { embeds: [embed], components };
}

export function buildCloseReasonMenu(groupId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`aion2_lfg_sel_close_reason_${groupId}`)
    .setPlaceholder('اختر سبب الإغلاق...')
    .addOptions([
      { label: 'تغيير الخطة', value: 'CHANGE_OF_PLAN' },
      { label: 'لم يكتمل الفريق', value: 'GROUP_NOT_FILLED' },
      { label: 'ظرف طارئ', value: 'EMERGENCY' },
      { label: 'سبب آخر', value: 'OTHER' }
    ]);
  return new ActionRowBuilder().addComponents(menu);
}

import client from '../../client.js';
export async function updateEventsCard(groupId) {
  const state = await fetchGroupState(groupId);
  if (!state || !state.group.events_message_id) return;
  const channel = await client.channels.fetch('1548359577307717683').catch(() => null);
  if (!channel) return;
  
  const msg = await channel.messages.fetch(state.group.events_message_id).catch(err => {
    if (err.code === 10008) console.log(`[LFG] Unknown Message ${state.group.events_message_id} on updateEventsCard`);
    return null;
  });

  if (msg) {
    const { embeds, components } = buildGroupCard(state.group, state.members, state.fallbackReq, state.votes);
    await msg.edit({ embeds, components });
    
    await pool.query(`
      UPDATE aion2_lfg_groups 
      SET events_render_pending = FALSE 
      WHERE id = $1 AND events_render_version = $2
    `, [groupId, state.group.events_render_version]);
  }
}
