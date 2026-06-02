import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import "dotenv/config";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    const channel = await client.channels.fetch("1508678825066762280");
    let reportText = "";

    reportText += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportText += `🛡️ **Shadow Assassins**\n`;
    reportText += `👑 **القيادة:** <@1507733275278577916> | 🏅 **إجمالي نقاط القيلد:** \`250\`\n\n`;
    reportText += `✅ **الحضور (5):**\n<@136371223209836544> \`50pt\` ، <@123456789012345678> \`50pt\` ، <@234567890123456789> \`50pt\` ، <@345678901234567890> \`50pt\` ، <@456789012345678901> \`50pt\`\n\n`;

    reportText += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportText += `🛡️ **Knights of the Abyss**\n`;
    reportText += `👑 **القيادة:** <@1507733319989858435> | 🏅 **إجمالي نقاط القيلد:** \`140\`\n\n`;
    reportText += `✅ **الحضور (2):**\n<@567890123456789012> \`50pt\` ، <@678901234567890123> \`50pt\`\n\n`;
    reportText += `⚠️ **انسحاب مبكر (2):**\n<@789012345678901234> \`20pt\` ، <@890123456789012345> \`20pt\`\n\n`;
    reportText += `❌ **غياب (1):**\n<@901234567890123456>\n`;

    reportText += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportText += `🛡️ **Dragon's Fury**\n`;
    reportText += `👑 **القيادة:** <@1507733404781645874> | 🏅 **إجمالي نقاط القيلد:** \`60\`\n\n`;
    reportText += `⚠️ **انسحاب مبكر (3):**\n<@112233445566778899> \`20pt\` ، <@223344556677889900> \`20pt\` ، <@334455667788990011> \`20pt\`\n\n`;
    reportText += `❌ **غياب (4):**\n<@445566778899001122> ، <@556677889900112233> ، <@667788990011223344> ، <@778899001122334455>\n`;

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("📊 نتائج ومنافسة السيج (Siege Results & Leaderboard)")
      .setDescription(reportText)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log("Mock report sent successfully.");
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
