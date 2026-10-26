import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

export const LFG_CHANNEL_ID = '1548358065945059428';
const CONFIG_PATH = path.join(process.cwd(), 'src', 'modules', 'aion2Lfg', 'panel_config.json');

// The known fixed Message ID in production right now
const FALLBACK_FIXED_ID = '1552502070198804491';

function getStoredPanelId() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return data.panelMessageId;
    }
  } catch (e) {
    console.error("[LFG] Error reading panel config", e);
  }
  return FALLBACK_FIXED_ID;
}

function storePanelId(messageId) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ panelMessageId: messageId }, null, 2));
  } catch (e) {
    console.error("[LFG] Error writing panel config", e);
  }
}

/**
 * Ensures the main LFG Panel exists using a Stable Message ID.
 */
export async function ensureLfgPanel(client) {
  try {
    const channel = await client.channels.fetch(LFG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    let existingPanel = null;
    const storedId = getStoredPanelId();

    // 1. Try fetching by stable ID
    if (storedId) {
      try {
        const msg = await channel.messages.fetch(storedId);
        if (msg && msg.author.id === client.user.id) {
          existingPanel = msg;
        }
      } catch (err) {
        console.log(`[LFG] Stored Panel ID ${storedId} not found or deleted.`);
      }
    }

    // 2. Fallback search if stable ID failed
    if (!existingPanel) {
      const messages = await channel.messages.fetch({ limit: 20 });
      existingPanel = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title === 'AION 2 LFG Control Panel');
      if (existingPanel) {
        console.log(`[LFG] Found panel via fallback search. New ID: ${existingPanel.id}`);
        storePanelId(existingPanel.id);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('AION 2 LFG Control Panel')
      .setDescription('اختر النشاط الذي ترغب في إنشاء مجموعة له أو الانضمام إليه.\n\n🛡️ **الأنشطة المتاحة:**\n- إكسبدشن: مجموعات 5 لاعبين\n- ترانسندنس: مجموعات 5 لاعبين (4 مراحل)\n- سانكشوري: مجموعات 10 لاعبين\n- أبيس: مجموعات 20 لاعب (بدون قيود كلاس)\n- زعماء العالم: مجموعات 20 لاعب (بدون قيود كلاس)')
      .setColor('#9A67D2');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('aion2_lfg_nav_dungeons')
        .setLabel('إكسبدشن')
        .setEmoji('🗡️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('aion2_lfg_nav_transcendence')
        .setLabel('ترانسندنس')
        .setEmoji('✨')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('aion2_lfg_nav_sanctuary')
        .setLabel('سانكشوري')
        .setEmoji('⛩️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('aion2_lfg_nav_abyss')
        .setLabel('أبيس')
        .setEmoji('⚔️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('aion2_lfg_nav_world_boss')
        .setLabel('زعماء العالم')
        .setEmoji('👹')
        .setStyle(ButtonStyle.Danger)
    );

    if (existingPanel) {
      // Edit existing to avoid spam
      await existingPanel.edit({ embeds: [embed], components: [row] });
      console.log(`[LFG Stage B1.1] Panel updated. Message ID: ${existingPanel.id}`);
      return existingPanel.id;
    } else {
      // Send new and store ID
      const newMsg = await channel.send({ embeds: [embed], components: [row] });
      console.log(`[LFG Stage B1.1] Panel created. Message ID: ${newMsg.id}`);
      storePanelId(newMsg.id);
      return newMsg.id;
    }
  } catch (err) {
    console.error("[LFG Stage B1.1] Error ensuring LFG Panel:", err);
  }
}
