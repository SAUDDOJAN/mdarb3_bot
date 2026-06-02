import "dotenv/config";
import { query } from "../src/database/index.js";

async function fix() {
  console.log("Checking for duplicates in recruits...");
  const dupes = await query(`
    SELECT guild_id, user_id, COUNT(*) 
    FROM recruits 
    GROUP BY guild_id, user_id 
    HAVING COUNT(*) > 1
  `);

  if (dupes.rows.length > 0) {
    console.log(`Found ${dupes.rows.length} duplicate pairs. Cleaning up...`);
    for (const row of dupes.rows) {
      console.log(`Cleaning ${row.guild_id} / ${row.user_id}`);
      // Keep only the one with the highest ID
      await query(`
        DELETE FROM recruits 
        WHERE guild_id=$1 AND user_id=$2 
        AND id NOT IN (
          SELECT id FROM recruits 
          WHERE guild_id=$1 AND user_id=$2 
          ORDER BY id DESC LIMIT 1
        )
      `, [row.guild_id, row.user_id]);
    }
    console.log("Cleanup finished.");
  } else {
    console.log("No duplicates found.");
  }

  console.log("Attempting to add UNIQUE constraint...");
  try {
    await query(`ALTER TABLE recruits ADD CONSTRAINT recruits_user_guild_unique UNIQUE (guild_id, user_id)`);
    console.log("✅ UNIQUE constraint added successfully!");
  } catch (e) {
    if (e.code === '42P16') {
      console.log("ℹ️ UNIQUE constraint already exists.");
    } else {
      console.error("❌ Failed to add UNIQUE constraint:", e);
    }
  }
}

fix();
