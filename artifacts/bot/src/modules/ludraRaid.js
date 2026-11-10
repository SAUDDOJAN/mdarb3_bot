/**
 * M3RGEEN — Ludra Raid Registration, Verification, Sorting & Statistics Engine
 * Completely isolated from guild applications, static teams, LFG, points, and desktop app DB.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} from "discord.js";
import dns from "node:dns";
import net from "node:net";
import * as cheerio from "cheerio";
import { query, pool } from "../database/index.js";
import { stripHtml } from "./scraper.js";

try {
  dns.setDefaultResultOrder("ipv4first");
  if (typeof net.setDefaultAutoSelectFamily === "function") {
    net.setDefaultAutoSelectFamily(false);
  }
} catch {}

// ─── Constants & Confirmed Role / Channel IDs ─────────────────────────────────
export const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";
export const LUDRA_TEST_CHANNEL_ID = "1290449971639881849";
export const LUDRA_OFFICIAL_CHANNEL_ID = "1566867947786473583";
export const LUDRA_CONFIG_KEY = "ludra_raid_system";
export const LUDRA_REGISTERED_ROLE_NAME = "🎯 مسجل لودرا";

// Strictly the two official guild roles (Never confuse with AION 2 Member or 🔥 المعرقين)
export const M3RGEEN_GUILD_ROLE_ID = "1555617080521269368"; // M3RGEEN Guild (Global: M3RGEEN / M3RG33N / M3RGEEEN)
export const EMPEROR_GUILD_ROLE_ID = "1555617021411065917"; // Emperor Guild (Early Access: EMPEROR)

// Authorized Admin / Leadership Roles for viewing detailed participant lists
export const AUTHORIZED_LIST_VIEWER_ROLE_IDS = [
  "1296028441690374155", // قائد المعرقين
  "1296029940520587264", // Admin
  "1554242295384252427", // S-Admin
  "1548343903307178024", // AION 2 Guild Leader
  "1555965433058693220", // 👑 Emperor Guild Leader
];

// Eligibility & Classification Thresholds
export const HARD_MIN_ILVL = 3000;
export const NORMAL_MIN_ILVL = 2800;
export const CARRY_MIN_CP = 170000; // >= 170000 => "كيري", < 170000 => "يتكرى"

// Queue & Rate Limit Configuration
export const QUEUE_CONFIG = {
  CONCURRENCY: 2,
  MIN_REQUEST_INTERVAL_MS: 2000, // 2 seconds between Shugo refresh calls
  MAX_RETRIES: 3,
  DEFAULT_RETRY_AFTER_MS: 15000,
  EMBED_DEBOUNCE_MS: 1800,
  PAGE_SIZE: 15,
  HARD_EMBED_MAX_INLINE_NAMES: 60,
};

export const ALL_CLASSES = [
  "Templar",
  "Gladiator",
  "Cleric",
  "Chanter",
  "Assassin",
  "Ranger",
  "Sorcerer",
  "Spiritmaster",
];

export const CLASS_EMOJIS = {
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Templar:      "<:Templar:1504472027724255414>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Spiritmaster: "<:Elementalist:1504471920219783209>",
};

const CLASS_MAP = {
  2:  "Gladiator",    3:  "Templar",       4:  "Ranger",
  5:  "Gladiator",    6:  "Gladiator",     7:  "Gladiator",  8:  "Gladiator",
  9:  "Templar",      10: "Templar",       11: "Templar",    12: "Templar",
  13: "Ranger",       14: "Ranger",        15: "Ranger",     16: "Ranger",
  17: "Assassin",     18: "Assassin",      19: "Assassin",   20: "Assassin",
  21: "Spiritmaster", 22: "Spiritmaster",  23: "Spiritmaster", 24: "Spiritmaster",
  25: "Sorcerer",     26: "Sorcerer",      27: "Sorcerer",   28: "Sorcerer",
  29: "Cleric",       30: "Cleric",        31: "Cleric",     32: "Cleric",
  33: "Chanter",      34: "Chanter",       35: "Chanter",    36: "Chanter",
};

const REGION_SUBREGION_MAP = {
  1: "nae",
  2: "naw",
  3: "eu",
  4: "la",
  5: "as",
};

const REGION_CONFIG = {
  GLOBAL: { apiBase: "https://aion2.plaync.com", lang: "en-US" },
  TW:     { apiBase: "https://tw.ncsoft.com/aion2", lang: "en" },
  KR:     { apiBase: "https://aion2.plaync.com", lang: "ko-kr" },
};

const KNOWN_SERVER_SLUGS = {
  "eu-ludra": { id: "2311", name: "Ludra" },
  "eu-zikel": { id: "2302", name: "Zikel" },
  "eu-triniel": { id: "2303", name: "Triniel" },
  "eu-vaizel": { id: "2304", name: "Vaizel" },
  "eu-kaisenel": { id: "2305", name: "Kaisenel" },
  "eu-nezekan": { id: "2301", name: "Nezekan" },
  "ludra": { id: "2311", name: "Ludra" },
  "zikel": { id: "2302", name: "Zikel" },
  "triniel": { id: "2303", name: "Triniel" },
  "vaizel": { id: "2304", name: "Vaizel" },
  "kaisenel": { id: "2305", name: "Kaisenel" },
  "nezekan": { id: "2301", name: "Nezekan" },
};

const ALLOWED_SHUGO_DOMAINS = ["shugo.gg", "www.shugo.gg"];

const PAGE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  Referer: "https://shugo.gg/",
  "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
};

const PROXY_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  DNT: "1",
  Referer: "https://shugo.gg/",
  Origin: "https://shugo.gg",
  "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

const numFmt = (n) => Number(n || 0).toLocaleString("en-US");

export function normalizeClassName(rawClass) {
  const s = String(rawClass || "").trim();
  if (!s) return "Unknown";
  if (s.toLowerCase() === "elementalist" || s.toLowerCase() === "mentalist") {
    return "Spiritmaster";
  }
  const found = ALL_CLASSES.find((c) => c.toLowerCase() === s.toLowerCase());
  return found || s;
}

// ─── 1. Database Schema Initialization (Isolated Ludra Tables) ────────────────
let dbInitialized = false;

export async function initLudraRaidDB() {
  if (dbInitialized) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ludra_raid_config (
      config_key VARCHAR(64) PRIMARY KEY,
      guild_id VARCHAR(64) NOT NULL,
      channel_id VARCHAR(64) NOT NULL,
      hard_message_id VARCHAR(64),
      normal_message_id VARCHAR(64),
      announcement_message_id VARCHAR(64),
      is_test_channel BOOLEAN DEFAULT TRUE,
      previous_channel_id VARCHAR(64),
      previous_hard_message_id VARCHAR(64),
      previous_normal_message_id VARCHAR(64),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE ludra_raid_config
      ADD COLUMN IF NOT EXISTS announcement_message_id VARCHAR(64);

    CREATE TABLE IF NOT EXISTS ludra_external_profiles (
      discord_id VARCHAR(64) PRIMARY KEY,
      shugo_url TEXT NOT NULL,
      shugo_character_id TEXT NOT NULL,
      server_id VARCHAR(32) NOT NULL,
      server_name TEXT,
      region VARCHAR(32) DEFAULT 'GLOBAL',
      character_name TEXT NOT NULL,
      class_name VARCHAR(64) NOT NULL,
      item_level INTEGER NOT NULL DEFAULT 0,
      combat_power INTEGER NOT NULL DEFAULT 0,
      last_verified_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_ludra_ext_shugo_char UNIQUE (shugo_character_id, server_id)
    );

    CREATE TABLE IF NOT EXISTS ludra_raid_registrations (
      id BIGSERIAL PRIMARY KEY,
      discord_id VARCHAR(64) NOT NULL UNIQUE,
      shugo_character_id TEXT NOT NULL,
      server_id VARCHAR(32) NOT NULL,
      server_name TEXT,
      region VARCHAR(32) DEFAULT 'GLOBAL',
      shugo_url TEXT NOT NULL,
      character_name TEXT NOT NULL,
      class_name VARCHAR(64) NOT NULL,
      item_level INTEGER NOT NULL,
      combat_power INTEGER NOT NULL,
      raid_tier VARCHAR(16) NOT NULL CHECK (raid_tier IN ('HARD', 'NORMAL')),
      carry_classification VARCHAR(16) CHECK (carry_classification IN ('كيري', 'يتكرى') OR carry_classification IS NULL),
      member_source VARCHAR(32) NOT NULL CHECK (member_source IN ('M3RGEEN_GUILD', 'EMPEROR_GUILD', 'BOTH_GUILDS', 'EXTERNAL')),
      is_guild_member BOOLEAN NOT NULL DEFAULT FALSE,
      eligibility_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (eligibility_status IN ('ACTIVE', 'SUSPENDED')),
      suspended_reason TEXT,
      last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ludra_reg_shugo_char UNIQUE (shugo_character_id, server_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ludra_reg_tier_status
      ON ludra_raid_registrations (raid_tier, eligibility_status);

    CREATE TABLE IF NOT EXISTS ludra_sync_queue (
      id BIGSERIAL PRIMARY KEY,
      discord_id VARCHAR(64) NOT NULL,
      shugo_character_id TEXT,
      shugo_url TEXT NOT NULL,
      target_action VARCHAR(24) NOT NULL CHECK (target_action IN ('HARD', 'NORMAL', 'REFRESH')),
      member_source VARCHAR(32) NOT NULL,
      is_guild_member BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_retry_at TIMESTAMPTZ DEFAULT NOW(),
      error_message TEXT,
      result_summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_ludra_queue_active_discord
      ON ludra_sync_queue (discord_id)
      WHERE status IN ('PENDING', 'PROCESSING');

    CREATE UNIQUE INDEX IF NOT EXISTS uq_ludra_queue_active_char
      ON ludra_sync_queue (shugo_character_id)
      WHERE status IN ('PENDING', 'PROCESSING') AND shugo_character_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS ludra_blacklist (
      id BIGSERIAL PRIMARY KEY,
      discord_id VARCHAR(64) NOT NULL UNIQUE,
      character_name TEXT,
      shugo_character_id TEXT,
      reason TEXT,
      banned_by TEXT DEFAULT 'ADMIN',
      banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  dbInitialized = true;
}

// ─── 2. Strict URL Validation & SSRF Prevention ───────────────────────────────
export function validateAndSanitizeShugoUrl(rawInput) {
  if (!rawInput || typeof rawInput !== "string") {
    return { valid: false, error: "يرجى إدخال رابط بروفايل Shugo.gg صالح." };
  }

  let clean = rawInput.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00A0]/g, "").trim();
  const urlMatch = clean.match(/https?:\/\/[^\s<>"'`]+/i) || clean.match(/(?:www\.)?shugo\.gg[^\s<>"'`]+/i);
  if (urlMatch) clean = urlMatch[0];
  clean = clean.replace(/[>)'"`\].,;]+$/, "");
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = `https://${clean}`;
  }

  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    return { valid: false, error: "صيغة الرابط غير صحيحة. تأكد من نسخ الرابط كاملاً من متصفحك." };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "يجب أن يبدأ الرابط ببروتوكول آمن (https://shugo.gg/...)." };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_SHUGO_DOMAINS.includes(host)) {
    return {
      valid: false,
      error: "الرابط المدخل غير مدعوم. يُسمح فقط بروابط بروفايلات الشخصيات من النطاق الرسمي `shugo.gg`.",
    };
  }

  const pathname = parsed.pathname;
  const isPathChar = pathname.toLowerCase().includes("/character/");
  const isQueryChar = pathname.toLowerCase().startsWith("/character") && parsed.searchParams.has("id") && parsed.searchParams.has("server");

  if (!isPathChar && !isQueryChar) {
    return {
      valid: false,
      error:
        "هذا الرابط لا يشير إلى صفحة شخصية في Shugo.gg.\n" +
        "مثال صحيح:\n`https://shugo.gg/character/global/eu-ludra/CharacterName`",
    };
  }

  return { valid: true, url: parsed.href };
}

// ─── 3. Role Detection & Source Profile Resolution ────────────────────────────
export function detectMemberGuildRoleStatus(member) {
  const roleCache = member?.roles?.cache;
  const hasM3rgeen = Boolean(
    roleCache ? roleCache.has(M3RGEEN_GUILD_ROLE_ID) : Array.isArray(member?.roles) && member.roles.includes(M3RGEEN_GUILD_ROLE_ID)
  );
  const hasEmperor = Boolean(
    roleCache ? roleCache.has(EMPEROR_GUILD_ROLE_ID) : Array.isArray(member?.roles) && member.roles.includes(EMPEROR_GUILD_ROLE_ID)
  );

  let memberSource = "EXTERNAL";
  if (hasM3rgeen && hasEmperor) memberSource = "BOTH_GUILDS";
  else if (hasM3rgeen) memberSource = "M3RGEEN_GUILD";
  else if (hasEmperor) memberSource = "EMPEROR_GUILD";

  return {
    hasM3rgeen,
    hasEmperor,
    isGuildMember: hasM3rgeen || hasEmperor,
    memberSource,
  };
}

export function isAuthorizedListViewer(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const roleCache = member.roles?.cache;
  if (roleCache) {
    return AUTHORIZED_LIST_VIEWER_ROLE_IDS.some((rid) => roleCache.has(rid));
  }
  if (Array.isArray(member.roles)) {
    return AUTHORIZED_LIST_VIEWER_ROLE_IDS.some((rid) => member.roles.includes(rid));
  }
  return false;
}

/**
 * Look up existing Shugo URL for a player without modifying any guild tables.
 * Priority for guild members:
 *   1) Existing Ludra registration / external profile (if they already updated their link in Ludra)
 *   2) aion2_global_applications (accepted or latest with shugo_url)
 *   3) recruits / power_cards fallback
 */
export async function resolveExistingPlayerShugoUrl(discordId, isGuildMember) {
  await initLudraRaidDB();

  // Check if already registered in Ludra
  const ludraReg = await query(
    `SELECT shugo_url, shugo_character_id FROM ludra_raid_registrations WHERE discord_id = $1 LIMIT 1`,
    [String(discordId)]
  );
  if (ludraReg.rows.length > 0 && ludraReg.rows[0].shugo_url) {
    const v = validateAndSanitizeShugoUrl(ludraReg.rows[0].shugo_url);
    if (v.valid) {
      return { shugoUrl: v.url, shugoCharacterId: ludraReg.rows[0].shugo_character_id || null, origin: "LUDRA_REGISTRATION" };
    }
  }

  if (isGuildMember) {
    // 1. Check aion2_global_applications (Read-Only!)
    const appRes = await query(
      `SELECT shugo_url FROM aion2_global_applications
       WHERE discord_id = $1 AND shugo_url IS NOT NULL AND TRIM(shugo_url) <> ''
       ORDER BY (CASE WHEN status = 'ACCEPTED' THEN 0 ELSE 1 END), id DESC
       LIMIT 1`,
      [String(discordId)]
    );
    if (appRes.rows.length > 0) {
      const v = validateAndSanitizeShugoUrl(appRes.rows[0].shugo_url);
      if (v.valid) {
        return { shugoUrl: v.url, shugoCharacterId: null, origin: "GUILD_APPLICATIONS" };
      }
    }

    // 2. Check recruits fallback (Read-Only!)
    const recRes = await query(
      `SELECT shugo_url FROM recruits
       WHERE user_id = $1 AND shugo_url IS NOT NULL AND TRIM(shugo_url) <> ''
       ORDER BY id DESC LIMIT 1`,
      [String(discordId)]
    );
    if (recRes.rows.length > 0) {
      const v = validateAndSanitizeShugoUrl(recRes.rows[0].shugo_url);
      if (v.valid) {
        return { shugoUrl: v.url, shugoCharacterId: null, origin: "RECRUITS" };
      }
    }

    // 3. Check ludra_external_profiles (in case a guild member previously supplied a missing URL safely via Ludra modal)
    const extRes = await query(
      `SELECT shugo_url, shugo_character_id FROM ludra_external_profiles WHERE discord_id = $1 LIMIT 1`,
      [String(discordId)]
    );
    if (extRes.rows.length > 0) {
      const v = validateAndSanitizeShugoUrl(extRes.rows[0].shugo_url);
      if (v.valid) {
        return { shugoUrl: v.url, shugoCharacterId: extRes.rows[0].shugo_character_id || null, origin: "LUDRA_SAFE_FALLBACK" };
      }
    }

    return null;
  }

  // External member: check ludra_external_profiles
  const extRes = await query(
    `SELECT shugo_url, shugo_character_id FROM ludra_external_profiles WHERE discord_id = $1 LIMIT 1`,
    [String(discordId)]
  );
  if (extRes.rows.length > 0) {
    const v = validateAndSanitizeShugoUrl(extRes.rows[0].shugo_url);
    if (v.valid) {
      return { shugoUrl: v.url, shugoCharacterId: extRes.rows[0].shugo_character_id || null, origin: "EXTERNAL_PROFILE" };
    }
  }

  return null;
}

// ─── 4. Forced Live Shugo.gg Refresh & Data Extraction ────────────────────────
let customVerifyFn = null;
export function setCustomShugoVerifierForTesting(fn) {
  customVerifyFn = fn;
}

/**
 * Forces a fresh fetch from Shugo.gg / PlayNC using cacheBuster (`_t = Date.now()`)
 * and `cache: "no-store"` (identical to Shugo.gg's internal `refreshCharacter` hook).
 * Never uses cached DB values for Item Level or Combat Power.
 */
export async function forceRefreshAndFetchShugoProfile(inputUrl) {
  if (typeof customVerifyFn === "function") {
    return await customVerifyFn(inputUrl);
  }

  const validated = validateAndSanitizeShugoUrl(inputUrl);
  if (!validated.valid) {
    return { success: false, error: validated.error, status: 400 };
  }

  const cleanUrl = validated.url;
  const parsedUrl = new URL(cleanUrl);
  const pathname = parsedUrl.pathname;

  let characterId = null;
  let serverId = null;
  let region = "GLOBAL";
  let fallbackName = "";

  // A. Resolve characterId & serverId from Shugo URL
  // We also support fast resolution via the official search proxy if the HTML page is slow/throttled
  if (pathname.toLowerCase().includes("/character/")) {
    const segments = pathname.split("/").filter(Boolean);
    const charIdx = segments.findIndex((s) => s.toLowerCase() === "character");
    if (charIdx === -1 || segments.length < charIdx + 4) {
      return { success: false, error: "رابط البروفايل غير مكتمل. تأكد من وجود المنطقة والسيرفر واسم الشخصية.", status: 400 };
    }
    const regionSegment = segments[charIdx + 1];
    const serverSlug = segments[charIdx + 2];
    const rawCharName = decodeURIComponent(segments.slice(charIdx + 3).join("/"));
    fallbackName = rawCharName;
    const serverInfo = KNOWN_SERVER_SLUGS[serverSlug.toLowerCase()];

    const pageUrl = `https://shugo.gg/character/${encodeURIComponent(regionSegment)}/${encodeURIComponent(serverSlug)}/${encodeURIComponent(rawCharName)}`;
    let pageRes = null;
    try {
      pageRes = await fetch(pageUrl, {
        headers: PAGE_HEADERS,
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      pageRes = null;
    }

    if (pageRes && pageRes.status === 429) {
      const retryHeader = pageRes.headers.get("retry-after");
      const retryAfterMs = retryHeader ? Number(retryHeader) * 1000 : QUEUE_CONFIG.DEFAULT_RETRY_AFTER_MS;
      return { success: false, error: "ضغط مرتفع على Shugo.gg (429).", status: 429, retryable: true, retryAfterMs };
    }

    if (pageRes && pageRes.status === 404) {
      return {
        success: false,
        error: `لم يتم العثور على الشخصية "${rawCharName}" في سيرفر "${serverSlug}" على Shugo.gg.`,
        status: 404,
      };
    }

    if (pageRes && pageRes.ok) {
      const html = await pageRes.text();
      const $ = cheerio.load(html);

      const metaContent =
        $('meta[name="shugo-character"]').attr("content") ||
        $('meta[property="shugo-character"]').attr("content");

      if (metaContent) {
        try {
          const metaObj = JSON.parse(metaContent);
          if (metaObj.id && metaObj.serverId) {
            characterId = String(metaObj.id);
            serverId = String(metaObj.serverId);
            region = String(metaObj.region || regionSegment || "GLOBAL").toUpperCase();
            fallbackName = stripHtml(metaObj.name || rawCharName);
          }
        } catch {}
      }

      if (!characterId || !serverId) {
        let jsonLdId = null;
        let jsonLdName = null;
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const data = JSON.parse($(el).text());
            if (data.mainEntity?.identifier) {
              jsonLdId = data.mainEntity.identifier;
              jsonLdName = data.mainEntity.name;
            }
          } catch {}
        });
        const idMatch = jsonLdId || html.match(/"identifier"\s*:\s*"([^"]+)"/)?.[1] || html.match(/charKey=([^&"']+)/)?.[1];
        const srvMatch = serverInfo?.id || html.match(/gameServerKey=(\d+)/)?.[1] || html.match(/"serverId"\s*:\s*"?(\d+)"?/)?.[1];

        if (idMatch && srvMatch) {
          characterId = decodeURIComponent(idMatch);
          serverId = String(srvMatch).trim();
          region = String(regionSegment || "GLOBAL").toUpperCase();
          fallbackName = stripHtml(jsonLdName || rawCharName);
        }
      }
    }

    // Fallback: if SSR HTML timed out, resolve characterId via the PlayNC search proxy using serverId + rawCharName
    if ((!characterId || !serverId) && serverInfo?.id) {
      serverId = serverInfo.id;
      region = String(regionSegment || "GLOBAL").toUpperCase();
      const subRegion = REGION_SUBREGION_MAP[String(serverId)[1]] || "eu";
      for (const raceId of [1, 2]) {
        try {
          const searchInner = `https://api-search.plaync.com/aion2global/search/v2/character?keyword=${encodeURIComponent(rawCharName)}&page=1&size=20&race=${raceId}&serverId=${serverId}&region=${subRegion}&localeInfo=en-US`;
          const searchProxy = `https://shugo.gg/api/proxy?url=${encodeURIComponent(searchInner)}`;
          const sRes = await fetch(searchProxy, {
            headers: PROXY_HEADERS,
            signal: AbortSignal.timeout(10000),
          });
          if (sRes.ok) {
            const sJson = await sRes.json();
            const list = Array.isArray(sJson?.list) ? sJson.list : Array.isArray(sJson?.data?.list) ? sJson.data.list : [];
            const match = list.find(
              (c) => stripHtml(c.name || "").toLowerCase() === rawCharName.toLowerCase() && String(c.serverId) === String(serverId)
            );
            if (match && match.characterId) {
              let dec = String(match.characterId);
              try {
                while (dec.includes("%")) {
                  const nx = decodeURIComponent(dec);
                  if (nx === dec) break;
                  dec = nx;
                }
              } catch {}
              characterId = dec;
              fallbackName = stripHtml(match.name || rawCharName);
              break;
            }
          }
        } catch {}
      }
    }

    if (!characterId || !serverId) {
      return {
        success: false,
        error: `تعذر استخراج معرّف الشخصية "${rawCharName}" من Shugo.gg. تأكد أن رابط البروفايل يفتح بشكل صحيح.`,
        status: 422,
        retryable: !pageRes,
      };
    }
  } else {
    // Query-param format: ?id=...&server=...
    const qId = parsedUrl.searchParams.get("id");
    const qServer = parsedUrl.searchParams.get("server");
    const qRegion = parsedUrl.searchParams.get("region");
    const qName = parsedUrl.searchParams.get("name");
    if (!qId || !qServer) {
      return { success: false, error: "رابط Shugo.gg يفتقد معرّف الشخصية أو السيرفر.", status: 400 };
    }
    let decodedId = qId;
    try {
      while (decodedId.includes("%")) {
        const next = decodeURIComponent(decodedId);
        if (next === decodedId) break;
        decodedId = next;
      }
    } catch {}
    characterId = decodedId;
    serverId = qServer.trim();
    region = String(qRegion || "GLOBAL").trim().toUpperCase();
    fallbackName = stripHtml(qName || "");
  }

  // B. Force fresh character/info call via Shugo proxy with cacheBuster (`_t`) and `cache: "no-store"`
  const cfg = REGION_CONFIG[region] ?? REGION_CONFIG.GLOBAL;
  const cacheBuster = Date.now();
  let extraRegion = "";
  if (region === "GLOBAL" && /^[12]\d{3}$/.test(String(serverId))) {
    const sub = REGION_SUBREGION_MAP[String(serverId)[1]];
    if (sub) extraRegion = `&region=${sub}`;
  }

  const innerInfoUrl =
    `${cfg.apiBase}/api/character/info?lang=${cfg.lang}` +
    `&characterId=${encodeURIComponent(characterId)}` +
    `&serverId=${encodeURIComponent(serverId)}` +
    `${extraRegion}&_t=${cacheBuster}`;
  const proxyInfoUrl = `https://shugo.gg/api/proxy?url=${encodeURIComponent(innerInfoUrl)}`;

  let infoRes;
  try {
    infoRes = await fetch(proxyInfoUrl, {
      headers: PROXY_HEADERS,
      signal: AbortSignal.timeout(30000),
    });
  } catch (netErr) {
    return { success: false, error: `انتهت مهلة الاتصال بخادم بيانات Shugo.gg (${netErr.message}).`, status: 504, retryable: true };
  }

  if (infoRes.status === 429) {
    const retryHeader = infoRes.headers.get("retry-after");
    const retryAfterMs = retryHeader ? Number(retryHeader) * 1000 : QUEUE_CONFIG.DEFAULT_RETRY_AFTER_MS;
    return { success: false, error: "تم الوصول لحد الطلبات المؤقت في Shugo.gg (429).", status: 429, retryable: true, retryAfterMs };
  }

  if (!infoRes.ok) {
    return {
      success: false,
      error: `تعذر جلب بيانات الشخصية المحدثة من Shugo.gg (HTTP ${infoRes.status}).`,
      status: infoRes.status,
      retryable: infoRes.status >= 500,
    };
  }

  let raw;
  try {
    raw = await infoRes.json();
  } catch {
    return { success: false, error: "استجابة غير صالحة من Shugo.gg أثناء تحديث البروفايل.", status: 502, retryable: true };
  }

  if (raw?.error || !raw?.profile) {
    return {
      success: false,
      error: raw?.error ? `خطأ من مصدر Shugo.gg: ${raw.error}` : "لم تتوفر بيانات البروفايل في استجابة Shugo.gg.",
      status: 422,
    };
  }

  const profile = raw.profile;
  const characterName = stripHtml(
    String(profile.characterName ?? profile.charName ?? profile.pcName ?? profile.name ?? fallbackName ?? "")
  );

  let className = profile.className ?? profile.jobName ?? null;
  if (!className || className === "Unknown") {
    className = CLASS_MAP[ parseInt(profile.pcId ?? profile.classId ?? 0, 10) ] ?? "Unknown";
  }
  className = normalizeClassName(className);

  const combatPowerRaw = profile.combatPower ?? profile.powerScore ?? profile.cp ?? null;
  const combatPower = combatPowerRaw !== null && combatPowerRaw !== undefined ? parseInt(combatPowerRaw, 10) : NaN;

  const statList = Array.isArray(raw?.stat?.statList) ? raw.stat.statList : [];
  const itemLevelStat = statList.find(
    (s) => s && (s.type === "ItemLevel" || s.name === "Item Level" || s.name === "아이템레벨")
  );
  const itemLevelRaw = itemLevelStat?.value ?? profile.itemLevel ?? profile.gearScore ?? null;
  const itemLevel = itemLevelRaw !== null && itemLevelRaw !== undefined ? parseInt(itemLevelRaw, 10) : NaN;

  if (!characterName || !Number.isFinite(itemLevel) || itemLevel <= 0 || !Number.isFinite(combatPower) || combatPower < 0) {
    return {
      success: false,
      error: "البيانات المستخرجة من Shugo.gg غير مكتملة (Item Level أو Combat Power مفقود).",
      status: 422,
    };
  }

  const serverName = stripHtml(String(profile.serverName ?? `Server ${serverId}`));
  const resolvedServerId = String(profile.serverId ?? serverId);

  return {
    success: true,
    data: {
      shugoCharacterId: String(characterId),
      serverId: resolvedServerId,
      serverName,
      region,
      shugoUrl: cleanUrl,
      characterName,
      className,
      itemLevel,
      combatPower,
      verifiedAt: new Date(),
    },
  };
}

// ─── 5. Atomic Registration, Classification & Upgrade Logic ──────────────────
/**
 * Evaluates freshly fetched Shugo character data against the requested action ('HARD' | 'NORMAL' | 'REFRESH')
 * and performs an atomic transaction in PostgreSQL so a player is NEVER counted in both Hard and Normal.
 */
export async function applyLudraRegistrationTransaction({
  discordId,
  targetAction,
  memberSource,
  isGuildMember,
  freshData,
}) {
  await initLudraRaidDB();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      shugoCharacterId,
      serverId,
      serverName,
      region,
      shugoUrl,
      characterName,
      className,
      itemLevel,
      combatPower,
      verifiedAt,
    } = freshData;

    // 0. Check if user or character is permanently blacklisted from Ludra system
    const blRes = await client.query(
      `SELECT reason FROM ludra_blacklist WHERE discord_id = $1 OR ($2::text IS NOT NULL AND shugo_character_id = $2) LIMIT 1`,
      [String(discordId), shugoCharacterId]
    );
    if (blRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return {
        accepted: false,
        code: "BLACKLISTED_FROM_LUDRA",
        embedsChanged: false,
        message: `⛔ **عذراً، تم استبعادك ومنع هذا الحساب/الشخصية من التسجيل في منظومة لودرا بالسيرفر.**\n• **السبب:** ${blRes.rows[0].reason || "مخالفة قوانين وأنظمة التحالف."}`,
      };
    }

    // 1. Check if another Discord user already registered this exact Shugo character
    const charOwnerRes = await client.query(
      `SELECT discord_id, character_name, raid_tier FROM ludra_raid_registrations
       WHERE shugo_character_id = $1 AND server_id = $2 AND discord_id <> $3
       FOR UPDATE`,
      [shugoCharacterId, serverId, String(discordId)]
    );

    if (charOwnerRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return {
        accepted: false,
        code: "CHARACTER_ALREADY_CLAIMED",
        embedsChanged: false,
        message: `❌ هذه الشخصية (**${characterName}**) مسجلة مسبقاً بحساب ديسكورد آخر في نظام Ludra.`,
      };
    }

    // 2. If External participant (or guild member using safe fallback URL), upsert into ludra_external_profiles
    if (!isGuildMember) {
      const extOwnerConflict = await client.query(
        `SELECT discord_id FROM ludra_external_profiles
         WHERE shugo_character_id = $1 AND server_id = $2 AND discord_id <> $3`,
        [shugoCharacterId, serverId, String(discordId)]
      );
      if (extOwnerConflict.rows.length > 0) {
        await client.query("ROLLBACK");
        return {
          accepted: false,
          code: "CHARACTER_ALREADY_CLAIMED",
          embedsChanged: false,
          message: `❌ هذا البروفايل (**${characterName}**) مرتبط مسبقاً بحساب ديسكورد آخر.`,
        };
      }

      await client.query(
        `INSERT INTO ludra_external_profiles (
           discord_id, shugo_url, shugo_character_id, server_id, server_name, region,
           character_name, class_name, item_level, combat_power, last_verified_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           shugo_url = EXCLUDED.shugo_url,
           shugo_character_id = EXCLUDED.shugo_character_id,
           server_id = EXCLUDED.server_id,
           server_name = EXCLUDED.server_name,
           region = EXCLUDED.region,
           character_name = EXCLUDED.character_name,
           class_name = EXCLUDED.class_name,
           item_level = EXCLUDED.item_level,
           combat_power = EXCLUDED.combat_power,
           last_verified_at = EXCLUDED.last_verified_at,
           updated_at = NOW()`,
        [
          String(discordId),
          shugoUrl,
          shugoCharacterId,
          serverId,
          serverName,
          region,
          characterName,
          className,
          itemLevel,
          combatPower,
          verifiedAt,
        ]
      );
    }

    // 3. Fetch current registration for this Discord user (locked FOR UPDATE)
    const existingRes = await client.query(
      `SELECT * FROM ludra_raid_registrations WHERE discord_id = $1 FOR UPDATE`,
      [String(discordId)]
    );
    const existing = existingRes.rows[0] || null;

    const effectiveAction =
      targetAction === "REFRESH"
        ? existing?.raid_tier || (itemLevel >= HARD_MIN_ILVL ? "HARD" : "NORMAL")
        : targetAction;

    // ── CASE A: Target is HARD (3000+ iLvl) ─────────────────────────────────
    if (effectiveAction === "HARD") {
      if (itemLevel < HARD_MIN_ILVL) {
        // Did they already have an active HARD registration and dropped below 3000 on re-check?
        if (existing && existing.raid_tier === "HARD") {
          await client.query(
            `UPDATE ludra_raid_registrations
             SET character_name = $2, class_name = $3, item_level = $4, combat_power = $5,
                 member_source = $6, is_guild_member = $7,
                 eligibility_status = 'SUSPENDED',
                 suspended_reason = $8,
                 last_verified_at = $9, updated_at = NOW()
             WHERE discord_id = $1`,
            [
              String(discordId),
              characterName,
              className,
              itemLevel,
              combatPower,
              memberSource,
              isGuildMember,
              `انخفض Item Level إلى ${itemLevel} (أقل من 3000)`,
              verifiedAt,
            ]
          );
          await client.query("COMMIT");
          return {
            accepted: false,
            code: "HARD_SUSPENDED_BELOW_3000",
            embedsChanged: true,
            message:
              `⚠️ لم تصل بعد إلى Item Level 3000 المطلوب للتسجيل في Ludra Hard. مستواك الحالي: ${itemLevel}.\n` +
              `تم تعليق أهليتك في إحصائيات Hard مؤقتاً لحين رفع مستوى العتاد إلى 3000+ من جديد (ولم يتم نقلك تلقائياً إلى Normal).`,
          };
        }

        // Otherwise (new registrant OR existing Normal registrant trying to upgrade to Hard with < 3000):
        // Leave any existing Normal registration completely untouched!
        await client.query("COMMIT");
        const keepNormalNote =
          existing && existing.raid_tier === "NORMAL" && existing.eligibility_status === "ACTIVE"
            ? `\n*(بقي تسجيلك السابق في **Ludra Normal** كما هو دون تغيير)*`
            : "";
        return {
          accepted: false,
          code: "HARD_REJECTED_ILVL",
          embedsChanged: false,
          message: `لم تصل بعد إلى Item Level 3000 المطلوب للتسجيل في Ludra Hard. مستواك الحالي: ${itemLevel}.${keepNormalNote}`,
        };
      }

      // Qualified for HARD (itemLevel >= 3000)!
      const wasInNormal = existing && existing.raid_tier === "NORMAL";
      const wasUpdateInHard = existing && existing.raid_tier === "HARD";

      // Atomic upsert into HARD (removes from NORMAL if wasInNormal, clears carry_classification)
      await client.query(
        `INSERT INTO ludra_raid_registrations (
           discord_id, shugo_character_id, server_id, server_name, region, shugo_url,
           character_name, class_name, item_level, combat_power,
           raid_tier, carry_classification, member_source, is_guild_member,
           eligibility_status, suspended_reason, last_verified_at, registered_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10,
           'HARD', NULL, $11, $12,
           'ACTIVE', NULL, $13, NOW(), NOW()
         )
         ON CONFLICT (discord_id) DO UPDATE SET
           shugo_character_id = EXCLUDED.shugo_character_id,
           server_id = EXCLUDED.server_id,
           server_name = EXCLUDED.server_name,
           region = EXCLUDED.region,
           shugo_url = EXCLUDED.shugo_url,
           character_name = EXCLUDED.character_name,
           class_name = EXCLUDED.class_name,
           item_level = EXCLUDED.item_level,
           combat_power = EXCLUDED.combat_power,
           raid_tier = 'HARD',
           carry_classification = NULL,
           member_source = EXCLUDED.member_source,
           is_guild_member = EXCLUDED.is_guild_member,
           eligibility_status = 'ACTIVE',
           suspended_reason = NULL,
           last_verified_at = EXCLUDED.last_verified_at,
           updated_at = NOW()`,
        [
          String(discordId),
          shugoCharacterId,
          serverId,
          serverName,
          region,
          shugoUrl,
          characterName,
          className,
          itemLevel,
          combatPower,
          memberSource,
          isGuildMember,
          verifiedAt,
        ]
      );

      await client.query("COMMIT");

      if (wasInNormal) {
        return {
          accepted: true,
          code: "UPGRADED_NORMAL_TO_HARD",
          embedsChanged: true,
          tier: "HARD",
          message:
            `🔥 **تمت ترقيتك ونقلك تلقائياً من Ludra Normal إلى Ludra Hard!**\n` +
            `• **الشخصية:** \`${characterName}\` (${className})\n` +
            `• **Item Level:** \`${numFmt(itemLevel)}\`\n` +
            `• **Combat Power:** \`${numFmt(combatPower)}\`\n` +
            `*(تم حذف تسجيلك من Normal وإضافتك في إحصائيات Hard بنجاح)*`,
        };
      }

      if (wasUpdateInHard) {
        return {
          accepted: true,
          code: "UPDATED_IN_HARD",
          embedsChanged: true,
          tier: "HARD",
          message:
            `✅ **تم تحديث بياناتك في Ludra Hard بنجاح!**\n` +
            `• **الشخصية:** \`${characterName}\` (${className})\n` +
            `• **Item Level:** \`${numFmt(itemLevel)}\`\n` +
            `• **Combat Power:** \`${numFmt(combatPower)}\``,
        };
      }

      return {
        accepted: true,
        code: "REGISTERED_HARD",
        embedsChanged: true,
        tier: "HARD",
        message:
          `⚔️ **تم تسجيلك بنجاح في Ludra Hard (3000+)!**\n` +
          `• **الشخصية:** \`${characterName}\` (${className})\n` +
          `• **Item Level:** \`${numFmt(itemLevel)}\`\n` +
          `• **Combat Power:** \`${numFmt(combatPower)}\``,
      };
    }

    // ── CASE B: Target is NORMAL (2800+ iLvl) ───────────────────────────────
    // If player is registered in HARD and chooses to register in NORMAL, allow moving down to Normal!
    const wasDowngradeFromHard = Boolean(
      existing && existing.raid_tier === "HARD" && existing.eligibility_status === "ACTIVE" && targetAction === "NORMAL"
    );

    if (itemLevel < NORMAL_MIN_ILVL) {
      // If they were already registered in NORMAL and their iLvl dropped below 2800 on re-verification:
      if (existing && existing.raid_tier === "NORMAL") {
        await client.query(
          `UPDATE ludra_raid_registrations
           SET character_name = $2, class_name = $3, item_level = $4, combat_power = $5,
               member_source = $6, is_guild_member = $7,
               eligibility_status = 'SUSPENDED',
               suspended_reason = $8,
               last_verified_at = $9, updated_at = NOW()
           WHERE discord_id = $1`,
          [
            String(discordId),
            characterName,
            className,
            itemLevel,
            combatPower,
            memberSource,
            isGuildMember,
            `انخفض Item Level إلى ${itemLevel} (أقل من 2800)`,
            verifiedAt,
          ]
        );
        await client.query("COMMIT");
        return {
          accepted: false,
          code: "NORMAL_SUSPENDED_BELOW_2800",
          embedsChanged: true,
          message:
            `⚠️ لم تصل إلى Item Level 2800 المطلوب للتسجيل في Ludra Normal. مستواك الحالي: ${itemLevel}.\n` +
            `تم تعليق أهليتك في الإحصائيات لحين إعادة رفع مستوى العتاد إلى 2800+.`,
        };
      }

      await client.query("COMMIT");
      return {
        accepted: false,
        code: "NORMAL_REJECTED_ILVL",
        embedsChanged: false,
        message: `لم تصل بعد إلى Item Level 2800 المطلوب للتسجيل في Ludra Normal. مستواك الحالي: ${itemLevel}.`,
      };
    }

    // Automatic Carry / يتكرى classification:
    // CP >= 170000 => "كيري"
    // CP < 170000  => "يتكرى"
    const carryClassification = combatPower >= CARRY_MIN_CP ? "كيري" : "يتكرى";
    const wasUpdateInNormal = existing && existing.raid_tier === "NORMAL";

    await client.query(
      `INSERT INTO ludra_raid_registrations (
         discord_id, shugo_character_id, server_id, server_name, region, shugo_url,
         character_name, class_name, item_level, combat_power,
         raid_tier, carry_classification, member_source, is_guild_member,
         eligibility_status, suspended_reason, last_verified_at, registered_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         'NORMAL', $11, $12, $13,
         'ACTIVE', NULL, $14, NOW(), NOW()
       )
       ON CONFLICT (discord_id) DO UPDATE SET
         shugo_character_id = EXCLUDED.shugo_character_id,
         server_id = EXCLUDED.server_id,
         server_name = EXCLUDED.server_name,
         region = EXCLUDED.region,
         shugo_url = EXCLUDED.shugo_url,
         character_name = EXCLUDED.character_name,
         class_name = EXCLUDED.class_name,
         item_level = EXCLUDED.item_level,
         combat_power = EXCLUDED.combat_power,
         raid_tier = 'NORMAL',
         carry_classification = EXCLUDED.carry_classification,
         member_source = EXCLUDED.member_source,
         is_guild_member = EXCLUDED.is_guild_member,
         eligibility_status = 'ACTIVE',
         suspended_reason = NULL,
         last_verified_at = EXCLUDED.last_verified_at,
         updated_at = NOW()`,
      [
        String(discordId),
        shugoCharacterId,
        serverId,
        serverName,
        region,
        shugoUrl,
        characterName,
        className,
        itemLevel,
        combatPower,
        carryClassification,
        memberSource,
        isGuildMember,
        verifiedAt,
      ]
    );

    await client.query("COMMIT");

    let responseCode = "REGISTERED_NORMAL";
    let titleMsg = "تم تسجيلك بنجاح";
    if (wasDowngradeFromHard) {
      responseCode = "MOVED_HARD_TO_NORMAL";
      titleMsg = "تم نقلك بنجاح من Ludra Hard إلى Ludra Normal";
    } else if (wasUpdateInNormal) {
      responseCode = "UPDATED_IN_NORMAL";
      titleMsg = "تم تحديث بياناتك وتصنيفك في Ludra Normal";
    }

    return {
      accepted: true,
      code: responseCode,
      embedsChanged: true,
      tier: "NORMAL",
      classification: carryClassification,
      message:
        `🛡️ **${titleMsg} (2800+)!**\n` +
        `• **الشخصية:** \`${characterName}\` (${className})\n` +
        `• **Item Level:** \`${numFmt(itemLevel)}\`\n` +
        `• **Combat Power:** \`${numFmt(combatPower)}\`\n` +
        `• **التصنيف التلقائي:** **${carryClassification}**`,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── 6. Database-Backed Statistics & Embed Builders ───────────────────────────
export async function getLudraHardStats() {
  await initLudraRaidDB();
  const res = await query(
    `SELECT discord_id, character_name, class_name, item_level, combat_power,
            member_source, is_guild_member, server_name, last_verified_at
     FROM ludra_raid_registrations
     WHERE raid_tier = 'HARD' AND eligibility_status = 'ACTIVE'
     ORDER BY combat_power DESC, item_level DESC, character_name ASC`
  );

  const byClass = {};
  const classCounts = {};
  for (const c of ALL_CLASSES) {
    byClass[c] = [];
    classCounts[c] = 0;
  }

  for (const row of res.rows) {
    const normClass = normalizeClassName(row.class_name);
    if (!byClass[normClass]) byClass[normClass] = [];
    byClass[normClass].push(row);
    classCounts[normClass] = (classCounts[normClass] || 0) + 1;
  }

  return {
    total: res.rows.length,
    players: res.rows,
    byClass,
    classCounts,
  };
}

export async function removeLudraParticipant(discordId) {
  await initLudraRaidDB();
  const delRes = await query(
    `DELETE FROM ludra_raid_registrations WHERE discord_id = $1 RETURNING discord_id, raid_tier, class_name`,
    [String(discordId)]
  );
  if (delRes.rowCount > 0) {
    scheduleLudraEmbedsUpdate();
  }
  return { removed: delRes.rowCount > 0, row: delRes.rows[0] || null };
}

export async function getLudraNormalStats() {
  await initLudraRaidDB();
  const res = await query(
    `SELECT discord_id, character_name, class_name, item_level, combat_power,
            carry_classification, member_source, is_guild_member, server_name, last_verified_at
     FROM ludra_raid_registrations
     WHERE raid_tier = 'NORMAL' AND eligibility_status = 'ACTIVE'
     ORDER BY
       (CASE WHEN carry_classification = 'كيري' THEN 0 ELSE 1 END) ASC,
       combat_power DESC,
       item_level DESC,
       character_name ASC`
  );

  let carryCount = 0;
  let carriedCount = 0;
  const classCounts = {};
  for (const c of ALL_CLASSES) classCounts[c] = 0;

  for (const row of res.rows) {
    if (row.carry_classification === "كيري") carryCount++;
    else carriedCount++;

    const normClass = normalizeClassName(row.class_name);
    classCounts[normClass] = (classCounts[normClass] || 0) + 1;
  }

  return {
    total: res.rows.length,
    carryCount,
    carriedCount,
    classCounts,
    players: res.rows,
  };
}

export async function buildLudraHardEmbedAndComponents(disabled = false) {
  const stats = await getLudraHardStats();

  // 1. Class distribution summary block (identical style to 2800 embed)
  const classDistributionLines = ALL_CLASSES.map((cls) => {
    const emoji = CLASS_EMOJIS[cls] || "🔹";
    const cnt = stats.classCounts[cls] || 0;
    return `${emoji} **${cls}:** \`${cnt}\``;
  });

  // 2. Detailed Character Name + CP roster grouped by class
  const classSections = [];
  let totalCharLength = 0;
  let truncated = false;

  for (const cls of Object.keys(stats.byClass)) {
    const list = stats.byClass[cls];
    if (!list || list.length === 0) continue;
    const emoji = CLASS_EMOJIS[cls] || "🔹";
    const header = `${emoji} **${cls} (${list.length})**`;
    const lines = list.map((p) => `- **${p.character_name}** — CP \`${numFmt(p.combat_power)}\``);
    const block = `${header}\n${lines.join("\n")}`;

    if (stats.total > QUEUE_CONFIG.HARD_EMBED_MAX_INLINE_NAMES || totalCharLength + block.length > 2900) {
      truncated = true;
      break;
    }
    classSections.push({ cls, emoji, count: list.length, lines, block });
    totalCharLength += block.length + 2;
  }

  const baseHeaderDescription =
    `إحصاء وفرز اللاعبين المؤهلين لريد **Ludra Hard**.\n` +
    `🎯 **شرط القبول:** \`Item Level >= 3000\` (تحديث وفحص حي من Shugo.gg)\n\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 **إجمالي المسجلين:** \`${stats.total}\`\n\n` +
    `📊 **توزيع الكلاسات:**\n` +
    `${classDistributionLines.join("\n")}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⚔️ **قائمة المسجلين (الاسم + CP):**\n`;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🔥 LUDRA HARD — 3000+")
    .setFooter({ text: "تحالف M3RGEEN • نظام فرز وإحصاء Ludra Raid" })
    .setTimestamp();

  if (stats.total === 0) {
    embed.setDescription(
      `${baseHeaderDescription}` +
      `*لا يوجد مسجلون مؤهلون حالياً.*\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📊 **الإجمالي:** \`0\` لاعبين`
    );
  } else {
    const inlineRosterText = classSections.map((s) => s.block).join("\n\n");
    const fullDescriptionCandidate =
      `${baseHeaderDescription}\n` +
      `${inlineRosterText}` +
      (truncated
        ? `\n\n*(القائمة كبيرة — لعرض جميع الأسماء بالتفصيل استخدم زر القائمة التفصيلية أدناه)*`
        : "") +
      `\n\n━━━━━━━━━━━━━━━━━━\n` +
      `📊 **الإجمالي:** \`${stats.total}\` ${stats.total === 1 ? "لاعب" : "لاعبين"}`;

    if (fullDescriptionCandidate.length <= 3900) {
      embed.setDescription(fullDescriptionCandidate);
    } else {
      // Fallback to structured Embed Fields when description approaches Discord's 4096-char limit
      embed.setDescription(
        `${baseHeaderDescription}` +
        `*(تظهر القائمة مرتبة حسب الكلاس في الحقول أدناه)*`
      );
      for (const sec of classSections.slice(0, 24)) {
        let fieldVal = sec.lines.join("\n");
        if (fieldVal.length > 1020) {
          fieldVal = fieldVal.slice(0, 980) + "\n*... (استخدم زر القائمة الكاملة)*";
        }
        embed.addFields({
          name: `${sec.emoji} ${sec.cls} (${sec.count})`,
          value: fieldVal || "-",
          inline: false,
        });
      }
      embed.addFields({
        name: "📊 الإجمالي",
        value: `\`${stats.total}\` ${stats.total === 1 ? "لاعب" : "لاعبين"}`,
        inline: false,
      });
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ludra_raid:register:HARD")
      .setLabel("⚔️ تسجيل Hard 3000+")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("ludra_raid:refresh:HARD")
      .setLabel("🔄 تحديث بياناتي")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );

  if (truncated || stats.total > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("ludra_raid:hard_list:0")
        .setLabel("📋 عرض القائمة التفصيلية")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    );
  }

  return { embed, components: [row], stats };
}

export async function buildLudraNormalEmbedAndComponents(disabled = false) {
  const stats = await getLudraNormalStats();

  const classDistributionLines = ALL_CLASSES.map((cls) => {
    const emoji = CLASS_EMOJIS[cls] || "🔹";
    const cnt = stats.classCounts[cls] || 0;
    return `${emoji} **${cls}:** \`${cnt}\``;
  });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🛡️ LUDRA NORMAL — 2800+")
    .setDescription(
      `إحصاء وفرز اللاعبين المؤهلين لريد **Ludra Normal**.\n` +
      `🎯 **شرط القبول:** \`Item Level >= 2800\` (تحديث وفحص حي من Shugo.gg)\n\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `👥 **إجمالي المسجلين:** \`${stats.total}\`\n\n` +
      `⚔️ **الكيري:** \`${stats.carryCount}\`\n` +
      `🛡️ **يتكرى:** \`${stats.carriedCount}\`\n\n` +
      `📊 **توزيع الكلاسات:**\n` +
      `${classDistributionLines.join("\n")}\n\n` +
      `━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({ text: "تحالف M3RGEEN • نظام فرز وإحصاء Ludra Raid" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ludra_raid:register:NORMAL")
      .setLabel("🛡️ تسجيل Normal 2800+")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("ludra_raid:refresh:NORMAL")
      .setLabel("🔄 تحديث بياناتي")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("ludra_raid:normal_list:0")
      .setLabel("📋 عرض قائمة المسجلين")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );

  return { embed, components: [row], stats };
}

// ─── 7. Persistent Embed Config & Debounced Single-Message Updater ────────────
let activeDiscordClient = null;
let embedRefreshTimer = null;
let isRefreshingEmbeds = false;
let pendingEmbedRefreshAfterCurrent = false;

export function setLudraDiscordClient(client) {
  activeDiscordClient = client;
}

/**
 * Ensures the "🎯 مسجل لودرا" Discord role exists in the guild and returns it.
 */
export async function ensureLudraRegisteredRole(guild) {
  if (!guild) return null;
  let role = guild.roles.cache.find((r) => r.name === LUDRA_REGISTERED_ROLE_NAME);
  if (!role) {
    const fetched = await guild.roles.fetch().catch(() => null);
    if (fetched) {
      role = fetched.find((r) => r.name === LUDRA_REGISTERED_ROLE_NAME);
    }
  }
  if (!role) {
    role = await guild.roles.create({
      name: LUDRA_REGISTERED_ROLE_NAME,
      color: 0x9b59b6,
      permissions: [],
      hoist: false,
      mentionable: false,
      reason: "Automated role for Ludra Raid registered members voice room visibility",
    });
    console.log(`[LudraRole] Created dedicated role "${LUDRA_REGISTERED_ROLE_NAME}" (${role.id})`);
  }
  return role;
}

/**
 * Grants the "🎯 مسجل لودرا" role to a newly registered or active member.
 */
export async function grantLudraRegisteredRoleToUser(client, discordId) {
  const targetClient = client || activeDiscordClient;
  if (!targetClient || !discordId) return false;
  try {
    const guild = targetClient.guilds.cache.get(MAIN_GUILD_ID) || (await targetClient.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
    if (!guild) return false;
    const role = await ensureLudraRegisteredRole(guild);
    if (!role) return false;
    const member = guild.members.cache.get(String(discordId)) || (await guild.members.fetch(String(discordId)).catch(() => null));
    if (!member) return false;
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, "Registered in Ludra Raid system");
    }
    return true;
  } catch (err) {
    console.warn(`[LudraRole] Could not grant role to ${discordId}:`, err.message);
    return false;
  }
}

/**
 * Synchronizes "🎯 مسجل لودرا" role across all guild members against active DB registrations.
 */
export async function syncLudraRegisteredRoles(client) {
  const targetClient = client || activeDiscordClient;
  if (!targetClient) return { added: 0, removed: 0 };
  await initLudraRaidDB();

  const guild = targetClient.guilds.cache.get(MAIN_GUILD_ID) || (await targetClient.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return { added: 0, removed: 0 };

  const role = await ensureLudraRegisteredRole(guild);
  if (!role) return { added: 0, removed: 0 };

  const activeRes = await query(
    `SELECT DISTINCT discord_id FROM ludra_raid_registrations WHERE eligibility_status = 'ACTIVE' AND discord_id IS NOT NULL`
  );
  const activeIds = new Set(activeRes.rows.map((r) => String(r.discord_id)));

  const members = await guild.members.fetch().catch(() => guild.members.cache);
  let added = 0;
  let removed = 0;

  for (const [mId, member] of members) {
    if (member.user.bot) continue;
    const shouldHave = activeIds.has(String(mId));
    const hasRole = member.roles.cache.has(role.id);

    if (shouldHave && !hasRole) {
      await member.roles.add(role, "Active Ludra Raid registration sync").catch(() => {});
      added++;
    } else if (!shouldHave && hasRole) {
      await member.roles.remove(role, "Not active in Ludra Raid registrations").catch(() => {});
      removed++;
    }
  }

  console.log(`[LudraRole] Sync complete: +${added} granted, -${removed} revoked.`);
  return { added, removed, roleId: role.id };
}

export async function getLudraPanelConfig() {
  await initLudraRaidDB();
  const res = await query(
    `SELECT * FROM ludra_raid_config WHERE config_key = $1 LIMIT 1`,
    [LUDRA_CONFIG_KEY]
  );
  return res.rows[0] || null;
}

export async function saveLudraPanelConfig({
  guildId,
  channelId,
  hardMessageId,
  normalMessageId,
  announcementMessageId = null,
  isTestChannel = false,
  previousChannelId = null,
  previousHardMessageId = null,
  previousNormalMessageId = null,
}) {
  await initLudraRaidDB();
  await query(
    `INSERT INTO ludra_raid_config (
       config_key, guild_id, channel_id, hard_message_id, normal_message_id, announcement_message_id,
       is_test_channel, previous_channel_id, previous_hard_message_id, previous_normal_message_id, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (config_key) DO UPDATE SET
       guild_id = EXCLUDED.guild_id,
       channel_id = EXCLUDED.channel_id,
       hard_message_id = EXCLUDED.hard_message_id,
       normal_message_id = EXCLUDED.normal_message_id,
       announcement_message_id = COALESCE(EXCLUDED.announcement_message_id, ludra_raid_config.announcement_message_id),
       is_test_channel = EXCLUDED.is_test_channel,
       previous_channel_id = COALESCE(EXCLUDED.previous_channel_id, ludra_raid_config.previous_channel_id),
       previous_hard_message_id = COALESCE(EXCLUDED.previous_hard_message_id, ludra_raid_config.previous_hard_message_id),
       previous_normal_message_id = COALESCE(EXCLUDED.previous_normal_message_id, ludra_raid_config.previous_normal_message_id),
       updated_at = NOW()`,
    [
      LUDRA_CONFIG_KEY,
      guildId,
      channelId,
      hardMessageId,
      normalMessageId,
      announcementMessageId,
      isTestChannel,
      previousChannelId,
      previousHardMessageId,
      previousNormalMessageId,
    ]
  );
}

/**
 * Verify that the target test channel is NOT visible to regular members (@everyone or AION 2 Member).
 */
export function verifyChannelIsPrivateForTesting(channel, guildId = MAIN_GUILD_ID) {
  if (!channel) return { safe: false, reason: "القناة غير موجودة أو يتعذر الوصول إليها." };

  const VIEW_CHANNEL = 1024n;
  const overwrites = channel.permissionOverwrites?.cache;

  // Support both discord.js Channel object and raw API channel JSON
  let everyoneDeny = 0n;
  let everyoneAllow = 0n;
  let aionMemberAllow = 0n;

  if (overwrites) {
    const ev = overwrites.get(guildId);
    if (ev) {
      everyoneDeny = BigInt(ev.deny?.bitfield ?? 0);
      everyoneAllow = BigInt(ev.allow?.bitfield ?? 0);
    }
    const aionRole = overwrites.get("1401376073077231702");
    if (aionRole) {
      aionMemberAllow = BigInt(aionRole.allow?.bitfield ?? 0);
    }
  } else if (Array.isArray(channel.permission_overwrites)) {
    const ev = channel.permission_overwrites.find((o) => String(o.id) === String(guildId));
    if (ev) {
      everyoneDeny = BigInt(ev.deny || 0);
      everyoneAllow = BigInt(ev.allow || 0);
    }
    const aionRole = channel.permission_overwrites.find((o) => String(o.id) === "1401376073077231702");
    if (aionRole) {
      aionMemberAllow = BigInt(aionRole.allow || 0);
    }
  }

  const everyoneDeniedView = (everyoneDeny & VIEW_CHANNEL) !== 0n && (everyoneAllow & VIEW_CHANNEL) === 0n;
  const aionMemberAllowedView = (aionMemberAllow & VIEW_CHANNEL) !== 0n;

  if (!everyoneDeniedView || aionMemberAllowedView) {
    return {
      safe: false,
      reason: "القناة مكشوفة للأعضاء العاديين (@everyone أو AION 2 Member يملكون صلاحية ViewChannel).",
    };
  }

  return { safe: true };
}

/**
 * Schedule a debounced update of the two fixed embeds from fresh database counts.
 */
export function scheduleLudraEmbedsUpdate(client = activeDiscordClient) {
  if (client) activeDiscordClient = client;
  if (embedRefreshTimer) clearTimeout(embedRefreshTimer);
  embedRefreshTimer = setTimeout(() => {
    embedRefreshTimer = null;
    refreshLudraEmbedsNow(activeDiscordClient).catch((err) =>
      console.error("[LudraRaid] Error updating embeds:", err.message)
    );
  }, QUEUE_CONFIG.EMBED_DEBOUNCE_MS);
}

/**
 * Immediately recalculates Hard and Normal stats from DB and edits the 2 fixed messages in-place.
 */
export async function refreshLudraEmbedsNow(client = activeDiscordClient) {
  if (client) activeDiscordClient = client;
  if (!activeDiscordClient) return { updated: false, reason: "NO_CLIENT" };

  if (isRefreshingEmbeds) {
    pendingEmbedRefreshAfterCurrent = true;
    return { updated: false, reason: "ALREADY_REFRESHING" };
  }

  isRefreshingEmbeds = true;
  try {
    const config = await getLudraPanelConfig();
    if (!config || !config.channel_id) return { updated: false, reason: "NOT_CONFIGURED" };

    const channel =
      activeDiscordClient.channels?.cache?.get(config.channel_id) ||
      (await activeDiscordClient.channels?.fetch?.(config.channel_id).catch(() => null));

    if (!channel) {
      console.warn(`[LudraRaid] Configured channel ${config.channel_id} not accessible.`);
      return { updated: false, reason: "CHANNEL_NOT_FOUND" };
    }

    const [hardPayload, normalPayload] = await Promise.all([
      buildLudraHardEmbedAndComponents(false),
      buildLudraNormalEmbedAndComponents(false),
    ]);

    let hardMsgId = config.hard_message_id;
    let normalMsgId = config.normal_message_id;

    if (hardMsgId) {
      const hardMsg = await channel.messages.fetch(hardMsgId).catch(() => null);
      if (hardMsg) {
        await hardMsg.edit({ embeds: [hardPayload.embed], components: hardPayload.components });
      } else {
        console.warn(`[LudraRaid] Hard embed message ${hardMsgId} was deleted. Recreating safely once.`);
        const recreated = await channel.send({ embeds: [hardPayload.embed], components: hardPayload.components });
        hardMsgId = recreated.id;
      }
    }

    if (normalMsgId) {
      const normalMsg = await channel.messages.fetch(normalMsgId).catch(() => null);
      if (normalMsg) {
        await normalMsg.edit({ embeds: [normalPayload.embed], components: normalPayload.components });
      } else {
        console.warn(`[LudraRaid] Normal embed message ${normalMsgId} was deleted. Recreating safely once.`);
        const recreated = await channel.send({ embeds: [normalPayload.embed], components: normalPayload.components });
        normalMsgId = recreated.id;
      }
    }

    if (hardMsgId !== config.hard_message_id || normalMsgId !== config.normal_message_id) {
      await saveLudraPanelConfig({
        guildId: config.guild_id,
        channelId: config.channel_id,
        hardMessageId: hardMsgId,
        normalMessageId: normalMsgId,
        isTestChannel: config.is_test_channel,
      });
    }

    return { updated: true, hardMessageId: hardMsgId, normalMessageId: normalMsgId };
  } finally {
    isRefreshingEmbeds = false;
    if (pendingEmbedRefreshAfterCurrent) {
      pendingEmbedRefreshAfterCurrent = false;
      scheduleLudraEmbedsUpdate(activeDiscordClient);
    }
  }
}

/**
 * Deploy or update the 2 fixed Ludra embeds in the target channel.
 * If migrating from the test channel to the official channel later:
 *   1. Publishes the 2 new fixed embeds in the new channel (keeping all DB registrations intact).
 *   2. Disables the old buttons in the test channel.
 *   3. Deletes ONLY the 2 test embed messages after successful migration.
 */
export async function deployOrMigrateLudraPanels(client, targetChannelId = LUDRA_OFFICIAL_CHANNEL_ID, options = {}) {
  await initLudraRaidDB();
  setLudraDiscordClient(client);

  const channel =
    client.channels?.cache?.get(targetChannelId) ||
    (await client.channels?.fetch?.(targetChannelId).catch(() => null));

  if (!channel) {
    throw new Error(`تعذر العثور على القناة المحددة (${targetChannelId}).`);
  }

  // If deploying to the test channel, enforce privacy check
  const isTest = String(targetChannelId) === String(LUDRA_TEST_CHANNEL_ID);
  if (isTest && !options.skipPrivacyCheck) {
    const privacy = verifyChannelIsPrivateForTesting(channel, MAIN_GUILD_ID);
    if (!privacy.safe) {
      throw new Error(`رفض النشر الأمني: ${privacy.reason}`);
    }
  }

  const existingConfig = await getLudraPanelConfig();
  const [hardPayload, normalPayload] = await Promise.all([
    buildLudraHardEmbedAndComponents(false),
    buildLudraNormalEmbedAndComponents(false),
  ]);

  // Same channel: edit existing messages if present, otherwise send once (never re-send mention!)
  if (existingConfig && String(existingConfig.channel_id) === String(targetChannelId)) {
    let hardMsg = existingConfig.hard_message_id
      ? await channel.messages.fetch(existingConfig.hard_message_id).catch(() => null)
      : null;
    let normalMsg = existingConfig.normal_message_id
      ? await channel.messages.fetch(existingConfig.normal_message_id).catch(() => null)
      : null;

    if (hardMsg) {
      await hardMsg.edit({ embeds: [hardPayload.embed], components: hardPayload.components });
    } else {
      hardMsg = await channel.send({ embeds: [hardPayload.embed], components: hardPayload.components });
    }

    if (normalMsg) {
      await normalMsg.edit({ embeds: [normalPayload.embed], components: normalPayload.components });
    } else {
      normalMsg = await channel.send({ embeds: [normalPayload.embed], components: normalPayload.components });
    }

    await saveLudraPanelConfig({
      guildId: channel.guildId || MAIN_GUILD_ID,
      channelId: targetChannelId,
      hardMessageId: hardMsg.id,
      normalMessageId: normalMsg.id,
      announcementMessageId: existingConfig.announcement_message_id || null,
      isTestChannel: isTest,
    });

    return {
      mode: "DEPLOYED_OR_UPDATED",
      channelId: targetChannelId,
      hardMessageId: hardMsg.id,
      normalMessageId: normalMsg.id,
      announcementMessageId: existingConfig.announcement_message_id || null,
    };
  }

  // Migrating to the official channel (or initial deployment)
  let announcementMessageId = existingConfig?.announcement_message_id || null;
  if (options.sendOpeningMention && !announcementMessageId) {
    const announcementContent =
      `<@&${M3RGEEN_GUILD_ROLE_ID}>\n` +
      `<@&${EMPEROR_GUILD_ROLE_ID}>\n` +
      `📢 **تم فتح التسجيل والفرز الرسمي لـ Ludra Raid (Hard 3000+ & Normal 2800+)!**\n` +
      `يرجى اختيار الفئة المناسبة أدناه للتسجيل أو تحديث بيانات شخصيتك مباشرة عبر Shugo.gg.`;

    const announcementMsg = await channel.send({
      content: announcementContent,
      allowedMentions: {
        parse: [],
        roles: [M3RGEEN_GUILD_ROLE_ID, EMPEROR_GUILD_ROLE_ID],
      },
    });
    announcementMessageId = announcementMsg.id;
  }

  const newHardMsg = await channel.send({ embeds: [hardPayload.embed], components: hardPayload.components });
  const newNormalMsg = await channel.send({ embeds: [normalPayload.embed], components: normalPayload.components });

  // Safety check: verify both messages and their interactive buttons were published before touching old channel
  if (!newHardMsg?.id || !newNormalMsg?.id) {
    throw new Error("فشل التحقق من نشر رسالتي الإمبد في الروم الجديد؛ لن يتم المساس بلوحات الاختبار.");
  }

  const oldChannelId = existingConfig?.channel_id || null;
  const oldHardMsgId = existingConfig?.hard_message_id || null;
  const oldNormalMsgId = existingConfig?.normal_message_id || null;

  await saveLudraPanelConfig({
    guildId: channel.guildId || MAIN_GUILD_ID,
    channelId: targetChannelId,
    hardMessageId: newHardMsg.id,
    normalMessageId: newNormalMsg.id,
    announcementMessageId,
    isTestChannel: isTest,
    previousChannelId: oldChannelId,
    previousHardMessageId: oldHardMsgId,
    previousNormalMessageId: oldNormalMsgId,
  });

  // If there was a previous channel (e.g. test channel migration), disable its buttons then delete ONLY those 2 messages
  let oldMessagesCleaned = 0;
  if (oldChannelId && String(oldChannelId) !== String(targetChannelId)) {
    const oldChannel =
      client.channels?.cache?.get(oldChannelId) ||
      (await client.channels?.fetch?.(oldChannelId).catch(() => null));

    if (oldChannel) {
      const [disabledHard, disabledNormal] = await Promise.all([
        buildLudraHardEmbedAndComponents(true),
        buildLudraNormalEmbedAndComponents(true),
      ]);

      for (const [msgId, payload] of [
        [oldHardMsgId, disabledHard],
        [oldNormalMsgId, disabledNormal],
      ]) {
        if (!msgId) continue;
        const oldMsg = await oldChannel.messages.fetch(msgId).catch(() => null);
        if (oldMsg && (!client.user?.id || oldMsg.author?.id === client.user?.id)) {
          await oldMsg.edit({ embeds: [payload.embed], components: payload.components }).catch(() => {});
          await oldMsg.delete().catch(() => {});
          oldMessagesCleaned++;
        }
      }
    }
  }

  return {
    mode: oldChannelId ? "MIGRATED" : "INITIAL_DEPLOY",
    channelId: targetChannelId,
    hardMessageId: newHardMsg.id,
    normalMessageId: newNormalMsg.id,
    announcementMessageId,
    previousChannelId: oldChannelId,
    oldMessagesCleaned,
  };
}

// ─── 8. Persistent, Rate-Limited Shugo Verification Queue ─────────────────────
const pendingInteractionCallbacks = new Map(); // queueId -> async (result) => void
let activeWorkers = 0;
let lastShugoRequestAt = 0;
let queueSuspendedUntil = 0;
let workerTimer = null;

/**
 * Enqueue a Shugo verification & registration task in PostgreSQL.
 * Deduplicates by both `discord_id` and `shugo_character_id` when a request is already PENDING or PROCESSING.
 */
export async function enqueueLudraVerification({
  discordId,
  shugoUrl,
  shugoCharacterId = null,
  targetAction,
  memberSource,
  isGuildMember,
  onComplete = null,
}) {
  await initLudraRaidDB();

  // Check if user or character already has an active item in queue
  const activeRes = await query(
    `SELECT id, discord_id, target_action, status, created_at
     FROM ludra_sync_queue
     WHERE status IN ('PENDING', 'PROCESSING')
       AND (discord_id = $1 OR ($2::text IS NOT NULL AND shugo_character_id = $2))
     LIMIT 1`,
    [String(discordId), shugoCharacterId]
  );

  if (activeRes.rows.length > 0) {
    const existingTask = activeRes.rows[0];
    if (onComplete && String(existingTask.discord_id) === String(discordId)) {
      pendingInteractionCallbacks.set(String(existingTask.id), onComplete);
    }
    triggerLudraQueueWorker();
    return {
      queued: false,
      alreadyPending: true,
      queueId: existingTask.id,
      status: existingTask.status,
    };
  }

  try {
    const ins = await query(
      `INSERT INTO ludra_sync_queue (
         discord_id, shugo_character_id, shugo_url, target_action,
         member_source, is_guild_member, status, attempts, max_attempts, next_retry_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7, NOW())
       RETURNING id`,
      [
        String(discordId),
        shugoCharacterId,
        shugoUrl,
        targetAction,
        memberSource,
        Boolean(isGuildMember),
        QUEUE_CONFIG.MAX_RETRIES,
      ]
    );

    const queueId = ins.rows[0].id;
    if (onComplete) {
      pendingInteractionCallbacks.set(String(queueId), onComplete);
    }

    // Count position in queue
    const posRes = await query(
      `SELECT COUNT(*)::int AS pos FROM ludra_sync_queue WHERE status = 'PENDING' AND id <= $1`,
      [queueId]
    );

    triggerLudraQueueWorker();

    return {
      queued: true,
      alreadyPending: false,
      queueId,
      position: posRes.rows[0]?.pos || 1,
    };
  } catch (err) {
    // Handle unique index race condition gracefully
    if (err.code === "23505") {
      return { queued: false, alreadyPending: true };
    }
    throw err;
  }
}

export function triggerLudraQueueWorker() {
  if (workerTimer) return;
  workerTimer = setTimeout(() => {
    workerTimer = null;
    pumpLudraQueue().catch((err) => console.error("[LudraQueue] Pump error:", err.message));
  }, 50);
}

async function pumpLudraQueue() {
  if (activeWorkers >= QUEUE_CONFIG.CONCURRENCY) return;

  const now = Date.now();
  if (now < queueSuspendedUntil) {
    const waitMs = Math.min(queueSuspendedUntil - now, 15000);
    if (!workerTimer) {
      workerTimer = setTimeout(() => {
        workerTimer = null;
        pumpLudraQueue().catch(() => {});
      }, waitMs);
    }
    return;
  }

  const timeSinceLast = now - lastShugoRequestAt;
  if (timeSinceLast < QUEUE_CONFIG.MIN_REQUEST_INTERVAL_MS) {
    const waitMs = QUEUE_CONFIG.MIN_REQUEST_INTERVAL_MS - timeSinceLast;
    if (!workerTimer) {
      workerTimer = setTimeout(() => {
        workerTimer = null;
        pumpLudraQueue().catch(() => {});
      }, waitMs);
    }
    return;
  }

  // Claim next ready PENDING task atomically using FOR UPDATE SKIP LOCKED
  const claimRes = await query(
    `UPDATE ludra_sync_queue
     SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW()
     WHERE id = (
       SELECT id FROM ludra_sync_queue
       WHERE status = 'PENDING' AND next_retry_at <= NOW()
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`
  );

  if (claimRes.rows.length === 0) {
    // Check if there are delayed retry tasks in the future
    const futureRes = await query(
      `SELECT EXTRACT(EPOCH FROM (MIN(next_retry_at) - NOW())) * 1000 AS wait_ms
       FROM ludra_sync_queue
       WHERE status = 'PENDING'`
    );
    const futureWait = Number(futureRes.rows[0]?.wait_ms || 0);
    if (futureWait > 0 && !workerTimer) {
      workerTimer = setTimeout(() => {
        workerTimer = null;
        pumpLudraQueue().catch(() => {});
      }, Math.min(Math.max(futureWait, 500), 15000));
    }
    return;
  }

  const task = claimRes.rows[0];
  activeWorkers++;
  lastShugoRequestAt = Date.now();

  // If concurrency allows more workers after spacing, schedule next pump
  if (activeWorkers < QUEUE_CONFIG.CONCURRENCY) {
    triggerLudraQueueWorker();
  }

  try {
    await executeQueueTask(task);
  } catch (err) {
    console.error(`[LudraQueue] Unhandled error in task ${task.id}:`, err);
  } finally {
    activeWorkers--;
    triggerLudraQueueWorker();
  }
}

async function executeQueueTask(task) {
  const queueIdStr = String(task.id);
  const refreshResult = await forceRefreshAndFetchShugoProfile(task.shugo_url);

  if (!refreshResult.success) {
    if (refreshResult.status === 429 && refreshResult.retryAfterMs) {
      queueSuspendedUntil = Math.max(queueSuspendedUntil, Date.now() + refreshResult.retryAfterMs);
    }

    const canRetry = Boolean(refreshResult.retryable && task.attempts < task.max_attempts);
    if (canRetry) {
      const backoffMs = refreshResult.retryAfterMs || task.attempts * 4000;
      await query(
        `UPDATE ludra_sync_queue
         SET status = 'PENDING',
             error_message = $2,
             next_retry_at = NOW() + ($3 || ' milliseconds')::interval,
             updated_at = NOW()
         WHERE id = $1`,
        [task.id, refreshResult.error, String(backoffMs)]
      );
      return;
    }

    // Final failure — NEVER fall back to stale DB values!
    const failMessage =
      `❌ **تعذر إتمام تحديث وفحص بروفايل Shugo.gg:**\n${refreshResult.error}\n` +
      `*(لم يتم اعتماد أي بيانات قديمة؛ يرجى المحاولة مجدداً بعد التأكد من الرابط).*`;

    await query(
      `UPDATE ludra_sync_queue
       SET status = 'FAILED', error_message = $2, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [task.id, refreshResult.error]
    );

    const cb = pendingInteractionCallbacks.get(queueIdStr);
    if (cb) {
      pendingInteractionCallbacks.delete(queueIdStr);
      await Promise.resolve(cb({ success: false, message: failMessage })).catch(() => {});
    }
    return;
  }

  // Fresh data verified from Shugo! Record character ID on queue row and apply atomic registration
  const freshData = refreshResult.data;
  const txResult = await applyLudraRegistrationTransaction({
    discordId: task.discord_id,
    targetAction: task.target_action,
    memberSource: task.member_source,
    isGuildMember: task.is_guild_member,
    freshData,
  });

  await query(
    `UPDATE ludra_sync_queue
     SET status = 'COMPLETED',
         shugo_character_id = $2,
         result_summary = $3,
         error_message = NULL,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [task.id, freshData.shugoCharacterId, txResult.code]
  );

  if (txResult.accepted) {
    grantLudraRegisteredRoleToUser(activeDiscordClient, task.discord_id).catch(() => {});
  }

  if (txResult.embedsChanged) {
    scheduleLudraEmbedsUpdate();
  }

  const cb = pendingInteractionCallbacks.get(queueIdStr);
  if (cb) {
    pendingInteractionCallbacks.delete(queueIdStr);
    await Promise.resolve(cb({ success: txResult.accepted, ...txResult })).catch(() => {});
  }
}

/**
 * On bot startup:
 *   1. Reset any interrupted 'PROCESSING' tasks back to 'PENDING' so they resume without loss or duplication.
 *   2. Start the queue worker.
 *   3. Sync the two fixed embeds in the configured channel.
 */
export async function resumeLudraRaidSystemOnStartup(client) {
  await initLudraRaidDB();
  setLudraDiscordClient(client);

  const resetRes = await query(
    `UPDATE ludra_sync_queue
     SET status = 'PENDING', next_retry_at = NOW(), updated_at = NOW()
     WHERE status = 'PROCESSING'
     RETURNING id`
  );
  if (resetRes.rowCount > 0) {
    console.log(`[LudraRaid] Resumed ${resetRes.rowCount} interrupted queue task(s) on startup.`);
  }

  triggerLudraQueueWorker();
  await refreshLudraEmbedsNow(client).catch((err) =>
    console.warn("[LudraRaid] Startup embed sync warning:", err.message)
  );
  syncLudraRegisteredRoles(client).catch((err) =>
    console.warn("[LudraRole] Startup role sync warning:", err.message)
  );
}

// ─── 9. Discord Interaction Handlers (Buttons, Modals, Pagination) ────────────
function buildShugoUrlModal(targetAction, isGuildFallback = false) {
  const modal = new ModalBuilder()
    .setCustomId(`ludra_raid:modal:${targetAction}`)
    .setTitle(
      isGuildFallback
        ? "إدخال رابط Shugo.gg لفحص Ludra"
        : `تسجيل Ludra ${targetAction === "HARD" ? "Hard 3000+" : "Normal 2800+"}`
    );

  const urlInput = new TextInputBuilder()
    .setCustomId("shugo_url_input")
    .setLabel("رابط بروفايل شخصيتك في Shugo.gg")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://shugo.gg/character/global/eu-ludra/CharacterName")
    .setRequired(true)
    .setMinLength(20)
    .setMaxLength(300);

  modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
  return modal;
}

export async function handleLudraInteraction(interaction) {
  await initLudraRaidDB();
  if (interaction.client) setLudraDiscordClient(interaction.client);

  const customId = interaction.customId || "";
  const parts = customId.split(":");
  const action = parts[1];
  const param = parts[2];

  // Must be a member of the M3RGEEN Discord server
  if (interaction.guildId !== MAIN_GUILD_ID) {
    return interaction.reply({
      content: "❌ هذا النظام مخصص لأعضاء سيرفر ديسكورد M3RGEEN فقط.",
      ephemeral: true,
    });
  }

  const activeConfig = await getLudraPanelConfig();
  if (
    activeConfig?.channel_id &&
    interaction.channelId &&
    String(interaction.channelId) !== String(activeConfig.channel_id)
  ) {
    return interaction.reply({
      content: `ℹ️ تم نقل لوحة تسجيل Ludra Raid رسمياً إلى <#${activeConfig.channel_id}>.`,
      ephemeral: true,
    });
  }

  // Ensure member object with roles is loaded
  let member = interaction.member;
  if (!member?.roles?.cache && interaction.guild) {
    member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
  }

  const roleStatus = detectMemberGuildRoleStatus(member);

  // Check Ludra blacklist before allowing registration, refresh, or modal submit
  if (action === "register" || action === "refresh" || action === "modal") {
    const blRes = await query(
      `SELECT reason FROM ludra_blacklist WHERE discord_id = $1 LIMIT 1`,
      [String(interaction.user.id)]
    );
    if (blRes.rows.length > 0) {
      return interaction.reply({
        content: `⛔ **عذراً، تم استبعادك ومنعك بشكل نهائي من التسجيل في منظومة لودرا بالسيرفر.**\n• **السبب:** ${blRes.rows[0].reason || "مخالفة أنظمة القيلد ومنظومة لودرا."}`,
        ephemeral: true,
      });
    }
  }

  // ── 1. Register / Refresh Button Clicked ──────────────────────────────────
  if (action === "register" || action === "refresh") {
    const targetAction = action === "refresh" ? "REFRESH" : param === "HARD" ? "HARD" : "NORMAL";

    // Look up existing Shugo URL
    const existingProfile = await resolveExistingPlayerShugoUrl(
      interaction.user.id,
      roleStatus.isGuildMember
    );

    // If user is a non-guild member without a saved URL, OR a guild member whose stored URL is missing/invalid:
    // Open the Modal immediately (before deferring!)
    if (!existingProfile || !existingProfile.shugoUrl) {
      if (action === "refresh") {
        // Check if they even have a registration to refresh
        const modal = buildShugoUrlModal(param === "HARD" ? "HARD" : "NORMAL", roleStatus.isGuildMember);
        return interaction.showModal(modal);
      }
      const modal = buildShugoUrlModal(targetAction, roleStatus.isGuildMember);
      return interaction.showModal(modal);
    }

    // Acknowledge immediately within Discord's 3s window
    await interaction.deferReply({ ephemeral: true });

    const qRes = await enqueueLudraVerification({
      discordId: interaction.user.id,
      shugoUrl: existingProfile.shugoUrl,
      shugoCharacterId: existingProfile.shugoCharacterId,
      targetAction,
      memberSource: roleStatus.memberSource,
      isGuildMember: roleStatus.isGuildMember,
      onComplete: async (result) => {
        await interaction.editReply({ content: result.message, components: [] }).catch(() => {});
      },
    });

    if (qRes.alreadyPending) {
      return interaction.editReply({
        content: "⏳ **لديك طلب فحص قيد المعالجة بالفعل في الطابور.**\nيرجى الانتظار لحين اكتمال تحديث وفحص بروفايلك من Shugo.gg؛ ستظهر النتيجة هنا تلقائياً.",
      });
    }

    return interaction.editReply({
      content:
        `⏳ **تم استلام طلبك وإضافته إلى طابور الفحص (الموقع في الطابور: #${qRes.position || 1}).**\n` +
        `جارٍ طلب تحديث فعلي لبروفايلك في **Shugo.gg** والتحقق من **Item Level** و**CP** الحالية...`,
    });
  }

  // ── 2. Modal Submitted (External Member or Missing Guild URL Fallback) ────
  if (action === "modal" && interaction.isModalSubmit()) {
    const targetAction = param === "HARD" ? "HARD" : "NORMAL";
    const rawUrl = interaction.fields.getTextInputValue("shugo_url_input");

    const validation = validateAndSanitizeShugoUrl(rawUrl);
    if (!validation.valid) {
      return interaction.reply({
        content: `❌ **رابط غير صالح:**\n${validation.error}`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // If a guild member had a missing/invalid link in the legacy table, store their link ONLY in ludra_external_profiles
    // so we NEVER touch aion2_global_applications or recruits!
    const qRes = await enqueueLudraVerification({
      discordId: interaction.user.id,
      shugoUrl: validation.url,
      shugoCharacterId: null,
      targetAction,
      memberSource: roleStatus.memberSource,
      isGuildMember: roleStatus.isGuildMember,
      onComplete: async (result) => {
        await interaction.editReply({ content: result.message, components: [] }).catch(() => {});
      },
    });

    if (qRes.alreadyPending) {
      return interaction.editReply({
        content: "⏳ **لديك طلب فحص قيد المعالجة بالفعل في الطابور.**\nسيتم تحديث هذه الرسالة فور انتهاء الفحص.",
      });
    }

    return interaction.editReply({
      content:
        `⏳ **تم استلام طلبك وإضافته إلى طابور الفحص (الموقع في الطابور: #${qRes.position || 1}).**\n` +
        `جارٍ التحقق من الرابط وطلب تحديث بيانات شخصيتك من **Shugo.gg**...`,
    });
  }

  // ── 3. Detailed Paginated List for Normal (Restricted to Authorized Admins/Leaders)
  if (action === "normal_list") {
    if (!isAuthorizedListViewer(member)) {
      return interaction.reply({
        content: "❌ عذراً، عرض القائمة التفصيلية للمسجلين مخصص لقائد السيرفر والمسؤولين الإداريين المخوّلين فقط.",
        ephemeral: true,
      });
    }

    const page = Math.max(0, parseInt(param || "0", 10) || 0);
    const payload = await buildPaginatedNormalListReply(page);
    if (interaction.isButton() && interaction.message?.flags?.has?.(64)) {
      return interaction.update(payload);
    }
    return interaction.reply({ ...payload, ephemeral: true });
  }

  // ── 4. Detailed Paginated List for Hard ───────────────────────────────────
  if (action === "hard_list") {
    const page = Math.max(0, parseInt(param || "0", 10) || 0);
    const payload = await buildPaginatedHardListReply(page, isAuthorizedListViewer(member));
    if (interaction.isButton() && interaction.message?.flags?.has?.(64)) {
      return interaction.update(payload);
    }
    return interaction.reply({ ...payload, ephemeral: true });
  }
}

function formatSourceLabel(memberSource) {
  switch (memberSource) {
    case "M3RGEEN_GUILD":
      return "جيلد M3RGEEN";
    case "EMPEROR_GUILD":
      return "جيلد EMPEROR";
    case "BOTH_GUILDS":
      return "جيلد M3RGEEN + EMPEROR";
    default:
      return "مشارك خارجي";
  }
}

export async function buildPaginatedNormalListReply(page = 0) {
  const stats = await getLudraNormalStats();
  const total = stats.players.length;
  const pageSize = QUEUE_CONFIG.PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const slice = stats.players.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const lines =
    slice.length === 0
      ? ["*لا يوجد مسجلون حالياً في Ludra Normal.*"]
      : slice.map((p, idx) => {
          const num = safePage * pageSize + idx + 1;
          const emoji = CLASS_EMOJIS[normalizeClassName(p.class_name)] || "🔹";
          const srcLabel = formatSourceLabel(p.member_source);
          return (
            `**${num}. ${p.character_name}** (${emoji} ${normalizeClassName(p.class_name)})\n` +
            `   • iLvl: \`${numFmt(p.item_level)}\` | CP: \`${numFmt(p.combat_power)}\` | التصنيف: **${p.carry_classification}**\n` +
            `   • العضوية: \`${srcLabel}\` | Discord: <@${p.discord_id}> (\`${p.discord_id}\`)`
          );
        });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`📋 قائمة مسجلي Ludra Normal التفصيلية (${total})`)
    .setDescription(
      `⚔️ **الكيري:** \`${stats.carryCount}\`  •  🛡️ **يتكرى:** \`${stats.carriedCount}\`\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      lines.join("\n\n")
    )
    .setFooter({ text: `صفحة ${safePage + 1} من ${totalPages} • خاص بالإدارة والقيادة` })
    .setTimestamp();

  const components = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ludra_raid:normal_list:${safePage - 1}`)
          .setLabel("◀ السابق")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(`ludra_raid:normal_list:${safePage + 1}`)
          .setLabel("التالي ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1)
      )
    );
  }

  return { embeds: [embed], components };
}

export async function buildPaginatedHardListReply(page = 0, includeDiscordIds = false) {
  const stats = await getLudraHardStats();
  const total = stats.players.length;
  const pageSize = QUEUE_CONFIG.PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const slice = stats.players.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const lines =
    slice.length === 0
      ? ["*لا يوجد مسجلون حالياً في Ludra Hard.*"]
      : slice.map((p, idx) => {
          const num = safePage * pageSize + idx + 1;
          const emoji = CLASS_EMOJIS[normalizeClassName(p.class_name)] || "🔹";
          const extra = includeDiscordIds
            ? ` | \`${formatSourceLabel(p.member_source)}\` | <@${p.discord_id}> (\`${p.discord_id}\`)`
            : "";
          return `**${num}. ${p.character_name}** — ${emoji} ${normalizeClassName(p.class_name)} — iLvl \`${numFmt(p.item_level)}\` — CP \`${numFmt(p.combat_power)}\`${extra}`;
        });

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`🔥 قائمة المؤهلين في Ludra Hard (${total})`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `صفحة ${safePage + 1} من ${totalPages}` })
    .setTimestamp();

  const components = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ludra_raid:hard_list:${safePage - 1}`)
          .setLabel("◀ السابق")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(`ludra_raid:hard_list:${safePage + 1}`)
          .setLabel("التالي ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1)
      )
    );
  }

  return { embeds: [embed], components };
}
