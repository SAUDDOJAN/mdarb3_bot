import { EmbedBuilder, PermissionsBitField } from "discord.js";

const LOG_CHANNEL_ID = "1290468734045261885";
const DISCORD_EPOCH_MS = 1420070400000n;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours
const PER_CHANNEL_FETCH_LIMIT = 100;
const SWEEP_CONCURRENCY = 5;
const DEDUP_COOLDOWN_MS = 30 * 1000;
const MAX_TRACKED_MSGS_PER_USER = 150;

// Channels that must never be swept for user messages
const PROTECTED_CHANNEL_IDS = new Set([LOG_CHANNEL_ID]);

// In-memory rolling message tracker: `${guildId}:${userId}` -> Array<{ channelId, messageId, createdAt }>
const recentUserMessages = new Map();

// Dedup / concurrency guards
const seenTimeouts = new Map();
const inFlightPurges = new Set();

function snowflakeToMs(snowflake) {
  if (!snowflake) return 0;
  try {
    return Number((BigInt(snowflake) >> 22n) + DISCORD_EPOCH_MS);
  } catch {
    return 0;
  }
}

function pruneTrackerMap() {
  if (recentUserMessages.size <= 2500) return;
  const cutoff = Date.now() - DEFAULT_LOOKBACK_MS;
  for (const [key, list] of recentUserMessages.entries()) {
    const fresh = list.filter((m) => m.createdAt >= cutoff);
    if (fresh.length === 0) {
      recentUserMessages.delete(key);
    } else {
      recentUserMessages.set(key, fresh);
    }
  }
}

/**
 * Records non-bot guild messages in memory so timeout cleanup can delete known
 * recent messages immediately in addition to sweeping active channels.
 */
export function trackRecentUserMessage(message) {
  if (!message || !message.guild || message.author?.bot || message.webhookId) return;
  const key = `${message.guild.id}:${message.author.id}`;
  const cutoff = Date.now() - DEFAULT_LOOKBACK_MS;

  const existing = recentUserMessages.get(key) || [];
  const filtered = existing.filter((m) => m.createdAt >= cutoff);
  filtered.push({
    channelId: message.channel.id,
    messageId: message.id,
    createdAt: message.createdTimestamp || Date.now(),
  });

  if (filtered.length > MAX_TRACKED_MSGS_PER_USER) {
    filtered.splice(0, filtered.length - MAX_TRACKED_MSGS_PER_USER);
  }

  recentUserMessages.set(key, filtered);
  pruneTrackerMap();
}

function takeTrackedMessages(guildId, userId, cutoffMs) {
  const key = `${guildId}:${userId}`;
  const list = recentUserMessages.get(key) || [];
  recentUserMessages.delete(key);

  const byChannel = new Map();
  for (const entry of list) {
    if (entry.createdAt < cutoffMs || PROTECTED_CHANNEL_IDS.has(entry.channelId)) continue;
    if (!byChannel.has(entry.channelId)) byChannel.set(entry.channelId, new Set());
    byChannel.get(entry.channelId).add(entry.messageId);
  }
  return byChannel;
}

async function deleteMessageBatch(channel, messageIds) {
  const ids = [...messageIds];
  if (ids.length === 0) return 0;

  let deletedCount = 0;

  // Discord allows bulkDelete for 2-100 messages newer than 14 days
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (chunk.length >= 2 && typeof channel.bulkDelete === "function") {
      try {
        const res = await channel.bulkDelete(chunk, true);
        deletedCount += res?.size ?? chunk.length;
        continue;
      } catch (err) {
        // Fall back to individual deletion if bulkDelete fails
        console.warn(`[TimeoutCleaner] bulkDelete fallback in #${channel.name || channel.id}:`, err.message);
      }
    }

    for (const msgId of chunk) {
      try {
        await channel.messages.delete(msgId);
        deletedCount++;
      } catch (err) {
        // Ignore already-deleted messages (10008)
        if (err?.code !== 10008) {
          console.warn(`[TimeoutCleaner] Failed deleting ${msgId} in #${channel.name || channel.id}:`, err.message);
        }
      }
    }
  }

  return deletedCount;
}

/**
 * Collects all readable & manageable text channels and active threads in the guild.
 */
async function collectSweepableChannels(guild, botMember, cutoffMs) {
  const fetchedChannels = await guild.channels.fetch().catch(() => null);
  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);

  const merged = new Map();
  for (const [id, ch] of guild.channels.cache) {
    if (ch) merged.set(id, ch);
  }
  if (fetchedChannels) {
    for (const [id, ch] of fetchedChannels) {
      if (ch && !merged.has(id)) merged.set(id, ch);
    }
  }
  if (activeThreads?.threads) {
    for (const [id, th] of activeThreads.threads) {
      if (th) merged.set(id, th);
    }
  }

  const requiredPerms = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.ManageMessages,
  ];

  const sweepable = [];
  for (const ch of merged.values()) {
    if (!ch || !ch.isTextBased() || PROTECTED_CHANNEL_IDS.has(ch.id)) continue;

    // Preserve Gateway lastMessageId from cache when available to skip idle channels without API calls
    const cached = guild.channels.cache.get(ch.id);
    const lastMessageId = ch.lastMessageId ?? cached?.lastMessageId;

    if (lastMessageId === null) continue;
    if (lastMessageId && snowflakeToMs(lastMessageId) < cutoffMs) continue;

    const perms = ch.permissionsFor(botMember);
    if (!perms || !perms.has(requiredPerms)) continue;

    sweepable.push(ch);
  }

  return sweepable;
}

/**
 * Deletes recent messages sent by a timed-out member across all accessible text
 * channels and active threads in the guild, then logs a summary if messages were removed.
 */
export async function purgeTimedOutMemberMessages(member, options = {}) {
  const {
    lookbackMs = DEFAULT_LOOKBACK_MS,
    reason = "تم تطبيق التايم أوت على العضو",
    timeoutUntilMs = member?.communicationDisabledUntilTimestamp || Date.now(),
  } = options;

  if (!member?.guild || !member?.id || member.user?.bot) return { deletedCount: 0, skipped: true };

  const dedupKey = `${member.guild.id}:${member.id}`;
  const now = Date.now();
  const prevEntry = seenTimeouts.get(dedupKey);
  if (
    inFlightPurges.has(dedupKey) ||
    (prevEntry &&
      (now - prevEntry.ranAt < DEDUP_COOLDOWN_MS || Math.abs(prevEntry.untilMs - timeoutUntilMs) < 5000))
  ) {
    return { deletedCount: 0, skipped: true };
  }

  inFlightPurges.add(dedupKey);
  seenTimeouts.set(dedupKey, { untilMs: timeoutUntilMs, ranAt: now });
  if (seenTimeouts.size > 3000) {
    const firstKey = seenTimeouts.keys().next().value;
    if (firstKey) seenTimeouts.delete(firstKey);
  }

  const cutoffMs = now - lookbackMs;
  const perChannelDeleted = new Map();
  let totalDeleted = 0;

  try {
    const guild = member.guild;
    const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!botMember) return { deletedCount: 0, skipped: true };

    // 1. Delete any already-tracked messages from memory immediately
    const trackedByChannel = takeTrackedMessages(guild.id, member.id, cutoffMs);
    const alreadyDeletedIds = new Map();

    // 2. Gather all active text channels and threads
    const channels = await collectSweepableChannels(guild, botMember, cutoffMs);
    const channelMap = new Map(channels.map((ch) => [ch.id, ch]));

    for (const [cid, idSet] of trackedByChannel.entries()) {
      const ch = channelMap.get(cid) || guild.channels.cache.get(cid) || (await guild.channels.fetch(cid).catch(() => null));
      if (!ch || !ch.isTextBased()) continue;
      const perms = ch.permissionsFor(botMember);
      if (!perms?.has(PermissionsBitField.Flags.ManageMessages)) continue;

      const count = await deleteMessageBatch(ch, idSet);
      alreadyDeletedIds.set(cid, idSet);
      if (count > 0) {
        totalDeleted += count;
        perChannelDeleted.set(cid, (perChannelDeleted.get(cid) || 0) + count);
      }
    }

    // 3. Sweep recent messages across all accessible active channels & threads (handles pre-restart messages)
    let cursor = 0;
    const workers = Array.from({ length: SWEEP_CONCURRENCY }, async () => {
      while (cursor < channels.length) {
        const ch = channels[cursor++];
        try {
          const msgs = await ch.messages.fetch({ limit: PER_CHANNEL_FETCH_LIMIT }).catch(() => null);
          if (!msgs || msgs.size === 0) continue;

          const skipIds = alreadyDeletedIds.get(ch.id);
          const toDelete = [];
          for (const msg of msgs.values()) {
            if (msg.author?.id !== member.id) continue;
            if (msg.pinned) continue;
            if (msg.createdTimestamp < cutoffMs) continue;
            if (skipIds?.has(msg.id)) continue;
            toDelete.push(msg.id);
          }

          if (toDelete.length > 0) {
            const count = await deleteMessageBatch(ch, toDelete);
            if (count > 0) {
              totalDeleted += count;
              perChannelDeleted.set(ch.id, (perChannelDeleted.get(ch.id) || 0) + count);
            }
          }
        } catch (chErr) {
          console.warn(`[TimeoutCleaner] Sweep error in #${ch.name || ch.id}:`, chErr.message);
        }
      }
    });

    await Promise.all(workers);

    console.log(
      `[TimeoutCleaner] Swept ${channels.length} channels for ${member.user?.tag || member.id} in ${guild.name}: deleted ${totalDeleted} message(s).`
    );

    if (totalDeleted > 0 && guild.id === "861355983975874601") {
      const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID) || (await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));
      if (logChannel?.isTextBased()) {
        const roomSummary = [...perChannelDeleted.entries()]
          .slice(0, 15)
          .map(([cid, cnt]) => `<#${cid}> (${cnt})`)
          .join("، ");
        const extraRooms = perChannelDeleted.size > 15 ? `\n*وعدد ${perChannelDeleted.size - 15} رومات أخرى*` : "";

        const logEmbed = new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle("🧹 تنظيف تلقائي لرسائل عضو بعد التايم أوت")
          .setDescription(`تم رصد تايم أوت على العضو وحذف رسائله الأخيرة من جميع الرومات المتاحة.`)
          .addFields(
            { name: "👤 العضو", value: `<@${member.id}> (\`${member.user?.tag || member.id}\`)`, inline: true },
            { name: "🗑️ الرسائل المحذوفة", value: `**${totalDeleted}** رسالة`, inline: true },
            { name: "🛡️ السبب / المصدر", value: reason, inline: true },
            { name: "📂 الرومات المنظفة", value: `${roomSummary}${extraRooms}` || "—", inline: false }
          )
          .setFooter({ text: "نظام مكافحة السبام والتايم أوت التلقائي" })
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return {
      deletedCount: totalDeleted,
      channelsCleaned: perChannelDeleted.size,
      channelsSwept: channels.length,
    };
  } finally {
    inFlightPurges.delete(dedupKey);
  }
}

/**
 * Checks guildMemberUpdate transition and triggers message cleanup when a new timeout is applied.
 */
export async function handleGuildMemberTimeoutTransition(oldMember, newMember) {
  const newUntil = newMember?.communicationDisabledUntilTimestamp || 0;
  const now = Date.now();
  if (!newUntil || newUntil <= now) return null;

  const isOldPartial = Boolean(oldMember?.partial);
  const oldUntil = isOldPartial ? 0 : (oldMember?.communicationDisabledUntilTimestamp || 0);

  // Trigger only when entering timeout or timeout expiration extended cleanly
  if (!isOldPartial && oldUntil > now && newUntil <= oldUntil + 5000) {
    return null;
  }

  return await purgeTimedOutMemberMessages(newMember, {
    timeoutUntilMs: newUntil,
    reason: "رصد تايم أوت جديد على العضو (تلقائي / إداري)",
  });
}
