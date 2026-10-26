/**
 * M3RGEEN AION 2 — Character Profile Smart Sync Engine
 *
 * Implements:
 *   - 24-hour cache TTL per character
 *   - Centralized serial queue (concurrency = 1)
 *   - Conservative rate limit (1 request every 12 seconds)
 *   - In-flight request deduplication by discord_id
 *   - Bounded queue capacity (max 100 items)
 *   - Zero mass startup sync (queue starts empty)
 *   - Stale-while-revalidate: preserves existing profile_image on failure
 *   - 429 Retry-After handling & 403 suspension (no bypass attempts)
 *   - SSRF protection & PlayNC / NCSoft domain whitelist
 *   - Safe partial merge of character_data JSONB (preserves existing stats/gear)
 *   - Safety switch: EXTERNAL_SYNC_ENABLED defaults to FALSE per project policy.
 */

import { query } from '../database/index.js';
import { scrapeProfile } from './scraper.js';

// Configuration
export const CONFIG = {
  RATE_LIMIT_MS: 30_000,           // 1 request per 30 seconds (gentle pacing)
  CACHE_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  ERROR_BACKOFF_MS: 6 * 60 * 60 * 1000, // 6 hours backoff on failure
  SUSPEND_403_MS: 30 * 60 * 1000,  // 30 minutes cooldown on 403 / Cloudflare
  DEFAULT_RETRY_AFTER_MS: 60_000,  // 60 seconds on 429
  MAX_QUEUE_SIZE: 100,             // Max items in queue
  MAX_RETRIES: 2,                  // Retries per task
};

// Source policy switch: Disabled by default until explicit permission
export const EXTERNAL_SYNC_ENABLED = process.env.SHUGO_EXTERNAL_SYNC_ENABLED === 'true';

// Whitelist of valid avatar URL hostnames
const ALLOWED_IMAGE_DOMAINS = [
  'profileimg.plaync.com',
  'assets.playnccdn.com',
  'tw.ncsoft.com',
  'aion2.plaync.com',
  'shugo.gg',
];

/**
 * Validate image URL against domain whitelist & prevent SSRF
 */
export function isValidAvatarUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    
    // Prevent SSRF / internal IP / localhost
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    return ALLOWED_IMAGE_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// In-memory queue state (Decoupled, zero blocking on main API loop)
const queue = [];
const queuedDiscordIds = new Set();
let isProcessing = false;
let suspendedUntil = 0;
let lastRequestTime = 0;

/**
 * Get current queue status (read-only diagnostics)
 */
export function getQueueStatus() {
  return {
    queueLength: queue.length,
    activeQueuedIds: Array.from(queuedDiscordIds),
    isProcessing,
    isSuspended: Date.now() < suspendedUntil,
    suspendedUntil: suspendedUntil > 0 ? new Date(suspendedUntil).toISOString() : null,
    externalSyncEnabled: EXTERNAL_SYNC_ENABLED,
  };
}

/**
 * Enqueue a discord_id for profile image sync check
 * @param {string} discordId 
 * @param {object} [options]
 * @returns {object} { queued: boolean, reason: string }
 */
export function enqueueProfileSync(discordId, options = {}) {
  if (!discordId) return { queued: false, reason: 'INVALID_ID' };

  // 1. Request deduplication (In-flight & queued check)
  if (queuedDiscordIds.has(discordId)) {
    return { queued: false, reason: 'ALREADY_QUEUED' };
  }

  // 2. Queue capacity guard
  if (queue.length >= CONFIG.MAX_QUEUE_SIZE) {
    console.warn(`[ShugoSync] Queue is at max capacity (${CONFIG.MAX_QUEUE_SIZE}). Dropping request for ${discordId}`);
    return { queued: false, reason: 'QUEUE_FULL' };
  }

  // 3. Add to queue
  const task = {
    discordId: String(discordId),
    enqueuedAt: Date.now(),
    retries: 0,
    mockScraper: options.mockScraper || null, // For local testing
  };

  queue.push(task);
  queuedDiscordIds.add(String(discordId));

  // Trigger processing asynchronously
  triggerQueueProcessing();

  return { queued: true, position: queue.length };
}

/**
 * Enqueue accepted guild members missing CP for safe background sync
 * Strictly limited to 30 members at a time, processed serially with safe spacing
 */
export async function enqueueMissingCpMembers() {
  if (!EXTERNAL_SYNC_ENABLED) return { enqueued: 0, reason: 'EXTERNAL_SYNC_DISABLED' };
  try {
    const res = await query(`
      SELECT discord_id, character_name, combat_power
      FROM aion2_global_applications
      WHERE LOWER(status) = 'accepted'
        AND assigned_guild IN ('EMPEROR', 'M3RGEEN_GLOBAL')
        AND (combat_power IS NULL OR combat_power = 0)
        AND shugo_url IS NOT NULL
      ORDER BY id ASC
      LIMIT 30
    `);
    let count = 0;
    for (const row of res.rows) {
      const qRes = enqueueProfileSync(row.discord_id);
      if (qRes.queued) count++;
    }
    return { enqueued: count, totalFound: res.rows.length };
  } catch (e) {
    console.error('[ShugoSync] Error enqueuing missing CP members:', e.message);
    return { enqueued: 0, error: e.message };
  }
}

/**
 * Trigger queue processor if not already active
 */
function triggerQueueProcessing() {
  if (isProcessing) return;
  isProcessing = true;
  setImmediate(processNextTask);
}

/**
 * Process next item in the queue with strict rate limit & error handling
 */
async function processNextTask() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  // 1. Check if queue is temporarily suspended (e.g. 429 or 403 cooldown)
  const now = Date.now();
  if (now < suspendedUntil) {
    const waitMs = suspendedUntil - now;
    console.log(`[ShugoSync] Queue suspended. Waiting ${(waitMs / 1000).toFixed(1)}s before resume.`);
    setTimeout(processNextTask, Math.min(waitMs, 30_000));
    return;
  }

  // 2. Rate limit pacing (at least RATE_LIMIT_MS between external requests)
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < CONFIG.RATE_LIMIT_MS && EXTERNAL_SYNC_ENABLED) {
    const delay = CONFIG.RATE_LIMIT_MS - timeSinceLast;
    setTimeout(processNextTask, delay);
    return;
  }

  const task = queue.shift();
  queuedDiscordIds.delete(task.discordId);

  try {
    await handleSingleSync(task);
  } catch (err) {
    console.error(`[ShugoSync] Unexpected error processing task for ${task.discordId}:`, err.message);
  } finally {
    lastRequestTime = Date.now();
    // Schedule next task with rate limit spacing
    if (queue.length > 0) {
      setTimeout(processNextTask, EXTERNAL_SYNC_ENABLED ? CONFIG.RATE_LIMIT_MS : 50);
    } else {
      isProcessing = false;
    }
  }
}

/**
 * Execute sync for a single player
 */
async function handleSingleSync(task) {
  const { discordId } = task;

  // 1. Fetch current application row from DB
  const appRes = await query(`
    SELECT id, character_name, profile_image, shugo_url, character_data 
    FROM aion2_global_applications 
    WHERE discord_id = $1 AND status = 'ACCEPTED'
    ORDER BY id DESC LIMIT 1
  `, [discordId]);

  if (appRes.rows.length === 0) {
    return; // Player not registered or not accepted
  }

  const app = appRes.rows[0];
  const charData = (typeof app.character_data === 'object' && app.character_data !== null)
    ? app.character_data
    : {};

  const now = Date.now();
  const lastSync = Number(charData.last_image_sync_at || 0);

  // 2. 24-hour cache evaluation
  if (lastSync > 0 && (now - lastSync) < CONFIG.CACHE_TTL_MS && app.profile_image) {
    // Cache is fresh (< 24h) and image exists: Zero external call!
    return;
  }

  // Check failure backoff (6h)
  if (charData.image_sync_status === 'FAILED' && (now - lastSync) < CONFIG.ERROR_BACKOFF_MS) {
    return; // In failure backoff window
  }

  // 3. Policy check: If external sync is disabled by policy, do not make network calls
  if (!EXTERNAL_SYNC_ENABLED && !task.mockScraper) {
    // Record cached local status safely
    const updatedCharData = {
      ...charData,
      last_image_sync_at: now,
      image_sync_status: 'CACHED_LOCAL_ONLY'
    };
    await safeUpdateCharacterData(app.id, app.profile_image, updatedCharData);
    return;
  }

  // 4. Perform profile scrape
  if (!app.shugo_url) {
    return; // No URL to scrape
  }

  const scraperFn = task.mockScraper || scrapeProfile;
  let scrapeResult;

  try {
    scrapeResult = await scraperFn(app.shugo_url);
  } catch (netErr) {
    scrapeResult = { success: false, error: netErr.message, status: netErr.status || 500 };
  }

  // 5. Handle response & site protection
  if (!scrapeResult.success) {
    const errMsg = String(scrapeResult.error || '');
    const httpStatus = Number(scrapeResult.status || 0);

    // 429 Too Many Requests
    if (httpStatus === 429 || errMsg.includes('429') || errMsg.toLowerCase().includes('too many')) {
      const retryAfter = Number(scrapeResult.retryAfterMs) || CONFIG.DEFAULT_RETRY_AFTER_MS;
      suspendedUntil = Date.now() + retryAfter;
      console.warn(`[ShugoSync] 429 detected! Suspending queue for ${(retryAfter / 1000)}s.`);
      
      // Re-queue task if retries remain
      if (task.retries < CONFIG.MAX_RETRIES) {
        task.retries++;
        queue.unshift(task);
        queuedDiscordIds.add(task.discordId);
      }
      return;
    }

    // 403 Forbidden / Cloudflare / CAPTCHA
    if (httpStatus === 403 || errMsg.includes('403') || errMsg.toLowerCase().includes('captcha')) {
      suspendedUntil = Date.now() + CONFIG.SUSPEND_403_MS;
      console.error(`[ShugoSync] 403 / Protection detected! Suspending queue for 30m. No bypass attempted.`);
      
      // Mark character sync failed without clearing existing image
      const updatedCharData = {
        ...charData,
        last_image_sync_at: now,
        image_sync_status: 'SUSPENDED_403'
      };
      await safeUpdateCharacterData(app.id, app.profile_image, updatedCharData);
      return;
    }

    // Other errors (Network / Parsing / Stale): Stale-While-Revalidate!
    console.warn(`[ShugoSync] Sync failed for ${app.character_name} (${discordId}): ${errMsg}. Keeping current image.`);
    const updatedCharData = {
      ...charData,
      last_image_sync_at: now,
      image_sync_status: 'FAILED',
      last_error: errMsg
    };
    await safeUpdateCharacterData(app.id, app.profile_image, updatedCharData);
    return;
  }

  // 6. Success: Validate extracted image URL against domain whitelist
  const newImageUrl = scrapeResult.data?.profileImage || null;
  let finalImageUrl = app.profile_image; // Default: retain current image

  if (newImageUrl && isValidAvatarUrl(newImageUrl)) {
    finalImageUrl = newImageUrl;
  } else if (newImageUrl) {
    console.warn(`[ShugoSync] Extracted image URL failed whitelist validation: ${newImageUrl}`);
  }

  // 7. Safe partial merge of character_data JSONB (preserves all stats, gear, titles)
  const updatedCharData = {
    ...charData,
    ...(scrapeResult.data?.stats ? { stats: scrapeResult.data.stats } : {}),
    last_image_sync_at: now,
    image_sync_status: 'SUCCESS',
    last_error: null,
  };

  const newCp = (typeof scrapeResult.data?.combatPower === 'number' && scrapeResult.data.combatPower > 0)
    ? Math.floor(scrapeResult.data.combatPower)
    : null;

  await safeUpdateCharacterData(app.id, finalImageUrl, updatedCharData, newCp);
  console.log(`[ShugoSync] Successfully synced image & CP for ${app.character_name} (${discordId})`);
}

/**
 * Safely update profile_image, combat_power, and character_data JSONB in the database
 * Never wipes existing character_data fields.
 */
async function safeUpdateCharacterData(appId, profileImage, updatedCharData, newCp = null) {
  if (newCp !== null) {
    await query(`
      UPDATE aion2_global_applications
      SET profile_image = $1,
          character_data = $2,
          combat_power = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [profileImage, JSON.stringify(updatedCharData), appId, newCp]);
  } else {
    await query(`
      UPDATE aion2_global_applications
      SET profile_image = $1,
          character_data = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [profileImage, JSON.stringify(updatedCharData), appId]);
  }
}

/**
 * Reset in-memory queue state (for testing)
 */
export function resetQueueForTesting() {
  queue.length = 0;
  queuedDiscordIds.clear();
  isProcessing = false;
  suspendedUntil = 0;
  lastRequestTime = 0;
}
