import { startCompletionVoteAtomic, requestFallbackVoteAtomic, confirmFallbackVoteAtomic, submitCompletionVoteAtomic, executeTerminationFlow } from '../db/engine.js';
import { processPendingLedgers } from '../workers/ledgerWorker.js';
import { b4EvaluatorHook } from '../evaluator/b4Evaluator.js';

export async function coreStartCompletionVote(groupId, userId, client = null) {
  const res = await startCompletionVoteAtomic(groupId, userId);
  if (res.error) return { success: false, error: res.error };
  if (client) {
    const termRes = await executeTerminationFlow(groupId, client);
    if (!termRes.success && termRes.retryPending) {
      return { success: true, pendingDeletion: true };
    }
  }
  return { success: true };
}

export async function coreRequestFallbackVote(groupId, userId) {
  const res = await requestFallbackVoteAtomic(groupId, userId);
  if (res.error) return { success: false, error: res.error };
  return { success: true };
}

export async function coreConfirmFallbackVote(groupId, userId, client = null) {
  const res = await confirmFallbackVoteAtomic(groupId, userId);
  if (res.error) return { success: false, error: res.error };
  if (client) {
    const termRes = await executeTerminationFlow(groupId, client);
    if (!termRes.success && termRes.retryPending) {
      return { success: true, pendingDeletion: true };
    }
  }
  return { success: true };
}

export async function coreSubmitCompletionVote(groupId, userId, voteAction) {
  const res = await submitCompletionVoteAtomic(groupId, userId, voteAction);
  if (res.error) return { success: false, error: res.error };
  return { success: true, completed: res.completed, idempotent: res.idempotent };
}

export async function handleVoteStart(interaction, groupId) {
  const res = await coreStartCompletionVote(groupId, interaction.user.id, interaction.client);
  
  if (!res.success) {
    let msg = 'حدث خطأ غير معروف.';
    if (res.error === 'NOT_FOUND') msg = 'المجموعة غير موجودة.';
    else if (res.error === 'NOT_ACTIVE') msg = 'المجموعة ليست نشطة الآن.';
    else if (res.error === 'NOT_CREATOR') msg = 'يجب أن تكون منشئ الفريق لبدء التصويت.';
    else if (res.error === 'NOT_OFFICIAL') msg = 'لست عضواً رسمياً في هذا الفريق.';
    else if (res.error === 'CAPACITY_MISMATCH') msg = 'عدد الأعضاء الرسميين لا يتطابق مع العدد المطلوب للنشاط.';
    else if (res.error === 'INSUFFICIENT_VOICE_QUORUM') msg = 'لا يمكن بدء التصويت الآن.\nيجب وجود 4 أعضاء على الأقل من الفريق داخل الروم الصوتي.';
    return interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
  }

  if (res.pendingDeletion) {
    return interaction.reply({ content: '⏳ تم تأكيد إنهاء النشاط، جاري حذف الروم الصوتي وبدء التصويت...', ephemeral: true });
  }

  return interaction.reply({ content: '✅ تم إنهاء النشاط وحذف الروم الصوتي وبدء التصويت بنجاح.', ephemeral: true });
}

export async function handleVoteReq(interaction, groupId) {
  const res = await coreRequestFallbackVote(groupId, interaction.user.id);
  
  if (!res.success) {
    let msg = 'حدث خطأ غير معروف.';
    if (res.error === 'NOT_FOUND') msg = 'المجموعة غير موجودة.';
    else if (res.error === 'NOT_ACTIVE') msg = 'المجموعة ليست نشطة الآن.';
    else if (res.error === 'NOT_OFFICIAL') msg = 'لست عضواً رسمياً في هذا الفريق.';
    else if (res.error === 'ALREADY_PENDING') msg = 'يوجد طلب معلق بالفعل.';
    else if (res.error === 'CREATOR_CANNOT_FALLBACK' || res.error === 'USE_CREATOR_PATH') msg = 'أنت منشئ الفريق، استخدم الزر الخاص بك لبدء التصويت مباشرة.';
    else if (res.error === 'INSUFFICIENT_VOICE_QUORUM') msg = 'لا يمكن بدء التصويت الآن.\nيجب وجود 4 أعضاء على الأقل من الفريق داخل الروم الصوتي.';
    return interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
  }

  return interaction.reply({ content: '✅ تم تقديم طلب إنهاء النشاط وبانتظار تأكيد عضو آخر.', ephemeral: true });
}

export async function handleVoteConf(interaction, groupId) {
  const res = await coreConfirmFallbackVote(groupId, interaction.user.id, interaction.client);
  
  if (!res.success) {
    let msg = 'حدث خطأ غير معروف.';
    if (res.error === 'NOT_FOUND') msg = 'المجموعة غير موجودة.';
    else if (res.error === 'NO_PENDING_REQUEST') msg = 'لا يوجد طلب معلق لتأكيده، أو انتهت صلاحيته.';
    else if (res.error === 'NOT_ACTIVE') msg = 'المجموعة ليست نشطة الآن.';
    else if (res.error === 'NOT_OFFICIAL') msg = 'لست عضواً رسمياً في هذا الفريق.';
    else if (res.error === 'CANNOT_SELF_CONFIRM') msg = 'لا يمكنك تأكيد طلبك الخاص.';
    else if (res.error === 'CAPACITY_MISMATCH') msg = 'عدد الأعضاء الرسميين لا يتطابق مع العدد المطلوب للنشاط.';
    else if (res.error === 'INSUFFICIENT_VOICE_QUORUM') msg = 'لا يمكن بدء التصويت الآن.\nيجب وجود 4 أعضاء على الأقل من الفريق داخل الروم الصوتي.';
    return interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
  }

  if (res.pendingDeletion) {
    return interaction.reply({ content: '⏳ تم تأكيد إنهاء النشاط، جاري حذف الروم الصوتي وبدء التصويت...', ephemeral: true });
  }

  return interaction.reply({ content: '✅ تم تأكيد الطلب وحذف الروم الصوتي وبدء التصويت بنجاح.', ephemeral: true });
}

export async function handleVoteSubmit(interaction, groupId, voteAction) {
  // It's in a DM so we must defer reply correctly to avoid interaction timeout
  await interaction.deferReply({ ephemeral: true });

  const res = await coreSubmitCompletionVote(groupId, interaction.user.id, voteAction);
  
  if (!res.success) {
    let msg = 'حدث خطأ غير معروف.';
    if (res.error === 'NOT_FOUND') msg = 'المجموعة غير موجودة.';
    else if (res.error === 'NOT_AWAITING_VOTE') msg = 'انتهى وقت التصويت أو تم حسم النتيجة.';
    else if (res.error === 'DEADLINE_PASSED') msg = 'انتهى الوقت المخصص للتصويت.';
    else if (res.error === 'NOT_OFFICIAL') msg = 'لست عضواً رسمياً في هذا الفريق.';
    else if (res.error === 'ALREADY_VOTED') msg = 'لقد قمت بالتصويت مسبقاً.';
    else if (res.error === 'INVALID_VOTE') msg = 'تصويت غير صحيح.';
    return interaction.editReply({ content: `❌ ${msg}` });
  }

  if (res.idempotent) {
    return interaction.editReply({ content: '⚠️ لقد قمت بهذا التصويت مسبقاً وتم تسجيله.' });
  }

  const actionText = voteAction === 'YES' ? '✅ تم تسجيل تأكيدك لنجاح النشاط.' : '❌ تم تسجيل رفضك لنجاح النشاط.';
  await interaction.editReply({ content: actionText });

  if (res.completed) {
    processPendingLedgers(b4EvaluatorHook, null, interaction.client).catch(err => {
      console.error("[Voting] Immediate post-completion ledger error:", err);
    });
  }
}
