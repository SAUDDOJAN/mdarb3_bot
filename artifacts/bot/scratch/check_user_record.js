import "dotenv/config";
import pkg from 'pg';
const { Client } = pkg;

async function checkUserRecord() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const userId = "136371223209836544"; // The USER
    const guildId = "861355983975874601";
    const res = await client.query("SELECT * FROM recruits WHERE user_id=$1 AND guild_id=$2", [userId, guildId]);
    console.log("User Recruit Record:", res.rows[0]);

    if (!res.rows[0]) {
        console.log("No record found. Inserting a mock record for the user so they can test.");
        await client.query(
            `INSERT INTO recruits (guild_id, user_id, discord_tag, character_name, class_name, status, accepted_at)
             VALUES ($1, $2, $3, $4, $5, 'accepted', NOW())`,
            [guildId, userId, "USER", "AdminChar", "Templar"]
        );
        console.log("Mock record inserted.");
    } else if (res.rows[0].status !== 'accepted') {
        console.log("Record found but status is not 'accepted'. Updating...");
        await client.query("UPDATE recruits SET status='accepted', accepted_at=NOW() WHERE user_id=$1 AND guild_id=$2", [userId, guildId]);
        console.log("Updated.");
    } else {
        console.log("Record exists and is accepted.");
    }

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

checkUserRecord();
