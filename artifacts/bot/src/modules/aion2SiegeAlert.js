import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../../aion2_siege_attendees.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[aion2SiegeAlert] Failed to read attendees file:", err.message);
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[aion2SiegeAlert] Failed to write attendees file:", err.message);
  }
}

export function getAttendees(messageId) {
  const data = loadData();
  return Array.isArray(data[messageId]) ? data[messageId] : [];
}

export function buildSiegeComponents(attendeeCount = 0) {
  const attendBtn = new ButtonBuilder()
    .setCustomId("aion2_siege_attend")
    .setLabel(`تأكيد الحضور (${attendeeCount})`)
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const listBtn = new ButtonBuilder()
    .setCustomId("aion2_siege_list")
    .setLabel("قائمة الحضور 📋")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(attendBtn, listBtn);
}

export async function handleInteraction(interaction) {
  const customId = interaction.customId;
  const messageId = interaction.message.id;

  if (customId === "aion2_siege_list") {
    const attendees = getAttendees(messageId);
    if (attendees.length === 0) {
      return interaction.reply({
        content: "📋 **قائمة الحضور:** لا يوجد أي لاعبين مسجلين حضورهم حتى الآن. كن أول من يسجل بالضغط على ✅!",
        ephemeral: true
      });
    }

    const mentions = attendees.map((id, index) => `${index + 1}. <@${id}>`).join("\n");
    return interaction.reply({
      content: `📋 **قائمة الحضور المؤكدين للحصار (${attendees.length} لاعب):**\n\n${mentions}`,
      ephemeral: true
    });
  }

  if (customId === "aion2_siege_attend") {
    const userId = interaction.user.id;
    const data = loadData();
    let attendees = Array.isArray(data[messageId]) ? [...data[messageId]] : [];

    const isAlreadyAttending = attendees.includes(userId);

    if (isAlreadyAttending) {
      attendees = attendees.filter(id => id !== userId);
      data[messageId] = attendees;
      saveData(data);

      await interaction.reply({
        content: "⚠️ **تم إلغاء تسجيل حضورك في الحصار.** إذا رغبت بالحضور مجدداً اضغط على الزر في أي وقت.",
        ephemeral: true
      });
    } else {
      attendees.push(userId);
      data[messageId] = attendees;
      saveData(data);

      await interaction.reply({
        content: "✅ **كفو يا بطل! تم تسجيل حضورك في الحصار بنجاح.**\nنراك في المعركة، جهز بوفاتك وعربتك القتالية! 🔥⚔️",
        ephemeral: true
      });
    }

    // Update message components and embed with the new count
    try {
      const originalEmbed = interaction.message.embeds[0];
      if (originalEmbed) {
        const embedBuilder = EmbedBuilder.from(originalEmbed);

        // Update the attendees count in embed description
        let desc = embedBuilder.data.description || "";
        const countRegex = /(👥\s*\*\*عدد الحضور المؤكدين:\*\*\s*`)\d+(\s*لاعب\s*✅?`)/;
        if (countRegex.test(desc)) {
          desc = desc.replace(countRegex, `$1${attendees.length}$2`);
        } else {
          desc += `\n\n👥 **عدد الحضور المؤكدين:** \`${attendees.length} لاعب ✅\``;
        }
        embedBuilder.setDescription(desc);

        const newRow = buildSiegeComponents(attendees.length);
        await interaction.message.edit({
          embeds: [embedBuilder],
          components: [newRow]
        });
      }
    } catch (editErr) {
      console.warn("[aion2SiegeAlert] Failed to update message embed count:", editErr.message);
    }
  }
}
