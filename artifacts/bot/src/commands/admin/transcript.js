import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType, 
  AttachmentBuilder, 
  SnowflakeUtil 
} from "discord.js";

// Saudi Arabia is permanently AST (UTC+3, no DST)
const RIYADH_OFFSET_HOURS = 3;
const CHUNK_SIZE_LIMIT = 7.5 * 1024 * 1024; // 7.5 MB safe limit for Discord file uploads
const MAX_MESSAGES_SAFETY_CAP = 25000; // Protection against excessive queries

/**
 * Parse date string in Asia/Riyadh time (UTC+3) into a UTC Date object
 * Supported: YYYY-MM-DD HH:mm or YYYY-MM-DD HH:mm:ss
 */
function parseRiyadhDate(str) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;

  const [_, y, m, d, h, min, s] = match;
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  const hour = parseInt(h, 10);
  const minute = parseInt(min, 10);
  const second = s ? parseInt(s, 10) : 0;

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  // Subtract 3 hours from Riyadh time to get UTC time
  const utcMs = Date.UTC(year, month - 1, day, hour - RIYADH_OFFSET_HOURS, minute, second);
  const parsed = new Date(utcMs);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Format Date into Asia/Riyadh (UTC+3) string components
 */
function formatRiyadh(date) {
  const riyadhMs = date.getTime() + (RIYADH_OFFSET_HOURS * 60 * 60 * 1000);
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
    full: `${Y}-${M}-${D} ${h}:${m}:${s}`
  };
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const data = new SlashCommandBuilder()
  .setName("transcript")
  .setDescription("تصدير سجل المحادثة من قناة خلال فترة زمنية محددة (للإدارة والمشرفين)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption(option =>
    option
      .setName("from")
      .setDescription("بداية الفترة بتوقيت السعودية (مثال: 2026-10-04 13:00)")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("to")
      .setDescription("نهاية الفترة بتوقيت السعودية (مثال: 2026-10-04 18:30)")
      .setRequired(true)
  )
  .addChannelOption(option =>
    option
      .setName("channel")
      .setDescription("القناة المراد تصدير سجلها (اختياري - الافتراضي القناة الحالية)")
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice
      )
      .setRequired(false)
  );

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (deferErr) {
    console.error("[transcript] Failed to deferReply:", deferErr);
    return;
  }

  try {
    // 1. Permission verification (Administrators, ManageGuild, or ManageMessages)
    const memberPerms = interaction.member?.permissions;
    const hasAdminOrMod = memberPerms && (
      memberPerms.has(PermissionFlagsBits.Administrator) ||
      memberPerms.has(PermissionFlagsBits.ManageGuild) ||
      memberPerms.has(PermissionFlagsBits.ManageMessages)
    );

    if (!hasAdminOrMod) {
      return interaction.editReply({ 
        content: "❌ عذرًا، هذا الأمر مخصص للمشرفين والإدارة فقط." 
      });
    }

    // 2. Resolve target channel
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.editReply({ 
        content: "❌ لا يمكن تصدير المحادثة من هذه القناة، يرجى اختيار قناة نصية صالحة." 
      });
    }

    // 3. Check bot permissions in target channel
    const botMember = targetChannel.guild.members.me || await targetChannel.guild.members.fetchMe().catch(() => null);
    const botPerms = targetChannel.permissionsFor(botMember);

    const hasView = botPerms?.has(PermissionFlagsBits.ViewChannel);
    const hasHistory = botPerms?.has(PermissionFlagsBits.ReadMessageHistory);

    if (!hasView || !hasHistory) {
      const missing = [];
      if (!hasView) missing.push("• رؤية القناة (`View Channel`)");
      if (!hasHistory) missing.push("• قراءة سجل الرسائل (`Read Message History`)");
      return interaction.editReply({
        content: `❌ البوت يفتقر إلى الصلاحيات المطلوبة في <#${targetChannel.id}>:\n${missing.join("\n")}`
      });
    }

    // 4. Parse time range in Asia/Riyadh
    const fromStrRaw = interaction.options.getString("from");
    const toStrRaw = interaction.options.getString("to");

    const fromDate = parseRiyadhDate(fromStrRaw);
    const toDate = parseRiyadhDate(toStrRaw);

    if (!fromDate) {
      return interaction.editReply({
        content: "❌ صيغة وقت البداية (`from`) غير صحيحة. يرجى استخدام الصيغة: `YYYY-MM-DD HH:mm` (مثال: `2026-10-04 13:00`)."
      });
    }

    if (!toDate) {
      return interaction.editReply({
        content: "❌ صيغة وقت النهاية (`to`) غير صحيحة. يرجى استخدام الصيغة: `YYYY-MM-DD HH:mm` (مثال: `2026-10-04 18:30`)."
      });
    }

    if (fromDate.getTime() > toDate.getTime()) {
      return interaction.editReply({
        content: "❌ وقت البداية (`from`) يجب أن يكون قبل وقت النهاية (`to`)."
      });
    }

    const fromRiyadhFormatted = formatRiyadh(fromDate).full;
    const toRiyadhFormatted = formatRiyadh(toDate).full;

    // 5. Fetch messages with pagination (reverse chronological batches)
    const collectedMessages = [];
    const fromTimestamp = fromDate.getTime();
    const toTimestamp = toDate.getTime();
    let isTruncated = false;

    // Start with a synthetic snowflake corresponding to toTimestamp + 1000ms
    let beforeId = SnowflakeUtil.generate({ timestamp: toTimestamp + 1000 }).toString();

    while (collectedMessages.length < MAX_MESSAGES_SAFETY_CAP) {
      const fetchLimit = 100;
      const batch = await targetChannel.messages.fetch({ limit: fetchLimit, before: beforeId });
      if (!batch || batch.size === 0) break;

      let reachedBeforeFrom = false;

      for (const [_, msg] of batch) {
        const msgTime = msg.createdTimestamp;
        if (msgTime <= toTimestamp && msgTime >= fromTimestamp) {
          collectedMessages.push(msg);
          if (collectedMessages.length >= MAX_MESSAGES_SAFETY_CAP) {
            break;
          }
        } else if (msgTime < fromTimestamp) {
          reachedBeforeFrom = true;
        }
      }

      if (collectedMessages.length >= MAX_MESSAGES_SAFETY_CAP && !reachedBeforeFrom) {
        isTruncated = true;
        break;
      }

      const oldestInBatch = batch.last();
      if (!oldestInBatch || reachedBeforeFrom) {
        break;
      }

      beforeId = oldestInBatch.id;
      if (batch.size < fetchLimit) {
        break; // No earlier messages exist in channel
      }
    }

    // 6. Handle empty results
    if (collectedMessages.length === 0) {
      return interaction.editReply({
        content: `ℹ️ لا توجد أي رسائل في القناة <#${targetChannel.id}> خلال الفترة المحددة:\n` +
                 `📅 **من:** \`${fromRiyadhFormatted}\`\n` +
                 `📅 **إلى:** \`${toRiyadhFormatted}\` *(توقيت الرياض)*`
      });
    }

    // 7. Sort messages chronologically (oldest to newest)
    collectedMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Build lookup map for referenced messages
    const messageMap = new Map(collectedMessages.map(m => [m.id, m]));

    // 8. Generate formatted text blocks
    const formattedBlocks = collectedMessages.map(msg => {
      const riyadh = formatRiyadh(msg.createdAt);
      const isBot = msg.author.bot;
      const botTag = isBot ? " [BOT]" : "";
      const displayName = msg.member?.displayName || msg.author.displayName || msg.author.username;
      const username = msg.author.tag || msg.author.username;

      let block = `--------------------------------------------------------------------------------\n`;
      block += `[${riyadh.full}] ${displayName} (@${username} | ID: ${msg.author.id})${botTag}\n`;
      block += `Message ID: ${msg.id} | Link: ${msg.url}\n`;

      // Reply reference details
      if (msg.reference?.messageId) {
        const refId = msg.reference.messageId;
        const cachedRef = messageMap.get(refId);
        if (cachedRef) {
          const refAuthor = cachedRef.member?.displayName || cachedRef.author.displayName || cachedRef.author.tag;
          const snippet = (cachedRef.cleanContent || cachedRef.content || "").replace(/\n+/g, " ").slice(0, 80);
          block += `↪️ رد على: ${refAuthor} (ID: ${refId}): "${snippet}${snippet.length >= 80 ? '...' : ''}"\n`;
        } else {
          const repliedUser = msg.mentions.repliedUser ? `@${msg.mentions.repliedUser.tag}` : "غير معروف";
          block += `↪️ رد على رسالة سابقة (Message ID: ${refId} | المستخدم: ${repliedUser})\n`;
        }
      }

      // Mentions summary if applicable
      const mentionedUsers = msg.mentions.users.map(u => `@${u.tag}`).join(", ");
      const mentionedRoles = msg.mentions.roles.map(r => `@${r.name}`).join(", ");
      const mentionedChannels = msg.mentions.channels.map(c => `#${c.name}`).join(", ");
      const mentionParts = [];
      if (mentionedUsers) mentionParts.push(`الأعضاء: ${mentionedUsers}`);
      if (mentionedRoles) mentionParts.push(`الرتب: ${mentionedRoles}`);
      if (mentionedChannels) mentionParts.push(`القنوات: ${mentionedChannels}`);
      if (mentionParts.length > 0) {
        block += `📌 منشن: ${mentionParts.join(" | ")}\n`;
      }

      // Content (cleanContent renders mentions as readable names, fallback to raw content)
      const textContent = (msg.cleanContent || msg.content || "").trim();
      if (textContent) {
        block += `\n${textContent}\n`;
      } else {
        block += `\n[لا يوجد محتوى نصي]\n`;
      }

      // Attachments
      if (msg.attachments.size > 0) {
        block += `\n📎 المرفقات (${msg.attachments.size}):\n`;
        msg.attachments.forEach(att => {
          block += `  • ${att.name || 'ملف'} (${formatBytes(att.size)}): ${att.url}\n`;
        });
      }

      // Stickers
      if (msg.stickers?.size > 0) {
        block += `\n🎨 الملصقات (${msg.stickers.size}):\n`;
        msg.stickers.forEach(st => {
          block += `  • ${st.name} (URL: ${st.url})\n`;
        });
      }

      // Embeds
      if (msg.embeds.length > 0) {
        block += `\n📦 Embeds (${msg.embeds.length}):\n`;
        msg.embeds.forEach((emb, i) => {
          block += `  [Embed ${i + 1}]\n`;
          if (emb.author?.name) block += `    Author: ${emb.author.name}\n`;
          if (emb.title) block += `    Title: ${emb.title}\n`;
          if (emb.url) block += `    URL: ${emb.url}\n`;
          if (emb.description) block += `    Description: ${emb.description.replace(/\n/g, "\n    ")}\n`;
          if (emb.fields?.length) {
            block += `    Fields:\n`;
            emb.fields.forEach(f => {
              block += `      - ${f.name}: ${f.value.replace(/\n/g, " ")}\n`;
            });
          }
          if (emb.footer?.text) block += `    Footer: ${emb.footer.text}\n`;
          if (emb.image?.url) block += `    Image: ${emb.image.url}\n`;
          if (emb.thumbnail?.url) block += `    Thumbnail: ${emb.thumbnail.url}\n`;
        });
      }

      return block;
    });

    // Earliest exported message (chronologically first message)
    const earliestExported = collectedMessages[0];
    const earliestExportedFormatted = earliestExported ? formatRiyadh(earliestExported.createdAt).full : fromRiyadhFormatted;

    // 9. Split into parts if file size exceeds safe limit
    const makeHeader = (partNum, totalParts) => {
      let h = "";
      if (isTruncated) {
        h += "==================================================\n";
        h += "WARNING: TRANSCRIPT INCOMPLETE\n";
        h += "Reason: Maximum message safety limit reached.\n";
        h += `Exported Messages: ${collectedMessages.length}\n`;
        h += `Requested From:    ${fromRiyadhFormatted}\n`;
        h += `Requested To:      ${toRiyadhFormatted}\n`;
        h += `Earliest Exported: ${earliestExportedFormatted}\n`;
        h += "==================================================\n";
      }
      h += "==================================================\n";
      h += isTruncated ? "M3RGEEN TRANSCRIPT (INCOMPLETE)\n" : "M3RGEEN TRANSCRIPT\n";
      h += `Channel: #${targetChannel.name} (ID: ${targetChannel.id})\n`;
      h += `Requested From:    ${fromRiyadhFormatted}\n`;
      h += `Requested To:      ${toRiyadhFormatted}\n`;
      h += `Timezone: Asia/Riyadh (UTC+3)\n`;
      if (isTruncated) {
        h += `Exported Messages: ${collectedMessages.length} (Limit reached - Incomplete)\n`;
        h += `Earliest Message:  ${earliestExportedFormatted}\n`;
      } else {
        h += `Total Messages:    ${collectedMessages.length}\n`;
      }
      if (totalParts > 1) {
        h += `Part:              ${partNum} of ${totalParts}\n`;
      }
      h += "==================================================\n\n";
      return h;
    };

    // First, bundle messages into parts without breaking any message in the middle
    const partsMessages = [];
    let currentPart = [];
    let currentBytes = 0;

    for (const block of formattedBlocks) {
      const blockBytes = Buffer.byteLength(block, "utf8");
      if (currentBytes + blockBytes > CHUNK_SIZE_LIMIT && currentPart.length > 0) {
        partsMessages.push(currentPart);
        currentPart = [block];
        currentBytes = blockBytes;
      } else {
        currentPart.push(block);
        currentBytes += blockBytes;
      }
    }
    if (currentPart.length > 0) {
      partsMessages.push(currentPart);
    }

    const totalParts = partsMessages.length;
    const cleanDateTag = formatRiyadh(fromDate).date;
    const sanitizedChannelName = targetChannel.name.replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, "_");

    const files = partsMessages.map((partBlocks, idx) => {
      const partNum = idx + 1;
      const header = makeHeader(partNum, totalParts);
      const fullText = header + partBlocks.join("\n");
      const buffer = Buffer.from(fullText, "utf8");

      const filename = totalParts === 1 
        ? `transcript_${sanitizedChannelName}_${cleanDateTag}.txt`
        : `transcript_${sanitizedChannelName}_${cleanDateTag}_part_${partNum}.txt`;

      return new AttachmentBuilder(buffer, { name: filename });
    });

    // 10. Audit logging to console (no chat content logged)
    console.log(`[Transcript] Export completed:
  Requester: ${interaction.user.tag} (${interaction.user.id})
  Channel: #${targetChannel.name} (${targetChannel.id})
  Range: ${fromRiyadhFormatted} to ${toRiyadhFormatted} (Asia/Riyadh)
  Messages Exported: ${collectedMessages.length}
  Files Generated: ${files.length}
  truncated: ${isTruncated}`);

    // 11. Send ephemeral response with files
    let responseText;
    if (isTruncated) {
      responseText = [
        `⚠️ **تحذير: تم تصدير السجل بشكل غير مكتمل (INCOMPLETE)**`,
        `تم الوصول إلى الحد الأقصى للأمان (${MAX_MESSAGES_SAFETY_CAP.toLocaleString()} رسالة) قبل الوصول لبداية الفترة المطلوبة.`,
        ``,
        `📁 **القناة:** <#${targetChannel.id}>`,
        `📅 **الفترة المطلوبة:** من \`${fromRiyadhFormatted}\` إلى \`${toRiyadhFormatted}\` *(توقيت الرياض)*`,
        `⏱️ **أقدم رسالة تم تصديرها:** \`${earliestExportedFormatted}\``,
        `💬 **الرسائل المصدرة:** ${collectedMessages.length}`,
        `📄 **عدد الملفات:** ${files.length}`
      ].join("\n");
    } else {
      responseText = [
        `✅ **تم تصدير سجل المحادثة بنجاح**`,
        `📁 **القناة:** <#${targetChannel.id}>`,
        `📅 **الفترة:** من \`${fromRiyadhFormatted}\` إلى \`${toRiyadhFormatted}\` *(توقيت الرياض)*`,
        `💬 **إجمالي الرسائل:** ${collectedMessages.length}`,
        `📄 **عدد الملفات:** ${files.length}`
      ].join("\n");
    }

    return interaction.editReply({
      content: responseText,
      files
    });

  } catch (err) {
    console.error("[transcript] Unexpected error during export:", err);
    return interaction.editReply({
      content: `❌ حدث خطأ غير متوقع أثناء تصدير السجل: ${err.message || err}`
    });
  }
}

export default {
  data,
  execute
};
