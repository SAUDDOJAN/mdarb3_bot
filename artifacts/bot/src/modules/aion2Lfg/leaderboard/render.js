import { AttachmentBuilder } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, pool } from '../../../database/index.js';
import { getMonthlyRankings } from './ranking.js';
import { getCurrentMonthlyCycle } from '../utils/timeCycles.js';

const LEADERBOARD_CHANNEL_ID = '1552492963945521222';
const BANNER_FILE_NAME = 'aion2_leaderboard_banner.png';
const LEADERBOARD_COLOR = 0xD4AF37; // Metallic Gold matching banner crown/border

export function getBannerPath() {
  const candidates = [
    path.resolve(process.cwd(), 'assets', BANNER_FILE_NAME),
    path.resolve(process.cwd(), 'src', 'assets', BANNER_FILE_NAME),
    path.resolve(process.cwd(), 'artifacts', 'bot', 'assets', BANNER_FILE_NAME),
    path.resolve(process.cwd(), 'artifacts', 'bot', 'src', 'assets', BANNER_FILE_NAME),
  ];
  try {
    candidates.push(fileURLToPath(new URL('../../../../assets/' + BANNER_FILE_NAME, import.meta.url)));
    candidates.push(fileURLToPath(new URL('../../../assets/' + BANNER_FILE_NAME, import.meta.url)));
  } catch (e) {}

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

export async function setLeaderboardDirty(client) {
  const q = client ? client.query.bind(client) : query;
  await q(`
    INSERT INTO aion2_lfg_leaderboard_state (channel_id, is_dirty, version) 
    VALUES ($1, TRUE, 1)
    ON CONFLICT (channel_id) 
    DO UPDATE SET is_dirty = TRUE, version = aion2_lfg_leaderboard_state.version + 1
  `, [LEADERBOARD_CHANNEL_ID]);
}

export function generateLeaderboardEmbed(top5Rankings, currentCycleId, bannerAttachmentName = null) {
  const RANK_META = [
    { rank: 3, title: '🥉 المركز الثالث' },
    { rank: 2, title: '🥈 المركز الثاني' },
    { rank: 1, title: '🥇 المركز الأول' },
    { rank: 5, title: '5️⃣ المركز الخامس' },
    { rank: 4, title: '4️⃣ المركز الرابع' }
  ];

  const hasAnyPlayer = Array.isArray(top5Rankings) && top5Rankings.length > 0;

  const playerByRank = new Map();
  if (hasAnyPlayer) {
    top5Rankings.forEach(p => {
      if (p && p.rank) {
        playerByRank.set(Number(p.rank), p);
      }
    });
  }

  const fields = RANK_META.map(meta => {
    const player = playerByRank.get(meta.rank);
    if (player) {
      return {
        name: meta.title,
        value: `<@${player.discord_id}>\n⭐ **${player.total_points} نقطة**\n🎮 **${player.completed_groups}** قروبات\n👥 **${player.unique_guildmates}** لاعب`,
        inline: true
      };
    } else {
      return {
        name: meta.title,
        value: '▫️ شاغر حاليًا',
        inline: true
      };
    }
  });

  const embed = {
    color: LEADERBOARD_COLOR,
    fields,
    footer: { text: `M3RGEEN • دورة: ${currentCycleId}` }
  };

  if (bannerAttachmentName) {
    embed.image = { url: `attachment://${bannerAttachmentName}` };
  }

  return embed;
}

export function generateLeaderboardEmbeds(top5Rankings, currentCycleId, bannerAttachmentName = null) {
  return [generateLeaderboardEmbed(top5Rankings, currentCycleId, bannerAttachmentName)];
}

export async function notifyTop5Transitions(client, previousTop5 = [], currentTop5 = []) {
  if (!client || !client.users) return;

  const RANK_NAMES_AR = {
    1: 'الأول',
    2: 'الثاني',
    3: 'الثالث',
    4: 'الرابع',
    5: 'الخامس'
  };

  const prevMap = new Map();
  for (const item of (previousTop5 || [])) {
    if (item && item.discord_id && item.rank >= 1 && item.rank <= 5) {
      prevMap.set(String(item.discord_id), Number(item.rank));
    }
  }

  const currMap = new Map();
  for (const item of (currentTop5 || [])) {
    if (item && item.discord_id && item.rank >= 1 && item.rank <= 5) {
      currMap.set(String(item.discord_id), Number(item.rank));
    }
  }

  const allUserIds = new Set([...prevMap.keys(), ...currMap.keys()]);

  for (const discordId of allUserIds) {
    const oldRank = prevMap.get(discordId);
    const newRank = currMap.get(discordId);

    let message = null;

    if (!oldRank && newRank) {
      // Case 1: Entered Top 5
      message = `🏆 وصلت إلى المركز ${RANK_NAMES_AR[newRank]} في قائمة أكثر اللاعبين نشاطًا!`;
    } else if (oldRank && newRank) {
      if (newRank < oldRank) {
        // Case 2: Climbed inside Top 5 (e.g. from 3 to 1)
        message = `🔥 صعدت إلى المركز ${RANK_NAMES_AR[newRank]} في قائمة أكثر اللاعبين نشاطًا!`;
      } else if (newRank > oldRank) {
        // Case 3: Dropped within Top 5 (e.g. from 1 to 3)
        message = `📉 نزلت إلى المركز ${RANK_NAMES_AR[newRank]} في قائمة أكثر اللاعبين نشاطًا.`;
      }
      // If newRank === oldRank: do nothing
    } else if (oldRank && !newRank) {
      // Case 4: Dropped out of Top 5
      message = `📉 خرجت من قائمة أفضل 5 بعد أن كنت في المركز ${RANK_NAMES_AR[oldRank]}.`;
    }

    if (message) {
      try {
        const user = await client.users.fetch(discordId);
        if (user) {
          await user.send(message);
        }
      } catch (dmErr) {
        console.warn(`[Leaderboard] Could not send DM to user ${discordId}: ${dmErr?.message || dmErr}`);
      }
    }
  }
}

export async function reconcileLeaderboard(client) {
  if (!client) return;

  // Acquire an advisory lock so multiple bot instances don't race
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const lockRes = await lockClient.query('SELECT pg_try_advisory_lock(155249296)');
    if (!lockRes.rows[0].pg_try_advisory_lock) return; // Another instance is reconciling
    locked = true;

    const { cycleId } = getCurrentMonthlyCycle();

    // Check dirty state and current recorded cycle
    const stateRes = await lockClient.query(`
      SELECT is_dirty, version, page_messages, last_top5, cycle_id 
      FROM aion2_lfg_leaderboard_state 
      WHERE channel_id = $1
    `, [LEADERBOARD_CHANNEL_ID]);
    
    if (stateRes.rowCount === 0) {
      // First time init
      await lockClient.query(`
        INSERT INTO aion2_lfg_leaderboard_state (channel_id, is_dirty, version, page_messages, last_top5, cycle_id) 
        VALUES ($1, TRUE, 1, '[]'::jsonb, '[]'::jsonb, $2)
      `, [LEADERBOARD_CHANNEL_ID, cycleId]);
      return; // Will pick up next tick
    }
    
    const state = stateRes.rows[0];
    const isNewCycle = Boolean(state.cycle_id && state.cycle_id !== cycleId);

    // If not dirty and cycle has not changed, nothing to do
    if (!state.is_dirty && !isNewCycle) return;

    const targetVersion = state.version;
    let pageMessages = Array.isArray(state.page_messages) ? state.page_messages : [];
    let previousTop5 = isNewCycle ? [] : (Array.isArray(state.last_top5) ? state.last_top5 : []);

    // Calculate Leaderboard
    const rankings = await getMonthlyRankings(cycleId);
    const top5 = rankings.slice(0, 5);

    const bannerPath = getBannerPath();
    const hasBannerFile = Boolean(bannerPath && fs.existsSync(bannerPath));
    const embeds = generateLeaderboardEmbeds(top5, cycleId, hasBannerFile ? BANNER_FILE_NAME : null);

    const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error("[Leaderboard] Channel not found or accessible.");
      return;
    }

    let primaryMsgId = pageMessages[0] || null;
    let primaryMsg = null;
    if (primaryMsgId) {
      primaryMsg = await channel.messages.fetch(primaryMsgId).catch(() => null);
    }

    // Check if the message already has the banner attachment to avoid re-uploading every tick
    const alreadyHasAttachment = primaryMsg && primaryMsg.attachments && primaryMsg.attachments.some(a => a.name === BANNER_FILE_NAME);

    const files = [];
    if (hasBannerFile && !alreadyHasAttachment) {
      files.push(new AttachmentBuilder(bannerPath, { name: BANNER_FILE_NAME }));
    }

    const payload = { embeds };
    if (files.length > 0) {
      payload.files = files;
    }

    let savedMsgId = null;

    if (primaryMsg) {
      try {
        await primaryMsg.edit(payload);
        savedMsgId = primaryMsg.id;
      } catch (err) {
        if (err.code === 10008) {
          // Unknown message, recreate with attachment
          const newPayload = { embeds };
          if (hasBannerFile) {
            newPayload.files = [new AttachmentBuilder(bannerPath, { name: BANNER_FILE_NAME })];
          }
          const newMsg = await channel.send(newPayload);
          savedMsgId = newMsg.id;
        } else {
          console.error("[Leaderboard] Failed to edit message:", err);
          return; // Abort, leave dirty
        }
      }
    } else {
      try {
        const newPayload = { embeds };
        if (hasBannerFile) {
          newPayload.files = [new AttachmentBuilder(bannerPath, { name: BANNER_FILE_NAME })];
        }
        const newMsg = await channel.send(newPayload);
        savedMsgId = newMsg.id;
      } catch (err) {
        console.error("[Leaderboard] Failed to send message:", err);
        return; // Abort, leave dirty
      }
    }

    // Shrink / Delete any excess messages from older versions
    if (pageMessages.length > 1) {
      for (let i = 1; i < pageMessages.length; i++) {
        const excessMsgId = pageMessages[i];
        try {
          const excessMsg = await channel.messages.fetch(excessMsgId);
          await excessMsg.delete().catch(() => {});
        } catch (delErr) {
          // Ignore
        }
      }
    }

    // Top 5 DM notifications
    const currentTop5Payload = top5.map(r => ({ discord_id: r.discord_id, rank: r.rank }));
    await notifyTop5Transitions(client, previousTop5, currentTop5Payload);

    // Update DB state
    const newPageMessages = savedMsgId ? [savedMsgId] : [];
    await lockClient.query(`
      UPDATE aion2_lfg_leaderboard_state 
      SET is_dirty = FALSE, 
          page_messages = $1, 
          last_top5 = $2, 
          cycle_id = $3
      WHERE channel_id = $4 AND version = $5
    `, [
      JSON.stringify(newPageMessages),
      JSON.stringify(currentTop5Payload),
      cycleId,
      LEADERBOARD_CHANNEL_ID,
      targetVersion
    ]);

    // Ensure page_messages and last_top5 are stored even if version changed
    await lockClient.query(`
      UPDATE aion2_lfg_leaderboard_state 
      SET page_messages = $1,
          last_top5 = $2,
          cycle_id = $3
      WHERE channel_id = $4
    `, [
      JSON.stringify(newPageMessages),
      JSON.stringify(currentTop5Payload),
      cycleId,
      LEADERBOARD_CHANNEL_ID
    ]);

  } catch (err) {
    console.error("[Leaderboard] Reconciliation Error:", err);
  } finally {
    if (locked) {
      await lockClient.query('SELECT pg_advisory_unlock(155249296)');
    }
    lockClient.release();
  }
}
