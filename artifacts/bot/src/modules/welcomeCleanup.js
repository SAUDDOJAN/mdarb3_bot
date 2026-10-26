export const GENERAL_CHAT_CHANNEL_ID = "1294312574162178200";

/**
 * Strict safety filter to verify a message is definitely an old welcome message sent by the bot.
 */
export function isWelcomeMessage(msg, botId) {
  if (!msg) return false;
  // 1. Must be sent by MDARB3 Manager itself
  if (msg.author?.id !== botId) return false;
  // 2. Must be in the designated general chat channel
  if (msg.channelId !== GENERAL_CHAT_CHANNEL_ID) return false;
  // 3. Must contain the distinctive welcome phrases
  const text = msg.content || "";
  return text.includes("في جيش المعرقين") && text.includes("الميدان ميدانك");
}

/**
 * Scans the general chat channel for old welcome messages backwards up to maxScan messages.
 */
export async function scanWelcomeMessages(client, maxScan = 1000) {
  const channel = client.channels.cache.get(GENERAL_CHAT_CHANNEL_ID) ||
                  await client.channels.fetch(GENERAL_CHAT_CHANNEL_ID).catch(() => null);
  if (!channel) throw new Error(`تعذر العثور على الشات العام (${GENERAL_CHAT_CHANNEL_ID})`);

  const matched = [];
  let lastId = null;
  let totalScanned = 0;
  const botId = client.user.id;

  while (totalScanned < maxScan) {
    const fetchLimit = Math.min(100, maxScan - totalScanned);
    const options = { limit: fetchLimit };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options).catch(err => {
      console.error("[WelcomeCleanup] Error fetching batch:", err.message);
      return null;
    });

    if (!messages || messages.size === 0) break;

    for (const msg of messages.values()) {
      totalScanned++;
      if (isWelcomeMessage(msg, botId)) {
        matched.push(msg);
      }
    }

    lastId = messages.last()?.id;
    if (!lastId || messages.size < fetchLimit) break;
  }

  return { channel, matched, totalScanned };
}

/**
 * Safely deletes matched welcome messages with bulkDelete (< 14 days) and individual deletion with rate-limiting (>= 14 days).
 */
export async function deleteMatchedWelcomeMessages(channel, matchedMessages, botId) {
  let deletedCount = 0;
  let failedCount = 0;

  const now = Date.now();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  const bulkThreshold = now - (FOURTEEN_DAYS_MS - 5 * 60 * 1000); // 5 min safety margin

  const bulkDeletable = [];
  const individualDeletable = [];

  for (const msg of matchedMessages) {
    if (!isWelcomeMessage(msg, botId)) continue; // Double safety check

    if (msg.createdTimestamp > bulkThreshold) {
      bulkDeletable.push(msg);
    } else {
      individualDeletable.push(msg);
    }
  }

  // 1. Bulk delete messages newer than 14 days
  if (bulkDeletable.length > 0) {
    for (let i = 0; i < bulkDeletable.length; i += 100) {
      const chunk = bulkDeletable.slice(i, i + 100);
      try {
        if (chunk.length === 1) {
          await chunk[0].delete();
          deletedCount += 1;
        } else {
          const deleted = await channel.bulkDelete(chunk, true);
          deletedCount += deleted.size;
        }
      } catch (err) {
        console.warn("[WelcomeCleanup] Bulk delete fallback to individual:", err.message);
        for (const msg of chunk) {
          try {
            await msg.delete();
            deletedCount++;
            await new Promise(r => setTimeout(r, 400));
          } catch (_) {
            failedCount++;
          }
        }
      }
    }
  }

  // 2. Delete messages older than 14 days individually with rate-limit sleep
  if (individualDeletable.length > 0) {
    for (const msg of individualDeletable) {
      try {
        await msg.delete();
        deletedCount++;
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.warn(`[WelcomeCleanup] Failed to delete message ${msg.id}:`, err.message);
        failedCount++;
      }
    }
  }

  return { deletedCount, failedCount };
}

// ── In-Memory Sessions for Confirmation ──
const activeSessions = new Map();

export function createCleanupSession(userId, channelId, messageIds) {
  const sessionId = Math.random().toString(36).substring(2, 10);
  activeSessions.set(sessionId, {
    userId,
    channelId,
    messageIds,
    createdAt: Date.now()
  });

  // Expire session after 10 minutes
  setTimeout(() => {
    activeSessions.delete(sessionId);
  }, 10 * 60 * 1000);

  return sessionId;
}

export function getCleanupSession(sessionId) {
  return activeSessions.get(sessionId);
}

export function deleteCleanupSession(sessionId) {
  activeSessions.delete(sessionId);
}

/**
 * Handles confirmation and cancellation buttons.
 */
export async function handleCleanupButton(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1]; // "confirm" or "cancel"
  const sessionId = parts[2];

  const session = getCleanupSession(sessionId);

  if (action === "cancel") {
    deleteCleanupSession(sessionId);
    return interaction.update({
      content: "❌ تم إلغاء عملية تنظيف رسائل الترحيب.",
      embeds: [],
      components: []
    });
  }

  if (action === "confirm") {
    if (!session) {
      return interaction.update({
        content: "⚠️ انتهت صلاحية جلسة التنظيف هذه. يرجى تشغيل الأمر مرة أخرى.",
        embeds: [],
        components: []
      });
    }

    if (interaction.user.id !== session.userId) {
      return interaction.reply({
        content: "❌ هذا الإجراء مخصص للمسؤول الذي بدأ عملية الفحص فقط.",
        flags: 64
      });
    }

    await interaction.update({
      content: `⏳ **جاري تنظيف ${session.messageIds.length} رسالة ترحيب من الشات العام بأمان...**\nيرجى الانتظار لحين اكتمال المعالجة.`,
      embeds: [],
      components: []
    });

    deleteCleanupSession(sessionId);

    const channel = interaction.client.channels.cache.get(session.channelId) ||
                    await interaction.client.channels.fetch(session.channelId).catch(() => null);

    if (!channel) {
      return interaction.editReply({
        content: "❌ تعذر الوصول إلى الشات العام لإكمال الحذف."
      });
    }

    // Fetch the target messages safely
    const messagesToDelete = [];
    for (const id of session.messageIds) {
      try {
        const msg = await channel.messages.fetch(id).catch(() => null);
        if (msg) messagesToDelete.push(msg);
      } catch (_) {}
    }

    const { deletedCount, failedCount } = await deleteMatchedWelcomeMessages(
      channel,
      messagesToDelete,
      interaction.client.user.id
    );

    return interaction.editReply({
      content: `✅ **اكتملت عملية تنظيف رسائل الترحيب القديمة بنجاح!**\n\n` +
               `• **القناة:** <#${session.channelId}>\n` +
               `• **عدد الرسائل المحذوفة بنجاح:** \`${deletedCount}\` رسالة\n` +
               (failedCount > 0 ? `• **تعذر حذف:** \`${failedCount}\` رسالة (ربما حُذفت مسبقاً)\n` : "") +
               `• الشات العام أصبح خالياً من رسائل الترحيب القديمة. ✨`
    });
  }
}
