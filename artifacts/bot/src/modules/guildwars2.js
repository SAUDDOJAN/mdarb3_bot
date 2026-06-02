import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import axios from "axios";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import path from "path";

// Register custom font to avoid missing font issues
try {
  const fontPath = path.join(process.cwd(), "assets", "Tajawal-Bold.ttf");
  GlobalFonts.registerFromPath(fontPath, "TajawalCustom");
} catch (e) {
  console.error("Failed to load Tajawal font in GW2 module:", e);
}

const GW2_ROLE_ID = "1511293343353667656";
const GW2_EVENTS_CHANNEL_ID = "1511298966707245077";
const GW2_MEMBERS_CHANNEL_ID = "1511308034939289700";

const GW2_CLASSES = [
  { label: "Warrior", value: "Warrior", emoji: "⚔️" },
  { label: "Guardian", value: "Guardian", emoji: "🛡️" },
  { label: "Revenant", value: "Revenant", emoji: "👁️" },
  { label: "Ranger", value: "Ranger", emoji: "🏹" },
  { label: "Thief", value: "Thief", emoji: "🗡️" },
  { label: "Engineer", value: "Engineer", emoji: "🔧" },
  { label: "Necromancer", value: "Necromancer", emoji: "💀" },
  { label: "Elementalist", value: "Elementalist", emoji: "🔥" },
  { label: "Mesmer", value: "Mesmer", emoji: "🦋" }
];

export async function setupGw2JoinEmbed(interaction) {
  const channelId = "1511298206762401862";
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.reply({ content: "Channel not found.", ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle("Guild Wars 2 - انضمام للقيلد")
    .setDescription("أهلاً بك في قسم لعبة Guild Wars 2! للانضمام للقيلد الخاص بنا، يرجى قراءة القوانين والضغط على زر الانضمام بالأسفل لتحديد كلاسك الخاص.")
    .addFields(
      { name: "قوانين القيلد", value: "1. الاحترام المتبادل بين جميع الأعضاء.\n2. التفاعل والمشاركة في فعاليات القيلد قدر الإمكان.\n3. الالتزام بتوجيهات القادة أثناء فعاليات World Bosses والـ Meta Events." }
    )
    .setColor("#B70000");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gw2:join")
      .setLabel("الانضمام للقيلد ⚔️")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: "تم إرسال رسالة الانضمام بنجاح.", ephemeral: true });
}

async function handleGw2JoinButton(interaction) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("gw2:class_select")
    .setPlaceholder("اختر كلاسك الرئيسي في Guild Wars 2...")
    .addOptions(GW2_CLASSES);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.reply({
    content: "مرحباً بك! الرجاء اختيار كلاسك (المهنة) الذي تلعب به:",
    components: [row],
    ephemeral: true
  });
}

async function handleGw2ClassSelect(interaction) {
  const selectedClass = interaction.values[0];
  const role = interaction.guild.roles.cache.get(GW2_ROLE_ID);
  
  if (!role) {
    return interaction.reply({ content: "حدث خطأ: لم يتم العثور على الرتبة المخصصة للقيلد.", ephemeral: true });
  }

  try {
    // If they already have the role, don't re-announce, just update the class maybe? 
    // For now we just add the role and announce.
    const isNew = !interaction.member.roles.cache.has(role.id);
    await interaction.member.roles.add(role);
    await interaction.reply({ 
      content: `تم منحك رتبة Guild Wars 2 بنجاح!\nالكلاس الذي اخترته: **${selectedClass}**. نتمنى لك وقتاً ممتعاً في Tyria!`, 
      ephemeral: true 
    });

    if (isNew) {
      // Draw Fancy Card
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext("2d");

      // Background Gradient
      const gradient = ctx.createLinearGradient(0, 0, 800, 300);
      gradient.addColorStop(0, "#4a0000"); // dark red
      gradient.addColorStop(0.5, "#1a0000");
      gradient.addColorStop(1, "#000000");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 800, 300);

      // Add a cool subtle glow/shapes
      ctx.fillStyle = "rgba(255, 50, 50, 0.1)";
      ctx.beginPath();
      ctx.arc(800, 150, 300, 0, Math.PI * 2);
      ctx.fill();

      // Draw Avatar
      const avatarX = 150;
      const avatarY = 150;
      const avatarRadius = 100;

      let avatar;
      const avatarUrl = interaction.member.user.displayAvatarURL({ extension: "png", size: 256 });
      try {
        avatar = await loadImage(avatarUrl);
      } catch (e) {
        avatar = await loadImage("https://cdn.discordapp.com/embed/avatars/0.png");
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();

      // Avatar Border
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#ff3333";
      ctx.stroke();

      // Text Formatting
      ctx.font = 'bold 45px "TajawalCustom", sans-serif';
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 5;
      
      const textX = 300;
      // "مقاتل جديد انضم للقيلد!"
      ctx.fillText("مقاتل جديد في قيلد GW2!", textX, 100);

      // Username
      ctx.font = 'bold 55px "TajawalCustom", sans-serif';
      ctx.fillStyle = "#ffcc00"; // Gold
      ctx.fillText(interaction.user.username, textX, 170);

      // Class Name
      ctx.font = '35px "TajawalCustom", sans-serif';
      ctx.fillStyle = "#cccccc";
      
      const classEmoji = GW2_CLASSES.find(c => c.value === selectedClass)?.emoji || "";
      ctx.fillText(`الكلاس: ${selectedClass} ${classEmoji}`, textX, 235);

      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, { name: "gw2_welcome.png" });

      let membersChannel = interaction.guild.channels.cache.get(GW2_MEMBERS_CHANNEL_ID);
      if (!membersChannel) {
        membersChannel = await interaction.guild.channels.fetch(GW2_MEMBERS_CHANNEL_ID).catch(() => null);
      }

      if (membersChannel) {
        await membersChannel.send({
          content: `رحبو معانا بالبطل <@${interaction.user.id}>! إضافة قوية للقيلد بكلاس الـ **${selectedClass}**. ⚔️🔥`,
          files: [attachment]
        });
      } else {
        console.error(`[GW2] Could not find or fetch the members channel: ${GW2_MEMBERS_CHANNEL_ID}`);
      }
    }

  } catch (error) {
    console.error("[GW2] Error adding role/card:", error);
    if (!interaction.replied) {
      await interaction.reply({ content: "حدث خطأ أثناء إعطائك الرتبة. تأكد من صلاحيات البوت.", ephemeral: true });
    }
  }
}

export async function handleInteraction(interaction) {
  const customId = interaction.customId;
  if (customId === "gw2:join") {
    await handleGw2JoinButton(interaction);
  } else if (customId === "gw2:class_select") {
    await handleGw2ClassSelect(interaction);
  }
}

// Event Scheduler
let lastEventNotified = null;

export function startGw2EventCron(client) {
  // Check every minute for upcoming events
  setInterval(async () => {
    try {
      const channel = client.channels.cache.get(GW2_EVENTS_CHANNEL_ID);
      if (!channel) return;

      const response = await axios.get("https://wiki.guildwars2.com/wiki/Widget:Event_timer/data.json?action=raw", {
        headers: {
          "User-Agent": "M3RGEEN-Discord-Bot/1.0"
        },
        responseType: 'text' // to handle BOM easily
      });
      
      const text = response.data;
      // Remove BOM if present
      const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
      const data = JSON.parse(cleanText);
      const eventsData = data.events || data;

      // Current time in UTC
      const now = new Date();
      const h = now.getUTCHours();
      const m = now.getUTCMinutes();
      const currentMinutes = h * 60 + m;

      // Filter important event groups by name
      const IMPORTANT_NAMES = ["World bosses", "Hard world bosses", "Ley-Line Anomaly", "Auric Basin", "Tangled Depths", "Dragon's Stand", "Dragonstorm", "The Echovald Wilds", "Dragon's End"];
      
      const upcomingEvents = [];

      Object.keys(eventsData).forEach(key => {
        const eventGroup = eventsData[key];
        if (!eventGroup || !IMPORTANT_NAMES.includes(eventGroup.name)) return;

        if (eventGroup.sequences && eventGroup.sequences.pattern && eventGroup.sequences.pattern.length > 0) {
          let timePointer = 0;
          let iterations = 0;
          while (timePointer <= 1440 && iterations < 100) {
            iterations++;
            for (const seq of eventGroup.sequences.pattern) {
              // seq.d is duration in minutes
              // if it's an event (seq.r > 0), we check time
              if (seq.r > 0 && eventGroup.segments[seq.r]) {
                // Time diff
                let diff = timePointer - currentMinutes;
                // Wrap around daily schedule
                if (diff < -120) diff += 1440;
                
                if (diff > 0 && diff <= 15) { // Notify 15 minutes before
                  upcomingEvents.push({
                    name: eventGroup.segments[seq.r].name || eventGroup.name,
                    minutesUntil: diff,
                    id: `${key}-${timePointer}`
                  });
                }
              }
              timePointer += seq.d;
            }
          }
        }
      });

      // Filter and send
      for (const ev of upcomingEvents) {
        if (lastEventNotified !== ev.id) {
          lastEventNotified = ev.id;

          const spawnTime = Math.floor((now.getTime() + ev.minutesUntil * 60000) / 1000);
          const embed = new EmbedBuilder()
            .setTitle("⚠️ انتبه! حدث مهم قادم في Guild Wars 2")
            .setDescription(`الحدث **${ev.name}** سيبدأ قريباً!`)
            .addFields({ name: "وقت البدء", value: `<t:${spawnTime}:R>` })
            .setColor("#FFD700");

          await channel.send({ content: `<@&${GW2_ROLE_ID}>`, embeds: [embed] });
        }
      }

    } catch (e) {
      console.error("[GW2] Error in background task:", e.message);
    }
  }, 60000);
}
