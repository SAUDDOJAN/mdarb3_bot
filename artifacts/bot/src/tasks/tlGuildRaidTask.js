import path from "path";
import { fileURLToPath } from "url";
import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  AttachmentBuilder 
} from "discord.js";
import { query } from "../database/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TL_GUILD_CHANNEL_ID = "1526362737884795011"; // ⚔️｜ريد-القيلد
export const TL_GUILD_ROLE_ID = "1292754458492796982";    // TL Guild
export const TL_LEAD_USER_ID = "651543054691598346";     // nwa_f
export const GUILD_ID = "861355983975874601";             // M3RGEEN

const BOSS_IMAGE_PATH = path.resolve(__dirname, "../../assets/tl_guild_raid_bosses.jpg");

/**
 * Returns current date and time components in Asia/Riyadh (KSA / GMT+3) timezone.
 */
function getRiyadhTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  return {
    weekday: map.weekday, // 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10)
  };
}

/**
 * Creates and posts the Thursday 4:00 PM Guild Raid announcement.
 */
export async function postGuildRaidAnnouncement(client, targetRaidDate = null) {
  try {
    const channel = await client.channels.fetch(TL_GUILD_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error(`[TL Guild Raid Task] Channel ${TL_GUILD_CHANNEL_ID} not found.`);
      return null;
    }

    // Determine target raid time (Thursday 21:00 KSA)
    let raidDate;
    if (targetRaidDate) {
      raidDate = new Date(targetRaidDate);
    } else {
      const r = getRiyadhTime();
      // 21:00 KSA = 18:00 UTC
      raidDate = new Date(Date.UTC(r.year, r.month - 1, r.day, 18, 0, 0));
    }

    const unixTime = Math.floor(raidDate.getTime() / 1000);

    // Fetch nwa_f user details for footer
    const nwafUser = await client.users.fetch(TL_LEAD_USER_ID).catch(() => null);
    const nwafAvatar = nwafUser ? nwafUser.displayAvatarURL() : null;

    const attachment = new AttachmentBuilder(BOSS_IMAGE_PATH, { name: "tl_guild_raid_bosses.jpg" });

    const embed = new EmbedBuilder()
      .setTitle("📢 Guild Raid")
      .setDescription(
        `قيلد ريد اليوم، التجمع في البيس رجاءً نبغى نخلص البوسات يا شباب!\n\n` +
        `⏰ **موعد الحدث:** <t:${unixTime}:F>\n` +
        `⏳ **يبدأ بعد:** <t:${unixTime}:R>`
      )
      .setColor("#E74C3C")
      .setImage("attachment://tl_guild_raid_bosses.jpg")
      .setFields([
        {
          name: "📊 إحصائيات التسجيل",
          value: "✅ بحضر: **0**\n🔄 يمكن أحضر: **0**\n❌ ماراح أحضر: **0**",
          inline: false
        }
      ])
      .setTimestamp(raidDate)
      .setFooter({
        text: `مسؤول قسم ثرون: nwa_f • تنظيم قيلد ريد`,
        iconURL: nwafAvatar || undefined
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("throne:ur_status:yes")
        .setLabel("بحضر")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId("throne:ur_status:maybe")
        .setLabel("يمكن أحضر")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄"),
      new ButtonBuilder()
        .setCustomId("throne:ur_status:no")
        .setLabel("ماراح أقدر أحضر")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌"),
      new ButtonBuilder()
        .setCustomId("throne:ur_view")
        .setLabel("عرض المسجلين")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📋")
    );

    const sentMessage = await channel.send({
      content: `<@&${TL_GUILD_ROLE_ID}>`,
      embeds: [embed],
      components: [row],
      files: [attachment]
    });

    // Save event in database
    await query(
      `INSERT INTO tl_raids_events 
        (message_id, channel_id, raid_type, title, image_url, raid_time, alert_3d_sent, alert_24h_sent, alert_5m_sent, alert_prep_sent, alert_now_sent)
       VALUES ($1, $2, 'guild_raid', 'Guild Raid', 'attachment://tl_guild_raid_bosses.jpg', $3, true, true, false, false, false)`,
      [sentMessage.id, TL_GUILD_CHANNEL_ID, raidDate.toISOString()]
    );

    console.log(`[TL Guild Raid Task] Successfully posted Guild Raid announcement (Msg ID: ${sentMessage.id})`);
    return sentMessage;
  } catch (err) {
    console.error("[TL Guild Raid Task] Error posting raid announcement:", err);
    return null;
  }
}

/**
 * Checks and triggers the automated Thursday schedule:
 * 1) 16:00 (4:00 PM KSA): Post Guild Raid announcement
 * 2) 20:30 (8:30 PM KSA): 30-minute preparation alert
 * 3) 21:00 (9:00 PM KSA): Raid start alert
 */
export async function checkGuildRaidSchedule(client) {
  try {
    const r = getRiyadhTime();

    // Check if today is Thursday
    const isThursday = r.weekday === "Thu";
    if (!isThursday) return;

    // ── 1. 16:00 (4:00 PM KSA) -> Post Announcement ──
    if (r.hour >= 16 && r.hour < 21) {
      // Check if already posted for today's date
      const checkRes = await query(`
        SELECT id FROM tl_raids_events 
        WHERE raid_type = 'guild_raid' 
          AND DATE(raid_time AT TIME ZONE 'Asia/Riyadh') = CURRENT_DATE
      `);

      if (checkRes.rowCount === 0) {
        console.log("[TL Guild Raid Task] Thursday 4:00 PM KSA reached. Posting Guild Raid announcement...");
        await postGuildRaidAnnouncement(client);
      }
    }

    // ── 2. 20:30 (8:30 PM KSA) -> 30-Minute Preparation Alert ──
    if (r.hour === 20 && r.minute >= 30) {
      const prepRes = await query(`
        SELECT * FROM tl_raids_events 
        WHERE raid_type = 'guild_raid' 
          AND alert_prep_sent = false 
          AND DATE(raid_time AT TIME ZONE 'Asia/Riyadh') = CURRENT_DATE
        ORDER BY id DESC LIMIT 1
      `);

      if (prepRes.rowCount > 0) {
        const event = prepRes.rows[0];
        const channel = await client.channels.fetch(TL_GUILD_CHANNEL_ID).catch(() => null);
        if (channel) {
          await channel.send({
            content: 
              `<@&${TL_GUILD_ROLE_ID}>\n` +
              `🔔 **تنبيه تحضير للريد (متبقي 30 دقيقة):**\n` +
              `جهّزوا وخلصوا الدنجنات وكل شيء يا شباب، حنتجمع في القيلد بيس بعد نصف ساعة! ⚔️🏰\n` +
              `🔗 **رابط الإعلان والتسجيل:** https://discord.com/channels/${GUILD_ID}/${TL_GUILD_CHANNEL_ID}/${event.message_id}`
          });
          await query(`UPDATE tl_raids_events SET alert_prep_sent = true WHERE id = $1`, [event.id]);
          console.log(`[TL Guild Raid Task] Sent 30-minute preparation alert for event ${event.id}`);
        }
      }
    }

    // ── 3. 21:00 (9:00 PM KSA) -> Raid Start Alert ──
    if (r.hour >= 21) {
      const startRes = await query(`
        SELECT * FROM tl_raids_events 
        WHERE raid_type = 'guild_raid' 
          AND alert_now_sent = false 
          AND DATE(raid_time AT TIME ZONE 'Asia/Riyadh') = CURRENT_DATE
        ORDER BY id DESC LIMIT 1
      `);

      if (startRes.rowCount > 0) {
        const event = startRes.rows[0];
        const channel = await client.channels.fetch(TL_GUILD_CHANNEL_ID).catch(() => null);
        if (channel) {
          await channel.send({
            content: 
              `<@&${TL_GUILD_ROLE_ID}>\n` +
              `🚨 **بدأ وقت الريد الآن!** التجمع في القيلد بيس فوراً يا أبطال لمواجهة البوسات، الهمة! 🔥⚔️`
          });
          await query(`UPDATE tl_raids_events SET alert_now_sent = true, alert_prep_sent = true WHERE id = $1`, [event.id]);
          console.log(`[TL Guild Raid Task] Sent Raid Start alert for event ${event.id}`);
        }
      }
    }

  } catch (err) {
    console.error("[TL Guild Raid Task] Error during schedule check:", err);
  }
}

/**
 * Initializes the automated Guild Raid background runner.
 */
export function startTlGuildRaidTask(client) {
  console.log("[TL Guild Raid Task] Automated weekly Guild Raid scheduler initialized.");
  
  // Run initial check immediately
  checkGuildRaidSchedule(client).catch(err => console.error("[TL Guild Raid Task] Initial check error:", err));
  
  // Run every 60 seconds
  setInterval(() => {
    checkGuildRaidSchedule(client).catch(err => console.error("[TL Guild Raid Task] Interval check error:", err));
  }, 60000);
}
