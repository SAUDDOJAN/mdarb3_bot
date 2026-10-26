import { query } from '../../../database/index.js';
import { ALLOWED_GUILDS } from '../utils/activitiesConfig.js';

/**
 * Retrieves the active, accepted guild application/profile for an eligible player.
 * Strictly enforces:
 * - status = 'ACCEPTED'
 * - transition_status IS NULL
 * - assigned_guild IN ('EMPEROR', 'M3RGEEN_GLOBAL')
 */
export async function getActiveAion2Application(discordId) {
  const res = await query(`
    SELECT * FROM aion2_global_applications 
    WHERE discord_id = $1 
      AND status = 'ACCEPTED' 
      AND transition_status IS NULL 
      AND assigned_guild = ANY($2::text[])
    ORDER BY id DESC LIMIT 1
  `, [discordId, ALLOWED_GUILDS]);
  
  return res.rows[0] || null;
}

/**
 * Updates the existing player profile row in aion2_global_applications with fresh Shugo data.
 * Preserves shugo_url, assigned_guild, guild_app_status, guild_app_target, status, transition_status.
 */
export async function updatePlayerProfileFromShugo(discordId, charData) {
  const cpNum = charData.combatPower !== null && !isNaN(Number(charData.combatPower))
    ? Number(charData.combatPower)
    : null;

  const res = await query(`
    UPDATE aion2_global_applications
    SET character_name = COALESCE($1, character_name),
        character_level = COALESCE($2, character_level),
        selected_class = COALESCE($3, selected_class),
        combat_power = COALESCE($4, combat_power),
        profile_image = COALESCE($5, profile_image),
        race_name = COALESCE($6, race_name),
        server_name = COALESCE($7, server_name),
        character_data = $8,
        updated_at = CURRENT_TIMESTAMP
    WHERE discord_id = $9
      AND status = 'ACCEPTED'
      AND transition_status IS NULL
      AND assigned_guild = ANY($10::text[])
    RETURNING *
  `, [
    charData.characterName || null,
    charData.characterLevel || null,
    charData.className || null,
    cpNum,
    charData.profileImage || null,
    charData.raceName || null,
    charData.serverName || null,
    JSON.stringify(charData),
    discordId,
    ALLOWED_GUILDS
  ]);

  return res.rows[0] || null;
}
