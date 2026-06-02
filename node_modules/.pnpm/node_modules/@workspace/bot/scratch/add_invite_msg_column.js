// Migration: Add invite_message_id column to dungeon_lfg_groups
import "dotenv/config";
import pkg from "pg";
const { Client } = pkg;

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    await client.query(`
      ALTER TABLE dungeon_lfg_groups 
      ADD COLUMN IF NOT EXISTS invite_message_id TEXT
    `);
    console.log("[Migration] ✅ invite_message_id column added successfully.");
  } catch (err) {
    console.error("[Migration] ❌ Failed:", err.message);
  } finally {
    await client.end();
    process.exit(0);
  }
}

migrate();

