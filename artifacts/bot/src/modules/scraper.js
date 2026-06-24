/**
 * AION 2 character scraper — field names reverse-engineered from shugo.gg bundle.
 *
 * Data strategy (3 calls total):
 *   1. GET /api/character/info      → basic profile + baseStat + title.titleList
 *   2. GET /api/character/equipment → equipmentList (itemId, enchantLevel, exceedLevel, slotPos/slotName)
 *   3. POST shugo.gg/api/items/batch-equipment → item names + grades
 *
 * Confirmed field names (from shugo.gg main-B7u5BrMq.js, Fpe stat config):
 *   baseStat.str   → Might
 *   baseStat.dex   → Dexterity
 *   baseStat.agi   → Precision  (NOT "pre" or "acc")
 *   baseStat.wis   → Willpower  (NOT "wil")
 *   baseStat.int   → Intelligence
 *   baseStat.con   → Constitution
 *
 * Slot name → display name mapping from shugo.gg PB() function (exact).
 */

// ─── HTTP Headers ─────────────────────────────────────────────────────────────
// Mimic a real Chrome 131 browser session to avoid 403/rate-limit blocks.
const PROXY_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:               "application/json, text/plain, */*",
  "Accept-Language":    "en-US,en;q=0.9,ar;q=0.8",
  "Accept-Encoding":    "gzip, deflate, br, zstd",
  "Cache-Control":      "no-cache",
  Pragma:               "no-cache",
  DNT:                  "1",
  Referer:              "https://shugo.gg/",
  Origin:               "https://shugo.gg",
  "Sec-Ch-Ua":          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile":   "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest":     "empty",
  "Sec-Fetch-Mode":     "cors",
  "Sec-Fetch-Site":     "same-origin",
};

// ─── Region config ────────────────────────────────────────────────────────────
const REGION_CONFIG = {
  TW: {
    apiBase:  "https://tw.ncsoft.com/aion2",
    lang:     "en",
    searchPath: "/api/search/aion2tw/search/v2/character",
    profileImageBase: "https://tw.ncsoft.com",
  },
  KR: {
    apiBase:  "https://aion2.plaync.com",
    lang:     "ko-kr",
    searchPath: "/ko-kr/api/search/aion2/search/v2/character",
    profileImageBase: "https://aion2.plaync.com",
  },
};

// ─── Class / Race maps ────────────────────────────────────────────────────────
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
const RACE_MAP = { 1: "Elyos", 2: "Asmodian" };

// ─── Class icon CDN ────────────────────────────────────────────────────────────
const CLASS_CDN_OVERRIDE = { Spiritmaster: "elementalist" };
const CDN_ICON_BASE =
  "https://assets.playnccdn.com/static-aion2/characters/img/class/class_icon_";

export function classIconUrl(className) {
  const name = CLASS_CDN_OVERRIDE[className] ?? (className ?? "unknown").toLowerCase();
  return `${CDN_ICON_BASE}${name}.png`;
}

// ─── Confirmed stat keys (from shugo.gg Fpe config array) ─────────────────────
// apiKey is what appears in the JSON; key/label is the display name.
const BASE_STAT_MAP = [
  { apiKey: "str", label: "Might"        },
  { apiKey: "dex", label: "Dexterity"    },
  { apiKey: "agi", label: "Precision"    }, // agi = Precision
  { apiKey: "wis", label: "Willpower"    }, // wis = Willpower
  { apiKey: "int", label: "Intelligence" },
  { apiKey: "con", label: "Constitution" },
];

// ─── Slot name → display ──────────────────────────────────────────────────────
// Covers both the old shugo.gg PB() names AND the live slotPosName values
// confirmed from the equipment API response (Torso, Helmet, Cape, Boots…).
const SLOT_DISPLAY = {
  // Weapons
  MainHand: "Main Hand",   SubHand: "Off-hand",    SubHand1: "Off-hand",  SubHand2: "Off-hand",
  // Earrings
  EarringR: "Earring",     EarringL: "Earring",    Earring: "Earring",    Earring1: "Earring",   Earring2: "Earring",
  // Rings
  RingR:    "Ring",        RingL:    "Ring",        Ring1: "Ring",         Ring2: "Ring",         Ring: "Ring",
  // Armor — old names
  Shoulder: "Shoulders",   Shoulderwear: "Shoulders",
  Gloves:   "Gloves",      GloveSkin: "Gloves",
  Shoes:    "Boots",       ShoeSkin:  "Boots",
  Head:     "Head",        Headwear: "Head",        HeadSkin: "Head",
  Body:     "Chest",       Costume: "Chest",        BodySkin: "Chest",
  Pants:    "Legs",
  Back:     "Back",        BackSkin: "Back",
  // Armor — live slotPosName values confirmed from API
  Torso:    "Chest",       Helmet: "Head",          Cape: "Back",
  Boots:    "Boots",
  // Accessories
  Waist:    "Belt",        Belt: "Belt",
  Neck:     "Necklace",    Necklace: "Necklace",
  Bracelet: "Bracelet",    Bracelet1: "Bracelet",   Bracelet2: "Bracelet",
  Brooch:   "Brooch",      Orb: "Orb",
  // Other
  Wing:     "Wings",       Wings: "Wings",
  Spellbook: "Spellbook",  WeaponSkin: "Weapon Skin",
  Arcana:   "Arcana",      Rune: "Rune",
};

// Slot name → gear category
const WEAPON_SLOTS    = new Set(["MainHand", "SubHand", "SubHand1", "SubHand2"]);
const ARMOR_SLOTS     = new Set([
  // old names
  "Head", "Headwear", "Body", "Costume", "Pants", "Shoulder", "Shoulderwear",
  "Gloves", "Shoes", "Back",
  // live slotPosName values from API
  "Torso", "Helmet", "Cape", "Boots",
]);
const ACCESSORY_SLOTS = new Set([
  "EarringR", "EarringL", "Earring", "Earring1", "Earring2",
  "RingR", "RingL", "Ring", "Ring1", "Ring2",
  "Waist", "Belt", "Neck", "Necklace",
  "Bracelet", "Bracelet1", "Bracelet2", "Brooch", "Orb",
]);
const ARCANA_SLOTS    = new Set(["Arcana"]);
const RUNE_SLOTS      = new Set(["Rune"]);

function classifySlot(slotName) {
  if (!slotName) return "other";
  // Also check partial match for arcana/rune (may appear as "Arcana1", "Arcana Slot 1", etc.)
  const s = String(slotName);
  if (/arcana/i.test(s)) return "arcana";
  if (/rune/i.test(s))   return "rune";
  if (WEAPON_SLOTS.has(s))    return "weapon";
  if (ARMOR_SLOTS.has(s))     return "armor";
  if (ACCESSORY_SLOTS.has(s)) return "accessory";
  return "other";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS   = 3;
const RETRY_DELAY_MS = 1500;
const sleep          = (ms) => new Promise((r) => setTimeout(r, ms));

export function stripHtml(str) {
  return String(str ?? "").replace(/<[^>]*>/g, "").trim();
}

/**
 * Recursively search entire JSON tree for the FIRST value under `key`.
 * Matches Python _find_key().
 */
function findKey(data, key) {
  if (data === null || data === undefined) return null;
  if (typeof data === "object" && !Array.isArray(data)) {
    if (key in data && data[key] !== null && data[key] !== "") return data[key];
    for (const v of Object.values(data)) {
      const found = findKey(v, key);
      if (found !== null && found !== "") return found;
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const found = findKey(item, key);
      if (found !== null && found !== "") return found;
    }
  }
  return null;
}

/** Try each candidate key in order. */
function extractField(data, ...keys) {
  for (const k of keys) {
    const v = findKey(data, k);
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function asArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") return Object.values(val);
  return [];
}

// ─── URL parser ───────────────────────────────────────────────────────────────
function parseShugUrl(inputUrl) {
  const trimmed = inputUrl.trim();
  let url;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  
  // 1. Shugo.gg Format
  if (url.hostname.includes("shugo.gg")) {
    const id     = url.searchParams.get("id");
    const server = url.searchParams.get("server");
    const region = url.searchParams.get("region");
    const name   = url.searchParams.get("name");
    if (!id || !server) return null;
    return {
      id:     decodeURIComponent(id),
      server: server.trim(),
      region: (region ?? "TW").trim().toUpperCase(),
      name:   stripHtml(name ?? ""),
    };
  }

  // 2. Official NCSoft Format: /characters/{serverId}/{characterId}
  const ncMatch = url.pathname.match(/\/characters\/(\d+)\/([^/]+)/);
  if (ncMatch) {
    let region = "TW";
    if (url.hostname.includes("plaync.com")) {
      region = "KR";
    }
    return {
      id:     decodeURIComponent(ncMatch[2]),
      server: ncMatch[1].trim(),
      region: region,
      name:   "", // Name will be fetched from API
    };
  }

  return null;
}

// ─── Proxy URL builder ────────────────────────────────────────────────────────
function buildProxyUrl(cfg, path, params) {
  const encodedId  = encodeURIComponent(params.characterId);
  const innerUrl   = `${cfg.apiBase}${path}?lang=${cfg.lang}&characterId=${encodedId}&serverId=${params.serverId}`;
  return `https://shugo.gg/api/proxy?url=${encodeURIComponent(innerUrl)}`;
}

// ─── API Call 1: character/info ───────────────────────────────────────────────
async function fetchCharacterInfo(characterId, serverId, region) {
  const cfg    = REGION_CONFIG[region] ?? REGION_CONFIG.TW;
  const proxyUrl = buildProxyUrl(cfg, "/api/character/info", { characterId, serverId });
  console.log(`[Scraper] character/info → ${proxyUrl}`);

  const res  = await fetch(proxyUrl, { headers: PROXY_HEADERS, signal: AbortSignal.timeout(15_000) });
  const json = await res.json();

  if (json?.error) throw new Error(`Shugo proxy error (info): ${json.error} | ID: ${characterId} | Srv: ${serverId}`);
  if (!json?.profile) throw new Error(`Invalid response from Shugo proxy (info) | ID: ${characterId}`);

  const raw = json;
  // Dump first 4000 chars for diagnostics — remove once field names confirmed
  console.log(`[Scraper] info top-level keys: [${Object.keys(raw).join(", ")}]`);
  console.log(`[Scraper] info payload (4000c): ${JSON.stringify(raw).substring(0, 4000)}`);
  return raw;
}

// ─── API Call 2: character/equipment ─────────────────────────────────────────
async function fetchCharacterEquipment(characterId, serverId, region) {
  const cfg      = REGION_CONFIG[region] ?? REGION_CONFIG.TW;
  const proxyUrl = buildProxyUrl(cfg, "/api/character/equipment", { characterId, serverId });
  console.log(`[Scraper] character/equipment → ${proxyUrl}`);

  const res  = await fetch(proxyUrl, { headers: PROXY_HEADERS, signal: AbortSignal.timeout(15_000) });
  const json = await res.json();

  if (json?.error) throw new Error(`Shugo proxy error (equipment): ${json.error}`);
  if (!res.ok)     throw new Error(`character/equipment HTTP ${res.status}`);

  // Dump for diagnostics
  console.log(`[Scraper] equipment top-level keys: [${Object.keys(json).join(", ")}]`);
  console.log(`[Scraper] equipment payload (4000c): ${JSON.stringify(json).substring(0, 4000)}`);
  return json;
}

// ─── API Call 3: batch item names from shugo.gg ───────────────────────────────
async function fetchItemNames(items, characterId, serverId, region) {
  if (!items || items.length === 0) return [];

  const body = JSON.stringify({
    items:       items.map((i) => ({ itemId: i.itemId, enchantLevel: i.totalEnchant, slotPos: i.slotPos })),
    characterId,
    serverId,
    region,
  });

  const res = await fetch("https://shugo.gg/api/items/batch-equipment", {
    method:  "POST",
    headers: { ...PROXY_HEADERS, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) throw new Error(`batch-equipment HTTP ${res.status}`);
  const json = await res.json();
  console.log(`[Scraper] batch-equipment response (2000c): ${JSON.stringify(json).substring(0, 2000)}`);
  return Array.isArray(json?.items) ? json.items : [];
}


// ─── Stats extraction (confirmed field names) ─────────────────────────────────
function extractBaseStats(raw) {
  // baseStat is confirmed top-level on profile (from shugo.gg bundle)
  const container = raw?.baseStat ?? findKey(raw, "baseStat") ?? raw;
  const result = {};
  let hasAny = false;

  for (const { apiKey, label } of BASE_STAT_MAP) {
    // Try short apiKey first, then long-form label name as fallback
    const val = container?.[apiKey] ?? container?.[label.toLowerCase()] ?? findKey(raw, apiKey);
    const num = val !== null && val !== undefined ? (parseInt(val, 10) || null) : null;
    result[apiKey] = { label, value: num };
    if (num !== null) hasAny = true;
  }

  return hasAny ? result : null;
}

// ─── Title extraction (confirmed field names) ─────────────────────────────────
function extractTitles(raw) {
  // profile.title.titleList — confirmed from shugo.gg bundle
  const titleContainer = raw?.title ?? findKey(raw, "title");
  const titleList      = asArray(titleContainer?.titleList ?? findKey(raw, "titleList"));

  let activeName     = null;
  let ownedCount     = titleList.length || null;

  // Active title: look for isWear/isEquipped flag; fall back to first item
  const activeTitle =
    titleList.find((t) => t?.isWear || t?.isEquipped || t?.isActive || t?.equipped) ??
    (titleList.length > 0 ? titleList[0] : null);

  if (activeTitle) {
    activeName = stripHtml(String(
      activeTitle?.titleName ??
      activeTitle?.name ??
      activeTitle?.title ??
      ""
    )) || null;
  }

  // titleName on the profile itself (shown in header on shugo.gg)
  const profileTitleName = stripHtml(String(
    raw?.titleName ?? findKey(raw, "titleName") ?? ""
  )) || null;

  return {
    active:     profileTitleName ?? activeName,
    ownedCount: raw?.title?.ownedCount ?? ownedCount,
    totalCount: raw?.title?.totalCount ?? null,
  };
}

// ─── Advanced Data Extraction (Rankings, Item Level, Equipped Titles) ───────
function extractRankings(raw) {
  const rankingList = raw?.ranking?.rankingList ?? [];
  const results = [];
  for (const r of rankingList) {
    if (r.rank) {
      results.push({
        name: r.rankingContentsName ?? "Unknown",
        rank: r.rank,
        point: r.point ?? null,
      });
    }
  }
  return results;
}

function extractEquippedTitles(raw) {
  // title.titleList contains the currently equipped titles for Attack, Defense, Etc
  const titleList = raw?.title?.titleList ?? [];
  const equipped = [];
  for (const t of titleList) {
    if (t.name) {
      equipped.push({
        category: t.equipCategory ?? "Title",
        name: t.name
      });
    }
  }
  return equipped;
}

function extractItemLevel(raw) {
  const statList = raw?.stat?.statList ?? [];
  const itemLevelStat = statList.find(s => s.type === "ItemLevel" || s.name === "아이템레벨" || s.name === "Item Level");
  return itemLevelStat ? itemLevelStat.value : null;
}

// ─── Equipment parsing ─────────────────────────────────────────────────────────
function parseEquipmentResponse(equipJson, itemNames) {
  const gear = { weapons: [], armor: [], accessories: [], arcana: [], runes: [] };

  // Equipment list at equipJson.equipment.equipmentList (confirmed)
  const raw = equipJson?.equipment ?? equipJson;
  const equipList = asArray(raw?.equipmentList ?? findKey(equipJson, "equipmentList"));

  console.log(`[Scraper] equipmentList length: ${equipList.length}`);

  for (let i = 0; i < equipList.length; i++) {
    const item = equipList[i];
    if (!item) continue;

    const itemId      = parseInt(item.itemId ?? item.id ?? 0, 10) || 0;
    if (!itemId) continue;

    const enchant     = parseInt(item.enchantLevel ?? 0, 10) || 0;
    const exceed      = parseInt(item.exceedLevel  ?? 0, 10) || 0;
    const totalEnchant = enchant + exceed;

    // Live API uses slotPosName (e.g. "Torso", "Helmet", "Cape").
    // Fall back to older field names for compatibility.
    const slotName    = stripHtml(String(
      item.slotPosName ?? item.slotName ?? item.slot ?? item.type ?? ""
    ));
    const displaySlot = SLOT_DISPLAY[slotName] ?? slotName;
    const category    = classifySlot(slotName);

    // Name: prefer batch-equipment response, fall back to direct equipment fields
    const namedItem   = itemNames[i] ?? {};
    const name        = stripHtml(String(
      namedItem.itemName ?? namedItem.name ?? namedItem.title ??
      item.itemName      ?? item.name      ?? `Item ${itemId}`
    ));
    const grade = stripHtml(String(namedItem.grade ?? item.grade ?? ""));

    const parsed = { name, enchant: totalEnchant, slot: displaySlot, grade, itemId };

    switch (category) {
      case "weapon":    gear.weapons.push(parsed);     break;
      case "armor":     gear.armor.push(parsed);       break;
      case "accessory": gear.accessories.push(parsed); break;
      case "arcana":    gear.arcana.push(parsed);      break;
      case "rune":      gear.runes.push(parsed);       break;
      default:
        console.log(`[Scraper] unclassified slot "${slotName}" for item ${name}`);
    }
  }

  return gear;
}

// ─── Fallback: public search API (routed through shugo.gg proxy) ─────────────
async function fetchViaSearch(characterId, serverId, region, characterName) {
  const cfg       = REGION_CONFIG[region] ?? REGION_CONFIG.TW;
  // Route through shugo.gg proxy to avoid 403 from direct NCSoft requests
  const rawUrl    = `${cfg.apiBase}${cfg.searchPath}?keyword=${encodeURIComponent(characterName)}&page=1&size=20`;
  const searchUrl = `https://shugo.gg/api/proxy?url=${encodeURIComponent(rawUrl)}`;
  console.log(`[Scraper] search (via proxy) → ${rawUrl}`);

  const res  = await fetch(searchUrl, { headers: PROXY_HEADERS, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Search API HTTP ${res.status}`);

  const json = await res.json();
  if (json?.error) throw new Error(`Shugo proxy error (search): ${json.error}`);
  // Proxy may wrap response; try common envelope shapes before falling back
  const list = Array.isArray(json?.list)       ? json.list       :
               Array.isArray(json?.data?.list) ? json.data.list  :
               Array.isArray(json?.data)        ? json.data       : [];

  const match =
    list.find((c) => decodeURIComponent(c.characterId ?? "") === characterId) ??
    list.find((c) => stripHtml(c.name).toLowerCase() === characterName.toLowerCase() &&
                     String(c.serverId) === String(serverId)) ??
    list.find((c) => stripHtml(c.name).toLowerCase() === characterName.toLowerCase());

  if (!match) throw new Error(`Character "${characterName}" not found (${list.length} results)`);

  return {
    characterName:  stripHtml(match.name),
    characterLevel: parseInt(match.level ?? 0, 10) || 0,
    className:      CLASS_MAP[match.pcId] ?? "Unknown",
    raceName:       RACE_MAP[match.race]  ?? "Unknown",
    combatPower:    null,
    profileImage:   match.profileImageUrl ? `${cfg.profileImageBase}${match.profileImageUrl}` : null,
    serverName:     match.serverName ?? `Server ${serverId}`,
    serverId:       String(match.serverId ?? serverId),
    region,
    stats:          null,
    gear:           { weapons: [], armor: [], accessories: [], arcana: [], runes: [] },
    titles:         { active: null, ownedCount: null, totalCount: null },
    source:         "search",
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function scrapeProfile(inputUrl) {
  const parsed = parseShugUrl(inputUrl);
  if (!parsed) {
    return {
      success: false,
      error:
        "Invalid URL. Please provide a valid character link:\n" +
        "- https://shugo.gg/character?id=...\n" +
        "- OR https://tw.ncsoft.com/aion2/characters/...",
    };
  }

  const { id: characterId, server: serverId, region, name: characterName } = parsed;
  let lastError = null;

  // ── 1–3 attempts on character/info ───────────────────────────────────────
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `[Scraper] Attempt ${attempt}/${MAX_ATTEMPTS} | id=${characterId} | server=${serverId} | region=${region}`
      );

      const raw = await fetchCharacterInfo(characterId, serverId, region);

      // ── Core identity ────────────────────────────────────────────────────
      const nameRaw    = extractField(raw, "characterName", "charName", "pcName", "nickName", "nickname", "name");
      const name       = stripHtml(String(nameRaw ?? characterName));
      const level      = parseInt(extractField(raw, "characterLevel", "level") ?? 0, 10) || 0;
      const cp         = extractField(raw, "combatPower", "gearScore", "powerScore", "cp");

      let className = extractField(raw, "className", "class_name", "jobName");
      if (!className || className === "Unknown") {
        const pcId = extractField(raw, "pcId", "classId");
        className  = CLASS_MAP[parseInt(pcId, 10)] ?? "Unknown";
      }

      const raceId     = extractField(raw, "raceId", "race");
      const raceName   = extractField(raw, "raceName", "race_name") ?? RACE_MAP[parseInt(raceId, 10)] ?? "Unknown";
      const serverName = extractField(raw, "serverName", "server_name") ?? `Server ${serverId}`;
      
      let profileImage = extractField(raw, "profileImage", "profileImg", "profileImageUrl") ?? null;
      if (profileImage && profileImage.includes("profileimg.plaync.com")) {
        try {
          const imgRes = await fetch(profileImage, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
          if ([301, 302, 307, 308].includes(imgRes.status)) {
            const loc = imgRes.headers.get('location');
            if (loc) profileImage = loc.split('#')[0]; // Remove hash fragment for Discord embed
          }
        } catch(e) {
          console.warn("[Scraper] Failed to resolve image URL:", e.message);
        }
      }

      // ── Stats (base character stats) ──────────────────────────────────────
      const stats  = extractBaseStats(raw);
      const titles = extractTitles(raw);
      const itemLevel = extractItemLevel(raw);
      const rankings = extractRankings(raw);
      const equippedTitles = extractEquippedTitles(raw);

      const cpNum = cp !== null ? parseInt(cp, 10) : null;

      console.log(
        `[Scraper] ✅ ${name} | Lv${level} ${className} (${raceName}) | ` +
        `CP: ${cpNum?.toLocaleString() ?? "—"} | Server: ${serverName}`
      );
      if (stats) {
        const statSummary = Object.entries(stats).map(([k, { label, value }]) => `${label}=${value}`).join(", ");
        console.log(`[Scraper] Stats: { ${statSummary} }`);
      } else {
        console.log("[Scraper] ⚠️ No baseStat found in character/info response");
      }

      // ── Equipment (separate call, non-fatal) ─────────────────────────────
      await sleep(400);
      let gear = { weapons: [], armor: [], accessories: [], arcana: [], runes: [] };
      try {
        const equipJson   = await fetchCharacterEquipment(characterId, serverId, region);
        const equipRaw    = equipJson?.equipment ?? equipJson;
        const equipList   = asArray(equipRaw?.equipmentList ?? findKey(equipJson, "equipmentList"));

        // Build item list for batch name fetch
        const itemsForBatch = equipList.map((item) => ({
          itemId:       parseInt(item?.itemId ?? item?.id ?? 0, 10) || 0,
          slotPos:      parseInt(item?.slotPos ?? 0, 10) || 0,
          totalEnchant: (parseInt(item?.enchantLevel ?? 0, 10) || 0) + (parseInt(item?.exceedLevel ?? 0, 10) || 0),
        })).filter((i) => i.itemId > 0);

        // Fetch item names from shugo.gg batch API
        let itemNames = [];
        try {
          itemNames = await fetchItemNames(itemsForBatch, characterId, serverId, region);
        } catch (nameErr) {
          console.warn(`[Scraper] batch-equipment failed (names will be IDs): ${nameErr.message}`);
        }

        gear = parseEquipmentResponse(equipJson, itemNames);
        console.log(
          `[Scraper] Gear: weapons=${gear.weapons.length}, armor=${gear.armor.length}, ` +
          `accessories=${gear.accessories.length}, arcana=${gear.arcana.length}, runes=${gear.runes.length}`
        );
      } catch (equipErr) {
        console.warn(`[Scraper] character/equipment failed (gear will be empty): ${equipErr.message}`);
      }

      return {
        success: true,
        data: {
          characterName:  name,
          characterLevel: level,
          className,
          raceName,
          combatPower:    isNaN(cpNum) ? null : cpNum,
          profileImage,
          classIconUrl:   classIconUrl(className),
          serverName,
          serverId:       String(serverId),
          region,
          stats,
          itemLevel,
          rankings,
          equippedTitles,
          gear,
          titles,
          source: "character/info",
        },
      };
    } catch (err) {
      lastError = err;
      console.warn(`[Scraper] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  // ── Fallback: search API ────────────────────────────────────────────────
  if (characterName) {
    console.warn(`[Scraper] Falling back to search API. Last error: ${lastError?.message}`);
    try {
      const data = await fetchViaSearch(characterId, serverId, region, characterName);
      return { success: true, data: { ...data, classIconUrl: classIconUrl(data.className) } };
    } catch (searchErr) {
      console.error(`[Scraper] Search fallback also failed: ${searchErr.message}`);
      lastError = searchErr;
    }
  }

  console.error(`[Scraper] ❌ All attempts failed for: ${characterName} (${characterId})`);
  return { success: false, error: lastError?.message ?? "Unknown scraper error" };
}
