import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { buildControlPanelPayload } from './instantVoice.js';

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
      existingPanel = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
      if (existingPanel) {
        console.log(`[LFG] Found panel via fallback search. New ID: ${existingPanel.id}`);
        storePanelId(existingPanel.id);
      }
    }

    const payload = buildControlPanelPayload();

    if (existingPanel) {
      // Edit existing to avoid spam
      await existingPanel.edit(payload);
      console.log(`[LFG InstantVoice] Panel updated. Message ID: ${existingPanel.id}`);
      return existingPanel.id;
    } else {
      // Send new and store ID
      const newMsg = await channel.send(payload);
      console.log(`[LFG InstantVoice] Panel created. Message ID: ${newMsg.id}`);
      storePanelId(newMsg.id);
      return newMsg.id;
    }
  } catch (err) {
    console.error("[LFG Stage B1.1] Error ensuring LFG Panel:", err);
  }
}
