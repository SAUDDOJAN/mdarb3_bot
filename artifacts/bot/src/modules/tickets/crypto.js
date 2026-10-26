/**
 * M3RGEEN Ticket System — Application-Level Cryptography (Data-at-Rest Protection)
 * 
 * Implements authenticated envelope encryption using AES-256-GCM.
 * Protects confidential report contents (incident details, evidence links,
 * and reported party names) before writing to PostgreSQL.
 * 
 * Even with direct database access or backup theft, confidential report
 * contents cannot be read without the application encryption key.
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // Standard 128-bit authentication tag

/**
 * Validate that TICKETS_ENCRYPTION_KEY is set and resolves to exactly 32 bytes.
 * Accepts:
 * - 64-character Hex string (32 bytes)
 * - 44-character Base64 string decoding to 32 bytes
 * - Raw 32-byte UTF-8 string
 * Strictly NO fallback to tokens or hardcoded secrets.
 */
export function validateEncryptionKey() {
  const envVal = process.env.TICKETS_ENCRYPTION_KEY || process.env.TICKET_ENCRYPTION_KEY;
  if (!envVal || typeof envVal !== "string") {
    return {
      valid: false,
      reason: "TICKETS_ENCRYPTION_KEY is missing from environment variables.",
    };
  }

  const trimmed = envVal.trim();

  // 1. 64-char Hex (preferred)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return {
      valid: true,
      keyBuffer: Buffer.from(trimmed, "hex"),
    };
  }

  // 2. Base64
  try {
    const b64Buf = Buffer.from(trimmed, "base64");
    if (b64Buf.length === 32) {
      return {
        valid: true,
        keyBuffer: b64Buf,
      };
    }
  } catch {
    // ignore
  }

  // 3. Raw 32-byte UTF-8 string
  const utf8Buf = Buffer.from(trimmed, "utf8");
  if (utf8Buf.length === 32) {
    return {
      valid: true,
      keyBuffer: utf8Buf,
    };
  }

  return {
    valid: false,
    reason: `TICKETS_ENCRYPTION_KEY must be exactly 32 bytes (got ${utf8Buf.length} bytes or invalid hex format).`,
  };
}

/**
 * Check if the encryption subsystem is healthy and operational.
 */
export function isEncryptionAvailable() {
  const result = validateEncryptionKey();
  return result.valid === true;
}

/**
 * Retrieve the validated 256-bit encryption key buffer.
 * Throws immediately if key is absent or invalid (Strict Fail-Closed).
 */
export function getEncryptionKey() {
  const result = validateEncryptionKey();
  if (!result.valid || !result.keyBuffer) {
    throw new Error(`[TicketCrypto] Critical Security Error: ${result.reason}`);
  }
  return result.keyBuffer;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns an envelope object containing ciphertext, iv, and auth tag.
 */
export function encryptString(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const text = String(plaintext);
  if (text.length === 0) return "";

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return {
    _enc: true,
    alg: ALGORITHM,
    iv: iv.toString("hex"),
    tag: authTag.toString("hex"),
    ct: encrypted,
  };
}

/**
 * Decrypt an envelope object back to plaintext string.
 */
export function decryptString(envelope) {
  if (envelope === null || envelope === undefined) return null;
  if (typeof envelope === "string") {
    // If not encrypted envelope, return as-is
    return envelope;
  }
  if (!envelope || typeof envelope !== "object" || !envelope._enc) {
    return envelope;
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(envelope.iv, "hex");
    const authTag = Buffer.from(envelope.tag, "hex");
    const decipher = crypto.createDecipheriv(envelope.alg || ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(envelope.ct, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[TicketCrypto] Decryption failed (tampered data or wrong key):", err.message);
    return "[تعذر فك تشفير البيانات — خطأ في المصادقة]";
  }
}

/**
 * Encrypt sensitive fields of confidential report modal data before DB persistence.
 */
export function encryptTicketModalData(modalData, isConfidential) {
  if (!isConfidential || !modalData || typeof modalData !== "object") {
    return modalData;
  }

  const encryptedData = { ...modalData };
  const sensitiveKeys = [
    "incident_details",
    "evidence_links",
    "reported_party",
    "report_category",
  ];

  for (const key of sensitiveKeys) {
    if (encryptedData[key] !== undefined && encryptedData[key] !== null) {
      encryptedData[key] = encryptString(encryptedData[key]);
    }
  }

  return encryptedData;
}

/**
 * Decrypt sensitive fields of confidential report modal data in-memory when reading from DB.
 */
export function decryptTicketModalData(modalData, isConfidential) {
  if (!isConfidential || !modalData || typeof modalData !== "object") {
    return modalData;
  }

  const decryptedData = { ...modalData };
  for (const [key, value] of Object.entries(decryptedData)) {
    if (value && typeof value === "object" && value._enc) {
      decryptedData[key] = decryptString(value);
    }
  }

  return decryptedData;
}
