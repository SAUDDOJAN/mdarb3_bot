import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

try {
  GlobalFonts.registerFromPath(path.join(process.cwd(), "assets", "Cairo-Bold.ttf"), "Cairo");
} catch (e) {
  console.error("Failed to load Cairo font:", e);
}

async function run() {
  const bannerPath = path.join(process.cwd(), "assets", "welcome_banner_v2.png");
  const banner = await loadImage(bannerPath);
  const canvas = createCanvas(banner.width, banner.height);
  const ctx = canvas.getContext("2d");

  // Load Member Avatar
  let avatar = await loadImage("https://cdn.discordapp.com/embed/avatars/0.png");

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

  const username = "xeonspirit";
  ctx.font = "bold 75px Cairo, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(username, 339, 790);

  fs.writeFileSync("scratch/test_welcome.png", canvas.toBuffer("image/png"));
  console.log("Image saved to scratch/test_welcome.png");
}

run();
