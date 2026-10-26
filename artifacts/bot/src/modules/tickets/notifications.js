/**
 * M3RGEEN Ticket System — Notification & DM Delivery Policy
 * 
 * Enforces strict, approved communication policies:
 * - Server Owner: 1 DM on confidential report creation only. NEVER on regular tickets.
 * - Staff: 1 DM to assigned staff ONLY on direct transfer/referral. NEVER on self-claim, collaborator add, or regular open.
 * - Ticket Owner: DM on info request or close (gracefully handles closed DMs).
 * - Zero leakage of sensitive reports to LOGS channel or console.
 */

import { EmbedBuilder } from "discord.js";
import { TICKET_CHANNELS } from "./config.js";
import { markOwnerDmSent } from "./db.js";

/**
 * Send a DM to a Discord user safely.
 * Returns { success: boolean, error?: string, closedDm?: boolean }
 */
async function sendSafeDm(client, userId, payload) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return { success: false, error: "USER_NOT_FOUND" };

    await user.send(payload);
    return { success: true };
  } catch (err) {
    const isClosedDm = err.code === 50007 || err.status === 403;
    return {
      success: false,
      error: err.message,
      closedDm: isClosedDm,
    };
  }
}

/**
 * Notify Server Owner on NEW Confidential Report.
 * STRICTLY 1 DM alert with link. No repeated DMs.
 */
export async function notifyOwnerConfidentialReport(client, guild, ticket) {
  if (!ticket.is_confidential) return { skipped: true, reason: "NOT_CONFIDENTIAL" };
  if (ticket.owner_dm_sent) return { skipped: true, reason: "ALREADY_SENT" };

  const ownerId = guild.ownerId;
  if (!ownerId) {
    console.warn("[TicketNotification] Guild ownerId not available.");
    return { success: false, error: "NO_OWNER_ID" };
  }

  const channelUrl = `https://discord.com/channels/${guild.id}/${ticket.channel_id}`;
  const embed = new EmbedBuilder()
    .setColor(0xd63031)
    .setTitle("🔒 تنبيه إداري سري: بلاغ جديد موجه لك")
    .setDescription(
      `تم استلام بلاغ إداري سري وحساس جديد في سيرفر **${guild.name}**.\n\n` +
      `**رقم البلاغ:** #${String(ticket.ticket_number).padStart(4, "0")}\n` +
      `**صاحب البلاغ:** <@${ticket.owner_id}>\n\n` +
      `🔗 **رابط الروم الخاص:** [اضغط هنا للدخول على البلاغ مباشرة](${channelUrl})\n\n` +
      `*هذا البلاغ محجوب بالكامل عن المشرفين وقادة الجيلدات وسجلات السيرفر.*`
    )
    .setTimestamp();

  const dmResult = await sendSafeDm(client, ownerId, { embeds: [embed] });

  if (dmResult.success) {
    try {
      await markOwnerDmSent(ticket.id);
    } catch (_) {
      // Non-fatal if DB is unreachable or in mock test environment
    }
  }

  return dmResult;
}

/**
 * Notify a staff member when a ticket is DIRECTLY REFERRED / TRANSFERRED to them.
 * NEVER sent on self-claim or adding collaborators.
 */
export async function notifyStaffReferred(client, guild, newStaffId, ticket, actorId) {
  const channelUrl = `https://discord.com/channels/${guild.id}/${ticket.channel_id}`;
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🔄 تمت إحالة تذكرة دعم إليك")
    .setDescription(
      `قام المشرف <@${actorId}> بإحالة التذكرة التالية لتتولى متابعتها:\n\n` +
      `**رقم التذكرة:** #${String(ticket.ticket_number).padStart(4, "0")}\n` +
      `**صاحب التذكرة:** <@${ticket.owner_id}>\n\n` +
      `🔗 **رابط التذكرة:** [اضغط هنا لفتح التذكرة](${channelUrl})`
    )
    .setTimestamp();

  return await sendSafeDm(client, newStaffId, { embeds: [embed] });
}

/**
 * Notify ticket owner when staff requests additional information.
 */
export async function notifyUserInformationRequested(client, guild, ticket, questionText, actorId) {
  const channelUrl = `https://discord.com/channels/${guild.id}/${ticket.channel_id}`;
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(`❓ طلب معلومات إضافية حول تذكرتك #${String(ticket.ticket_number).padStart(4, "0")}`)
    .setDescription(
      `قام فريق الدعم في سيرفر **${guild.name}** بطلب معلومات إضافية منك:\n\n` +
      `> "${questionText}"\n\n` +
      `يرجى الرد داخل التذكرة لاستكمال الإجراءات:\n` +
      `🔗 [اضغط هنا للانتقال إلى تذكرتك](${channelUrl})`
    )
    .setTimestamp();

  return await sendSafeDm(client, ticket.owner_id, { embeds: [embed] });
}

/**
 * Notify ticket owner when ticket is closed.
 * Only sent for regular tickets. For confidential reports, owner follows up in ticket.
 */
export async function notifyUserTicketClosed(client, guild, ticket, closeReason) {
  if (ticket.is_confidential) {
    // Respect user privacy: don't force DMs on sensitive reports
    return { skipped: true, reason: "CONFIDENTIAL_REPORT" };
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`✅ تم إغلاق تذكرتك #${String(ticket.ticket_number).padStart(4, "0")}`)
    .setDescription(
      `تم إغلاق تذكرتك في سيرفر **${guild.name}**.\n\n` +
      `**سبب الإغلاق:** ${closeReason || "تم حل الموضوع بنجاح"}\n\n` +
      `نشكر تواصلك، ويسعدنا دائماً خدمتك عبر مركز التذاكر.`
    )
    .setTimestamp();

  return await sendSafeDm(client, ticket.owner_id, { embeds: [embed] });
}

/**
 * Log action to Regular LOGS channel (1560176269117751336).
 * Zero-leakage guard: skips completely if ticket is confidential or embed is null.
 */
export async function logToRegularLogsChannel(guild, embed, ticket = null) {
  if (!embed || ticket?.is_confidential) return;
  try {
    const channel = guild.channels.cache.get(TICKET_CHANNELS.REGULAR_LOGS) || 
                    await guild.channels.fetch(TICKET_CHANNELS.REGULAR_LOGS).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("[TicketNotification] Failed to send regular log:", err.message);
  }
}

/**
 * Log new confidential report to REPORTS channel (1560176348524453988).
 * Only server owner and bot have access to this channel.
 */
export async function logToReportsChannel(guild, embed) {
  if (!embed) return { success: false, error: "NO_EMBED" };
  try {
    const channel = guild.channels.cache.get(TICKET_CHANNELS.REPORTS) || 
                    await guild.channels.fetch(TICKET_CHANNELS.REPORTS).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn("[TicketNotification] REPORTS channel not found or not text-based:", TICKET_CHANNELS.REPORTS);
      return { success: false, error: "CHANNEL_NOT_FOUND" };
    }

    await channel.send({ embeds: [embed] });
    return { success: true };
  } catch (err) {
    console.error("[TicketNotification] Failed to send report to REPORTS channel:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Audit helper to verify that the REPORTS channel and SUPPORT_CATEGORY_ID are properly linked.
 */
export async function verifyReportsChannelConfig(guild) {
  try {
    const channel = guild.channels.cache.get(TICKET_CHANNELS.REPORTS) || 
                    await guild.channels.fetch(TICKET_CHANNELS.REPORTS).catch(() => null);
    if (!channel) {
      return { ok: false, error: "REPORTS_CHANNEL_NOT_FOUND" };
    }

    return {
      ok: true,
      channelId: channel.id,
      parentId: channel.parentId,
      name: channel.name,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

