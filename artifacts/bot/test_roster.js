import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    // Members channel for Sage Alliance
    const channel = client.channels.cache.get("1507778645962522817") || await client.channels.fetch("1507778645962522817");
    
    const cpDisplay = "222,590";
    
    const rosterEmbed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle(`⚔️ Sorcera`)
      .setDescription(
        `🎉 **نرحب بانضمامك لأسرة التحالف! نحن سعداء ومتحمسون جداً بوجودك معنا.** 🌟\n` +
        `🎊 **Welcome to the Alliance family! We're thrilled to have you here.** ✨\n\n` +
        `> 🏰 **القيلد | Guild:** M3RGEEN\n` +
        `> 👤 **ديسكورد | Discord:** <@136371223209836544>\n` +
        `> 📊 **المستوى | Level:** 45\n` +
        `> 🎮 **الكلاس | Class:** Sorcerer\n` +
        `> 🧬 **العرق | Race:** Elyos\n` +
        `> 🌍 **السيرفر | Server:** Bakarma\n` +
        `> ⚡ **قوة القتال | CP:** ★ ${cpDisplay} ★\n\n` +
        `🔗 **[استعراض البروفايل الكامل | View Full Profile](https://shugo.gg)**`
      )
      .setThumbnail("https://assets.playnccdn.com/static-aion2-gamedata/resources/ICON_SO_SKILL_006.png")
      .setImage("https://profileimg.plaync.com/game_profile_images/aion2_tw/images?gameServerKey=1016&charKey=285978576338186281")
      .setFooter({ text: `Sage Alliance Roster • ${new Date().toLocaleDateString("ar-SA")}` })
      .setTimestamp();

    await channel.send({ content: "**[معاينة تجريبية لشكل بطاقة الترحيب الجديدة]**", embeds: [rosterEmbed] });
    console.log("✅ Test roster card sent successfully.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
