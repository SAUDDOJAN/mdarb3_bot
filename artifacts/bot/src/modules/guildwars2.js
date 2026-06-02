import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";

const GW2_ROLE_ID = "1511293343353667656";
const GW2_EVENTS_CHANNEL_ID = "1511298966707245077";

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
  } catch (error) {
    console.error("[GW2] Error adding role:", error);
    await interaction.reply({ content: "حدث خطأ أثناء إعطائك الرتبة. تأكد من صلاحيات البوت.", ephemeral: true });
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

      // Current time in UTC
      const now = new Date();
      const h = now.getUTCHours();
      const m = now.getUTCMinutes();
      const currentMinutes = h * 60 + m;

      // Filter important categories
      const IMPORTANT_CATS = ["Hardcore World Bosses", "World Bosses"];
      
      const upcomingEvents = [];

      Object.keys(data).forEach(key => {
        const eventGroup = data[key];
        if (!eventGroup || !IMPORTANT_CATS.includes(eventGroup.category)) return;

        if (eventGroup.sequences && eventGroup.sequences.pattern) {
          let timePointer = 0;
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
