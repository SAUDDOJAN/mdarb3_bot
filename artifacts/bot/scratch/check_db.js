import "dotenv/config";
import pkg from 'pg';
const { Client } = pkg;

async function checkDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to DB");

    const guildId = process.env.DISCORD_GUILD_ID;
    console.log("Checking for Guild ID:", guildId);

    const config = await client.query("SELECT * FROM guild_config WHERE guild_id = $1", [guildId]);
    console.log("Guild Config:", JSON.stringify(config.rows, null, 2));

    const subs = await client.query("SELECT alert_type, COUNT(*) FROM alert_subscriptions WHERE guild_id = $1 GROUP BY alert_type", [guildId]);
    console.log("Subscriptions Summary:", JSON.stringify(subs.rows, null, 2));

    // Also check if there are any subscriptions at all
    const allSubs = await client.query("SELECT * FROM alert_subscriptions WHERE guild_id = $1 LIMIT 10", [guildId]);
    console.log("Sample Subscriptions:", JSON.stringify(allSubs.rows, null, 2));

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

checkDb();
