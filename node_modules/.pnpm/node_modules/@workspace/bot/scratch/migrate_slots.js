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

    const columns = [
      "ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_extra1 JSONB DEFAULT '{\"status\":\"empty\"}'",
      "ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_extra2 JSONB DEFAULT '{\"status\":\"empty\"}'",
      "ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_extra3 JSONB DEFAULT '{\"status\":\"empty\"}'",
      "ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS slot_extra4 JSONB DEFAULT '{\"status\":\"empty\"}'",
      "ALTER TABLE event_groups ADD COLUMN IF NOT EXISTS event_name_cached TEXT"
    ];

    for (const sql of columns) {
      await client.query(sql);
      console.log("Executed:", sql);
    }

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    await client.end();
  }
}

migrate();
