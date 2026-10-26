import { query } from '../../../database/index.js';

/**
 * Stage B2 Constants
 * Recruitment: 10 minutes from creation.
 * Post-first-full voice start: 10 minutes from first_full_at.
 * Voice Entry (Later B3): 10 minutes.
 */

export async function initLfgSchema() {
  console.log("[LFG] Starting AION 2 LFG Schema Migration...");

  // 1. GROUPS TABLE
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_groups (
      id SERIAL PRIMARY KEY,
      group_uuid UUID DEFAULT gen_random_uuid() UNIQUE,
      creator_id TEXT NOT NULL,
      activity_type TEXT NOT NULL, 
      activity_name TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'RECRUITING',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      first_full_at TIMESTAMPTZ,
      voice_channel_id TEXT,
      voice_started_at TIMESTAMPTZ,
      all_entered_at TIMESTAMPTZ,
      vote_started_at TIMESTAMPTZ,
      vote_deadline TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      expired_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      events_message_id TEXT,
      cancellation_reason TEXT,
      recruitment_deadline TIMESTAMPTZ,
      voice_start_deadline TIMESTAMPTZ
    )
  `);
  
  // Apply Group Stage B2.0 constraints via ALTER (Idempotent if we drop and add, but easier just to do IF NOT EXISTS logic via catch or direct additions)
  // To keep it clean and idempotent:
  await query(`
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS recruitment_deadline TIMESTAMPTZ;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_start_deadline TIMESTAMPTZ;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS events_delivery_status TEXT NOT NULL DEFAULT 'NOT_STARTED';
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS events_delivery_started_at TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS events_render_pending BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS events_render_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_identity_token VARCHAR(9) UNIQUE;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_delivery_status TEXT NOT NULL DEFAULT 'NOT_STARTED';
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_delivery_started_at TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_creation_recovery_deadline TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_entry_deadline TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_deleted_at TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS voice_delete_reason TEXT NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS empty_voice_deadline TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS low_voice_deadline TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS activity_mode TEXT NOT NULL DEFAULT 'EXPLORATION';
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS activity_deadline TIMESTAMPTZ NULL;
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS termination_source TEXT NULL;
  `);

  await query(`
    DO $$ BEGIN
      ALTER TABLE aion2_lfg_groups ADD CONSTRAINT chk_events_delivery_status CHECK (
        events_delivery_status IN ('NOT_STARTED', 'PENDING', 'LINKED', 'FAILED')
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`
    DO $$ BEGIN
      ALTER TABLE aion2_lfg_groups ADD CONSTRAINT chk_delivery_state_rules CHECK (
        (events_delivery_status = 'NOT_STARTED' AND events_delivery_started_at IS NULL AND events_message_id IS NULL) OR
        (events_delivery_status = 'PENDING' AND events_delivery_started_at IS NOT NULL AND events_message_id IS NULL) OR
        (events_delivery_status = 'LINKED' AND events_delivery_started_at IS NOT NULL AND events_message_id IS NOT NULL) OR
        (events_delivery_status = 'FAILED' AND events_message_id IS NULL)
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`ALTER TABLE aion2_lfg_groups DROP CONSTRAINT IF EXISTS chk_voice_delivery_status`);
  await query(`
    ALTER TABLE aion2_lfg_groups ADD CONSTRAINT chk_voice_delivery_status CHECK (
      voice_delivery_status IN ('NOT_STARTED', 'PENDING', 'LINKED')
    )
  `);

  await query(`ALTER TABLE aion2_lfg_groups DROP CONSTRAINT IF EXISTS chk_voice_delivery_structural`);
  await query(`
    ALTER TABLE aion2_lfg_groups ADD CONSTRAINT chk_voice_delivery_structural CHECK (
      (voice_delivery_status = 'NOT_STARTED' AND voice_delivery_started_at IS NULL AND voice_channel_id IS NULL) OR
      (voice_delivery_status = 'PENDING' AND voice_delivery_started_at IS NOT NULL AND voice_channel_id IS NULL) OR
      (voice_delivery_status = 'LINKED' AND voice_delivery_started_at IS NOT NULL AND voice_channel_id IS NOT NULL)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_aion2_lfg_groups_delivery_pending 
    ON aion2_lfg_groups(id) 
    WHERE events_delivery_status = 'PENDING';
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_aion2_lfg_groups_active_linked 
    ON aion2_lfg_groups(id) 
    WHERE state IN ('RECRUITING', 'FULL_WAITING_FOR_VOICE') AND events_delivery_status = 'LINKED';
  `);

  try {
    await query(`ALTER TABLE aion2_lfg_groups DROP CONSTRAINT IF EXISTS chk_aion2_lfg_groups_state`);
    await query(`ALTER TABLE aion2_lfg_groups ADD CONSTRAINT chk_aion2_lfg_groups_state CHECK (state IN ('RECRUITING', 'FULL_WAITING_FOR_VOICE', 'VOICE_CREATING', 'VOICE_ENTRY', 'ACTIVE', 'AWAITING_VOTE', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED'))`);
  } catch(e) { console.error("Error adding groups state constraint", e); }

  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_groups_state ON aion2_lfg_groups(state)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_groups_creator ON aion2_lfg_groups(creator_id)`);

  // 2. MEMBERS TABLE
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES aion2_lfg_groups(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL,
      assigned_party INTEGER DEFAULT 1,
      assigned_role TEXT NOT NULL, 
      player_class TEXT NOT NULL,
      is_creator BOOLEAN DEFAULT FALSE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      cumulative_voice_seconds INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      left_at TIMESTAMPTZ,
      last_heartbeat_at TIMESTAMPTZ
    )
  `);

  // Stage B2.0 Member alterations
  await query(`ALTER TABLE aion2_lfg_members DROP CONSTRAINT IF EXISTS aion2_lfg_members_group_id_discord_id_key`);
  
  await query(`
    ALTER TABLE aion2_lfg_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
    ALTER TABLE aion2_lfg_members ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
    ALTER TABLE aion2_lfg_members ADD COLUMN IF NOT EXISTS is_official_lineup BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE aion2_lfg_members ADD COLUMN IF NOT EXISTS first_voice_entered_at TIMESTAMPTZ;
    ALTER TABLE aion2_lfg_members ADD COLUMN IF NOT EXISTS is_in_voice BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  try {
    await query(`ALTER TABLE aion2_lfg_members DROP CONSTRAINT IF EXISTS chk_aion2_lfg_members_status`);
    await query(`ALTER TABLE aion2_lfg_members ADD CONSTRAINT chk_aion2_lfg_members_status CHECK (status IN ('ACTIVE', 'LEFT', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED'))`);
    
    await query(`ALTER TABLE aion2_lfg_members DROP CONSTRAINT IF EXISTS chk_aion2_lfg_members_left_at`);
    await query(`ALTER TABLE aion2_lfg_members ADD CONSTRAINT chk_aion2_lfg_members_left_at CHECK ((status = 'ACTIVE' AND left_at IS NULL) OR (status != 'ACTIVE' AND left_at IS NOT NULL))`);
  } catch(e) { console.error("Error adding members constraints", e); }

  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_aion2_lfg_members_active ON aion2_lfg_members(group_id, discord_id) WHERE status = 'ACTIVE'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_members_group_active ON aion2_lfg_members(group_id) WHERE status = 'ACTIVE'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_members_discord ON aion2_lfg_members(discord_id)`);

  // 3. ONE-ACTIVE-GROUP LOCKS TABLE
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_active_locks (
      discord_id TEXT PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES aion2_lfg_groups(id) ON DELETE CASCADE,
      locked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 4. VOICE SESSIONS TABLE
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_voice_sessions (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES aion2_lfg_groups(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      left_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_voice_group_user ON aion2_lfg_voice_sessions(group_id, discord_id)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_aion2_lfg_voice_sessions_active ON aion2_lfg_voice_sessions(group_id, discord_id) WHERE left_at IS NULL`);

  // 5. COMPLETION VOTES TABLE
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_votes (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES aion2_lfg_groups(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL,
      vote TEXT NOT NULL, -- 'YES' or 'NO'
      voted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(group_id, discord_id)
    )
  `);

  // 6. ACTIVITY POINTS LEDGER
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_ledger (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES aion2_lfg_groups(id) ON DELETE CASCADE,
      discord_id TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      activity_name TEXT NOT NULL,
      base_points INTEGER DEFAULT 0,
      creator_bonus INTEGER DEFAULT 0,
      anti_farm_multiplier NUMERIC DEFAULT 1.0,
      final_points INTEGER DEFAULT 0,
      monthly_cycle_id TEXT NOT NULL, 
      qualification_status TEXT NOT NULL, 
      cumulative_voice_seconds INTEGER DEFAULT 0,
      anti_farm_n_value INTEGER DEFAULT 1,
      anti_farm_core_lineage TEXT,
      awarded_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(group_id, discord_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_ledger_discord_cycle ON aion2_lfg_ledger(discord_id, monthly_cycle_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_ledger_discord_activity ON aion2_lfg_ledger(discord_id, activity_type)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_ledger_awarded_at ON aion2_lfg_ledger(awarded_at)`);

  // 7. NOTIFICATIONS TABLE (B3.1)
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_notifications (
        notification_id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES aion2_lfg_groups(id) ON DELETE CASCADE,
        discord_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        delivery_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
        delivery_started_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, discord_id, notification_type)
    );
  `);

  await query(`
    DO $$ BEGIN
      ALTER TABLE aion2_lfg_notifications DROP CONSTRAINT IF EXISTS chk_notification_type;
      ALTER TABLE aion2_lfg_notifications ADD CONSTRAINT chk_notification_type CHECK (
        notification_type IN ('FIRST_FULL', 'VOICE_START_EXPIRED_CREATOR', 'VOTE_DM')
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // 8. FALLBACK VOTE REQUESTS
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_vote_requests (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES aion2_lfg_groups(id) ON DELETE CASCADE,
      requester_id TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ NOT NULL,
      resolved_at TIMESTAMPTZ NULL,
      resolution TEXT NULL
    )
  `);

  await query(`
    DO $$ BEGIN
      ALTER TABLE aion2_lfg_vote_requests ADD CONSTRAINT chk_vote_resolution CHECK (
        resolution IS NULL OR resolution IN ('CONFIRMED', 'EXPIRED', 'CONSUMED_BY_CREATOR')
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`
    DO $$ BEGIN
      ALTER TABLE aion2_lfg_vote_requests ADD CONSTRAINT chk_vote_resolution_structural CHECK (
        (resolved_at IS NULL AND resolution IS NULL) OR
        (resolved_at IS NOT NULL AND resolution IS NOT NULL)
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_aion2_lfg_vote_req_unresolved ON aion2_lfg_vote_requests(group_id) WHERE resolved_at IS NULL`);
  
  await query(`
    DO $$ BEGIN
      ALTER TABLE aion2_lfg_notifications ADD CONSTRAINT chk_notification_delivery_status CHECK (
        delivery_status IN ('NOT_STARTED', 'SENDING', 'SENT', 'DEFINITIVE_FAILED', 'AMBIGUOUS')
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`
    DO $$ BEGIN
      ALTER TABLE aion2_lfg_notifications ADD CONSTRAINT chk_notification_structural_invariants CHECK (
        (delivery_status = 'NOT_STARTED' AND delivery_started_at IS NULL AND sent_at IS NULL) OR
        (delivery_status = 'SENDING' AND delivery_started_at IS NOT NULL AND sent_at IS NULL) OR
        (delivery_status = 'SENT' AND delivery_started_at IS NOT NULL AND sent_at IS NOT NULL) OR
        (delivery_status = 'DEFINITIVE_FAILED' AND delivery_started_at IS NOT NULL AND sent_at IS NULL) OR
        (delivery_status = 'AMBIGUOUS' AND delivery_started_at IS NOT NULL AND sent_at IS NULL)
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_aion2_lfg_notifications_pending ON aion2_lfg_notifications(notification_id) WHERE delivery_status = 'NOT_STARTED'`);

  // B4.1 LEDGER FOUNDATION MIGRATIONS
  await query(`
    ALTER TABLE aion2_lfg_groups ADD COLUMN IF NOT EXISTS ledger_processed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE aion2_lfg_ledger ADD COLUMN IF NOT EXISTS eligibility_cycle_id TEXT;
    ALTER TABLE aion2_lfg_ledger ADD COLUMN IF NOT EXISTS voice_required_seconds INTEGER;
    ALTER TABLE aion2_lfg_ledger ADD COLUMN IF NOT EXISTS is_creator BOOLEAN;
  `);

  // B5 LEADERBOARD AND MONTHLY CYCLES MIGRATIONS
  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_leaderboard_state (
      channel_id TEXT PRIMARY KEY,
      is_dirty BOOLEAN DEFAULT FALSE,
      version BIGINT DEFAULT 0,
      page_messages JSONB DEFAULT '[]'::jsonb,
      last_top5 JSONB DEFAULT '[]'::jsonb,
      cycle_id TEXT
    )
  `);

  await query(`
    ALTER TABLE aion2_lfg_leaderboard_state ADD COLUMN IF NOT EXISTS last_top5 JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE aion2_lfg_leaderboard_state ADD COLUMN IF NOT EXISTS cycle_id TEXT;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_monthly_cycles (
      cycle_id TEXT PRIMARY KEY,
      cycle_start TIMESTAMPTZ NOT NULL,
      cycle_end TIMESTAMPTZ NOT NULL,
      is_finalized BOOLEAN DEFAULT FALSE,
      finalized_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_monthly_rankings (
      cycle_id TEXT NOT NULL REFERENCES aion2_lfg_monthly_cycles(cycle_id),
      discord_id TEXT NOT NULL,
      final_rank INT NOT NULL,
      total_points INT NOT NULL,
      unique_guildmates INT NOT NULL,
      completed_groups INT NOT NULL,
      reached_total_at TIMESTAMPTZ,
      PRIMARY KEY (cycle_id, discord_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS aion2_lfg_monthly_rewards (
      cycle_id TEXT NOT NULL REFERENCES aion2_lfg_monthly_cycles(cycle_id),
      discord_id TEXT NOT NULL,
      rank INT NOT NULL,
      reward_type TEXT NOT NULL,
      reward_status TEXT NOT NULL DEFAULT 'PENDING',
      PRIMARY KEY (cycle_id, discord_id)
    )
  `);
}
