import { query } from "../database/index.js";
import { createOrUpdateCard } from "../modules/powercards.js";
import { getRecruitmentConfig } from "../modules/recruitment.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

export function startPowerCardQueue(client) {
  console.log("[PowerCardQueue] 24h recruitment card queue started (checks every 15 min).");

  const run = async () => {
    try {
      const res = await query(`
        SELECT r.id, r.guild_id, r.user_id, r.shugo_url, r.character_name,
               r.accepted_at
        FROM recruits r
        WHERE r.status = 'accepted'
          AND r.power_card_posted = FALSE
          AND r.shugo_url IS NOT NULL
          AND r.accepted_at IS NOT NULL
          AND NOW() - r.accepted_at >= INTERVAL '24 hours'
      `);

      if (res.rows.length > 0) {
        console.log(`[PowerCardQueue] ${res.rows.length} card(s) ready to post.`);
      }

      for (const recruit of res.rows) {
        console.log(`[PowerCardQueue] Posting card for ${recruit.character_name} (user ${recruit.user_id})`);

        const config = await getRecruitmentConfig(recruit.guild_id);
        const radarChannelId = config.powerRadarChannelId;

        const ok = await createOrUpdateCard(
          client,
          recruit.guild_id,
          recruit.user_id,
          recruit.shugo_url,
          radarChannelId
        );

        if (ok) {
          await query(
            "UPDATE recruits SET power_card_posted=TRUE WHERE id=$1",
            [recruit.id]
          );
          console.log(`[PowerCardQueue] ✅ Card posted for ${recruit.character_name}`);
        } else {
          console.warn(`[PowerCardQueue] ⚠️ Failed to post card for ${recruit.character_name} — will retry next cycle`);
        }

        // Pace requests — avoid rate limits
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error("[PowerCardQueue] Error in queue check:", err);
    }

    setTimeout(run, CHECK_INTERVAL_MS);
  };

  // First check after 1 minute (let bot settle after boot)
  setTimeout(run, 60 * 1000);
}
