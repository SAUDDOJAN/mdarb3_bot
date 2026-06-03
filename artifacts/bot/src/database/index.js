import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Provision a Replit PostgreSQL database.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err);
});

export async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// ─── Notifications Helpers ───────────────────────────────────────────────────

export async function createNotification(type, title, message, data = {}) {
  const result = await query(
    `INSERT INTO notifications (type, title, message, data) VALUES ($1, $2, $3, $4) RETURNING *`,
    [type, title, message, JSON.stringify(data)]
  );
  return result.rows[0];
}

export async function getNotifications(limit = 20) {
  const result = await query(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ─── Wiki Helpers ────────────────────────────────────────────────────────────

export async function createWikiArticle(game, title, content, date_tag) {
  const result = await query(
    `INSERT INTO wiki_articles (game, title, content, date_tag) VALUES ($1, $2, $3, $4) RETURNING *`,
    [game, title, content, date_tag]
  );
  return result.rows[0];
}

export async function getWikiArticles() {
  const result = await query(
    `SELECT * FROM wiki_articles ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT,
      welcome_channel_id TEXT,
      farewell_channel_id TEXT,
      ticket_category_id TEXT,
      ticket_log_channel_id TEXT,
      mod_role_id TEXT,
      mute_role_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      balance INTEGER DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      last_xp_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, guild_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50),
      title TEXT,
      message TEXT,
      data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS mod_cases (
      id SERIAL PRIMARY KEY,
      case_number INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      duration INTEGER,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      topic TEXT,
      claimed_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS role_menus (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'button',
      roles JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      host_id TEXT NOT NULL,
      prize TEXT NOT NULL,
      winners INTEGER DEFAULT 1,
      entries JSONB DEFAULT '[]',
      ended BOOLEAN DEFAULT FALSE,
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS warns (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE guild_config
    ADD COLUMN IF NOT EXISTS alert_channel_id TEXT
  `);

  await query(`
    ALTER TABLE guild_config
    ADD COLUMN IF NOT EXISTS legion_role_id TEXT
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recruits (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      discord_tag TEXT NOT NULL,
      character_name TEXT,
      character_level INTEGER DEFAULT 0,
      class_name TEXT,
      combat_power INTEGER DEFAULT 0,
      profile_image TEXT,
      shugo_url TEXT,
      status TEXT DEFAULT 'pending',
      guild_branch TEXT DEFAULT 'pve',
      reviewed_by TEXT,
      accepted_at TIMESTAMPTZ,
      power_card_posted BOOLEAN DEFAULT FALSE,
      character_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tl_recruits (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      discord_tag TEXT NOT NULL,
      class_name TEXT,
      playstyle TEXT,
      game_status TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id)
    )
  `);

  await query(`
    ALTER TABLE tl_recruits
    ADD COLUMN IF NOT EXISTS message_id TEXT
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS alliance_members (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_name TEXT,
      character_level INTEGER DEFAULT 0,
      class_name TEXT,
      combat_power INTEGER DEFAULT 0,
      profile_image TEXT,
      shugo_url TEXT,
      status TEXT DEFAULT 'pending',
      character_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    )
  `);

  await query(`ALTER TABLE recruits ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE recruits ADD COLUMN IF NOT EXISTS power_card_posted BOOLEAN DEFAULT FALSE`);

  await query(`
    CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, user_id, alert_type)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS wiki_articles (
      id SERIAL PRIMARY KEY,
      game TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      date_tag TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS active_alerts (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, alert_type)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value JSONB
    )
  `);

  await query(`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS admin_channel_id TEXT`);
  await query(`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS powercard_channel_id TEXT`);
  await query(`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS event_category_id TEXT`);
  await query(`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS event_lobby_channel_id TEXT`);
  await query(`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS guild_role_id TEXT`);
  await query(`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS alliance_admin_channel_id TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS point_events (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      started_by TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS event_groups (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      event_id INTEGER REFERENCES point_events(id) ON DELETE CASCADE,
      vc_channel_id TEXT UNIQUE,
      group_name TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      slot_frontline JSONB DEFAULT '{"status":"empty"}',
      slot_dps1      JSONB DEFAULT '{"status":"empty"}',
      slot_dps2      JSONB DEFAULT '{"status":"empty"}',
      slot_support   JSONB DEFAULT '{"status":"empty"}',
      pending_applicants JSONB DEFAULT '[]',
      group_embed_channel_id TEXT,
      group_embed_message_id TEXT,
      is_full BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_frontline        JSONB DEFAULT '{"status":"empty"}'`);
  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_dps1             JSONB DEFAULT '{"status":"empty"}'`);
  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_dps2             JSONB DEFAULT '{"status":"empty"}'`);
  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_support          JSONB DEFAULT '{"status":"empty"}'`);
  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS pending_applicants    JSONB DEFAULT '[]'`);
  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS group_embed_channel_id TEXT`);
  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS group_embed_message_id TEXT`);
  await query(`ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS is_full               BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE event_groups ALTER COLUMN vc_channel_id DROP NOT NULL`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS points (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      withdrawals INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      event_id INTEGER,
      group_id INTEGER,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      duration_minutes INTEGER,
      points_awarded INTEGER DEFAULT 0,
      withdrawal_logged BOOLEAN DEFAULT FALSE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS power_cards (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      message_id TEXT,
      channel_id TEXT,
      character_name TEXT,
      character_level INTEGER DEFAULT 0,
      class_name TEXT,
      combat_power INTEGER DEFAULT 0,
      shugo_url TEXT,
      profile_image TEXT,
      prev_level INTEGER,
      prev_cp INTEGER,
      inactivity_streak INTEGER DEFAULT 0,
      last_activity_check TIMESTAMPTZ,
      last_updated TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE power_cards ADD COLUMN IF NOT EXISTS profile_image TEXT`);
  await query(`ALTER TABLE power_cards ADD COLUMN IF NOT EXISTS prev_level INTEGER`);
  await query(`ALTER TABLE power_cards ADD COLUMN IF NOT EXISTS prev_cp INTEGER`);
  await query(`ALTER TABLE power_cards ADD COLUMN IF NOT EXISTS inactivity_streak INTEGER DEFAULT 0`);
  await query(`ALTER TABLE power_cards ADD COLUMN IF NOT EXISTS last_activity_check TIMESTAMPTZ`);

  // Member Management System — extra columns on recruits
  await query(`ALTER TABLE recruits ADD COLUMN IF NOT EXISTS race_name    TEXT`);
  await query(`ALTER TABLE recruits ADD COLUMN IF NOT EXISTS server_name  TEXT`);
  await query(`ALTER TABLE recruits ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW()`);
  await query(`ALTER TABLE recruits ADD COLUMN IF NOT EXISTS guild_branch TEXT DEFAULT 'pve'`);
  await query(`ALTER TABLE recruits ADD COLUMN IF NOT EXISTS character_data JSONB`);
  await query(`ALTER TABLE recruits ADD CONSTRAINT recruits_user_guild_unique UNIQUE (guild_id, user_id)`).catch(() => {});

  // News Fetcher
  await query(`
    CREATE TABLE IF NOT EXISTS posted_news (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      published_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Abyss / PvP data
  await query(`ALTER TABLE recruits    ADD COLUMN IF NOT EXISTS abyss_rank  TEXT`);
  await query(`ALTER TABLE recruits    ADD COLUMN IF NOT EXISTS abyss_score INTEGER DEFAULT 0`);
  await query(`ALTER TABLE power_cards ADD COLUMN IF NOT EXISTS abyss_rank  TEXT`);
  await query(`ALTER TABLE power_cards ADD COLUMN IF NOT EXISTS abyss_score INTEGER DEFAULT 0`);

  await query(`
    CREATE TABLE IF NOT EXISTS power_history (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      combat_power INTEGER NOT NULL,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_power_history_user_time ON power_history(user_id, recorded_at DESC)`);

  // ─── Sage Alliance Controller — Isolated Tables ───────────────────────────────
  // Guild registry for the Sage Alliance server (one row per in-game guild)
  await query(`
    CREATE TABLE IF NOT EXISTS sage_guilds (
      id SERIAL PRIMARY KEY,
      discord_role_id TEXT NOT NULL UNIQUE,
      guild_name TEXT NOT NULL,
      guild_leader_id TEXT,
      member_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Member recruitment records — strictly for guild_id = '1507696012410749030'
  await query(`
    CREATE TABLE IF NOT EXISTS sage_recruitment (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      discord_tag TEXT NOT NULL,
      character_name TEXT,
      character_level INTEGER DEFAULT 0,
      class_name TEXT,
      combat_power INTEGER DEFAULT 0,
      race_name TEXT,
      server_name TEXT,
      profile_image TEXT,
      shugo_url TEXT,
      guild_role_id TEXT,
      guild_name TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      roster_message_id TEXT,
      roster_channel_id TEXT,
      character_data JSONB,
      joined_at TIMESTAMPTZ,
      source_discord_server TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE sage_recruitment ADD COLUMN IF NOT EXISTS source_discord_server TEXT`);

  // ─── Sage Invite Source Tracking ──────────────────────────────────────────────
  // Maps a Discord invite code to the source server name (set by admin).
  // When a new member joins via a tracked invite, we record where they came from.
  await query(`
    CREATE TABLE IF NOT EXISTS sage_invite_sources (
      invite_code       TEXT PRIMARY KEY,
      source_server_name TEXT NOT NULL,
      uses_at_cache     INTEGER DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Temporary map: user_id → source_discord_server (persisted for cross-event lookup)
  await query(`
    CREATE TABLE IF NOT EXISTS sage_pending_source (
      user_id           TEXT PRIMARY KEY,
      source_server_name TEXT NOT NULL,
      detected_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Dungeon LFG Table
  await query(`
    CREATE TABLE IF NOT EXISTS dungeon_lfg_groups (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      dungeon_name TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      channel_id TEXT NOT NULL,
      voice_channel_id TEXT,
      voice_invite_url TEXT,
      invite_message_id TEXT,
      slot_tank JSONB DEFAULT 'null',
      slot_healer JSONB DEFAULT 'null',
      slot_dps1 JSONB DEFAULT 'null',
      slot_dps2 JSONB DEFAULT 'null',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT DEFAULT 'open'
    )
  `);

  // ─── Weekly Points Tracking Tables ───────────────────────────────────────────

  // Dungeon participation — 10 pts per dungeon
  await query(`
    CREATE TABLE IF NOT EXISTS dungeon_participations (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      dungeon_name TEXT NOT NULL,
      difficulty TEXT,
      points_awarded INTEGER DEFAULT 10,
      participated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_dungeon_part_guild_user ON dungeon_participations(guild_id, user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dungeon_part_date ON dungeon_participations(participated_at DESC)`);

  // Siege results — per siege per member
  await query(`
    CREATE TABLE IF NOT EXISTS siege_results (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_id INTEGER,
      points_awarded INTEGER DEFAULT 0,
      status TEXT DEFAULT 'absent',
      event_date TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_siege_results_guild_date ON siege_results(guild_id, event_date DESC)`);

  // Battle results — per battle per member
  await query(`
    CREATE TABLE IF NOT EXISTS battle_results (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_id INTEGER,
      points_awarded INTEGER DEFAULT 0,
      status TEXT DEFAULT 'absent',
      event_date TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_battle_results_guild_date ON battle_results(guild_id, event_date DESC)`);

  // Dungeon VC sessions
  await query(`
    CREATE TABLE IF NOT EXISTS dungeon_vc_sessions (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      lfg_group_id INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      duration_minutes INTEGER DEFAULT 0,
      points_awarded BOOLEAN DEFAULT FALSE
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_dvc_sess_user ON dungeon_vc_sessions(user_id)`);

  console.log("[DB] All tables initialized.");
}


