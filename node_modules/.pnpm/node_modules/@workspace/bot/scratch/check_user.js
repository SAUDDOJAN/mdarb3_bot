import "dotenv/config";
import { query } from "../src/database/index.js";

const guildId = "861355983975874601";
const userId = "388733258638295040"; // Lexus from previous logs

async function check() {
  const res = await query("SELECT * FROM recruits WHERE guild_id=$1 AND user_id=$2", [guildId, userId]);
  console.log(JSON.stringify(res.rows, null, 2));
}

check();
