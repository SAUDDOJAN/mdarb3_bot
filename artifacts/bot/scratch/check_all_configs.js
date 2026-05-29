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

    const configs = await client.query("SELECT * FROM guild_config");
    console.log("All Guild Configs:", JSON.stringify(configs.rows, null, 2));

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

checkDb();
