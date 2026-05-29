import "dotenv/config";
import pkg from 'pg';
const { Client } = pkg;

async function checkActiveAlerts() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to DB");

    const alerts = await client.query("SELECT * FROM active_alerts WHERE guild_id = '861355983975874601'");
    console.log("Active Alerts:", JSON.stringify(alerts.rows, null, 2));

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

checkActiveAlerts();
