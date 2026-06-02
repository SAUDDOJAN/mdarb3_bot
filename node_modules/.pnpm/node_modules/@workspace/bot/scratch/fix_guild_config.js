import "dotenv/config";
import pkg from 'pg';
const { Client } = pkg;

async function setupGuild() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to DB");

    const guildId = "861355983975874601";
    const alertChannelId = "1498415559379910849";

    console.log(`Setting alert_channel_id to ${alertChannelId} for guild ${guildId}`);

    await client.query(
      "INSERT INTO guild_config (guild_id, alert_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET alert_channel_id = $2, updated_at = NOW()",
      [guildId, alertChannelId]
    );

    console.log("Done.");

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

setupGuild();
