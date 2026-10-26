/**
 * M3RGEEN Ticket System — Database Layer
 * 
 * Manages all ticket persistence, atomic state transitions,
 * audit logging, race condition prevention, and AES-256-GCM encryption
 * for confidential report fields at rest.
 * Uses independent tables (`support_tickets`, `support_ticket_logs`)
 * to avoid touching or corrupting legacy data.
 */

import { query } from "../../database/index.js";
import {
  encryptTicketModalData,
  decryptTicketModalData,
} from "./crypto.js";

/**
 * Format ticket record returned from DB:
 * Transparently decrypts modal_data in memory if confidential.
 */
function formatTicketRow(row) {
  if (!row) return null;
  if (row.modal_data) {
    row.modal_data = decryptTicketModalData(row.modal_data, row.is_confidential);
  }
  return row;
}

/**
 * Initialize ticket system tables idempotently.
 * NOTE: Can be called during explicit migration or system boot.
 */
export async function initTicketsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS support_ticket_counters (
      guild_id TEXT PRIMARY KEY,
      last_number INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      ticket_number INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      type TEXT NOT NULL,
      is_confidential BOOLEAN DEFAULT FALSE,
      status TEXT DEFAULT 'OPEN',
      priority TEXT DEFAULT 'NORMAL',
      claimed_by TEXT DEFAULT NULL,
      collaborators JSONB DEFAULT '[]'::jsonb,
      modal_data JSONB DEFAULT '{}'::jsonb,
      control_message_id TEXT DEFAULT NULL,
      owner_dm_sent BOOLEAN DEFAULT FALSE,
      closed_by TEXT DEFAULT NULL,
      close_reason TEXT DEFAULT NULL,
      closed_at TIMESTAMPTZ DEFAULT NULL,
      is_archived BOOLEAN DEFAULT FALSE,
      archived_at TIMESTAMPTZ DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
    ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

    CREATE INDEX IF NOT EXISTS idx_support_tickets_guild_owner 
    ON support_tickets(guild_id, owner_id);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_status 
    ON support_tickets(status);

    CREATE TABLE IF NOT EXISTS support_ticket_logs (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_support_ticket_logs_ticket 
    ON support_ticket_logs(ticket_id, created_at DESC);
  `);
}

/**
 * Get next sequential ticket number for the guild atomically.
 */
export async function getNextTicketNumber(guildId) {
  const res = await query(`
    INSERT INTO support_ticket_counters (guild_id, last_number)
    VALUES ($1, 1)
    ON CONFLICT (guild_id)
    DO UPDATE SET last_number = support_ticket_counters.last_number + 1
    RETURNING last_number;
  `, [guildId]);
  return res.rows[0].last_number;
}

/**
 * Check if user already has an active (non-closed) ticket of this specific type or confidential report.
 */
export async function hasActiveTicket(guildId, ownerId, type) {
  const res = await query(`
    SELECT channel_id, ticket_number, status, type, is_confidential 
    FROM support_tickets
    WHERE guild_id = $1 
      AND owner_id = $2 
      AND status NOT IN ('CLOSED', 'RESOLVED')
      AND type = $3
    LIMIT 1;
  `, [guildId, ownerId, type]);

  return formatTicketRow(res.rows[0]);
}

/**
 * Create a new ticket entry in database.
 * Encrypts sensitive fields at rest using AES-256-GCM if confidential.
 */
export async function createTicketRecord({
  guildId,
  channelId,
  ownerId,
  type,
  isConfidential,
  modalData,
}) {
  const ticketNumber = await getNextTicketNumber(guildId);

  // Encrypt sensitive modal data fields before writing to DB
  const storedModalData = encryptTicketModalData(modalData, isConfidential);

  const res = await query(`
    INSERT INTO support_tickets (
      ticket_number, guild_id, channel_id, owner_id, type, 
      is_confidential, status, modal_data
    ) VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7)
    RETURNING *;
  `, [
    ticketNumber,
    guildId,
    channelId,
    ownerId,
    type,
    Boolean(isConfidential),
    JSON.stringify(storedModalData || {}),
  ]);

  const rawTicket = res.rows[0];

  // Log creation action without leaking plain confidential details to audit logs
  const auditDetails = isConfidential
    ? { type, isConfidential: true, dataEncrypted: true }
    : { type, isConfidential: false, initialData: modalData };

  await logTicketAction(rawTicket.id, "OPENED", ownerId, auditDetails);

  return formatTicketRow(rawTicket);
}

/**
 * Set the primary control message ID for the living embed.
 */
export async function setControlMessageId(channelId, messageId) {
  await query(`
    UPDATE support_tickets
    SET control_message_id = $1, updated_at = NOW()
    WHERE channel_id = $2;
  `, [messageId, channelId]);
}

/**
 * Retrieve ticket by channel ID.
 */
export async function getTicketByChannel(channelId) {
  const res = await query(`
    SELECT * FROM support_tickets WHERE channel_id = $1 LIMIT 1;
  `, [channelId]);
  return formatTicketRow(res.rows[0]);
}

/**
 * Retrieve ticket by ticket ID.
 */
export async function getTicketById(ticketId) {
  const res = await query(`
    SELECT * FROM support_tickets WHERE id = $1 LIMIT 1;
  `, [ticketId]);
  return formatTicketRow(res.rows[0]);
}

/**
 * Claim ticket atomically.
 * Prevents race conditions by checking claimed_by IS NULL in WHERE clause.
 */
export async function claimTicketAtomic(channelId, staffId) {
  const res = await query(`
    UPDATE support_tickets
    SET claimed_by = $1, status = 'CLAIMED', updated_at = NOW()
    WHERE channel_id = $2 AND claimed_by IS NULL AND status != 'CLOSED'
    RETURNING *;
  `, [staffId, channelId]);

  if (res.rowCount === 0) {
    return { success: false, alreadyClaimed: true };
  }

  const ticket = formatTicketRow(res.rows[0]);
  await logTicketAction(ticket.id, "CLAIMED", staffId, { staffId });
  return { success: true, ticket };
}

/**
 * Transfer ticket to another staff member.
 */
export async function transferTicket(channelId, newStaffId, actorId) {
  const current = await getTicketByChannel(channelId);
  if (!current || current.status === 'CLOSED') {
    return { success: false, error: "TICKET_NOT_ACTIVE" };
  }

  const previousStaff = current.claimed_by;

  const res = await query(`
    UPDATE support_tickets
    SET claimed_by = $1, status = 'CLAIMED', updated_at = NOW()
    WHERE channel_id = $2
    RETURNING *;
  `, [newStaffId, channelId]);

  const ticket = formatTicketRow(res.rows[0]);
  await logTicketAction(ticket.id, "TRANSFERRED", actorId, {
    from: previousStaff,
    to: newStaffId,
  });

  return { success: true, ticket, previousStaff, newStaffId };
}

export const MAX_COLLABORATORS = 3;

/**
 * Add collaborating staff member (does NOT change primary assignee).
 * Enforces maximum of 3 collaborators per ticket.
 */
export async function addCollaborator(channelId, collaboratorId, actorId) {
  const current = await getTicketByChannel(channelId);
  if (!current || current.status === 'CLOSED') {
    return { success: false, error: "TICKET_NOT_ACTIVE" };
  }

  const existingCollaborators = Array.isArray(current.collaborators) ? current.collaborators : [];
  if (existingCollaborators.length >= MAX_COLLABORATORS) {
    return { success: false, maxReached: true, ticket: current };
  }

  if (existingCollaborators.includes(collaboratorId) || current.claimed_by === collaboratorId) {
    return { success: false, alreadyAdded: true, ticket: current };
  }

  const updatedCollaborators = [...existingCollaborators, collaboratorId];

  const res = await query(`
    UPDATE support_tickets
    SET collaborators = $1, updated_at = NOW()
    WHERE channel_id = $2
    RETURNING *;
  `, [JSON.stringify(updatedCollaborators), channelId]);

  const ticket = formatTicketRow(res.rows[0]);
  await logTicketAction(ticket.id, "COLLABORATOR_ADDED", actorId, {
    collaboratorId,
  });

  return { success: true, ticket, collaboratorId };
}

/**
 * Request information from ticket owner.
 * Sets status to 'PENDING_USER'.
 */
export async function requestInfo(channelId, actorId, questionText) {
  const res = await query(`
    UPDATE support_tickets
    SET status = 'PENDING_USER', updated_at = NOW()
    WHERE channel_id = $1 AND status != 'CLOSED'
    RETURNING *;
  `, [channelId]);

  if (res.rowCount === 0) return { success: false, error: "TICKET_NOT_ACTIVE" };

  const ticket = formatTicketRow(res.rows[0]);
  await logTicketAction(ticket.id, "INFO_REQUESTED", actorId, {
    question: questionText,
  });

  return { success: true, ticket, questionText };
}

/**
 * Change ticket status.
 */
export async function updateTicketStatus(channelId, newStatus, actorId) {
  const res = await query(`
    UPDATE support_tickets
    SET status = $1, updated_at = NOW()
    WHERE channel_id = $2 AND status != 'CLOSED'
    RETURNING *;
  `, [newStatus, channelId]);

  if (res.rowCount === 0) return { success: false, error: "TICKET_NOT_ACTIVE" };

  const ticket = formatTicketRow(res.rows[0]);
  await logTicketAction(ticket.id, "STATUS_CHANGED", actorId, {
    newStatus,
  });

  return { success: true, ticket };
}

/**
 * Close ticket atomically.
 */
export async function closeTicketAtomic(channelId, actorId, closeReason) {
  const res = await query(`
    UPDATE support_tickets
    SET status = 'CLOSED', closed_by = $1, close_reason = $2, closed_at = NOW(), updated_at = NOW()
    WHERE channel_id = $3 AND status != 'CLOSED'
    RETURNING *;
  `, [actorId, closeReason || "تم حل التذكرة وإغلاقها", channelId]);

  if (res.rowCount === 0) return { success: false, alreadyClosed: true };

  const ticket = formatTicketRow(res.rows[0]);
  await logTicketAction(ticket.id, "CLOSED", actorId, {
    reason: closeReason,
  });

  return { success: true, ticket };
}

/**
 * Mark owner DM sent for confidential report (deduplication flag).
 */
export async function markOwnerDmSent(ticketId) {
  await query(`
    UPDATE support_tickets
    SET owner_dm_sent = TRUE
    WHERE id = $1;
  `, [ticketId]);
}

/**
 * Mark ticket as successfully archived.
 */
export async function markTicketArchived(ticketId) {
  await query(`
    UPDATE support_tickets
    SET is_archived = TRUE, archived_at = NOW(), updated_at = NOW()
    WHERE id = $1;
  `, [ticketId]);
}

/**
 * Insert an action entry into audit log.
 */
export async function logTicketAction(ticketId, action, actorId, details = {}) {
  try {
    await query(`
      INSERT INTO support_ticket_logs (ticket_id, action, actor_id, details)
      VALUES ($1, $2, $3, $4);
    `, [ticketId, action, actorId, JSON.stringify(details)]);
  } catch (err) {
    console.error("[TicketDB] Error logging action:", err.message);
  }
}

/**
 * Get recent audit logs for a ticket.
 */
export async function getTicketAuditLogs(ticketId, limit = 5) {
  const res = await query(`
    SELECT * FROM support_ticket_logs
    WHERE ticket_id = $1
    ORDER BY created_at DESC
    LIMIT $2;
  `, [ticketId, limit]);
  return res.rows;
}
