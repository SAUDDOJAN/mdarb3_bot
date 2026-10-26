import { processManualChannelDeleteAtomic } from '../modules/aion2Lfg/db/engine.js';
import { query } from '../database/index.js';

export default {
  name: 'channelDelete',
  once: false,
  async execute(channel, client) {
    if (channel.type !== 2) return; // GuildVoice is 2

    try {
      const groupRes = await query(`SELECT id FROM aion2_lfg_groups WHERE voice_channel_id = $1`, [channel.id]);
      if (groupRes.rowCount > 0) {
        const groupId = groupRes.rows[0].id;
        console.log(`[AION2:ChannelDelete] Caught deletion for LFG Voice Channel ${channel.id}, Group ${groupId}`);
        
        await processManualChannelDeleteAtomic(groupId);
        
        // Also trigger B2 events card reconciliation since state might have changed to EXPIRED, or render dirty
        const { updateEventsCard } = await import('../modules/aion2Lfg/eventsCard.js');
        await updateEventsCard(client, groupId).catch(() => {});
      }
    } catch (e) {
      console.error("[AION2:ChannelDelete] Error processing deletion:", e);
    }
  }
};
