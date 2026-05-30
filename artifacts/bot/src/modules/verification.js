import { AttachmentBuilder } from "discord.js";
import { query } from "../database/index.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import path from "path";

// Register custom font to avoid missing font issues on Railway/Linux
try {
  const fontPath = path.join(process.cwd(), "assets", "Cairo-Bold.ttf");
  GlobalFonts.registerFromPath(fontPath, "CairoCustom");
  console.log("[Welcome] Registered font CairoCustom from:", fontPath);
} catch (e) {
  console.error("Failed to load Cairo font:", e);
}

export async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;

  const { customId, member, guild } = interaction;

  if (customId === "verify:agree") {
    // We defer the update to give us time and hide the loading state quickly
    await interaction.deferReply({ flags: 64 });

    const VISITOR_ROLE_ID = "1509197562203344937";
    const MEMBER_ROLE_ID = "1262605914918359140";

    try {
      // Check if the user already has the member role
      if (member.roles.cache.has(MEMBER_ROLE_ID)) {
        await interaction.editReply({
          content: "✅ أنت تمتلك عضوية المعرقين مسبقاً!",
        });
        return;
      }

      // Add Member Role and remove Visitor Role
      await member.roles.add(MEMBER_ROLE_ID);
      await member.roles.remove(VISITOR_ROLE_ID).catch(() => {});

      await interaction.editReply({
        content: "🎉 تم تفعيل عضويتك بنجاح وحصولك على رتبة المعرقين! حياك الله بين أخوانك.",
      });

      // ─── Welcome Image & Text Generation ──────────────────────────────────
      try {
        const res = await query(
          "SELECT welcome_channel_id FROM guild_config WHERE guild_id = $1",
          [guild.id]
        );
        const config = res.rows[0];
        const welcomeChannelId = config?.welcome_channel_id || "861355985023926315";
        if (welcomeChannelId) {
          const channel = guild.channels.cache.get(welcomeChannelId) || await guild.channels.fetch(welcomeChannelId).catch(() => null);
          if (channel) {
            // Generate Image
            const bannerPath = path.join(process.cwd(), "assets", "welcome_banner_v2.png");
            const banner = await loadImage(bannerPath);
            const canvas = createCanvas(banner.width, banner.height);
            const ctx = canvas.getContext("2d");

            // Load Member Avatar
            const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 512 });
            let avatar;
            try {
              avatar = await loadImage(avatarUrl);
            } catch (err) {
              // Fallback if avatar fails to load
              avatar = await loadImage("https://cdn.discordapp.com/embed/avatars/0.png");
            }

            const avatarX = 339;
            const avatarY = 321;
            const avatarRadius = 260;

            // Draw Avatar BEHIND
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
            ctx.restore();

            // Draw Transparent Banner ON TOP
            ctx.drawImage(banner, 0, 0);

            const username = member.user.username;
            ctx.font = '75px "CairoCustom"';
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillText(username, 339, 790);

            const buffer = canvas.toBuffer("image/png");
            const attachment = new AttachmentBuilder(buffer, { name: "welcome.png" });

            // Compose Welcome Text
            const welcomeText = `يا هلا بـ **${member}** في مجتمع المعرقين! 🛡️✨\n\n` +
              `ندري إن الخطوة الأولى والمشاركة في مجتمعات جديدة ممكن تكون صعبة أو تسبب شوية توتر، وعشان كذا نبيك ترتاح.. هنا ما فيه أي ضغط عليك!\n` +
              `تقدر تقعد في المدرج وتتفرج، أو تشارك متى ما حسيت إنك جاهز. مكانك محفوظ ومرحب بك دائماً كجزء من الجيش.\n\n` +
              `إذا احتجت أي شي أو حبيت تسولف على خفيف، الكل هنا إخوانك وفي خدمتك. نوّرتنا! 🤍`;

            await channel.send({ content: welcomeText, files: [attachment] });

            // Send short text to general chat
            try {
              const generalChannelId = "1294312574162178200";
              const generalChannel = guild.channels.cache.get(generalChannelId) || await guild.channels.fetch(generalChannelId);
              if (generalChannel) {
                await generalChannel.send(`يا هلا ومرحباً بك يا <@${member.user.id}> في جيش المعرقين! نورتنا يا وحش، خذ راحتك والميدان ميدانك! ⚔️🔥`);
              }
            } catch (err) {
              console.error("[Welcome] Error sending short text to general chat:", err);
            }
          }
        }
      } catch (err) {
        console.error("[Welcome] Error sending welcome message after verification:", err);
      }

    } catch (error) {
      console.error("[Verification] Error verifying member:", error);
      await interaction.editReply({
        content: "❌ حدث خطأ أثناء تفعيل العضوية. يرجى التواصل مع الإدارة.",
      });
    }
  }
}
