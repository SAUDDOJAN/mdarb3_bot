/**
 * M3RGEEN Ticket System — Centralized Configuration
 * 
 * All guild names, role IDs, channel IDs, and ticket type definitions
 * are managed here centrally without touching core logic.
 */

export const GUILD_ID = "861355983975874601";

// ─── Centralized Guild Names ──────────────────────────────────────────────────
// Used across guild join & transfer tickets. Easily editable/extensible.
export const GUILD_NAMES = [
  "M3RGEEN",
  "M3RG33N",
  "M3RGEEEN",
  "EMPEROR",
];

// ─── Centralized Guild Leadership Mapping ─────────────────────────────────────
// Official leader & officer Discord User IDs mapped per guild
export const GUILD_LEADERSHIP = {
  EMPEROR: {
    name: "EMPEROR",
    leaderId: "352636163527540757",
    officerIds: [],
  },
  M3RG33N: {
    name: "M3RG33N",
    leaderId: "930531874877607966",
    officerIds: [],
  },
  M3RGEEN: {
    name: "M3RGEEN",
    leaderId: "136371223209836544",
    officerIds: [],
  },
  M3RGEEEN: {
    name: "M3RGEEEN",
    leaderId: "136371223209836544",
    officerIds: ["1235720915317297154"],
  },
};

/**
 * Get all authorized user IDs for a given guild name.
 */
export function getGuildAuthorizedUserIds(guildName) {
  if (!guildName) return [];
  const g = GUILD_LEADERSHIP[guildName];
  if (!g) return [];
  const ids = [];
  if (g.leaderId) ids.push(g.leaderId);
  if (Array.isArray(g.officerIds)) ids.push(...g.officerIds);
  return ids;
}

/**
 * Get all authorized user IDs for a ticket (single guild or transfer between two guilds).
 */
export function getTicketAuthorizedGuildUserIds(ticket) {
  const modalData = ticket.modal_data || {};
  const authorizedIds = new Set();

  if (ticket.type === "guild_join") {
    const targetGuild = modalData.target_guild;
    for (const id of getGuildAuthorizedUserIds(targetGuild)) {
      authorizedIds.add(id);
    }
  } else if (ticket.type === "guild_transfer") {
    const currentGuild = modalData.current_guild;
    const targetGuild = modalData.target_guild;
    for (const id of getGuildAuthorizedUserIds(currentGuild)) {
      authorizedIds.add(id);
    }
    for (const id of getGuildAuthorizedUserIds(targetGuild)) {
      authorizedIds.add(id);
    }
  }

  return Array.from(authorizedIds);
}

/**
 * Get a user-friendly role label for a staff member relative to a guild.
 */
export function getStaffGuildRoleLabel(userId, guildName = null) {
  if (guildName && GUILD_LEADERSHIP[guildName]) {
    const g = GUILD_LEADERSHIP[guildName];
    if (g.leaderId === userId) return `قائد ${g.name}`;
    if (g.officerIds?.includes(userId)) return `ضابط ${g.name}`;
  }
  for (const [key, g] of Object.entries(GUILD_LEADERSHIP)) {
    if (g.leaderId === userId) return `قائد ${g.name}`;
    if (g.officerIds?.includes(userId)) return `ضابط ${g.name}`;
  }
  return "مشرف سيرفر";
}

// ─── Designated Discord Channels & Category ──────────────────────────────────
export const SUPPORT_CATEGORY_ID = "1560175563145084968"; // فئة الدعم الفني والتذاكر المعتمدة

export const TICKET_CHANNELS = {
  PANEL: "1560176133075501116",         // 🎫 TICKET — لوحة فتح التذاكر
  REGULAR_LOGS: "1560176269117751336",  // 📋 LOGS — سجل التذاكر العادية
  REPORTS: "1560176348524453988",       // 🔒 REPORTS — البلاغات الإدارية والسرية
  CATEGORY: SUPPORT_CATEGORY_ID,        // فئة إنشاء قنوات التذاكر
};

// ─── Staff & Member Role IDs ──────────────────────────────────────────────────
export const TICKET_ROLES = {
  MEMBER: "1401376073077231702",        // 🔥 المعرقين
  MODERATOR: "1509497629564866680",     // مشرفين السيرفر
  GUILD_LEADER: "1548343903307178024",  // AION 2 Guild Leader
};

// ─── Ticket Types & Definitions ───────────────────────────────────────────────
export const TICKET_TYPES = {
  GUILD_JOIN: {
    id: "guild_join",
    title: "مشكلة في الانضمام إلى الجيلد",
    emoji: "⚔️",
    description: "معالجة المشاكل في نظام طلبات الانضمام الموجود أصلًا (وليس لإنشاء طلب جديد)",
    isConfidential: false,
    requiresStaff: "guild_leader_or_mod",
  },
  GUILD_TRANSFER: {
    id: "guild_transfer",
    title: "النقل بين الجيلدات",
    emoji: "🔄",
    description: "بين M3RGEEN و M3RG33N و M3RGEEEN و EMPEROR",
    isConfidential: false,
    requiresStaff: "guild_leader_or_mod",
  },
  TECH_SUPPORT: {
    id: "tech_support",
    title: "مشاكل برنامج المعرقين",
    emoji: "🛠️",
    description: "للأعطال والمشاكل التي تواجه اللاعبين في برنامج M3RGEEN",
    isConfidential: false,
    requiresStaff: "mod",
  },
  ADMIN_COMPLAINT: {
    id: "admin_complaint",
    title: "شكوى إدارية",
    emoji: "⚖️",
    description: "للشكاوى العادية المتعلقة بإدارة السيرفر والأعضاء",
    isConfidential: false,
    requiresStaff: "mod",
  },
  SUGGESTION: {
    id: "suggestion",
    title: "اقتراح تطوير",
    emoji: "💡",
    description: "لتحسين البرنامج أو السيرفر أو خدمات المجتمع",
    isConfidential: false,
    requiresStaff: "mod",
  },
  GENERAL_INQUIRY: {
    id: "general_inquiry",
    title: "استفسار عام",
    emoji: "❓",
    description: "عن خدمات المجتمع والإدارة (وليس عن كلاسات اللعبة)",
    isConfidential: false,
    requiresStaff: "mod",
  },
  INGAME_HELP: {
    id: "ingame_help",
    title: "المساعدة داخل اللعبة",
    emoji: "🎮",
    description: "استفسارات الكلاسات، العتاد، المهمات، وبناء الشخصية",
    isConfidential: false,
    requiresStaff: "mod",
    hidden: true, // محذوف من لوحة إنشاء التذاكر مع الحفاظ على البيانات والتذاكر القديمة
  },
  CONFIDENTIAL_REPORT: {
    id: "confidential_report",
    title: "🔒 فتح بلاغ سري عن تحرش أو إساءة",
    emoji: "🛡️",
    description: "يصل إلى قائد السيرفر فقط (بسرية وتشفير تام)",
    isConfidential: true,
    requiresStaff: "owner_only",
  },
};

// ─── Status Definitions ───────────────────────────────────────────────────────
export const TICKET_STATUS = {
  OPEN: {
    code: "OPEN",
    label: "قيد الانتظار",
    badge: "🟡",
    color: 0xf1c40f,
  },
  CLAIMED: {
    code: "CLAIMED",
    label: "مستلمة (قيد المعالجة)",
    badge: "🔵",
    color: 0x3498db,
  },
  PENDING_USER: {
    code: "PENDING_USER",
    label: "بانتظار رد العضو",
    badge: "🟠",
    color: 0xe67e22,
  },
  RESOLVED: {
    code: "RESOLVED",
    label: "تمت المعالجة",
    badge: "🟢",
    color: 0x2ecc71,
  },
  CLOSED: {
    code: "CLOSED",
    label: "مغلقة",
    badge: "🔴",
    color: 0x95a5a6,
  },
};
