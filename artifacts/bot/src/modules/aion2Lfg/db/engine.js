import { pool } from '../../../database/index.js';
import { solveComposition, getCapacity } from '../utils/solvers.js';
import { ALLOWED_GUILDS } from '../utils/activitiesConfig.js';

async function executeTx(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function validateEligibility(client, discordId) {
  // Independent DB validation: requires ACCEPTED, transition_status NULL, and assigned_guild in allowlist
  const res = await client.query(`
    SELECT selected_class FROM aion2_global_applications 
    WHERE discord_id = $1 
      AND status = 'ACCEPTED' 
      AND transition_status IS NULL
      AND assigned_guild = ANY($2::text[])
  `, [discordId, ALLOWED_GUILDS]);
  if (res.rowCount === 0) throw new Error("ELIGIBILITY_FAILED");
  if (!res.rows[0].selected_class) throw new Error("NULL_CLASS");
  return res.rows[0].selected_class;
}

export async function createGroupAtomic(creatorId, activityType, activityName, activityMode = 'EXPLORATION') {
  return executeTx(async (client) => {
    const playerClass = await validateEligibility(client, creatorId);

    // Create Group
    const grp = await client.query(`
      INSERT INTO aion2_lfg_groups (creator_id, activity_type, activity_name, activity_mode, recruitment_deadline)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + interval '10 minutes')
      RETURNING *
    `, [creatorId, activityType, activityName, activityMode || 'EXPLORATION']);
    const group = grp.rows[0];

    // Create Active Lock (Throws if exists due to PK)
    await client.query(`INSERT INTO aion2_lfg_active_locks (discord_id, group_id) VALUES ($1, $2)`, [creatorId, group.id]);

    // Insert Creator Member
    const mem = await client.query(`
      INSERT INTO aion2_lfg_members (group_id, discord_id, assigned_role, player_class, is_creator)
      VALUES ($1, $2, 'TBD', $3, TRUE)
      RETURNING *
    `, [group.id, creatorId, playerClass]);

    // Initial Solver
    const assignments = solveComposition([mem.rows[0]], activityType);
    if (!assignments) throw new Error("SOLVER_REJECTED_CREATOR");
    
    await client.query(`
      UPDATE aion2_lfg_members SET assigned_party = $1, assigned_role = $2 WHERE group_id = $3 AND discord_id = $4 AND status = 'ACTIVE'
    `, [assignments[0].assigned_party, assignments[0].assigned_role, group.id, assignments[0].discord_id]);

    return group.id;
  });
}

export async function joinGroupAtomic(groupId, discordId, expectedActivityName = null, expectedActivityMode = null) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) throw new Error("GROUP_NOT_FOUND");
    const group = groupRes.rows[0];

    // TOCTOU Validation: verify activity and mode did not change during external Shugo refresh
    if (expectedActivityName && group.activity_name !== expectedActivityName) {
      throw new Error("ACTIVITY_MISMATCH");
    }
    if (expectedActivityMode && group.activity_mode !== expectedActivityMode) {
      throw new Error("ACTIVITY_MODE_MISMATCH");
    }

    // Allowed States for Join
    if (!['RECRUITING', 'FULL_WAITING_FOR_VOICE'].includes(group.state)) {
      throw new Error("INVALID_GROUP_STATE");
    }

    // Deadlines check using DB time
    const dbTimeRes = await client.query('SELECT CURRENT_TIMESTAMP as now');
    const dbNow = dbTimeRes.rows[0].now;

    if (!group.first_full_at) {
      if (dbNow >= group.recruitment_deadline) throw new Error("RECRUITMENT_EXPIRED");
    } else {
      if (dbNow >= group.voice_start_deadline) throw new Error("VOICE_START_DEADLINE_EXPIRED");
    }

    const playerClass = await validateEligibility(client, discordId);

    // Insert Lock (Throws if user already in ANY group)
    await client.query(`INSERT INTO aion2_lfg_active_locks (discord_id, group_id) VALUES ($1, $2)`, [discordId, groupId]);

    // Insert Member occurrence
    const newMem = await client.query(`
      INSERT INTO aion2_lfg_members (group_id, discord_id, assigned_role, player_class, is_creator)
      VALUES ($1, $2, 'TBD', $3, FALSE)
      RETURNING *
    `, [groupId, discordId, playerClass]);

    // Load all active members for solver
    const mems = await client.query(`SELECT * FROM aion2_lfg_members WHERE group_id = $1 AND status = 'ACTIVE'`, [groupId]);
    
    if (mems.rowCount > getCapacity(group.activity_type)) {
      throw new Error("OVER_CAPACITY");
    }

    const assignments = solveComposition(mems.rows, group.activity_type);
    if (!assignments) throw new Error("SOLVER_REJECTED_JOIN"); // Partial Feasibility / Bad composition

    // Persist new assignments for all
    for (const a of assignments) {
      await client.query(`
        UPDATE aion2_lfg_members SET assigned_party = $1, assigned_role = $2 
        WHERE group_id = $3 AND discord_id = $4 AND status = 'ACTIVE'
      `, [a.assigned_party, a.assigned_role, groupId, a.discord_id]);
    }

    // First Full Detection (Atomic)
    let reachedFull = false;
    const capacity = getCapacity(group.activity_type);
    if (!group.first_full_at && mems.rowCount === capacity) {
      const updateRes = await client.query(`
        UPDATE aion2_lfg_groups 
        SET first_full_at = CURRENT_TIMESTAMP, 
            voice_start_deadline = CURRENT_TIMESTAMP + interval '10 minutes',
            state = 'FULL_WAITING_FOR_VOICE',
            events_render_pending = TRUE, 
            events_render_version = events_render_version + 1
        WHERE id = $1 AND first_full_at IS NULL AND state = 'RECRUITING'
      `, [groupId]);
      
      if (updateRes.rowCount === 1) {
        // Insert exact capacity notifications.
        const notifInsert = await client.query(`
          INSERT INTO aion2_lfg_notifications (group_id, discord_id, notification_type)
          SELECT group_id, discord_id, 'FIRST_FULL'
          FROM aion2_lfg_members
          WHERE group_id = $1 AND status = 'ACTIVE'
          RETURNING *
        `, [groupId]);

        if (notifInsert.rowCount !== capacity) {
          throw new Error("FIRST_FULL_SNAPSHOT_CAPACITY_MISMATCH");
        }
        reachedFull = true;
      }
    }

    return reachedFull;
  });
}

export async function leaveGroupAtomic(groupId, discordId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) throw new Error("GROUP_NOT_FOUND");
    const group = groupRes.rows[0];

    // Must be in pre-voice phases
    if (!['RECRUITING', 'FULL_WAITING_FOR_VOICE'].includes(group.state)) {
      throw new Error("INVALID_PHASE_FOR_LEAVE");
    }

    // Fetch and lock member row
    const memRes = await client.query(`SELECT * FROM aion2_lfg_members WHERE group_id = $1 AND discord_id = $2 AND status = 'ACTIVE' FOR UPDATE`, [groupId, discordId]);
    if (memRes.rowCount === 0) throw new Error("NOT_AN_ACTIVE_MEMBER");
    if (memRes.rows[0].is_creator) throw new Error("CREATOR_MUST_CLOSE");

    // Update member history safely
    await client.query(`UPDATE aion2_lfg_members SET status = 'LEFT', left_at = CURRENT_TIMESTAMP WHERE id = $1`, [memRes.rows[0].id]);
    
    // Release Active Lock
    await client.query(`DELETE FROM aion2_lfg_active_locks WHERE discord_id = $1`, [discordId]);

    // Re-run solver for remaining members
    const remMems = await client.query(`SELECT * FROM aion2_lfg_members WHERE group_id = $1 AND status = 'ACTIVE'`, [groupId]);
    if (remMems.rowCount > 0) {
      const assignments = solveComposition(remMems.rows, group.activity_type);
      // It should always be valid since leaving doesn't break partial validity
      if (assignments) {
        for (const a of assignments) {
          await client.query(`
            UPDATE aion2_lfg_members SET assigned_party = $1, assigned_role = $2 
            WHERE group_id = $3 AND discord_id = $4 AND status = 'ACTIVE'
          `, [a.assigned_party, a.assigned_role, groupId, a.discord_id]);
        }
      }
    }
  });
}

export async function closeGroupAtomic(groupId, discordId, reasonCategory, customReason = null) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) throw new Error("GROUP_NOT_FOUND");
    if (groupRes.rows[0].creator_id !== discordId) throw new Error("NOT_CREATOR");
    if (['CANCELLED', 'EXPIRED', 'COMPLETED', 'FAILED'].includes(groupRes.rows[0].state)) throw new Error("ALREADY_TERMINAL");

    const reason = customReason || reasonCategory;

    await client.query(`
      UPDATE aion2_lfg_groups 
      SET state = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = $2,
          events_render_pending = TRUE, events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId, reason]);

    await client.query(`
      UPDATE aion2_lfg_members 
      SET status = 'CANCELLED', left_at = CURRENT_TIMESTAMP 
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
  });
}

/**
 * Transitions a group's delivery status to PENDING atomically.
 * Called immediately before discord.send().
 */
export async function transitionToPending(groupId) {
  return executeTx(async (client) => {
    const res = await client.query(`
      UPDATE aion2_lfg_groups 
      SET events_delivery_status = 'PENDING', events_delivery_started_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND events_delivery_status = 'NOT_STARTED'
    `, [groupId]);
    
    if (res.rowCount !== 1) {
      throw new Error("DELIVERY_TRANSITION_FAILED");
    }
  });
}

/**
 * Atomically cancels a group and all active members due to a system error (e.g. absent message or deleted message).
 */
export async function closeGroupSystemAtomic(groupId, systemReason, expectedDeliveryStatus) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) return; // Group disappeared or invalid
    const group = groupRes.rows[0];

    if (group.events_delivery_status !== expectedDeliveryStatus) {
      // Status mutated by another concurrent operation, ignore this system close.
      return;
    }
    if (['CANCELLED', 'EXPIRED', 'COMPLETED', 'FAILED'].includes(group.state)) {
      // Already terminal
      return;
    }

    await client.query(`
      UPDATE aion2_lfg_groups 
      SET state = 'CANCELLED', 
          cancelled_at = CURRENT_TIMESTAMP, 
          cancellation_reason = $2,
          events_delivery_status = 'FAILED',
          events_message_id = NULL,
          events_render_pending = TRUE, 
          events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId, systemReason]);

    await client.query(`
      UPDATE aion2_lfg_members 
      SET status = 'CANCELLED', left_at = CURRENT_TIMESTAMP 
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
  });
}

export async function expireRecruitmentAtomic(groupId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`
      SELECT state, recruitment_deadline 
      FROM aion2_lfg_groups 
      WHERE id = $1 FOR UPDATE
    `, [groupId]);

    if (groupRes.rowCount === 0) return false;
    const group = groupRes.rows[0];

    // Must still be RECRUITING and past deadline
    if (group.state !== 'RECRUITING') return false;
    if (!group.recruitment_deadline || new Date() <= new Date(group.recruitment_deadline)) return false;

    // Transition to EXPIRED
    await client.query(`
      UPDATE aion2_lfg_groups 
      SET state = 'EXPIRED', expired_at = CURRENT_TIMESTAMP, events_render_pending = TRUE, events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId]);

    // Update active members to EXPIRED
    await client.query(`
      UPDATE aion2_lfg_members SET status = 'EXPIRED', left_at = CURRENT_TIMESTAMP 
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    // Release all locks
    await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);

    return true;
  });
}

/**
 * Atomically expires a group because the voice start deadline was reached.
 */
export async function expireVoiceStartAtomic(groupId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) return false;
    const group = groupRes.rows[0];

    // Must be in FULL_WAITING_FOR_VOICE
    if (group.state !== 'FULL_WAITING_FOR_VOICE') return false;

    // Deadline must have actually passed
    const dbNowRes = await client.query(`SELECT CURRENT_TIMESTAMP as now`);
    if (dbNowRes.rows[0].now < group.voice_start_deadline) return false;

    // Mutate state to EXPIRED
    await client.query(`
      UPDATE aion2_lfg_groups
      SET state = 'EXPIRED', expired_at = CURRENT_TIMESTAMP, events_render_pending = TRUE, events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId]);

    await client.query(`
      UPDATE aion2_lfg_members
      SET status = 'EXPIRED', left_at = CURRENT_TIMESTAMP
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);

    // Issue Warning DM to Creator
    await client.query(`
      INSERT INTO aion2_lfg_notifications (group_id, discord_id, notification_type)
      VALUES ($1, $2, 'VOICE_START_EXPIRED_CREATOR')
      ON CONFLICT (group_id, discord_id, notification_type) DO NOTHING
    `, [groupId, group.creator_id]);

    return true;
  });
}

function generateVoiceIdentityToken() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let token = 'v';
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export async function startVoiceAtomic(groupId, expectedMemberIds, capacity) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) throw new Error("GROUP_NOT_FOUND");
    const group = groupRes.rows[0];

    if (group.state !== 'FULL_WAITING_FOR_VOICE') throw new Error("INVALID_GROUP_STATE");
    if (group.voice_start_deadline && new Date() > new Date(group.voice_start_deadline)) throw new Error("VOICE_START_DEADLINE_EXPIRED");
    if (group.voice_delivery_status !== 'NOT_STARTED') throw new Error("VOICE_ALREADY_STARTED");
    if (group.voice_channel_id) throw new Error("VOICE_CHANNEL_ALREADY_EXISTS");

    const memRes = await client.query(`SELECT discord_id FROM aion2_lfg_members WHERE group_id = $1 AND status = 'ACTIVE' ORDER BY discord_id`, [groupId]);
    const currentMemberIds = memRes.rows.map(r => r.discord_id);
    
    if (currentMemberIds.length !== capacity) throw new Error("GROUP_NOT_FULL");
    
    const expectedSorted = [...expectedMemberIds].sort();
    const currentSorted = [...currentMemberIds].sort();
    if (JSON.stringify(expectedSorted) !== JSON.stringify(currentSorted)) {
      throw new Error("LINEUP_CHANGED");
    }

    const token = generateVoiceIdentityToken();

    await client.query(`
      UPDATE aion2_lfg_groups
      SET state = 'VOICE_CREATING',
          voice_delivery_status = 'PENDING',
          voice_delivery_started_at = CURRENT_TIMESTAMP,
          voice_creation_recovery_deadline = CURRENT_TIMESTAMP + INTERVAL '15 minutes',
          voice_identity_token = $2,
          events_render_pending = TRUE,
          events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId, token]);

    await client.query(`
      UPDATE aion2_lfg_members
      SET is_official_lineup = TRUE
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    return token;
  });
}

export async function linkVoiceAtomic(groupId, token, channelId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 AND voice_identity_token = $2 FOR UPDATE`, [groupId, token]);
    if (groupRes.rowCount === 0) return false;
    const group = groupRes.rows[0];

    if (group.state !== 'VOICE_CREATING' || group.voice_delivery_status !== 'PENDING' || group.voice_channel_id !== null) {
      return false; // Already linked or aborted
    }

    await client.query(`
      UPDATE aion2_lfg_groups
      SET state = 'VOICE_ENTRY',
          voice_delivery_status = 'LINKED',
          voice_channel_id = $2,
          voice_entry_deadline = CURRENT_TIMESTAMP + INTERVAL '10 minutes',
          events_render_pending = TRUE,
          events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId, channelId]);

    return true;
  });
}

export async function resetVoiceCreationAtomic(groupId, token) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 AND voice_identity_token = $2 FOR UPDATE`, [groupId, token]);
    if (groupRes.rowCount === 0) return false;
    const group = groupRes.rows[0];

    if (group.state !== 'VOICE_CREATING' || group.voice_delivery_status !== 'PENDING' || group.voice_channel_id !== null) {
      return false;
    }
    
    if (group.voice_start_deadline && new Date() > new Date(group.voice_start_deadline)) {
      // Original deadline already passed during creation. Expire it directly.
      await client.query(`
        UPDATE aion2_lfg_groups
        SET state = 'EXPIRED', expired_at = CURRENT_TIMESTAMP, 
            voice_delivery_status = 'NOT_STARTED', voice_delivery_started_at = NULL, voice_creation_recovery_deadline = NULL, voice_identity_token = NULL,
            events_render_pending = TRUE, events_render_version = events_render_version + 1
        WHERE id = $1
      `, [groupId]);
      
      await client.query(`UPDATE aion2_lfg_members SET status = 'EXPIRED', left_at = CURRENT_TIMESTAMP, is_official_lineup = FALSE WHERE group_id = $1 AND status = 'ACTIVE'`, [groupId]);
      await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
      return 'EXPIRED';
    }

    // Safe reset back to waiting
    await client.query(`
      UPDATE aion2_lfg_groups
      SET state = 'FULL_WAITING_FOR_VOICE',
          voice_delivery_status = 'NOT_STARTED',
          voice_delivery_started_at = NULL,
          voice_creation_recovery_deadline = NULL,
          voice_identity_token = NULL,
          events_render_pending = TRUE,
          events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId]);

    await client.query(`
      UPDATE aion2_lfg_members
      SET is_official_lineup = FALSE
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    return 'RESET';
  });
}

// ==========================================
// STAGE B3.3: VOICE ATTENDANCE & LIFECYCLE
// ==========================================

export async function openVoiceSessionAtomic(groupId, discordId) {
  return executeTx(async (client) => {
    // 1. Verify group state and member eligibility
    const groupRes = await client.query(`
      SELECT state, activity_type, voice_delivery_status, voice_deleted_at, voice_entry_deadline, empty_voice_deadline, low_voice_deadline 
      FROM aion2_lfg_groups 
      WHERE id = $1 FOR UPDATE
    `, [groupId]);
    
    if (groupRes.rowCount === 0) return false;
    const group = groupRes.rows[0];
    
    if (!['VOICE_ENTRY', 'ACTIVE'].includes(group.state) || 
        group.voice_delivery_status !== 'LINKED' || 
        group.voice_deleted_at !== null) {
      return false;
    }

    const memberRes = await client.query(`
      SELECT 1 FROM aion2_lfg_members 
      WHERE group_id = $1 AND discord_id = $2 
      AND status = 'ACTIVE' AND is_official_lineup = TRUE
    `, [groupId, discordId]);
    
    if (memberRes.rowCount === 0) return false;

    // 2. Mark member as in voice
    await client.query(`
      UPDATE aion2_lfg_members
      SET is_in_voice = TRUE
      WHERE group_id = $1 AND discord_id = $2
    `, [groupId, discordId]);

    // 3. Handle First Entry & ALL_ENTERED transition if it's VOICE_ENTRY
    if (group.state === 'VOICE_ENTRY') {
      const insertRes = await client.query(`
        INSERT INTO aion2_lfg_voice_sessions (group_id, discord_id, joined_at, last_heartbeat_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (group_id, discord_id) WHERE left_at IS NULL
        DO NOTHING
        RETURNING id, joined_at
      `, [groupId, discordId]);

      // Record first entry
      await client.query(`
        UPDATE aion2_lfg_members
        SET first_voice_entered_at = CURRENT_TIMESTAMP
        WHERE group_id = $1 AND discord_id = $2 AND first_voice_entered_at IS NULL
      `, [groupId, discordId]);
      
      const capacity = getCapacity(group.activity_type);
      
      const countRes = await client.query(`
        SELECT COUNT(*) as c FROM aion2_lfg_members
        WHERE group_id = $1 AND is_official_lineup = TRUE AND first_voice_entered_at IS NOT NULL
      `, [groupId]);
      
      const enteredCount = parseInt(countRes.rows[0].c, 10);
      console.log(`[ALL_ENTERED Check] Group: ${groupId}, Count: ${enteredCount}, Capacity: ${capacity}, Activity Type: ${group.activity_type}`);
      
      if (enteredCount >= capacity) {
        await client.query(`
          UPDATE aion2_lfg_groups
          SET state = 'ACTIVE',
              all_entered_at = CURRENT_TIMESTAMP,
              activity_deadline = CURRENT_TIMESTAMP + interval '80 minutes',
              voice_entry_deadline = NULL,
              empty_voice_deadline = NULL,
              low_voice_deadline = NULL,
              events_render_pending = TRUE,
              events_render_version = events_render_version + 1
          WHERE id = $1
        `, [groupId]);
      }
      return true;
    }

    // 4. Handle ACTIVE state
    if (group.state === 'ACTIVE') {
      // Clear 0-member deadline since someone joined voice
      if (group.empty_voice_deadline !== null) {
        await client.query(`
          UPDATE aion2_lfg_groups
          SET empty_voice_deadline = NULL
          WHERE id = $1
        `, [groupId]);
      }

      if (group.activity_type === 'DUNGEON') {
        const countRes = await client.query(`
          SELECT discord_id FROM aion2_lfg_members
          WHERE group_id = $1 AND is_official_lineup = TRUE AND is_in_voice = TRUE
        `, [groupId]);
        const voiceCount = countRes.rowCount;

        if (voiceCount >= 4) {
          // Quorum satisfied: clear low_voice_deadline
          if (group.low_voice_deadline !== null) {
            await client.query(`
              UPDATE aion2_lfg_groups
              SET low_voice_deadline = NULL
              WHERE id = $1
            `, [groupId]);
          }

          // Open/reopen attendance session for all official members currently in voice
          for (const row of countRes.rows) {
            await client.query(`
              INSERT INTO aion2_lfg_voice_sessions (group_id, discord_id, joined_at, last_heartbeat_at)
              VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT (group_id, discord_id) WHERE left_at IS NULL
              DO NOTHING
            `, [groupId, row.discord_id]);
          }
          return true;
        } else {
          // voiceCount is 1, 2, or 3. Attendance remains paused for everyone.
          // Start low_voice_deadline (20m) if not already set
          if (group.low_voice_deadline === null) {
            await client.query(`
              UPDATE aion2_lfg_groups
              SET low_voice_deadline = CURRENT_TIMESTAMP + interval '20 minutes'
              WHERE id = $1
            `, [groupId]);
          }
          return true;
        }
      } else {
        // Non-DUNGEON activities (Sanctuary / Abyss)
        const insertRes = await client.query(`
          INSERT INTO aion2_lfg_voice_sessions (group_id, discord_id, joined_at, last_heartbeat_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (group_id, discord_id) WHERE left_at IS NULL
          DO NOTHING
          RETURNING id, joined_at
        `, [groupId, discordId]);
        return insertRes.rowCount > 0;
      }
    }
    
    return true;
  });
}

export async function closeVoiceSessionAtomic(groupId, discordId, isNormalLeave) {
  return executeTx(async (client) => {
    // 1. Mark member as no longer in voice
    await client.query(`
      UPDATE aion2_lfg_members
      SET is_in_voice = FALSE
      WHERE group_id = $1 AND discord_id = $2
    `, [groupId, discordId]);

    // 2. If this member had an open session, close it and record cumulative seconds
    let closedQuery;
    if (isNormalLeave) {
      closedQuery = await client.query(`
        WITH closed_session AS (
          UPDATE aion2_lfg_voice_sessions
          SET left_at = CURRENT_TIMESTAMP
          WHERE group_id = $1 AND discord_id = $2 AND left_at IS NULL
          RETURNING joined_at, left_at
        )
        UPDATE aion2_lfg_members
        SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
        FROM closed_session
        WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = $2
        RETURNING aion2_lfg_members.cumulative_voice_seconds
      `, [groupId, discordId]);
    } else {
      // Safe Cutoff for Restart/Crash/Manual Delete
      closedQuery = await client.query(`
        WITH closed_session AS (
          UPDATE aion2_lfg_voice_sessions
          SET left_at = COALESCE(last_heartbeat_at, joined_at)
          WHERE group_id = $1 AND discord_id = $2 AND left_at IS NULL
          RETURNING joined_at, left_at
        )
        UPDATE aion2_lfg_members
        SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
        FROM closed_session
        WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = $2
        RETURNING aion2_lfg_members.cumulative_voice_seconds
      `, [groupId, discordId]);
    }

    // 3. Lock group to inspect state & count remaining official members
    const groupRes = await client.query(`
      SELECT state, activity_type, empty_voice_deadline, low_voice_deadline, termination_source, voice_deleted_at 
      FROM aion2_lfg_groups 
      WHERE id = $1 FOR UPDATE
    `, [groupId]);

    if (groupRes.rowCount > 0 && groupRes.rows[0].state === 'ACTIVE' && groupRes.rows[0].termination_source === null && groupRes.rows[0].voice_deleted_at === null) {
      const group = groupRes.rows[0];
      const countRes = await client.query(`
        SELECT COUNT(*)::INT as count
        FROM aion2_lfg_members
        WHERE group_id = $1 AND is_official_lineup = TRUE AND is_in_voice = TRUE
      `, [groupId]);
      const voiceCount = countRes.rows[0].count;

      // Rule E: Zero members -> start 10m empty_voice_deadline
      if (voiceCount === 0 && group.empty_voice_deadline === null) {
        await client.query(`
          UPDATE aion2_lfg_groups
          SET empty_voice_deadline = CURRENT_TIMESTAMP + interval '10 minutes'
          WHERE id = $1
        `, [groupId]);
      }

      // Rule B: For DUNGEON, if voiceCount <= 3, pause attendance for everyone & start 20m timer
      if (group.activity_type === 'DUNGEON') {
        if (voiceCount <= 3) {
          // Pause attendance: safely close all remaining open attendance sessions
          await client.query(`
            WITH closed_sessions AS (
              UPDATE aion2_lfg_voice_sessions
              SET left_at = CURRENT_TIMESTAMP
              WHERE group_id = $1 AND left_at IS NULL
              RETURNING discord_id, joined_at, left_at
            )
            UPDATE aion2_lfg_members
            SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_sessions.left_at - closed_sessions.joined_at)))
            FROM closed_sessions
            WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = closed_sessions.discord_id
          `, [groupId]);

          // Start 20-minute low_voice_deadline if not already set
          if (group.low_voice_deadline === null) {
            await client.query(`
              UPDATE aion2_lfg_groups
              SET low_voice_deadline = CURRENT_TIMESTAMP + interval '20 minutes'
              WHERE id = $1
            `, [groupId]);
          }
        }
      }
    }
    
    return closedQuery.rowCount > 0 ? closedQuery.rows[0].cumulative_voice_seconds : null;
  });
}

export async function processEmptyVoiceTimeoutAtomic(groupId, discordClient = null) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`
      SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE
    `, [groupId]);
    if (groupRes.rowCount === 0) return null;
    const group = groupRes.rows[0];

    // Must be ACTIVE and past empty_voice_deadline
    if (group.state !== 'ACTIVE' || !group.empty_voice_deadline || new Date() < new Date(group.empty_voice_deadline)) {
      return null;
    }

    // Race Safety Check 1: Are there any open voice sessions for official lineup in DB?
    const activeOfficialRes = await client.query(`
      SELECT COUNT(*)::INT as count
      FROM aion2_lfg_voice_sessions vs
      JOIN aion2_lfg_members m ON vs.group_id = m.group_id AND vs.discord_id = m.discord_id
      WHERE vs.group_id = $1 AND vs.left_at IS NULL AND m.is_official_lineup = TRUE
    `, [groupId]);

    if (activeOfficialRes.rows[0].count > 0) {
      // Official member is present in DB session! Cancel deadline, do not fail.
      await client.query(`
        UPDATE aion2_lfg_groups
        SET empty_voice_deadline = NULL
        WHERE id = $1
      `, [groupId]);
      return null;
    }

    // Race Safety Check 2: If Discord client is provided and channel exists, check live voice presence
    if (discordClient && group.voice_channel_id) {
      try {
        const channel = discordClient.channels?.cache?.get(group.voice_channel_id) || await discordClient.channels?.fetch(group.voice_channel_id).catch(() => null);
        if (channel && channel.type === 2 && channel.members.size > 0) {
          const lineupRes = await client.query(`
            SELECT discord_id FROM aion2_lfg_members WHERE group_id = $1 AND is_official_lineup = TRUE
          `, [groupId]);
          const lineupIds = new Set(lineupRes.rows.map(r => r.discord_id));
          const hasOfficialInVoice = channel.members.some(m => lineupIds.has(m.id));
          if (hasOfficialInVoice) {
            // Someone returned to voice in Discord right before the deadline!
            await client.query(`
              UPDATE aion2_lfg_groups
              SET empty_voice_deadline = NULL
              WHERE id = $1
            `, [groupId]);
            return null;
          }
        }
      } catch (e) {}
    }

    // 10 minutes continuous empty confirmed: Fail the group cleanly
    await client.query(`
      UPDATE aion2_lfg_groups
      SET state = 'FAILED',
          failed_at = CURRENT_TIMESTAMP,
          cancellation_reason = 'EMPTY_VOICE_TIMEOUT',
          events_render_pending = TRUE,
          events_render_version = events_render_version + 1,
          voice_channel_deletion_pending = TRUE
      WHERE id = $1
    `, [groupId]);

    await client.query(`
      UPDATE aion2_lfg_members
      SET status = 'FAILED',
          left_at = COALESCE(left_at, CURRENT_TIMESTAMP)
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);

    // Close any open voice attendance sessions cleanly with Safe Cutoff
    await client.query(`
      WITH closed_session AS (
        UPDATE aion2_lfg_voice_sessions
        SET left_at = COALESCE(last_heartbeat_at, joined_at)
        WHERE group_id = $1 AND left_at IS NULL
        RETURNING discord_id, joined_at, left_at
      )
      UPDATE aion2_lfg_members
      SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
      FROM closed_session
      WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = closed_session.discord_id
    `, [groupId]);

    return group.voice_channel_id;
  });
}

export async function processLowVoiceTimeoutAtomic(groupId, discordClient = null) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`
      SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE
    `, [groupId]);
    if (groupRes.rowCount === 0) return null;
    const group = groupRes.rows[0];

    // Must be ACTIVE, DUNGEON, and past low_voice_deadline
    if (group.state !== 'ACTIVE' || group.activity_type !== 'DUNGEON' || !group.low_voice_deadline || new Date() < new Date(group.low_voice_deadline)) {
      return null;
    }

    // Race Safety Check 1: Check DB voice presence
    const activeOfficialRes = await client.query(`
      SELECT COUNT(*)::INT as count
      FROM aion2_lfg_members
      WHERE group_id = $1 AND is_official_lineup = TRUE AND (is_in_voice = TRUE OR EXISTS (SELECT 1 FROM aion2_lfg_voice_sessions vs WHERE vs.group_id = aion2_lfg_members.group_id AND vs.discord_id = aion2_lfg_members.discord_id AND vs.left_at IS NULL))
    `, [groupId]);

    if (activeOfficialRes.rows[0].count >= 4) {
      // Quorum returned! Clear low_voice_deadline, do not fail.
      await client.query(`
        UPDATE aion2_lfg_groups
        SET low_voice_deadline = NULL
        WHERE id = $1
      `, [groupId]);
      return null;
    }

    // Race Safety Check 2: Check Discord channel live members if client provided
    if (discordClient && group.voice_channel_id) {
      try {
        const channel = discordClient.channels?.cache?.get(group.voice_channel_id) || await discordClient.channels?.fetch(group.voice_channel_id).catch(() => null);
        if (channel && channel.type === 2) {
          const lineupRes = await client.query(`
            SELECT discord_id FROM aion2_lfg_members WHERE group_id = $1 AND is_official_lineup = TRUE
          `, [groupId]);
          const lineupIds = new Set(lineupRes.rows.map(r => r.discord_id));
          const countInVoice = channel.members.filter(m => lineupIds.has(m.id)).size;
          if (countInVoice >= 4) {
            // Returned in Discord! Clear low_voice_deadline, do not fail.
            await client.query(`
              UPDATE aion2_lfg_groups
              SET low_voice_deadline = NULL
              WHERE id = $1
            `, [groupId]);
            return null;
          }
        }
      } catch (e) {}
    }

    // Genuinely below quorum for 20 continuous minutes: Fail the group cleanly
    await client.query(`
      UPDATE aion2_lfg_groups
      SET state = 'FAILED',
          failed_at = CURRENT_TIMESTAMP,
          cancellation_reason = 'LOW_VOICE_TIMEOUT',
          events_render_pending = TRUE,
          events_render_version = events_render_version + 1,
          voice_channel_deletion_pending = TRUE
      WHERE id = $1
    `, [groupId]);

    await client.query(`
      UPDATE aion2_lfg_members
      SET status = 'FAILED',
          left_at = COALESCE(left_at, CURRENT_TIMESTAMP)
      WHERE group_id = $1 AND status = 'ACTIVE'
    `, [groupId]);

    await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);

    // Close any remaining voice sessions with Safe Cutoff
    await client.query(`
      WITH closed_session AS (
        UPDATE aion2_lfg_voice_sessions
        SET left_at = COALESCE(last_heartbeat_at, joined_at)
        WHERE group_id = $1 AND left_at IS NULL
        RETURNING discord_id, joined_at, left_at
      )
      UPDATE aion2_lfg_members
      SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
      FROM closed_session
      WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = closed_session.discord_id
    `, [groupId]);

    return group.voice_channel_id;
  });
}

export async function processVoiceEntryTimeoutAtomic(groupId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`
      SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE
    `, [groupId]);
    if (groupRes.rowCount === 0) return null;
    const group = groupRes.rows[0];
    
    if (group.state === 'VOICE_ENTRY' && new Date() >= new Date(group.voice_entry_deadline)) {
      // Safety check: if players are in voice, do NOT delete the room! Transition to ACTIVE!
      const inVoiceRes = await client.query(`
        SELECT COUNT(*) as c FROM aion2_lfg_members
        WHERE group_id = $1 AND is_official_lineup = TRUE AND is_in_voice = TRUE
      `, [groupId]);
      const openSessionsRes = await client.query(`
        SELECT COUNT(*) as c FROM aion2_lfg_voice_sessions
        WHERE group_id = $1 AND left_at IS NULL
      `, [groupId]);
      const activeVoiceCount = parseInt(inVoiceRes.rows[0].c, 10);
      const activeSessionCount = parseInt(openSessionsRes.rows[0].c, 10);

      if (activeVoiceCount > 0 || activeSessionCount > 0) {
        console.log(`[Safety Guard] Group ${groupId} has ${activeVoiceCount} active voice members and ${activeSessionCount} open sessions. Transitioning to ACTIVE instead of deleting!`);
        await client.query(`
          UPDATE aion2_lfg_groups
          SET state = 'ACTIVE',
              all_entered_at = CURRENT_TIMESTAMP,
              voice_entry_deadline = NULL,
              empty_voice_deadline = NULL,
              low_voice_deadline = NULL,
              events_render_pending = TRUE,
              events_render_version = events_render_version + 1
          WHERE id = $1
        `, [groupId]);
        return null;
      }

      await client.query(`
        UPDATE aion2_lfg_groups
        SET state = 'EXPIRED',
            expired_at = CURRENT_TIMESTAMP,
            events_render_pending = TRUE,
            events_render_version = events_render_version + 1,
            voice_channel_deletion_pending = TRUE
        WHERE id = $1
      `, [groupId]);
      
      await client.query(`
        UPDATE aion2_lfg_members
        SET status = 'EXPIRED', left_at = CURRENT_TIMESTAMP, is_official_lineup = FALSE
        WHERE group_id = $1 AND status = 'ACTIVE'
      `, [groupId]);
      
      await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
      
      // Close open sessions with Safe Cutoff
      await client.query(`
        WITH closed_session AS (
          UPDATE aion2_lfg_voice_sessions
          SET left_at = COALESCE(last_heartbeat_at, joined_at)
          WHERE group_id = $1 AND left_at IS NULL
          RETURNING discord_id, joined_at, left_at
        )
        UPDATE aion2_lfg_members
        SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
        FROM closed_session
        WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = closed_session.discord_id
      `, [groupId]);
      
      return group.voice_channel_id; // Return for Discord API deletion attempt
    }
    return null;
  });
}

export async function processManualChannelDeleteAtomic(groupId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT * FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) return false;
    const group = groupRes.rows[0];
    
    if (group.state === 'VOICE_ENTRY') {
      await client.query(`
        UPDATE aion2_lfg_groups
        SET state = 'EXPIRED', expired_at = CURRENT_TIMESTAMP,
            voice_deleted_at = CURRENT_TIMESTAMP, voice_delete_reason = 'MANUAL_DELETION_DURING_ENTRY',
            voice_channel_deletion_pending = FALSE,
            events_render_pending = TRUE, events_render_version = events_render_version + 1
        WHERE id = $1
      `, [groupId]);
      
      await client.query(`
        UPDATE aion2_lfg_members SET status = 'EXPIRED', left_at = CURRENT_TIMESTAMP, is_official_lineup = FALSE WHERE group_id = $1 AND status = 'ACTIVE'
      `, [groupId]);
      await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
      
    } else if (group.state === 'ACTIVE') {
      // Keep ACTIVE, close sessions, disable new ones
      await client.query(`
        UPDATE aion2_lfg_groups
        SET voice_deleted_at = CURRENT_TIMESTAMP, voice_delete_reason = 'MANUAL_DELETION_DURING_ACTIVE',
            voice_channel_deletion_pending = FALSE,
            events_render_pending = TRUE, events_render_version = events_render_version + 1
        WHERE id = $1
      `, [groupId]);
    } else {
      return false;
    }
    
    // Close sessions safely
    await client.query(`
      WITH closed_session AS (
        UPDATE aion2_lfg_voice_sessions SET left_at = COALESCE(last_heartbeat_at, joined_at)
        WHERE group_id = $1 AND left_at IS NULL RETURNING discord_id, joined_at, left_at
      )
      UPDATE aion2_lfg_members
      SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
      FROM closed_session WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = closed_session.discord_id
    `, [groupId]);
    
    return true;
  });
}

export async function heartbeatVoiceSessionsAtomic(sessionsToUpdate) {
  if (sessionsToUpdate.length === 0) return;
  return executeTx(async (client) => {
    // Batch update last_heartbeat_at
    const values = sessionsToUpdate.map(s => `(${s.groupId}, '${s.discordId}')`).join(', ');
    await client.query(`
      UPDATE aion2_lfg_voice_sessions AS v
      SET last_heartbeat_at = CURRENT_TIMESTAMP
      FROM (VALUES ${values}) AS t(group_id, discord_id)
      WHERE v.group_id = t.group_id AND v.discord_id = t.discord_id AND v.left_at IS NULL
    `);
  });
}

export async function getOpenVoiceSessions() {
  const res = await pool.query(`
    SELECT v.group_id, v.discord_id, g.voice_channel_id, g.state, v.last_heartbeat_at, v.joined_at
    FROM aion2_lfg_voice_sessions v
    JOIN aion2_lfg_groups g ON v.group_id = g.id
    WHERE v.left_at IS NULL
  `);
  return res.rows;
}

export async function getPendingVoiceChannelDeletions() {
  const res = await pool.query(`
    SELECT id, voice_channel_id, state, cancellation_reason, voice_delete_reason, termination_source 
    FROM aion2_lfg_groups 
    WHERE voice_channel_deletion_pending = TRUE
  `);
  return res.rows;
}

export async function markVoiceChannelDeletedAtomic(groupId, reason) {
  return executeTx(async (client) => {
    await client.query(`
      UPDATE aion2_lfg_groups
      SET voice_channel_deletion_pending = FALSE,
          voice_deleted_at = CURRENT_TIMESTAMP,
          voice_delete_reason = $2
      WHERE id = $1
    `, [groupId, reason]);
  });
}

// ==========================================
// B3.4 COMPLETION VOTING
// ==========================================

export async function requestActivityTerminationAtomic(groupId, source, requesterId = null) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`
      SELECT id, state, creator_id, activity_type, termination_source, voice_channel_id, voice_deleted_at, activity_deadline 
      FROM aion2_lfg_groups 
      WHERE id = $1 FOR UPDATE
    `, [groupId]);
    if (groupRes.rowCount === 0) return { error: 'NOT_FOUND' };
    const group = groupRes.rows[0];

    if (group.state !== 'ACTIVE') return { error: 'NOT_ACTIVE' };

    // Idempotency check: if termination is already requested, return success safely
    if (group.termination_source !== null) {
      return { success: true, alreadyPending: true, group };
    }

    // Role & Quorum checks based on source
    if (source === 'CREATOR') {
      if (group.creator_id !== requesterId) return { error: 'NOT_CREATOR' };

      const memberRes = await client.query(`
        SELECT 1 FROM aion2_lfg_members 
        WHERE group_id = $1 AND discord_id = $2 AND is_official_lineup = TRUE
      `, [groupId, requesterId]);
      if (memberRes.rowCount === 0) return { error: 'NOT_OFFICIAL' };

      const lineupRes = await client.query(`
        SELECT count(*) as count FROM aion2_lfg_members 
        WHERE group_id = $1 AND is_official_lineup = TRUE
      `, [groupId]);
      const count = parseInt(lineupRes.rows[0].count, 10);
      const expectedCapacity = getCapacity(group.activity_type);
      if (count !== expectedCapacity) return { error: 'CAPACITY_MISMATCH' };

      if (group.activity_type === 'DUNGEON') {
        const voicePresRes = await client.query(`
          SELECT COUNT(*)::INT as count FROM aion2_lfg_members
          WHERE group_id = $1 AND is_official_lineup = TRUE 
          AND (is_in_voice = TRUE OR EXISTS (SELECT 1 FROM aion2_lfg_voice_sessions vs WHERE vs.group_id = aion2_lfg_members.group_id AND vs.discord_id = aion2_lfg_members.discord_id AND vs.left_at IS NULL))
        `, [groupId]);
        if (voicePresRes.rows[0].count < 4) {
          return { error: 'INSUFFICIENT_VOICE_QUORUM' };
        }
      }
    } else if (source === 'MAX_DURATION') {
      const dbNowRes = await client.query(`SELECT CURRENT_TIMESTAMP as now`);
      const now = dbNowRes.rows[0].now;
      if (!group.activity_deadline || new Date(now) < new Date(group.activity_deadline)) {
        return { error: 'MAX_DURATION_NOT_REACHED' };
      }
    }

    const deleteReason = source === 'CREATOR' ? 'MANUAL_TERMINATION_BY_CREATOR' :
                         source === 'FALLBACK' ? 'MANUAL_TERMINATION_FALLBACK' :
                         'MAX_DURATION_EXPIRED';

    const resolution = source === 'CREATOR' ? 'CONSUMED_BY_CREATOR' :
                       source === 'FALLBACK' ? 'CONFIRMED' :
                       'EXPIRED_BY_MAX_DURATION';

    await client.query(`
      UPDATE aion2_lfg_groups
      SET termination_source = $2,
          voice_channel_deletion_pending = TRUE,
          voice_delete_reason = $3,
          empty_voice_deadline = NULL,
          low_voice_deadline = NULL
      WHERE id = $1
    `, [groupId, source, deleteReason]);

    // Resolve any pending vote requests atomically
    await client.query(`
      UPDATE aion2_lfg_vote_requests
      SET resolved_at = CURRENT_TIMESTAMP, resolution = $2
      WHERE group_id = $1 AND resolved_at IS NULL
    `, [groupId, resolution]);

    // Safely close active voice sessions at the EXACT activity-end boundary
    await client.query(`
      WITH closed_session AS (
        UPDATE aion2_lfg_voice_sessions SET left_at = CURRENT_TIMESTAMP
        WHERE group_id = $1 AND left_at IS NULL RETURNING discord_id, joined_at, left_at
      )
      UPDATE aion2_lfg_members
      SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
      FROM closed_session WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = closed_session.discord_id
    `, [groupId]);

    return { success: true, group };
  });
}

export async function finalizeTerminationAndStartVoteAtomic(groupId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`
      SELECT id, state, termination_source FROM aion2_lfg_groups 
      WHERE id = $1 FOR UPDATE
    `, [groupId]);
    if (groupRes.rowCount === 0) return false;
    const group = groupRes.rows[0];

    // Must still be ACTIVE and have termination_source set
    if (group.state !== 'ACTIVE' || !group.termination_source) {
      return false;
    }

    await client.query(`
      UPDATE aion2_lfg_groups
      SET state = 'AWAITING_VOTE',
          voice_channel_deletion_pending = FALSE,
          voice_deleted_at = COALESCE(voice_deleted_at, CURRENT_TIMESTAMP),
          vote_started_at = CURRENT_TIMESTAMP,
          vote_deadline = CURRENT_TIMESTAMP + INTERVAL '10 minutes',
          events_render_pending = TRUE,
          events_render_version = events_render_version + 1
      WHERE id = $1
    `, [groupId]);

    // Insert VOTE_DM notifications
    await client.query(`
      INSERT INTO aion2_lfg_notifications (group_id, discord_id, notification_type)
      SELECT group_id, discord_id, 'VOTE_DM' FROM aion2_lfg_members
      WHERE group_id = $1 AND is_official_lineup = TRUE
      ON CONFLICT DO NOTHING
    `, [groupId]);

    return true;
  });
}

export async function executeTerminationFlow(groupId, discordClient = null) {
  const res = await pool.query(`
    SELECT id, state, voice_channel_id, voice_deleted_at, termination_source 
    FROM aion2_lfg_groups 
    WHERE id = $1
  `, [groupId]);
  if (res.rowCount === 0) return { success: false, error: 'NOT_FOUND' };
  const group = res.rows[0];

  if (group.state !== 'ACTIVE' || !group.termination_source) {
    return { success: false, error: 'NOT_TERMINATING_ACTIVE' };
  }

  // If voice channel exists and not yet recorded as deleted, delete it in Discord FIRST
  if (group.voice_channel_id && !group.voice_deleted_at) {
    let deleted = false;
    if (discordClient) {
      try {
        let channel = discordClient.channels?.cache?.get(group.voice_channel_id);
        if (!channel) {
          channel = await discordClient.channels?.fetch(group.voice_channel_id).catch(e => {
            if (e.code === 10003) return null; // Unknown Channel -> already deleted
            throw e;
          });
        }
        if (channel && channel.type === 2) {
          await channel.delete(`LFG Activity Terminated: ${group.termination_source}`);
        }
        deleted = true;
      } catch (err) {
        if (err.code === 10003) {
          deleted = true;
        } else {
          console.error(`[LFG Termination] Failed to delete Discord channel ${group.voice_channel_id} for group ${groupId}:`, err);
          // Transient failure (rate limit / 5xx) -> DO NOT start vote!
          return { success: false, retryPending: true };
        }
      }
    } else {
      // If no discordClient provided, defer deletion to durable worker
      return { success: false, retryPending: true };
    }

    if (!deleted) {
      return { success: false, retryPending: true };
    }
  }

  // Deletion is confirmed or was already missing/deleted -> finalize vote transition
  const finalized = await finalizeTerminationAndStartVoteAtomic(groupId);
  if (finalized) {
    try {
      const { updateEventsCard } = await import('../eventsCard.js');
      await updateEventsCard(groupId).catch(() => {});
    } catch(e) {}
    return { success: true, voteStarted: true };
  }

  return { success: true, alreadyFinalized: true };
}

export async function startCompletionVoteAtomic(groupId, requesterId) {
  return requestActivityTerminationAtomic(groupId, 'CREATOR', requesterId);
}

export async function requestFallbackVoteAtomic(groupId, requesterId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT state, creator_id, activity_type FROM aion2_lfg_groups WHERE id = $1 FOR SHARE`, [groupId]);
    if (groupRes.rowCount === 0) return { error: 'NOT_FOUND' };
    if (groupRes.rows[0].state !== 'ACTIVE') return { error: 'NOT_ACTIVE' };
    if (groupRes.rows[0].creator_id === requesterId) return { error: 'USE_CREATOR_PATH' };

    const memberRes = await client.query(`SELECT 1 FROM aion2_lfg_members WHERE group_id = $1 AND discord_id = $2 AND is_official_lineup = TRUE`, [groupId, requesterId]);
    if (memberRes.rowCount === 0) return { error: 'NOT_OFFICIAL' };

    if (groupRes.rows[0].activity_type === 'DUNGEON') {
      const voicePresRes = await client.query(`
        SELECT COUNT(*)::INT as count FROM aion2_lfg_members
        WHERE group_id = $1 AND is_official_lineup = TRUE 
        AND (is_in_voice = TRUE OR EXISTS (SELECT 1 FROM aion2_lfg_voice_sessions vs WHERE vs.group_id = aion2_lfg_members.group_id AND vs.discord_id = aion2_lfg_members.discord_id AND vs.left_at IS NULL))
      `, [groupId]);
      if (voicePresRes.rows[0].count < 4) {
        return { error: 'INSUFFICIENT_VOICE_QUORUM' };
      }
    }

    const existingRes = await client.query(`
      SELECT id, (expires_at <= CURRENT_TIMESTAMP) as is_expired 
      FROM aion2_lfg_vote_requests 
      WHERE group_id = $1 AND resolved_at IS NULL FOR UPDATE
    `, [groupId]);

    if (existingRes.rowCount > 0) {
      if (existingRes.rows[0].is_expired) {
        await client.query(`UPDATE aion2_lfg_vote_requests SET resolved_at = CURRENT_TIMESTAMP, resolution = 'EXPIRED' WHERE id = $1`, [existingRes.rows[0].id]);
      } else {
        return { error: 'REQUEST_ALREADY_EXISTS' };
      }
    }

    try {
      await client.query(`
        INSERT INTO aion2_lfg_vote_requests (group_id, requester_id, requested_at, expires_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 minutes')
      `, [groupId, requesterId]);
      return { success: true };
    } catch(e) {
      if (e.code === '23505') return { error: 'REQUEST_ALREADY_EXISTS' }; // Constraint collision
      throw e;
    }
  });
}

export async function confirmFallbackVoteAtomic(groupId, confirmerId) {
  return executeTx(async (client) => {
    const groupRes = await client.query(`SELECT state, activity_type FROM aion2_lfg_groups WHERE id = $1 FOR UPDATE`, [groupId]);
    if (groupRes.rowCount === 0) return { error: 'NOT_FOUND' };
    if (groupRes.rows[0].state !== 'ACTIVE') return { error: 'NOT_ACTIVE' };

    const reqRes = await client.query(`
      SELECT id, requester_id, (expires_at <= CURRENT_TIMESTAMP) as is_expired 
      FROM aion2_lfg_vote_requests 
      WHERE group_id = $1 AND resolved_at IS NULL FOR UPDATE
    `, [groupId]);
    
    if (reqRes.rowCount === 0) return { error: 'NO_PENDING_REQUEST' };

    const request = reqRes.rows[0];
    if (request.is_expired) {
      await client.query(`UPDATE aion2_lfg_vote_requests SET resolved_at = CURRENT_TIMESTAMP, resolution = 'EXPIRED' WHERE id = $1`, [request.id]);
      return { error: 'EXPIRED' };
    }

    if (request.requester_id === confirmerId) return { error: 'CANNOT_SELF_CONFIRM' };

    const memberRes = await client.query(`SELECT 1 FROM aion2_lfg_members WHERE group_id = $1 AND discord_id = $2 AND is_official_lineup = TRUE`, [groupId, confirmerId]);
    if (memberRes.rowCount === 0) return { error: 'NOT_OFFICIAL' };

    const lineupRes = await client.query(`SELECT count(*) as count FROM aion2_lfg_members WHERE group_id = $1 AND is_official_lineup = TRUE`, [groupId]);
    const count = parseInt(lineupRes.rows[0].count, 10);
    const expectedCapacity = getCapacity(groupRes.rows[0].activity_type);
    if (count !== expectedCapacity) return { error: 'CAPACITY_MISMATCH' };

    if (groupRes.rows[0].activity_type === 'DUNGEON') {
      const voicePresRes = await client.query(`
        SELECT COUNT(*)::INT as count FROM aion2_lfg_members
        WHERE group_id = $1 AND is_official_lineup = TRUE 
        AND (is_in_voice = TRUE OR EXISTS (SELECT 1 FROM aion2_lfg_voice_sessions vs WHERE vs.group_id = aion2_lfg_members.group_id AND vs.discord_id = aion2_lfg_members.discord_id AND vs.left_at IS NULL))
      `, [groupId]);
      if (voicePresRes.rows[0].count < 4) {
        return { error: 'INSUFFICIENT_VOICE_QUORUM' };
      }
    }

    await client.query(`
      UPDATE aion2_lfg_groups
      SET termination_source = 'FALLBACK',
          voice_channel_deletion_pending = TRUE,
          voice_delete_reason = 'MANUAL_TERMINATION_FALLBACK',
          empty_voice_deadline = NULL,
          low_voice_deadline = NULL
      WHERE id = $1
    `, [groupId]);

    await client.query(`
      UPDATE aion2_lfg_vote_requests
      SET resolved_at = CURRENT_TIMESTAMP, resolution = 'CONFIRMED'
      WHERE group_id = $1 AND resolved_at IS NULL
    `, [groupId]);

    await client.query(`
      WITH closed_session AS (
        UPDATE aion2_lfg_voice_sessions SET left_at = CURRENT_TIMESTAMP
        WHERE group_id = $1 AND left_at IS NULL RETURNING discord_id, joined_at, left_at
      )
      UPDATE aion2_lfg_members
      SET cumulative_voice_seconds = cumulative_voice_seconds + GREATEST(0, EXTRACT(EPOCH FROM (closed_session.left_at - closed_session.joined_at)))
      FROM closed_session WHERE aion2_lfg_members.group_id = $1 AND aion2_lfg_members.discord_id = closed_session.discord_id
    `, [groupId]);
    
    return { success: true };
  });
}

export async function submitCompletionVoteAtomic(groupId, voterId, vote) {
  if (vote !== 'YES' && vote !== 'NO') return { error: 'INVALID_VOTE' };
  return executeTx(async (client) => {
    const groupRes = await client.query(`
      SELECT state, vote_deadline, activity_type, (vote_deadline <= CURRENT_TIMESTAMP) as is_expired 
      FROM aion2_lfg_groups 
      WHERE id = $1 FOR UPDATE
    `, [groupId]);
    if (groupRes.rowCount === 0) return { error: 'NOT_FOUND' };
    if (groupRes.rows[0].state !== 'AWAITING_VOTE') return { error: 'NOT_AWAITING_VOTE' };
    if (groupRes.rows[0].is_expired) return { error: 'DEADLINE_PASSED' };

    const memberRes = await client.query(`SELECT 1 FROM aion2_lfg_members WHERE group_id = $1 AND discord_id = $2 AND is_official_lineup = TRUE`, [groupId, voterId]);
    if (memberRes.rowCount === 0) return { error: 'NOT_OFFICIAL' };

    const lineupRes = await client.query(`SELECT count(*) as count FROM aion2_lfg_members WHERE group_id = $1 AND is_official_lineup = TRUE`, [groupId]);
    const electorateSize = parseInt(lineupRes.rows[0].count, 10);
    const expectedCapacity = getCapacity(groupRes.rows[0].activity_type);
    
    if (electorateSize !== expectedCapacity) {
      return { error: 'CORRUPTED_ELECTORATE_CAPACITY' };
    }

    const insertRes = await client.query(`
      INSERT INTO aion2_lfg_votes (group_id, discord_id, vote, voted_at) 
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (group_id, discord_id) DO NOTHING
      RETURNING id
    `, [groupId, voterId, vote]);

    if (insertRes.rowCount === 0) {
      // Already voted
      const existRes = await client.query(`SELECT vote FROM aion2_lfg_votes WHERE group_id = $1 AND discord_id = $2`, [groupId, voterId]);
      if (existRes.rows[0].vote === vote) return { success: true, idempotent: true };
      return { error: 'ALREADY_VOTED' };
    }
    
    const requiredYes = Math.floor(electorateSize / 2) + 1;

    const voteRes = await client.query(`
      SELECT 
        SUM(CASE WHEN vote = 'YES' THEN 1 ELSE 0 END) as yes_count,
        SUM(CASE WHEN vote = 'NO' THEN 1 ELSE 0 END) as no_count
      FROM aion2_lfg_votes WHERE group_id = $1
    `, [groupId]);
    
    const yesCount = parseInt(voteRes.rows[0].yes_count || 0, 10);
    const noCount = parseInt(voteRes.rows[0].no_count || 0, 10);
    const remaining = electorateSize - (yesCount + noCount);

    if (yesCount >= requiredYes) {
      await client.query(`
        UPDATE aion2_lfg_groups 
        SET state = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, events_render_pending = TRUE, events_render_version = events_render_version + 1
        WHERE id = $1
      `, [groupId]);
      await client.query(`
        UPDATE aion2_lfg_members SET status = 'COMPLETED', left_at = COALESCE(left_at, CURRENT_TIMESTAMP)
        WHERE group_id = $1 AND status = 'ACTIVE'
      `, [groupId]);
      await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
      return { success: true, completed: true };
    } else if (yesCount + remaining < requiredYes) {
      await client.query(`
        UPDATE aion2_lfg_groups 
        SET state = 'FAILED', failed_at = CURRENT_TIMESTAMP, events_render_pending = TRUE, events_render_version = events_render_version + 1
        WHERE id = $1
      `, [groupId]);
      await client.query(`
        UPDATE aion2_lfg_members SET status = 'FAILED', left_at = COALESCE(left_at, CURRENT_TIMESTAMP)
        WHERE group_id = $1 AND status = 'ACTIVE'
      `, [groupId]);
      await client.query(`DELETE FROM aion2_lfg_active_locks WHERE group_id = $1`, [groupId]);
      return { success: true, completed: false };
    } else {
      await client.query(`
        UPDATE aion2_lfg_groups SET events_render_pending = TRUE, events_render_version = events_render_version + 1 WHERE id = $1
      `, [groupId]);
      return { success: true, completed: false };
    }
  });
}
