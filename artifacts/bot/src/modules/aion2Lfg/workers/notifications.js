import { query, pool } from '../../../database/index.js';
import client from '../../../client.js';

export async function processNotifications() {
  let processed = 0;
  while (true) {
    // Claim one NOT_STARTED row atomically
    const claimRes = await query(`
      UPDATE aion2_lfg_notifications
      SET delivery_status = 'SENDING', delivery_started_at = CURRENT_TIMESTAMP
      WHERE notification_id = (
        SELECT notification_id FROM aion2_lfg_notifications
        WHERE delivery_status = 'NOT_STARTED'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `);

    if (claimRes.rowCount === 0) {
      break; // No more rows to process
    }

    const notif = claimRes.rows[0];
    let finalStatus = 'AMBIGUOUS';
    let lastError = null;

    try {
      const user = await client.users.fetch(notif.discord_id);
      
      let messageContent = '';
      if (notif.notification_type === 'FIRST_FULL') {
        messageContent = '🎉 فريقك في AION 2 اكتمل النصاب! يُرجى الاستعداد وبدء الروم الصوتي خلال 10 دقائق.';
      } else if (notif.notification_type === 'VOICE_START_EXPIRED_CREATOR') {
        messageContent = '⚠️ انتهت مهلة الـ 10 دقائق لإنشاء الروم الصوتي. تم إلغاء المجموعة.';
      }

      await user.send(messageContent);
      finalStatus = 'SENT';
    } catch (err) {
      lastError = err.message || 'UNKNOWN_ERROR';
      // 50007 = Cannot send messages to this user
      if (err.code === 50007 || err.status === 403) {
        finalStatus = 'DEFINITIVE_FAILED';
      } else {
        finalStatus = 'AMBIGUOUS';
      }
    }

    await query(`
      UPDATE aion2_lfg_notifications
      SET delivery_status = $1, sent_at = CASE WHEN $1 = 'SENT' THEN CURRENT_TIMESTAMP ELSE NULL END, last_error = $2
      WHERE notification_id = $3
    `, [finalStatus, lastError, notif.notification_id]);

    processed++;
  }
  return processed;
}

export async function recoverStaleNotifications() {
  // Convert SENDING to AMBIGUOUS on startup
  const res = await query(`
    UPDATE aion2_lfg_notifications
    SET delivery_status = 'AMBIGUOUS', last_error = 'STALE_SENDING_RECOVERED'
    WHERE delivery_status = 'SENDING'
  `);
  if (res.rowCount > 0) {
    console.log(`[LFG] Recovered ${res.rowCount} stale SENDING notifications to AMBIGUOUS.`);
  }
}
