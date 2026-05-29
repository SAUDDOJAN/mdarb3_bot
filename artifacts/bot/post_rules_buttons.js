import "dotenv/config";
import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    const channelId = "1507701269035225188"; 
    const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId);

    const messages = await channel.messages.fetch({ limit: 10 });
    for (const [id, msg] of messages) {
      if (msg.author.id === client.user.id) {
        await msg.delete().catch(() => {});
      }
    }

    const embedEng = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("📜 Siege Alliance Protocol")
      .setDescription(
        "• Mutual respect is mandatory at all times.\n" +
        "• No public drama or conflicts in any channel.\n" +
        "• 🚨 Zero Tolerance: Any toxicity = Immediate kick.\n" +
        "• All disputes must be resolved via DM with staff.\n" +
        "• Character verification is mandatory."
      );

    embedEng.setFooter({ text: "Siege Alliance • Authorized Protocol" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sage_gate_agree")
        .setLabel("✅ I Agree")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("sage_gate_reject")
        .setLabel("❌ I Disagree")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embedEng], components: [row] });
    console.log("✅ Gatekeeper messages sent successfully.");

  } catch (err) {
    console.error("Error adding buttons:", err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
