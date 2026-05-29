import pg from "pg";
import "dotenv/config";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const guildId = '861355983975874601';
  const channelId = '1509153258323705927'; // Actual banner welcome room
  
  const res = await pool.query(
    "UPDATE guild_config SET welcome_channel_id = $1 WHERE guild_id = $2 RETURNING *",
    [channelId, guildId]
  );
  console.log("Updated Guild Configuration:", res.rows[0]);
  await pool.end();
}

main().catch(console.error);
