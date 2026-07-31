import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const channelId = "1526297989734334554";
    const channel = await client.channels.fetch(channelId);
    
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("Test Title")
        .setDescription("**Test Body**\n\n🕒 **الوقت المتبقي:** 5")
        .setColor(0x3498db)
        .setTimestamp();

      const subscribeButton = new ButtonBuilder()
        .setCustomId(`alerts:subscribe:tl_gate`)
        .setLabel(`🔔 تفعيل/إلغاء التنبيه`)
        .setStyle(ButtonStyle.Secondary);
      
      const actionRow = new ActionRowBuilder().addComponents(subscribeButton);

      let mentionsStr = ""; // Simulating empty mentions

      await channel.send({
        content: mentionsStr || " ",
        embeds: [embed],
        components: [actionRow]
      });
      console.log("Message sent successfully via discord.js!");
    } else {
      console.log("Channel not found.");
    }
  } catch(e) {
    console.error("Error sending message:", e);
  }
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
