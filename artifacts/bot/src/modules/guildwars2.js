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
    await interaction.member.roles.add(role);
    await interaction.reply({ 
      content: `تم منحك رتبة Guild Wars 2 بنجاح!\nالكلاس الذي اخترته: **${selectedClass}**. نتمنى لك وقتاً ممتعاً في Tyria!`, 
      ephemeral: true 
    });

    // Send Welcome Embed to members channel
    try {
      const classEmoji = GW2_CLASSES.find(c => c.value === selectedClass)?.emoji || "⚔️";
      const avatarUrl = interaction.member.user.displayAvatarURL({ extension: "png", size: 256 });

      const welcomeEmbed = new EmbedBuilder()
        .setColor("#B70000")
        .setTitle(`⚔️ مقاتل جديد انضم لقيلد Guild Wars 2!`)
        .setDescription(`رحبو معانا بالبطل <@${interaction.user.id}>!\nإضافة قوية للقيلد بكلاس الـ **${selectedClass}** ${classEmoji} 🔥`)
        .setThumbnail(avatarUrl)
        .addFields(
          { name: "الاسم", value: interaction.user.username, inline: true },
          { name: "الكلاس", value: `${selectedClass} ${classEmoji}`, inline: true },
          { name: "\u200b", value: "\u200b", inline: true }
        )
        .setFooter({ text: "Guild Wars 2 • M3RGEEN Gaming Community" })
        .setTimestamp();

      // Use client.channels.fetch for reliability
      const membersChannel = await interaction.client.channels.fetch(GW2_MEMBERS_CHANNEL_ID);

      if (!membersChannel) {
        await interaction.followUp({ content: `❌ الروم غير موجود.`, ephemeral: true });
        return;
      }

      console.log(`[GW2] Found channel: ${membersChannel.name} (type: ${membersChannel.type})`);
      await membersChannel.send({ embeds: [welcomeEmbed] });
      console.log(`[GW2] Welcome embed sent for ${interaction.user.username}`);

    } catch (embedError) {
      console.error("[GW2] Error sending welcome embed:", embedError);
      await interaction.followUp({ 
        content: `❌ خطأ: ${embedError.message}\nCode: ${embedError.code || "N/A"}\nStatus: ${embedError.status || "N/A"}`, 
        ephemeral: true 
      });
    }


  } catch (error) {
    console.error("[GW2] Error adding role/card:", error);
    if (!interaction.replied) {
      await interaction.reply({ content: `حدث خطأ: ${error.message}`, ephemeral: true });
    } else {
      await interaction.followUp({ content: `حدث خطأ أثناء إنشاء البطاقة: ${error.message}`, ephemeral: true });
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
const notifiedEvents = new Set();

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
                  // Make sure ID includes the day to reset automatically, or just clear the Set occasionally.
                  // Since timePointer is daily, appending the day of month prevents infinite growth if we clear it daily.
                  const day = now.getUTCDate();
                  upcomingEvents.push({
                    name: eventGroup.segments[seq.r].name || eventGroup.name,
                    minutesUntil: diff,
                    id: `${key}-${timePointer}-day${day}`
                  });
                }
              }
              timePointer += seq.d;
            }
          }
        }
      });

      // Clear the set periodically to prevent memory leaks (e.g., if day changes)
      // Since we append `-day${now.getUTCDate()}` to the ID, old IDs won't match tomorrow's events.
      // We can just keep the Set size small by deleting old entries if it gets too large.
      if (notifiedEvents.size > 500) {
        notifiedEvents.clear();
      }

      // Filter and send
      for (const ev of upcomingEvents) {
        if (!notifiedEvents.has(ev.id)) {
          notifiedEvents.add(ev.id);

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
