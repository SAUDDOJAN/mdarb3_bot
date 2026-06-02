/**
 * create_sage_tables.js — One-shot migration script
 * Creates sage_guilds and sage_recruitment tables in the database.
 * Run: node scratch/create_sage_tables.js
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("[Migration] Connected to database.");

    await client.query(`
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
    console.log("[Migration] ✅ sage_guilds table ready.");

    await client.query(`
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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[Migration] ✅ sage_recruitment table ready.");

    console.log("[Migration] 🎉 All Sage tables created successfully!");
  } catch (err) {
    console.error("[Migration] ❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
