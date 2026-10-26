import { pool } from '../../../database/index.js';
import client from '../../../client.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export async function processVoteDeliveries() {
  let processedCount = 0;
  while (true) {
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      
      const notifRes = await dbClient.query(`
        SELECT n.group_id, n.discord_id, g.state, g.vote_deadline, g.activity_name, g.creator_id, (g.vote_deadline > CURRENT_TIMESTAMP) as can_retry
        FROM aion2_lfg_notifications n
        JOIN aion2_lfg_groups g ON n.group_id = g.id
        WHERE n.notification_type = 'VOTE_DM'
        AND (
          n.delivery_status = 'NOT_STARTED' OR 
          (n.delivery_status = 'SENDING' AND n.delivery_started_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes') OR
          (n.delivery_status = 'AMBIGUOUS' AND n.delivery_started_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes')
        )
        FOR UPDATE SKIP LOCKED LIMIT 1
      `);
      
      if (notifRes.rowCount === 0) {
        await dbClient.query('ROLLBACK');
        break;
      }
      
      const n = notifRes.rows[0];
      
      if (n.state !== 'AWAITING_VOTE' || !n.can_retry) {
        await dbClient.query(`UPDATE aion2_lfg_notifications SET delivery_status = 'DEFINITIVE_FAILED', delivery_started_at = CURRENT_TIMESTAMP, last_error = 'GROUP_NO_LONGER_VOTING' WHERE group_id = $1 AND discord_id = $2 AND notification_type = 'VOTE_DM'`, [n.group_id, n.discord_id]);
        await dbClient.query('COMMIT');
        continue;
      }

      await dbClient.query(`UPDATE aion2_lfg_notifications SET delivery_status = 'SENDING', delivery_started_at = CURRENT_TIMESTAMP WHERE group_id = $1 AND discord_id = $2 AND notification_type = 'VOTE_DM'`, [n.group_id, n.discord_id]);
      await dbClient.query('COMMIT');

      let outcome = 'AMBIGUOUS';
      let errorMsg = null;
      try {
        const user = await client.users.fetch(n.discord_id);
        const embed = new EmbedBuilder()
          .setTitle('تأكيد نتيجة النشاط')
          .setColor('#3498DB')
          .addFields(
            { name: 'اسم النشاط', value: n.activity_name.replace(/_/g, ' ') },
            { name: 'منشئ الفريق', value: `<@${n.creator_id}>` },
            { name: 'السؤال', value: 'هل تم إنهاء النشاط بنجاح؟' }
          );
          
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`aion2_lfg_vote_yes_${n.group_id}`).setLabel('✅ نعم').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`aion2_lfg_vote_no_${n.group_id}`).setLabel('❌ لا').setStyle(ButtonStyle.Danger)
        );

        await user.send({ embeds: [embed], components: [row] });
        outcome = 'SENT';
      } catch (err) {
        errorMsg = err.message ? err.message.substring(0, 255) : 'Unknown Error';
        if (err.code === 50007) {
          outcome = 'DEFINITIVE_FAILED';
        } else {
          outcome = 'AMBIGUOUS';
        }
      }

      await pool.query(`
        UPDATE aion2_lfg_notifications
        SET delivery_status = $1,
            sent_at = CASE WHEN $1 = 'SENT' THEN CURRENT_TIMESTAMP ELSE NULL END,
            last_error = $2
        WHERE group_id = $3 AND discord_id = $4 AND notification_type = 'VOTE_DM'
      `, [outcome, errorMsg, n.group_id, n.discord_id]);

      processedCount++;
    } catch (e) {
      await dbClient.query('ROLLBACK');
      console.error('[LFG] Error processing vote delivery', e);
      break;
    } finally {
      dbClient.release();
    }
  }
  return processedCount;
}
