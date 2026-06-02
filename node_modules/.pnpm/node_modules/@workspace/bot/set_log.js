import { query } from "./src/database/index.js";
import "dotenv/config";

const guildId = "861355983975874601";
const logChannel = "1290468734045261885";

async function run() {
  try {
    await query(
      "INSERT INTO guild_config (guild_id, log_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET log_channel_id = $2",
      [guildId, logChannel]
    );
    console.log("Successfully updated log channel!");
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
