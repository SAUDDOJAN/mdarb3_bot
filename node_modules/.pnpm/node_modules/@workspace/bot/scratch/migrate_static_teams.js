import "dotenv/config";
import pkg from 'pg';
const { Client } = pkg;

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to DB.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS static_teams (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        team_name TEXT NOT NULL,
        leader_id TEXT,
        slot_tank    JSONB DEFAULT '{"status":"empty"}',
        slot_support JSONB DEFAULT '{"status":"empty"}',
        slot_dps1    JSONB DEFAULT '{"status":"empty"}',
        slot_dps2    JSONB DEFAULT '{"status":"empty"}',
        message_id   TEXT,
        channel_id   TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("Executed: CREATE TABLE static_teams");

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    await client.end();
  }
}

migrate();
