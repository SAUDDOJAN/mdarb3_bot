import "dotenv/config";
import pkg from 'pg';
const { Client } = pkg;

async function checkLobbyChannel() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const guildId = "861355983975874601";
    const res = await client.query("SELECT event_lobby_channel_id FROM guild_config WHERE guild_id=$1", [guildId]);
    console.log("Current Event Lobby Channel ID:", res.rows[0]?.event_lobby_channel_id);

    // Update it if it's different
    const targetChannel = "1496783538937135184";
    if (res.rows[0]?.event_lobby_channel_id !== targetChannel) {
        console.log(`Updating to ${targetChannel}...`);
        await client.query("UPDATE guild_config SET event_lobby_channel_id=$1 WHERE guild_id=$2", [targetChannel, guildId]);
        console.log("Updated.");
    } else {
        console.log("Already set correctly.");
    }

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

checkLobbyChannel();
