import "dotenv/config";
import { query } from "../src/database/index.js";

async function cleanup() {
  const url = "https://shugo.gg/character?id=MVyT5vQMjpc5WH4Rkzl3PwWMv0lQZiI8M_qUZOMmlKo%253D&server=1016&region=TW&name=Sorcera";
  try {
    const res = await query("DELETE FROM recruits WHERE shugo_url = $1", [url]);
    console.log(`Deleted ${res.rowCount} records.`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

cleanup();
