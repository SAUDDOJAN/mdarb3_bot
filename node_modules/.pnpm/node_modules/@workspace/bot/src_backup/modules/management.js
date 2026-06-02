import { deleteCard } from "./powercards.js";
import { query } from "../database/index.js";

export async function removeMemberAllData(client, guild, userId) {
  console.log(`[Management] Removing all data for user ${userId} in guild ${guild.id}`);

  try {
    await deleteCard(client, guild.id, userId);
  } catch (e) {
    console.error("[Management] Power card deletion error:", e);
  }

  const tables = [
    "DELETE FROM voice_sessions WHERE guild_id=$1 AND user_id=$2",
    "DELETE FROM points WHERE guild_id=$1 AND user_id=$2",
    "DELETE FROM alert_subscriptions WHERE guild_id=$1 AND user_id=$2",
    "DELETE FROM warns WHERE guild_id=$1 AND user_id=$2",
    "DELETE FROM users WHERE guild_id=$1 AND user_id=$2",
    "UPDATE recruits SET status='left' WHERE guild_id=$1 AND user_id=$2",
  ];

  for (const sql of tables) {
    await query(sql, [guild.id, userId]).catch((e) =>
      console.error(`[Management] Error in cleanup (${sql.split(" ")[2]}):`, e)
    );
  }

  console.log(`[Management] All data removed for user ${userId}.`);
}

export async function getPoints(guildId, userId) {
  const res = await query(
    "SELECT total_points, withdrawals FROM points WHERE guild_id=$1 AND user_id=$2",
    [guildId, userId]
  );
  return res.rows[0] ?? { total_points: 0, withdrawals: 0 };
}

export async function addPoints(client, guildId, userId, amount) {
  const res = await query(
    `INSERT INTO points (guild_id, user_id, total_points)
     VALUES ($1,$2,$3)
     ON CONFLICT (guild_id, user_id) DO UPDATE
     SET total_points = points.total_points + $3, updated_at = NOW()
     RETURNING total_points`,
    [guildId, userId, amount]
  );

  const totalPoints = res.rows[0].total_points;

  // Auto-promotion logic
  if (totalPoints >= 100) {
    const recruitRes = await query(
      "SELECT id, guild_branch, character_name FROM recruits WHERE guild_id=$1 AND user_id=$2 AND status='accepted' LIMIT 1",
      [guildId, userId]
    );
    const recruit = recruitRes.rows[0];

    if (recruit && recruit.guild_branch === 'pve') {
      console.log(`[Management] Promoting ${userId} to PvP Guild (100+ points)`);
      
      await query(
        "UPDATE recruits SET guild_branch='pvp', updated_at=NOW() WHERE id=$1",
        [recruit.id]
      );

      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        const config = await query("SELECT legion_role_id, admin_channel_id FROM guild_config WHERE guild_id=$1", [guildId]);
        const { legion_role_id, admin_channel_id } = config.rows[0] || {};

        if (member && legion_role_id) {
          await member.roles.add(legion_role_id).catch(e => console.error("[Promotion] Role add failed:", e));
          
          // Notify user
          const { EmbedBuilder } = await import("discord.js");
          const promoEmbed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("⚔️ تهانينا! تمت ترقيتك إلى قيلد النخبة (PvP)")
            .setDescription(
              `أهلاً **${recruit.character_name}**!\n\n` +
              `بسبب نشاطك المستمر ووصولك لـ **${totalPoints} نقطة**، تم ترقيتك تلقائياً إلى **قيلد الـ PvP**.\n\n` +
              `لقد حصلت الآن على رتبة **Aion 2 Legionnaire** وتم تحديث بياناتك في جميع اللوحات كلاعب PvP. استمر في التألق! 🏆`
            )
            .setTimestamp();
          
          await member.send({ embeds: [promoEmbed] }).catch(() => {});

          // Log in admin channel
          if (admin_channel_id) {
            const adminChan = guild.channels.cache.get(admin_channel_id);
            if (adminChan) {
              await adminChan.send({
                content: `🚀 **ترقية تلقائية:** تمت ترقية <@${userId}> (${recruit.character_name}) إلى قيلد الـ **PvP** بعد وصوله لـ ${totalPoints} نقطة.`
              });
            }
          }
        }
      }
    }
  }
}

export async function addWithdrawal(guildId, userId) {
  await query(
    `INSERT INTO points (guild_id, user_id, withdrawals)
     VALUES ($1,$2,1)
     ON CONFLICT (guild_id, user_id) DO UPDATE
     SET withdrawals = points.withdrawals + 1, updated_at = NOW()`,
    [guildId, userId]
  );
}

/**
 * Get player data (Name, Class, Profile Image) from the DB.
 * Used for generating Jewel Cards or other visual assets.
 */
export async function getPlayerData(guildId, userId) {
  const res = await query(
    "SELECT character_name, class_name, profile_image FROM recruits WHERE guild_id=$1 AND user_id=$2 AND status='accepted' LIMIT 1",
    [guildId, userId]
  );
  
  if (!res.rows[0]) return null;
  
  const p = res.rows[0];
  return {
    name:  p.character_name,
    class: p.class_name,
    image: p.profile_image // This is a URL string
  };
}
