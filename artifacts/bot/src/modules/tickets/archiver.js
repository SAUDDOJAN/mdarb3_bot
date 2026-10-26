/**
 * M3RGEEN Ticket System — Archiver & Auto-Deletion Engine
 * 
 * Safely exports complete message history and downloaded attachments,
 * creates a standard ZIP/TXT archive, dispatches to destination channel
 * (REGULAR_LOGS for normal tickets, strictly REPORTS for confidential),
 * verifies delivery, and deletes the ticket channel automatically.
 */

import zlib from "node:zlib";
import {
  AttachmentBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import {
  TICKET_CHANNELS,
  TICKET_ROLES,
  TICKET_TYPES,
} from "./config.js";
import {
  closeTicketAtomic,
  markTicketArchived,
  getTicketByChannel,
} from "./db.js";
import {
  notifyUserTicketClosed,
} from "./notifications.js";

// Saudi Arabia is permanently AST (UTC+3, no DST)
const RIYADH_OFFSET_HOURS = 3;
const MAX_MESSAGES_SAFETY_CAP = 10000;
const MAX_ATTACHMENT_SIZE_BYTES = 7.5 * 1024 * 1024; // 7.5 MB per attachment
const MAX_TOTAL_ARCHIVE_BYTES = 7.5 * 1024 * 1024; // 7.5 MB safe limit for Discord uploads

/**
 * Format Date into Asia/Riyadh (UTC+3) string
 */
export function formatRiyadh(date) {
  if (!date) return { date: "—", time: "—", full: "—" };
  const dObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(dObj.getTime())) return { date: "—", time: "—", full: "—" };

  const riyadhMs = dObj.getTime() + (RIYADH_OFFSET_HOURS * 60 * 60 * 1000);
  const d = new Date(riyadhMs);
  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, "0");
  const D = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return {
    date: `${Y}-${M}-${D}`,
    time: `${h}:${m}:${s}`,
    full: `${Y}-${M}-${D} ${h}:${m}:${s} (KSA)`,
  };
}

/**
 * Format bytes to readable string
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Standard CRC32 implementation for ZIP headers
 */
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

/**
 * Dependency-free ZIP archive creator using Node built-in zlib
 */
export function createZipArchive(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const dataBuf = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content || "", "utf8");
    const deflated = zlib.deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);

    // Local Header
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8
    lh.writeUInt16LE(8, 8); // Deflate
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(deflated.length, 18);
    lh.writeUInt32LE(dataBuf.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    nameBuf.copy(lh, 30);

    localHeaders.push(lh, deflated);

    // Central Directory Header
    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); // UTF-8
    ch.writeUInt16LE(8, 10); // Deflate
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(deflated.length, 20);
    ch.writeUInt32LE(dataBuf.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    nameBuf.copy(ch, 46);

    centralHeaders.push(ch);
    offset += lh.length + deflated.length;
  }

  const centralDir = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

/**
 * Fetch all messages from a channel in chronological order.
 */
export async function fetchAllMessagesChronological(channel) {
  const collected = [];
  let beforeId = null;

  while (collected.length < MAX_MESSAGES_SAFETY_CAP) {
    const options = { limit: 100 };
    if (beforeId) options.before = beforeId;

    const batch = await channel.messages.fetch(options).catch(() => null);
    if (!batch || batch.size === 0) break;

    for (const [_, msg] of batch) {
      collected.push(msg);
      if (collected.length >= MAX_MESSAGES_SAFETY_CAP) break;
    }

    if (batch.size < 100) break;
    const oldestInBatch = batch.last();
    if (!oldestInBatch) break;
    beforeId = oldestInBatch.id;
  }

  // Reverse to chronological order (oldest first)
  collected.reverse();
  return collected;
}

/**
 * Safely download an attachment buffer with size cap and timeout.
 */
async function downloadAttachmentSafe(url, maxBytes = MAX_ATTACHMENT_SIZE_BYTES) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
      return { success: false, error: "EXCEEDS_SIZE_LIMIT", size: buffer.length };
    }

    return { success: true, buffer, size: buffer.length };
  } catch (err) {
    return { success: false, error: err.name === "AbortError" ? "TIMEOUT" : err.message };
  }
}

/**
 * Verify that REPORTS channel is properly secured and inaccessible to moderators and guild leaders.
 */
export async function isReportsChannelSecure(guild) {
  try {
    const reportsChan = guild.channels.cache.get(TICKET_CHANNELS.REPORTS) ||
                        await guild.channels.fetch(TICKET_CHANNELS.REPORTS).catch(() => null);
    if (!reportsChan) {
      return { secure: false, reason: "قناة REPORTS غير موجودة على السيرفر." };
    }

    // 1. Check @everyone
    const everyonePerms = reportsChan.permissionsFor(guild.roles.everyone);
    if (everyonePerms?.has(PermissionFlagsBits.ViewChannel)) {
      return { secure: false, reason: "قناة REPORTS متاحة للرؤية من قِبل رول @everyone." };
    }

    // 2. Check MODERATOR role
    if (TICKET_ROLES.MODERATOR) {
      const modRole = guild.roles.cache.get(TICKET_ROLES.MODERATOR);
      if (modRole) {
        const modPerms = reportsChan.permissionsFor(modRole);
        if (modPerms?.has(PermissionFlagsBits.ViewChannel)) {
          return { secure: false, reason: "قناة REPORTS متاحة للرؤية من قِبل رول المشرفين (MODERATOR)." };
        }
      }
    }

    // 3. Check GUILD_LEADER role
    if (TICKET_ROLES.GUILD_LEADER) {
      const leaderRole = guild.roles.cache.get(TICKET_ROLES.GUILD_LEADER);
      if (leaderRole) {
        const leaderPerms = reportsChan.permissionsFor(leaderRole);
        if (leaderPerms?.has(PermissionFlagsBits.ViewChannel)) {
          return { secure: false, reason: "قناة REPORTS متاحة للرؤية من قِبل رول قادة الجيلدات (GUILD_LEADER)." };
        }
      }
    }

    return { secure: true, channel: reportsChan };
  } catch (err) {
    return { secure: false, reason: err.message };
  }
}

/**
 * Generate full ticket archive payload (transcript text, downloaded attachments, and ZIP bundle).
 */
export async function generateTicketArchive({ guild, channel, ticket, closedBy, closeReason }) {
  const messages = await fetchAllMessagesChronological(channel);
  const typeConfig = Object.values(TICKET_TYPES).find(t => t.id === ticket.type) || {
    title: ticket.type,
    emoji: "🎫",
  };

  const formattedNum = String(ticket.ticket_number).padStart(4, "0");
  const modalData = ticket.modal_data || {};
  const closedAtRiyadh = formatRiyadh(new Date());
  const createdAtRiyadh = formatRiyadh(ticket.created_at);

  const zipFiles = [];
  const downloadedAttachments = [];
  let totalAttachmentsBytes = 0;
  let skippedAttachmentsCount = 0;

  // Process and download attachments
  let attachmentIndex = 0;
  for (const msg of messages) {
    if (msg.attachments.size === 0) continue;

    for (const [_, att] of msg.attachments) {
      attachmentIndex++;
      const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const archiveFilename = `attachments/${attachmentIndex}_${safeName}`;

      // Check cumulative size limit
      if (totalAttachmentsBytes + att.size > MAX_TOTAL_ARCHIVE_BYTES) {
        skippedAttachmentsCount++;
        downloadedAttachments.push({
          msgId: msg.id,
          name: att.name,
          url: att.url,
          size: att.size,
          saved: false,
          reason: "تجاوز حد الحجم الإجمالي للأرشيف (7.5 MB)",
        });
        continue;
      }

      const dlRes = await downloadAttachmentSafe(att.url);
      if (dlRes.success) {
        totalAttachmentsBytes += dlRes.size;
        zipFiles.push({
          name: archiveFilename,
          content: dlRes.buffer,
        });
        downloadedAttachments.push({
          msgId: msg.id,
          name: att.name,
          url: att.url,
          size: dlRes.size,
          saved: true,
          archivePath: archiveFilename,
        });
      } else {
        skippedAttachmentsCount++;
        downloadedAttachments.push({
          msgId: msg.id,
          name: att.name,
          url: att.url,
          size: att.size,
          saved: false,
          reason: dlRes.error,
        });
      }
    }
  }

  // Build Transcript Text Header
  let header = "";
  header += "================================================================================\n";
  header += ticket.is_confidential
    ? "                    M3RGEEN CONFIDENTIAL REPORT TRANSCRIPT                      \n"
    : "                          M3RGEEN TICKET TRANSCRIPT                             \n";
  header += "================================================================================\n";
  header += `رقم التذكرة:          #${formattedNum} (المعرف الداخلي: ${ticket.id})\n`;
  header += `نوع التذكرة:          ${typeConfig.title} (${ticket.type})\n`;
  header += `حالة التذكرة:         مغلقة ومؤرشفة (CLOSED)\n`;
  header += `صاحب التذكرة:         <@${ticket.owner_id}> (ID: ${ticket.owner_id})\n`;
  header += `المسؤول الأساسي:       ${ticket.claimed_by ? `<@${ticket.claimed_by}> (ID: ${ticket.claimed_by})` : "غير مسند"}\n`;
  const collabs = Array.isArray(ticket.collaborators) && ticket.collaborators.length > 0
    ? ticket.collaborators.map(id => `<@${id}> (${id})`).join("، ")
    : "لا يوجد";
  header += `المسؤولون المشاركون:  ${collabs}\n`;
  header += `تاريخ ووقت الفتح:     ${createdAtRiyadh.full}\n`;
  header += `تاريخ ووقت الإغلاق:   ${closedAtRiyadh.full}\n`;
  header += `أغلقت بواسطة:         <@${closedBy.id}> (@${closedBy.username || closedBy.tag} | ID: ${closedBy.id})\n`;
  header += `سبب الإغلاق:          ${closeReason}\n`;
  header += `إجمالي الرسائل:       ${messages.length}\n`;
  header += `المرفقات المحفوظة:    ${downloadedAttachments.filter(a => a.saved).length} من أصل ${downloadedAttachments.length}\n`;
  header += "--------------------------------------------------------------------------------\n";
  header += "بيانات الطلب الأولية:\n";

  if (modalData && typeof modalData === "object" && Object.keys(modalData).length > 0) {
    for (const [key, val] of Object.entries(modalData)) {
      header += `  • ${key}: ${val}\n`;
    }
  } else {
    header += "  (لا توجد بيانات إضافية)\n";
  }
  header += "================================================================================\n\n";

  // Build Messages Body
  const messageBlocks = [];
  const messageMap = new Map(messages.map(m => [m.id, m]));

  for (const msg of messages) {
    const riyadh = formatRiyadh(msg.createdAt);
    const isBot = msg.author.bot ? " [BOT]" : "";
    const displayName = msg.member?.displayName || msg.author.displayName || msg.author.username;
    const authorTag = msg.author.tag || msg.author.username;

    let block = `--------------------------------------------------------------------------------\n`;
    block += `[${riyadh.full}] ${displayName} (@${authorTag} | ID: ${msg.author.id})${isBot}\n`;
    block += `Message ID: ${msg.id}\n`;

    // Reply reference
    if (msg.reference?.messageId) {
      const refMsg = messageMap.get(msg.reference.messageId);
      if (refMsg) {
        const refAuthor = refMsg.member?.displayName || refMsg.author.tag || refMsg.author.username;
        const snippet = (refMsg.cleanContent || refMsg.content || "").replace(/\n+/g, " ").slice(0, 70);
        block += `↪️ رد على: ${refAuthor}: "${snippet}${snippet.length >= 70 ? "..." : ""}"\n`;
      } else {
        block += `↪️ رد على رسالة سابقة (Message ID: ${msg.reference.messageId})\n`;
      }
    }

    // Text content
    const text = (msg.cleanContent || msg.content || "").trim();
    block += text ? `\n${text}\n` : `\n[لا يوجد نص رسالة]\n`;

    // Embeds
    if (msg.embeds.length > 0) {
      block += `\n📦 تضمينات (Embeds: ${msg.embeds.length}):\n`;
      msg.embeds.forEach((emb, i) => {
        block += `  [Embed ${i + 1}]`;
        if (emb.title) block += ` ${emb.title}`;
        if (emb.description) block += `\n    ${emb.description.replace(/\n/g, "\n    ")}`;
        if (emb.fields?.length) {
          emb.fields.forEach(f => {
            block += `\n    • ${f.name}: ${f.value.replace(/\n/g, " ")}`;
          });
        }
        block += "\n";
      });
    }

    // Attachments summary in message
    if (msg.attachments.size > 0) {
      block += `\n📎 المرفقات (${msg.attachments.size}):\n`;
      for (const [_, att] of msg.attachments) {
        const downloaded = downloadedAttachments.find(a => a.msgId === msg.id && a.name === att.name);
        if (downloaded && downloaded.saved) {
          block += `  • [محفوظ فعلياً في الأرشيف]: ${downloaded.archivePath} (${formatBytes(att.size)})\n`;
          block += `    الرابط الأصلي: ${att.url}\n`;
        } else {
          const reason = downloaded ? downloaded.reason : "تعذر الحفظ";
          block += `  • [غير محفوظ فعلياً: ${reason}]: ${att.name} (${formatBytes(att.size)})\n`;
          block += `    الرابط: ${att.url}\n`;
        }
      }
    }

    messageBlocks.push(block);
  }

  const fullTranscriptText = header + messageBlocks.join("\n");
  const transcriptBuffer = Buffer.from(fullTranscriptText, "utf8");

  // Always include transcript.txt inside the ZIP or as standalone file
  zipFiles.unshift({
    name: "transcript.txt",
    content: transcriptBuffer,
  });

  const filesToSend = [];

  // If there are downloaded attachments, create ZIP archive
  if (downloadedAttachments.some(a => a.saved)) {
    const zipBuffer = createZipArchive(zipFiles);
    const zipFilename = ticket.is_confidential
      ? `confidential_report_${formattedNum}.zip`
      : `ticket_${formattedNum}_archive.zip`;

    filesToSend.push(new AttachmentBuilder(zipBuffer, { name: zipFilename }));

    // Also send transcript.txt separately if small enough for instant viewing
    if (transcriptBuffer.length <= 2 * 1024 * 1024) {
      filesToSend.push(new AttachmentBuilder(transcriptBuffer, {
        name: ticket.is_confidential ? `report_${formattedNum}.txt` : `ticket_${formattedNum}.txt`,
      }));
    }
  } else {
    // If no attachments, send text transcript directly
    const textFilename = ticket.is_confidential
      ? `confidential_report_${formattedNum}.txt`
      : `ticket_${formattedNum}.txt`;
    filesToSend.push(new AttachmentBuilder(transcriptBuffer, { name: textFilename }));
  }

  return {
    success: true,
    files: filesToSend,
    messageCount: messages.length,
    attachmentCount: downloadedAttachments.filter(a => a.saved).length,
    totalAttachments: downloadedAttachments.length,
    skippedAttachmentsCount,
  };
}

/**
 * Main Orchestrator: Safely archive ticket, send to destination, and auto-delete channel.
 */
export async function archiveAndCloseTicket({ interaction, channel, ticket, actor, closeReason }) {
  const guild = interaction.guild;
  const formattedNum = String(ticket.ticket_number).padStart(4, "0");

  // 1. Guard against concurrent closing
  const freshTicket = await getTicketByChannel(channel.id);
  if (!freshTicket || freshTicket.status === "CLOSED" || freshTicket.is_archived) {
    return { success: false, error: "TICKET_ALREADY_CLOSED" };
  }

  // 2. Strict Security Check for Confidential Reports
  if (ticket.is_confidential) {
    const secCheck = await isReportsChannelSecure(guild);
    if (!secCheck.secure) {
      console.error(`[TicketArchiver] Security HALT: REPORTS channel insecure (${secCheck.reason}). Channel NOT deleted.`);
      await interaction.reply({
        content: `⚠️ **توقف أمني:** ${secCheck.reason}\nتم إيقاف أرشفة البلاغ السري وحذف الروم حرصاً على سرية البيانات وعدم كشفها. يرجى تصحيح صلاحيات القناة.`,
        ephemeral: true,
      }).catch(() => {});
      return {
        success: false,
        securityHalt: true,
        reason: secCheck.reason,
      };
    }
  }

  // 3. Inform users in room that archiving has started
  await interaction.reply({
    content: "⏳ جاري إغلاق التذكرة واستخراج المحادثة والمرفقات وحفظ الأرشيف بأمان...",
  });

  // 4. Atomically close ticket in DB
  const closeRes = await closeTicketAtomic(ticket.channel_id, actor.id, closeReason);
  if (!closeRes.success) {
    return { success: false, error: "ALREADY_CLOSED_IN_DB" };
  }

  // 5. Generate Archive
  let archiveData = null;
  try {
    archiveData = await generateTicketArchive({
      guild,
      channel,
      ticket: closeRes.ticket,
      closedBy: actor,
      closeReason,
    });
  } catch (err) {
    console.error("[TicketArchiver] Error generating archive:", err);
    await channel.send({
      content: `❌ **فشلت عملية أرشفة التذكرة:** ${err.message}\n⚠️ حفاظاً على البيانات من الضياع، **لم يتم حذف القناة** حتى يتمكن المسؤول من مراجعتها.`,
    }).catch(() => {});
    return { success: false, error: "ARCHIVE_GENERATION_FAILED" };
  }

  // 6. Send Archive to Destination Channel
  let deliverySuccess = false;
  let destinationChannelId = null;

  try {
    if (ticket.is_confidential) {
      // STRICTLY to REPORTS channel only! ZERO leakage to LOGS!
      destinationChannelId = TICKET_CHANNELS.REPORTS;
      const reportsChan = guild.channels.cache.get(destinationChannelId) ||
                          await guild.channels.fetch(destinationChannelId).catch(() => null);
      if (!reportsChan) throw new Error("قناة REPORTS غير متاحة.");

      const reportEmbed = new EmbedBuilder()
        .setColor(0x2d3436)
        .setTitle(`🔒 أرشيف بلاغ سري مكتمل | #${formattedNum}`)
        .setDescription(
          `تم إغلاق البلاغ السري وتوثيق الأرشيف والمرفقات كاملة وحذف القناة تلقائياً.\n\n` +
          `**صاحب البلاغ:** <@${ticket.owner_id}> (\`${ticket.owner_id}\`)\n` +
          `**أُغلق بواسطة:** <@${actor.id}>\n` +
          `**سبب الإغلاق:** ${closeReason}\n` +
          `**إجمالي الرسائل:** ${archiveData.messageCount}\n` +
          `**المرفقات المحفوظة:** ${archiveData.attachmentCount} من ${archiveData.totalAttachments}`
        )
        .setFooter({ text: "سجل البلاغات السرية المؤرشفة • M3RGEEN Administration" })
        .setTimestamp();

      await reportsChan.send({
        embeds: [reportEmbed],
        files: archiveData.files,
      });
      deliverySuccess = true;
    } else {
      // Regular Tickets: Send to LOGS channel (1560176269117751336)
      destinationChannelId = TICKET_CHANNELS.REGULAR_LOGS;
      const logsChan = guild.channels.cache.get(destinationChannelId) ||
                       await guild.channels.fetch(destinationChannelId).catch(() => null);
      if (!logsChan) throw new Error("قناة LOGS غير متاحة.");

      const typeConfig = Object.values(TICKET_TYPES).find(t => t.id === ticket.type) || {
        title: ticket.type,
        emoji: "🎫",
      };

      const logEmbed = new EmbedBuilder()
        .setColor(0x636e72)
        .setTitle(`📋 أرشيف تذكرة دعم مغلقة | #${formattedNum}`)
        .setDescription(
          `تم إغلاق التذكرة بنجاح وتوثيق المحادثة والمرفقات كاملة.\n\n` +
          `**النوع:** ${typeConfig.emoji} ${typeConfig.title}\n` +
          `**صاحب التذكرة:** <@${ticket.owner_id}> (\`${ticket.owner_id}\`)\n` +
          `**أُغلقت بواسطة:** <@${actor.id}>\n` +
          `**سبب الإغلاق:** ${closeReason}\n` +
          `**إجمالي الرسائل:** ${archiveData.messageCount}\n` +
          `**المرفقات المحفوظة في الأرشيف:** ${archiveData.attachmentCount} من ${archiveData.totalAttachments}`
        )
        .setFooter({ text: "M3RGEEN Ticket Archive" })
        .setTimestamp();

      await logsChan.send({
        embeds: [logEmbed],
        files: archiveData.files,
      });
      deliverySuccess = true;
    }
  } catch (deliveryErr) {
    console.error("[TicketArchiver] Failed to deliver archive to destination channel:", deliveryErr.message);
    await channel.send({
      content: `❌ **تعذر إرسال ملف الأرشيف إلى قناة السجلات المعتمدة:** ${deliveryErr.message}\n⚠️ حفاظاً على المحادثة والمرفقات، **تم إيقاف حذف القناة**.`,
    }).catch(() => {});
    return { success: false, error: "DELIVERY_FAILED" };
  }

  // 7. Mark as archived in Database
  await markTicketArchived(ticket.id).catch(() => {});

  // 8. Auto-delete channel with clean final notification
  try {
    await channel.send({
      content: "✅ **تم حفظ الأرشيف والمرفقات بنجاح في السجلات.**\n🔒 سيتم حذف هذه القناة تلقائياً خلال لحظات...",
    }).catch(() => {});

    // Brief 3-second grace period
    await new Promise(resolve => setTimeout(resolve, 3000));

    await channel.delete(`Ticket #${formattedNum} closed and archived by ${actor.username || actor.id}`);
    return { success: true, archived: true, channelDeleted: true };
  } catch (delErr) {
    console.error("[TicketArchiver] Failed to auto-delete channel after successful archiving:", delErr.message);
    await channel.send({
      content: "ℹ️ تم حفظ الأرشيف بنجاح في السجلات، ولكن تعذر حذف القناة تلقائياً بسبب أذونات ديسكورد. يمكن للمشرف حذفها يدوياً الآن بأمان.",
    }).catch(() => {});
    return { success: true, archived: true, channelDeleted: false };
  }
}
