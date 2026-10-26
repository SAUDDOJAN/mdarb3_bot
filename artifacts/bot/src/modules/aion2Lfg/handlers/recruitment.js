import { checkAccessGate } from '../navigation.js';
import { createGroupAtomic, transitionToPending, joinGroupAtomic, leaveGroupAtomic, closeGroupAtomic } from '../db/engine.js';
import { fetchGroupState, buildGroupCard, buildCloseReasonMenu, updateEventsCard } from '../eventsCard.js';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { pool } from '../../../database/index.js';
import { scrapeProfile } from '../../scraper.js';
import { getActiveAion2Application, updatePlayerProfileFromShugo } from '../db/player.js';
import { getMinimumItemLevel, getMinimumCharacterLevel } from '../utils/activitiesConfig.js';

const EVENTS_CHANNEL_ID = '1548359577307717683';
const GLOBAL_GUILD_ROLE = '1555617080521269368';
const EMPEROR_GUILD_ROLE = '1555617021411065917';

/**
 * Common pre-check verifying Discord role and approved guild membership
 */
async function preCheck(interaction) {
  const app = await checkAccessGate(interaction);
  if (!app) return null;
  return app;
}

/**
 * Validates player eligibility, refreshes Shugo profile (outside DB transaction),
 * validates className, itemLevel, and characterLevel against requirements, and updates player profile.
 */
async function validateAndRefreshShugo(userId, activityName, activityMode, options = {}) {
  // 1. Basic eligibility check
  const app = await getActiveAion2Application(userId);
  if (!app) {
    return {
      success: false,
      error: '❌ عذراً، نظام LFG مخصص حصرياً لأعضاء قيلد Emperor و M3RGEEN Global المعتمدين.'
    };
  }

  // 2. Must have shugo_url
  if (!app.shugo_url) {
    return {
      success: false,
      error: '❌ لا يوجد رابط Shugo.gg مسجل لحسابك. يرجى إتمام التسجيل وتأكيد شخصيتك أولاً.'
    };
  }

  // 3. Shugo Refresh (OUTSIDE Database Transaction)
  let scrapeRes;
  try {
    scrapeRes = options.fetcher ? await options.fetcher() : await scrapeProfile(app.shugo_url);
  } catch (err) {
    return {
      success: false,
      error: `❌ تعذر الاتصال بـ Shugo.gg حالياً (${err.message}). يرجى المحاولة لاحقاً.`
    };
  }

  if (!scrapeRes || !scrapeRes.success) {
    return {
      success: false,
      error: scrapeRes?.message || `❌ تعذر الاتصال بـ Shugo.gg حالياً (${scrapeRes?.error || 'خطأ غير معروف'}). يرجى المحاولة لاحقاً.`
    };
  }

  const charData = scrapeRes.data;

  // 4. Validate Class (Fail Closed)
  if (!charData.className || charData.className === 'Unknown') {
    return {
      success: false,
      error: '❌ تعذر التحقق من كلاس شخصيتك من بروفايل شوقو.'
    };
  }

  // 5. Validate Item Level (Fail Closed)
  if (charData.itemLevel === null || charData.itemLevel === undefined || isNaN(Number(charData.itemLevel))) {
    return {
      success: false,
      error: '❌ تعذر استخراج مستوى العتاد (Item Level) من بروفايلك في Shugo للتحقق من شروط النشاط.'
    };
  }

  // 6. Compare with minimumItemLevel
  const currentItemLevel = Number(charData.itemLevel);
  const minILvl = getMinimumItemLevel(activityName, activityMode);

  if (minILvl !== null && currentItemLevel < Number(minILvl)) {
    return {
      success: false,
      error: `❌ الآيتم لفل غير كافٍ لهذا النشاط.\nالمطلوب: **${minILvl}**\nالحالي: **${currentItemLevel}**`
    };
  }

  // 6.1 Validate Character Level (Fail Closed)
  const minCharLvl = getMinimumCharacterLevel(activityName, activityMode);
  if (minCharLvl !== null) {
    const currentCharLevel = Number(charData.characterLevel);
    if (isNaN(currentCharLevel) || currentCharLevel < Number(minCharLvl)) {
      return {
        success: false,
        error: `❌ مستوى الشخصية غير كافٍ لهذا النشاط.\nالمطلوب: **مستوى ${minCharLvl}**\nالحالي: **مستوى ${isNaN(currentCharLevel) ? 'غير محدد' : currentCharLevel}**`
      };
    }
  }


  // 7. Update Player Profile in aion2_global_applications
  try {
    await updatePlayerProfileFromShugo(userId, charData);
  } catch (updateErr) {
    console.error(`[LFG] Failed to update player profile for ${userId}:`, updateErr.message);
  }

  return { success: true, charData, app };
}

/**
 * Handle Create Group Confirm
 */

export async function recoverOrPublishPendingGroup(groupId, client) {
  const gRes = await pool.query(`
    SELECT id, group_uuid, events_delivery_status, events_message_id, state 
    FROM aion2_lfg_groups 
    WHERE id = $1
  `, [groupId]);

  if (gRes.rowCount === 0) {
    return { success: false, status: 'CREATION_FAILED', error: 'المجموعة غير موجودة.' };
  }
  const group = gRes.rows[0];

  // 1. If already linked and published, return CREATED_AND_PUBLISHED immediately
  if (group.events_delivery_status === 'LINKED' && group.events_message_id) {
    return {
      success: true,
      status: 'CREATED_AND_PUBLISHED',
      groupId: group.id,
      messageId: group.events_message_id,
    };
  }

  // 2. Validate group active state
  if (!['RECRUITING', 'FULL_WAITING_FOR_VOICE'].includes(group.state)) {
    return {
      success: false,
      status: 'CREATION_FAILED',
      error: 'حالة المجموعة غير صالحة للنشر.',
      groupId: group.id,
    };
  }

  // 3. Fetch state for card building
  const state = await fetchGroupState(group.id);
  if (!state || !state.group) {
    return {
      success: true,
      status: 'CREATED_PENDING_PUBLICATION',
      groupId: group.id,
      error: 'تعذر جلب تفاصيل المجموعة للنشر.',
    };
  }

  const { embeds, components } = buildGroupCard(state.group, state.members);

  let channel = null;
  try {
    if (client?.channels?.fetch) {
      channel = await client.channels.fetch(EVENTS_CHANNEL_ID).catch(() => null);
    }
  } catch (e) {
    channel = null;
  }

  if (!channel) {
    return {
      success: true,
      status: 'CREATED_PENDING_PUBLICATION',
      groupId: group.id,
      error: 'قناة ديسكورد غير متاحة حالياً.',
    };
  }

  // 4. Duplicate Card Protection: Scan bounded recent messages in channel
  try {
    if (channel.messages?.fetch) {
      const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
      if (recent) {
        const existing = recent.find((m) => 
          m.embeds.length > 0 && 
          m.embeds[0].footer?.text === `M3RGEEN_LFG:v1:${group.group_uuid}`
        );
        if (existing) {
          // Card was already posted! Link it to avoid duplicate messages
          await pool.query(`
            UPDATE aion2_lfg_groups 
            SET events_message_id = $1, events_delivery_status = 'LINKED' 
            WHERE id = $2 AND events_delivery_status = 'PENDING'
          `, [existing.id, group.id]);

          return {
            success: true,
            status: 'CREATED_AND_PUBLISHED',
            groupId: group.id,
            messageId: existing.id,
          };
        }
      }
    }
  } catch (scanErr) {
    console.warn('[Recovery] Card deduplication scan warning:', scanErr.message);
  }

  // 5. Send Card to Discord
  try {
    const message = await channel.send({
      embeds,
      components
    });
    if (message && message.id) {
      await pool.query(`
        UPDATE aion2_lfg_groups 
        SET events_message_id = $1, events_delivery_status = 'LINKED' 
        WHERE id = $2 AND events_delivery_status = 'PENDING'
      `, [message.id, group.id]);

      return {
        success: true,
        status: 'CREATED_AND_PUBLISHED',
        groupId: group.id,
        messageId: message.id,
      };
    }
  } catch (sendErr) {
    console.error('[Recovery] Discord Send Error:', sendErr.message);
    return {
      success: true,
      status: 'CREATED_PENDING_PUBLICATION',
      groupId: group.id,
      error: 'حدث خطأ أثناء إرسال رسالة التنبيه في ديسكورد.',
    };
  }

  return {
    success: true,
    status: 'CREATED_PENDING_PUBLICATION',
    groupId: group.id,
  };
}

const activeGroupCreations = new Set();

/**
 * Checks if a user already has an active (non-terminal) group as creator, active member, or active lock.
 */
export async function getUserActiveGroup(discordId) {
  const res = await pool.query(`
    SELECT g.id, g.group_uuid, g.activity_name, g.activity_type, g.activity_mode, g.state, 
           g.events_delivery_status, g.events_message_id, g.creator_id,
           (g.creator_id = $1) AS is_creator
    FROM aion2_lfg_groups g
    WHERE g.state NOT IN ('COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED')
      AND (
        g.creator_id = $1 
        OR EXISTS (
          SELECT 1 FROM aion2_lfg_members m 
          WHERE m.group_id = g.id AND m.discord_id = $1 AND m.status = 'ACTIVE'
        )
        OR EXISTS (
          SELECT 1 FROM aion2_lfg_active_locks l 
          WHERE l.group_id = g.id AND l.discord_id = $1
        )
      )
    ORDER BY g.created_at DESC
    LIMIT 1
  `, [discordId]);

  return res.rows[0] || null;
}

export async function coreCreateGroup(discordId, client, activityType, activityName, activityMode = 'EXPLORATION', options = {}) {
  // Prevent concurrent rapid button spamming
  if (activeGroupCreations.has(discordId)) {
    return {
      success: false,
      status: 'CREATION_FAILED',
      error: '⏳ طلب إنشاء مجموعة قيد المعالجة بالفعل. يرجى الانتظار وعدم تكرار الضغط.',
    };
  }

  activeGroupCreations.add(discordId);
  try {
    // Check if creator or member already has an active group BEFORE heavy Shugo refresh
    const activeGroup = await getUserActiveGroup(discordId);
    if (activeGroup) {
      const actDisplayName = activeGroup.activity_name?.replace(/_/g, ' ') || 'نشاط';
      if (activeGroup.is_creator) {
        if (activeGroup.events_delivery_status === 'LINKED' && activeGroup.events_message_id) {
          return {
            success: false,
            status: 'CREATION_FAILED',
            error: `❌ لديك بالفعل مجموعة نشطة (${actDisplayName}). يجب إغلاق مجموعتك السابقة أولاً لتتمكن من إنشاء مجموعة جديدة.`,
            groupId: activeGroup.id,
          };
        }
        // Existing group is in PENDING delivery status -> recover it without creating duplicate group!
        if (activeGroup.events_delivery_status === 'PENDING' && ['RECRUITING', 'FULL_WAITING_FOR_VOICE'].includes(activeGroup.state)) {
          return await recoverOrPublishPendingGroup(activeGroup.id, client);
        }
        return {
          success: false,
          status: 'CREATION_FAILED',
          error: `❌ لديك بالفعل مجموعة نشطة (${actDisplayName}). يجب إغلاق مجموعتك السابقة أولاً لتتمكن من إنشاء مجموعة جديدة.`,
          groupId: activeGroup.id,
        };
      } else {
        return {
          success: false,
          status: 'CREATION_FAILED',
          error: `❌ أنت مسجل بالفعل كعضو في مجموعة نشطة (${actDisplayName}). يجب مغادرة المجموعة الحالية أولاً لتتمكن من إنشاء مجموعة جديدة.`,
          groupId: activeGroup.id,
        };
      }
    }

    // Validate creator's Shugo profile & minimum iLvl (Creator joins official lineup immediately)
    const valRes = await validateAndRefreshShugo(discordId, activityName, activityMode, options);
    if (!valRes.success) {
      return { success: false, status: 'CREATION_FAILED', error: valRes.error };
    }

    let groupId;
    try {
      groupId = await createGroupAtomic(discordId, activityType, activityName, activityMode);
    } catch (err) {
      if (err.code === '23505') { // Postgres Unique Violation
        const checkRes = await getUserActiveGroup(discordId);
        if (checkRes && checkRes.events_delivery_status === 'PENDING' && ['RECRUITING', 'FULL_WAITING_FOR_VOICE'].includes(checkRes.state)) {
          return await recoverOrPublishPendingGroup(checkRes.id, client);
        }
        return {
          success: false,
          status: 'CREATION_FAILED',
          error: '❌ لديك بالفعل مجموعة نشطة. يجب إغلاقها أو مغادرتها أولاً قبل إنشاء مجموعة جديدة.',
        };
      }
      console.error("Create Group Error:", err);
      return { success: false, status: 'CREATION_FAILED', error: 'حدث خطأ أثناء الإنشاء: ' + err.message };
    }

    // Transition to PENDING before Discord send
    try {
      await transitionToPending(groupId);
    } catch (e) {
      console.error("Transition to pending failed:", e);
      return {
        success: true,
        status: 'CREATED_PENDING_PUBLICATION',
        groupId,
        error: 'حدث خطأ داخلي أثناء تحضير رسالة المجموعة.',
      };
    }

    // Publish or recover card
    return await recoverOrPublishPendingGroup(groupId, client);
  } finally {
    activeGroupCreations.delete(discordId);
  }
}

export async function handleCreateGroup(interaction, activityType, activityName, activityMode = 'EXPLORATION') {
  const app = await preCheck(interaction);
  if (!app) return;

  // Immediately clear buttons and show processing feedback to prevent rapid spam clicking
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.update({
        content: '⏳ جارٍ التحقق من الشروط وإنشاء المجموعة، يرجى الانتظار...',
        embeds: [],
        components: []
      });
    }
  } catch (err) {
    console.warn('[LFG] Interaction update warning in handleCreateGroup:', err.message);
  }

  const res = await coreCreateGroup(interaction.user.id, interaction.client, activityType, activityName, activityMode);

  const replyContent = !res.success 
    ? res.error 
    : (res.status === 'CREATED_PENDING_PUBLICATION' 
        ? '⚠️ تم إنشاء المجموعة في قاعدة البيانات، ولكن تعذر استكمال نشر الرسالة في ديسكورد حالياً. سيتولى النظام استكمال النشر تلقائياً.' 
        : '✅ تم إنشاء المجموعة بنجاح!');

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: replyContent, embeds: [], components: [] });
    } else {
      await interaction.reply({ content: replyContent, ephemeral: true });
    }
  } catch (err) {
    try {
      await interaction.followUp({ content: replyContent, ephemeral: true });
    } catch (_) {}
  }
}

export async function handleCancelNav(interaction) {
  await interaction.update({ content: 'تم إلغاء العملية.', embeds: [], components: [] });
}

/**
 * Refresh UI Card safely
 */
async function refreshCard(interaction, groupId) {
  const state = await fetchGroupState(groupId);
  if (!state) return;
  const { embeds, components } = buildGroupCard(state.group, state.members);
  
  try {
    await interaction.editReply({ embeds, components });
    await pool.query(`
      UPDATE aion2_lfg_groups 
      SET events_render_pending = FALSE 
      WHERE id = $1 AND events_render_version = $2
    `, [groupId, state.group.events_render_version]);
  } catch(e) {
    console.error("Discord Edit Error after DB success:", e);
  }
}

/**
 * Handle Join Button
 */

export async function coreJoinGroup(discordId, groupId, options = {}) {
  const state = await fetchGroupState(groupId);
  if (!state || !state.group) return { success: false, error: 'هذه المجموعة غير موجودة.' };
  
  const valRes = await validateAndRefreshShugo(discordId, state.group.activity_name, state.group.activity_mode, options);
  if (!valRes.success) return { success: false, error: valRes.error };
  
  try {
    await joinGroupAtomic(groupId, discordId, state.group.activity_name, state.group.activity_mode);
    return { success: true };
  } catch (err) {
    let msg = 'خطأ داخلي';
    if (err.code === '23505') msg = 'أنت بالفعل في مجموعة نشطة أخرى.';
    else if (err.message === 'OVER_CAPACITY' || err.message === 'GROUP_FULL') msg = 'المجموعة ممتلئة.';
    else if (err.message === 'SOLVER_REJECTED_JOIN') msg = 'التشكيلة الحالية لا تسمح بانضمام فئة شخصيتك.';
    else if (err.message === 'RECRUITMENT_EXPIRED') msg = 'انتهت مدة التجمع لهذه المجموعة.';
    else if (err.message === 'VOICE_START_DEADLINE_EXPIRED') msg = 'المجموعة انتهت صلاحيتها.';
    else if (err.message === 'INVALID_GROUP_STATE') msg = 'حالة المجموعة غير صالحة للانضمام.';
    else if (err.message === 'ALREADY_JOINED') msg = 'أنت منضم بالفعل في هذه المجموعة.';
    else if (err.message === 'ACTIVITY_MISMATCH' || err.message === 'ACTIVITY_MODE_MISMATCH') msg = 'تغيرت بيانات الفعالية أو الطور أثناء المعالجة.';
    else if (err.message === 'ELIGIBILITY_FAILED') msg = 'عذراً، يجب أن تكون عضواً معتمداً في تحالف Emperor أو M3RGEEN Global.';
    
    return { success: false, error: msg };
  }
}

export async function coreLeaveGroup(discordId, groupId) {
  try {
    await leaveGroupAtomic(groupId, discordId);
    return { success: true };
  } catch (err) {
    if (err.message === 'CREATOR_MUST_CLOSE') {
      return { success: false, error: 'أنت منشئ المجموعة. لإلغائها يجب إغلاق المجموعة.' };
    } else if (err.message === 'NOT_AN_ACTIVE_MEMBER') {
      return { success: false, error: 'أنت لست عضواً نشطاً في هذه المجموعة.' };
    } else {
      return { success: false, error: 'خطأ: ' + err.message };
    }
  }
}

export async function handleJoinGroup(interaction, groupId) {
  const app = await preCheck(interaction);
  if (!app) return;
  await interaction.deferUpdate();
  
  const res = await coreJoinGroup(interaction.user.id, groupId);
  if (res.success) {
    await refreshCard(interaction, groupId);
  } else {
    await interaction.followUp({ content: res.error, ephemeral: true });
    await updateEventsCard(groupId).catch(() => {});
  }
}

/**
 * Handle Leave Button
 */
export async function handleLeaveGroup(interaction, groupId) {
  const app = await preCheck(interaction);
  if (!app) return;
  await interaction.deferUpdate();

  const res = await coreLeaveGroup(interaction.user.id, groupId);
  if (res.success) {
    await refreshCard(interaction, groupId);
  } else {
    await interaction.followUp({ content: res.error, ephemeral: true });
    await updateEventsCard(groupId).catch(() => {});
  }
}

/**
 * Handle Close (Initiate)
 */
export async function handleCloseGroupInit(interaction, groupId) {
  const state = await fetchGroupState(groupId);
  if (!state || state.group.state === 'CANCELLED') {
    return interaction.reply({ content: 'المجموعة مغلقة مسبقاً.', ephemeral: true });
  }

  if (state.group.creator_id !== interaction.user.id) {
    return interaction.reply({ content: 'منشئ المجموعة فقط يمكنه إغلاقها.', ephemeral: true });
  }

  const comp = buildCloseReasonMenu(groupId);
  await interaction.reply({ content: 'الرجاء تحديد سبب إغلاق المجموعة:', components: [comp], ephemeral: true });
}

/**
 * Handle Close Select Reason
 */
export async function handleCloseReasonSelect(interaction) {
  const reason = interaction.values[0];
  const groupId = interaction.customId.replace('aion2_lfg_sel_close_reason_', '');

  if (reason === 'OTHER') {
    const modal = new ModalBuilder()
      .setCustomId(`aion2_lfg_modal_close_other_${groupId}`)
      .setTitle('سبب الإغلاق');

    const input = new TextInputBuilder()
      .setCustomId('reason_input')
      .setLabel('السبب (اختياري)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  } else {
    await executeCloseGroup(interaction, groupId, reason, null);
  }
}

/**
 * Handle Close Modal Submit
 */
export async function handleCloseModalSubmit(interaction) {
  const groupId = interaction.customId.replace('aion2_lfg_modal_close_other_', '');
  const customReason = interaction.fields.getTextInputValue('reason_input');
  await executeCloseGroup(interaction, groupId, 'OTHER', customReason);
}

export async function coreCloseGroup(discordId, groupId, reasonEnum, customReason = null) {
  try {
    await closeGroupAtomic(groupId, discordId, reasonEnum, customReason);
    return { success: true };
  } catch (err) {
    if (err.message === 'GROUP_NOT_FOUND') return { success: false, error: 'المجموعة غير موجودة.' };
    if (err.message === 'NOT_CREATOR') return { success: false, error: 'أنت لست منشئ المجموعة.' };
    if (err.message === 'ALREADY_TERMINAL') return { success: false, error: 'المجموعة مغلقة أو منتهية مسبقاً.' };
    return { success: false, error: 'فشل الإغلاق: ' + err.message };
  }
}

async function executeCloseGroup(interaction, groupId, reasonEnum, customReason) {
  await interaction.deferUpdate();

  const res = await coreCloseGroup(interaction.user.id, groupId, reasonEnum, customReason);
  if (res.success) {
    await updateEventsCard(groupId).catch(() => {});
    await interaction.editReply({ content: 'تم إغلاق المجموعة.', components: [] });
  } else {
    await interaction.followUp({ content: res.error, ephemeral: true });
    await updateEventsCard(groupId).catch(() => {});
  }
}
