import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    // 1. Update Roster Cards
    const res = await pool.query("SELECT roster_message_id FROM sage_recruitment WHERE roster_message_id IS NOT NULL");
    const channelId = process.env.SAGE_ROSTER_CHANNEL_ID || "1507778645962522817"; // Roster channel ID
    const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(()=>null);
    if (!channel) return console.log("Channel not found");
    
    let updated = 0;
    for (const row of res.rows) {
      try {
        const msg = await channel.messages.fetch(row.roster_message_id);
        if (msg && msg.embeds.length > 0) {
          const oldEmbed = msg.embeds[0];
          const newEmbed = EmbedBuilder.from(oldEmbed);
          let changed = false;
          
          if (oldEmbed.footer?.text && oldEmbed.footer.text.includes("Sage")) {
            newEmbed.setFooter({ text: oldEmbed.footer.text.replace(/Sage/g, "Siege") });
            changed = true;
          }
          if (oldEmbed.description && oldEmbed.description.includes("Sage")) {
            newEmbed.setDescription(oldEmbed.description.replace(/Sage/g, "Siege"));
            changed = true;
          }
          if (changed) {
            await msg.edit({ embeds: [newEmbed] });
            updated++;
          }
        }
      } catch (err) {
        console.error("Failed to update message", row.roster_message_id, err.message);
      }
    }
    console.log(`Successfully updated ${updated} roster cards.`);
  } catch(e) {
    console.error(e);
  } finally {
    client.destroy();
    pool.end();
  }
});
client.login(process.env.DISCORD_BOT_TOKEN);
