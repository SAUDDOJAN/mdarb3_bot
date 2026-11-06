/**
 * M3RGEEN Ludra Raid — Static Teams Module (الفرق الثابتة)
 *
 * Handles:
 *  - 10-player Static Raid Teams persistence in PostgreSQL
 *  - Live-updatable Embeds in the designated static teams channel
 *  - Dedicated Leader Controls (Mention, Direct Message, Add Player, Remove Player)
 *  - Admin Approval & Audit Logging workflow in private log channel
 *  - Interactive DM Bridge for Admin Inquiries and Member Clarifications
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  AttachmentBuilder,
  PermissionsBitField,
} from "discord.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { query } from "../database/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
export const STATIC_TEAMS_CHANNEL_ID = "1567923394769326281"; // 👹┊ʟᴜᴅʀᴀ-ʀᴀɪᴅ・الفرق-الثابتة
export const STATIC_LOG_CHANNEL_ID = "1567943675470942319";    // 👹┊ʟᴜᴅʀᴀ-ʀᴀɪᴅ・سجل-التغييرات
export const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";

export const CLASS_EMOJIS = {
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Templar:      "<:Templar:1504472027724255414>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Spiritmaster: "<:Elementalist:1504471920219783209>",
  Elementalist: "<:Elementalist:1504471920219783209>",
};

export function normalizeClassName(raw) {
  if (!raw) return "Gladiator";
  const str = String(raw).trim().toLowerCase();
  if (str.includes("temp") || str.includes("تمبل")) return "Templar";
  if (str.includes("glad") || str.includes("جلاد")) return "Gladiator";
  if (str.includes("cler") || str.includes("كلير")) return "Cleric";
  if (str.includes("chan") || str.includes("تشان") || str.includes("شنتر")) return "Chanter";
  if (str.includes("rang") || str.includes("رينج") || str.includes("رامي")) return "Ranger";
  if (str.includes("ass") || str.includes("أساس") || str.includes("اساس")) return "Assassin";
  if (str.includes("sorc") || str.includes("ساحر") || str.includes("محر")) return "Sorcerer";
  if (str.includes("spirit") || str.includes("elem") || str.includes("سبير") || str.includes("عنصر")) return "Spiritmaster";
  return "Gladiator";
}

let dbInitialized = false;
let dbInitPromise = null;
const teamCache = new Map();

export async function getCachedTeam(teamNumber) {
  const num = parseInt(teamNumber, 10) || 1;
  const res = await query(`SELECT * FROM ludra_static_teams WHERE team_number = $1 LIMIT 1`, [num]);
  const team = res.rows[0] || null;
  if (team) {
    teamCache.set(num, team);
  }
  return team;
}

export function invalidateTeamCache(teamNumber) {
  if (teamNumber) {
    teamCache.delete(parseInt(teamNumber, 10));
  } else {
    teamCache.clear();
  }
}

export async function initLudraStaticTeamsDB() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS ludra_static_teams (
          id SERIAL PRIMARY KEY,
          team_number INT UNIQUE NOT NULL,
          team_name TEXT NOT NULL,
          leader_discord_id TEXT NOT NULL,
          leader_name TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          message_id TEXT,
          logo_filename TEXT,
          status TEXT DEFAULT 'ACTIVE',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ludra_static_team_members (
          id SERIAL PRIMARY KEY,
          team_number INT NOT NULL,
          discord_id TEXT,
          character_name TEXT NOT NULL,
          class_name TEXT NOT NULL,
          is_leader BOOLEAN DEFAULT FALSE,
          slot_index INT NOT NULL,
          added_at TIMESTAMPTZ DEFAULT NOW(),
          added_by TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ludra_team_member ON ludra_static_team_members (team_number, character_name);

        CREATE TABLE IF NOT EXISTS ludra_team_removal_requests (
          id SERIAL PRIMARY KEY,
          team_number INT NOT NULL,
          requested_by_discord_id TEXT NOT NULL,
          requested_by_name TEXT,
          target_discord_id TEXT,
          target_character_name TEXT NOT NULL,
          target_class_name TEXT,
          reason TEXT NOT NULL,
          status TEXT DEFAULT 'PENDING',
          log_channel_id TEXT,
          log_message_id TEXT,
          inquiry_question TEXT,
          inquiry_target_id TEXT,
          inquiry_target_type TEXT,
          inquiry_answer TEXT,
          reviewed_by_discord_id TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          reviewed_at TIMESTAMPTZ
        );

        ALTER TABLE ludra_static_teams ADD COLUMN IF NOT EXISTS col1_title TEXT;
        ALTER TABLE ludra_static_teams ADD COLUMN IF NOT EXISTS col2_title TEXT;
        ALTER TABLE ludra_static_teams ADD COLUMN IF NOT EXISTS embed_color TEXT;
        ALTER TABLE ludra_static_team_members ADD COLUMN IF NOT EXISTS role_tag TEXT;
        ALTER TABLE ludra_static_team_members ADD COLUMN IF NOT EXISTS combat_power INT;
      `);

      dbInitialized = true;

      const res = await query(`SELECT * FROM ludra_static_teams`);
      for (const t of res.rows) {
        teamCache.set(t.team_number, t);
      }
    } catch (err) {
      console.error("[LudraStaticTeams] DB init error:", err);
    }
  })();

  return dbInitPromise;
}

// Pre-initialize in background on module load
initLudraStaticTeamsDB();

/**
 * Ensures Team #1 (Boo's Lead Team) is seeded in the database if not present.
 */
export async function seedTeam1IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 1 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename)
      VALUES (1, 'الفريق الثابت #1', '140247495832764417', 'Boo', $1, 'team_1_logo.jpg')
    `, [STATIC_TEAMS_CHANNEL_ID]);

    const initialMembers = [
      { name: "Boo", class: "Templar", discord_id: "140247495832764417", is_leader: true, slot: 1 },
      { name: "TouchMyBow", class: "Ranger", discord_id: "409091843943301121", is_leader: false, slot: 2 },
      { name: "AinzJGL", class: "Chanter", discord_id: "1290464582963302463", is_leader: false, slot: 3 },
      { name: "Zev", class: "Cleric", discord_id: "1235720915317297154", is_leader: false, slot: 4 },
      { name: "RSR", class: "Cleric", discord_id: "649062008666193960", is_leader: false, slot: 5 },
      { name: "Triss", class: "Gladiator", discord_id: "225384334859698177", is_leader: false, slot: 6 },
      { name: "Longo", class: "Assassin", discord_id: "460018444872712213", is_leader: false, slot: 7 },
      { name: "Luvv", class: "Spiritmaster", discord_id: "351341873593319426", is_leader: false, slot: 8 },
      { name: "x7mc", class: "Ranger", discord_id: "323838749270212618", is_leader: false, slot: 9 },
      { name: "KILLR", class: "Spiritmaster", discord_id: "853800137431187486", is_leader: false, slot: 10 },
    ];

    for (const m of initialMembers) {
      await query(`
        INSERT INTO ludra_static_team_members (team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by)
        VALUES (1, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
        ON CONFLICT (team_number, character_name) DO NOTHING
      `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
    }
  }
}

/**
 * Ensures Team #2 (Yami's Lead Team) is seeded in the database if not present.
 */
export async function seedTeam2IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 2 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename)
      VALUES (2, 'الفريق الثابت #2', '930531874877607966', 'Yamiメ', $1, 'team_2_logo.jpg')
    `, [STATIC_TEAMS_CHANNEL_ID]);

    const initialMembers = [
      { name: "Yamiメ", class: "Chanter", discord_id: "930531874877607966", is_leader: true, slot: 1 },
      { name: "NoLife", class: "Assassin", discord_id: "439415701745303553", is_leader: false, slot: 2 },
      { name: "xN7R", class: "Gladiator", discord_id: "348506964138917891", is_leader: false, slot: 3 },
      { name: "Uta", class: "Ranger", discord_id: "1083076957144621177", is_leader: false, slot: 4 },
      { name: "CLiQ", class: "Cleric", discord_id: "1242815909194760213", is_leader: false, slot: 5 },
    ];

    for (const m of initialMembers) {
      await query(`
        INSERT INTO ludra_static_team_members (team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by)
        VALUES (2, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
        ON CONFLICT (team_number, character_name) DO NOTHING
      `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
    }
  }
}

/**
 * Ensures Team #3 (Prometheus's Lead Team - Raid 1 Boss Divisions) is seeded in the database.
 */
export async function seedTeam3IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 3 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (
        team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename, col1_title, col2_title, embed_color
      )
      VALUES (
        3, 'الريد الأول (فريق #3)', '448221981452795904', 'Prometheus', $1, 'team_3_logo.jpg',
        '🐉 تشكيلة Rahu', '🐍 تشكيلة Ketu', '0x2ecc71'
      )
    `, [STATIC_TEAMS_CHANNEL_ID]);
  } else {
    await query(`
      UPDATE ludra_static_teams
      SET team_name = 'الريد الأول (فريق #3)',
          leader_discord_id = '448221981452795904',
          leader_name = 'Prometheus',
          logo_filename = 'team_3_logo.jpg',
          col1_title = '🐉 تشكيلة Rahu',
          col2_title = '🐍 تشكيلة Ketu',
          embed_color = '0x2ecc71'
      WHERE team_number = 3
    `);
  }

  const initialMembers = [
    // Rahu Boss (Slots 1-5)
    { name: "Prometheus", class: "Cleric", discord_id: "448221981452795904", is_leader: true, slot: 1 },
    { name: "loay", class: "Templar", discord_id: "611829466448003082", is_leader: false, slot: 2 },
    { name: "abdo", class: "Chanter", discord_id: "897888023931400234", is_leader: false, slot: 3 },
    { name: "Rino", class: "Sorcerer", discord_id: "186441588187201536", is_leader: false, slot: 4 },
    { name: "Zeusツ", class: "Assassin", discord_id: "331084798493720578", is_leader: false, slot: 5 },

    // Ketu Boss (Slots 6-10)
    { name: "Boogie", class: "Cleric", discord_id: "810385452350832700", is_leader: false, slot: 6 },
    { name: "YorBriar", class: "Gladiator", discord_id: "852941611284693002", is_leader: false, slot: 7 },
    { name: "3dne", class: "Cleric", discord_id: "707678580263354388", is_leader: false, slot: 8 },
    { name: "AZ", class: "Ranger", discord_id: "697193649020338187", is_leader: false, slot: 9 },
    { name: "z7", class: "Spiritmaster", discord_id: "558419221911044112", is_leader: false, slot: 10 },
  ];

  for (const m of initialMembers) {
    await query(`
      INSERT INTO ludra_static_team_members (
        team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by
      )
      VALUES (3, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        is_leader = EXCLUDED.is_leader,
        slot_index = EXCLUDED.slot_index
    `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
  }
}

/**
 * Ensures Team #4 (QTR's Lead Team - Raid 2 Boss Divisions) is seeded in the database.
 */
export async function seedTeam4IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 4 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (
        team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename, col1_title, col2_title, embed_color
      )
      VALUES (
        4, 'الريد الثاني (فريق #4)', '573528099090595841', 'TheForgotten', $1, 'team_4_logo.jpg',
        '🐉 تشكيلة Rahu', '🐍 تشكيلة Ketu', '0x9b59b6'
      )
    `, [STATIC_TEAMS_CHANNEL_ID]);
  } else {
    await query(`
      UPDATE ludra_static_teams
      SET team_name = 'الريد الثاني (فريق #4)',
          leader_discord_id = '573528099090595841',
          leader_name = 'TheForgotten',
          logo_filename = 'team_4_logo.jpg',
          col1_title = '🐉 تشكيلة Rahu',
          col2_title = '🐍 تشكيلة Ketu',
          embed_color = '0x9b59b6'
      WHERE team_number = 4
    `);
  }

  const initialMembers = [
    // Rahu Boss (Slots 1-5)
    { name: "Quark", class: "Cleric", discord_id: "436583534371799040", is_leader: false, slot: 1 },
    { name: "m0stafaEG", class: "Templar", discord_id: "1047367036357066843", is_leader: false, slot: 2 },
    { name: "Sirocco", class: "Chanter", discord_id: "321059745773518859", is_leader: false, slot: 3 },
    { name: "KimShockz", class: "Assassin", discord_id: "208631081174302721", is_leader: false, slot: 4 },
    { name: "Khaled", class: "Spiritmaster", discord_id: "744953077550809114", is_leader: false, slot: 5 },

    // Ketu Boss (Slots 6-10)
    { name: "QTR", class: "Cleric", discord_id: "1486797245885055038", is_leader: false, slot: 6 },
    { name: "TheForgotten", class: "Gladiator", discord_id: "573528099090595841", is_leader: true, slot: 7 },
    { name: "snowWhite", class: "Cleric", discord_id: "327602752282951700", is_leader: false, slot: 8 },
    { name: "SecRets", class: "Ranger", discord_id: "444277151387222016", is_leader: false, slot: 9 },
    { name: "Oraid", class: "Spiritmaster", discord_id: "1060997209627303996", is_leader: false, slot: 10 },
  ];

  for (const m of initialMembers) {
    await query(`
      INSERT INTO ludra_static_team_members (
        team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by
      )
      VALUES (4, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        is_leader = EXCLUDED.is_leader,
        slot_index = EXCLUDED.slot_index
    `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
  }
}

/**
 * Ensures Team #5 (Boodh's Lead Team - Raid 3 Boss Divisions) is seeded in the database.
 */
export async function seedTeam5IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 5 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (
        team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename, col1_title, col2_title, embed_color
      )
      VALUES (
        5, 'الريد الثالث (فريق #5)', '153037022578212864', 'Boodh', $1, 'team_5_logo.jpg',
        '🐉 تشكيلة Rahu', '🐍 تشكيلة Ketu', '0xf1c40f'
      )
    `, [STATIC_TEAMS_CHANNEL_ID]);
  } else {
    await query(`
      UPDATE ludra_static_teams
      SET team_name = 'الريد الثالث (فريق #5)',
          leader_discord_id = '153037022578212864',
          leader_name = 'Boodh',
          logo_filename = 'team_5_logo.jpg',
          col1_title = '🐉 تشكيلة Rahu',
          col2_title = '🐍 تشكيلة Ketu',
          embed_color = '0xf1c40f'
      WHERE team_number = 5
    `);
  }

  const initialMembers = [
    // Rahu Boss (Slots 1-5)
    { name: "Boodh", class: "Cleric", discord_id: "153037022578212864", is_leader: true, slot: 1 },
    { name: "Alpha", class: "Templar", discord_id: "466030409260466180", is_leader: false, slot: 2 },
    { name: "HolyBrand", class: "Chanter", discord_id: "210372267777982464", is_leader: false, slot: 3 },
    { name: "Janna", class: "Sorcerer", discord_id: "513312098441232405", is_leader: false, slot: 4 },
    { name: "DEMO", class: "Spiritmaster", discord_id: "406192692729741342", is_leader: false, slot: 5 },

    // Ketu Boss (Slots 6-10)
    { name: "SMS", class: "Cleric", discord_id: "690578558749245481", is_leader: false, slot: 6 },
    { name: "scar", class: "Gladiator", discord_id: "254245441237942272", is_leader: false, slot: 7 },
    { name: "iii5", class: "Ranger", discord_id: "735177064155447326", is_leader: false, slot: 8 },
    { name: "Agatha", class: "Assassin", discord_id: "349451642044940289", is_leader: false, slot: 9 },
    { name: "Silent", class: "Assassin", discord_id: "233686357224980480", is_leader: false, slot: 10 },
  ];

  for (const m of initialMembers) {
    await query(`
      INSERT INTO ludra_static_team_members (
        team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by
      )
      VALUES (5, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        is_leader = EXCLUDED.is_leader,
        slot_index = EXCLUDED.slot_index
    `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
  }
}

/**
 * Ensures Team #6 (NotCalm's Lead Team - Raid 4 Boss Divisions) is seeded in the database.
 */
export async function seedTeam6IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 6 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (
        team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename, col1_title, col2_title, embed_color
      )
      VALUES (
        6, 'الريد الرابع (فريق #6)', '893268209237655572', 'NotCalm', $1, 'team_6_logo.jpg',
        '🐉 تشكيلة Rahu', '🐍 تشكيلة Ketu', '0x00cec9'
      )
    `, [STATIC_TEAMS_CHANNEL_ID]);
  } else {
    await query(`
      UPDATE ludra_static_teams
      SET team_name = 'الريد الرابع (فريق #6)',
          leader_discord_id = '893268209237655572',
          leader_name = 'NotCalm',
          logo_filename = 'team_6_logo.jpg',
          col1_title = '🐉 تشكيلة Rahu',
          col2_title = '🐍 تشكيلة Ketu',
          embed_color = '0x00cec9'
      WHERE team_number = 6
    `);
  }

  const initialMembers = [
    // Rahu Boss (Slots 1-5)
    { name: "HajwalaH", class: "Cleric", discord_id: "465633054480924712", is_leader: false, slot: 1 },
    { name: "WA", class: "Templar", discord_id: "434756403006013451", is_leader: false, slot: 2 },
    { name: "Natlus", class: "Chanter", discord_id: "222777886023745536", is_leader: false, slot: 3 },
    { name: "NotCalm", class: "Spiritmaster", discord_id: "893268209237655572", is_leader: true, slot: 4 },
    { name: "A22md", class: "Spiritmaster", discord_id: "546756906337959937", is_leader: false, slot: 5 },

    // Ketu Boss (Slots 6-10)
    { name: "M8", class: "Cleric", discord_id: "505793271327358981", is_leader: false, slot: 6 },
    { name: "Ms3", class: "Gladiator", discord_id: "684212022258565126", is_leader: false, slot: 7 },
    { name: "ShadowArow", class: "Ranger", discord_id: "1004740291447754852", is_leader: false, slot: 8 },
    { name: "Alaeddine", class: "Ranger", discord_id: "227025742020476938", is_leader: false, slot: 9 },
    { name: "ecico", class: "Spiritmaster", discord_id: "556169687562584093", is_leader: false, slot: 10 },
  ];

  for (const m of initialMembers) {
    await query(`
      INSERT INTO ludra_static_team_members (
        team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by
      )
      VALUES (6, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        is_leader = EXCLUDED.is_leader,
        slot_index = EXCLUDED.slot_index
    `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
  }
}

/**
 * Ensures Team #7 (TaKa's Lead Team - Raid 5 Boss Divisions) is seeded in the database.
 */
export async function seedTeam7IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 7 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (
        team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename, col1_title, col2_title, embed_color
      )
      VALUES (
        7, 'الريد الخامس (فريق #7)', '486190677323939848', 'TaKa', $1, 'team_7_logo.jpg',
        '🐉 تشكيلة Rahu', '🐍 تشكيلة Ketu', '0x48dbfb'
      )
    `, [STATIC_TEAMS_CHANNEL_ID]);
  } else {
    await query(`
      UPDATE ludra_static_teams
      SET team_name = 'الريد الخامس (فريق #7)',
          leader_discord_id = '486190677323939848',
          leader_name = 'TaKa',
          logo_filename = 'team_7_logo.jpg',
          col1_title = '🐉 تشكيلة Rahu',
          col2_title = '🐍 تشكيلة Ketu',
          embed_color = '0x48dbfb'
      WHERE team_number = 7
    `);
  }

  const initialMembers = [
    // Rahu Boss (Slots 1-5)
    { name: "ibrah", class: "Cleric", discord_id: "122767943179304960", is_leader: false, slot: 1 },
    { name: "Meshal", class: "Templar", discord_id: "661560382661591074", is_leader: false, slot: 2 },
    { name: "iGreaTz", class: "Chanter", discord_id: "324660236751208460", is_leader: false, slot: 3 },
    { name: "Error", class: "Spiritmaster", discord_id: "493391800145281025", is_leader: false, slot: 4 },
    { name: "AssAssINxLy", class: "Assassin", discord_id: "1228487690538848356", is_leader: false, slot: 5 },

    // Ketu Boss (Slots 6-10)
    { name: "Vladimir", class: "Cleric", discord_id: "501122333591863306", is_leader: false, slot: 6 },
    { name: "Eziio", class: "Gladiator", discord_id: "762010152164524042", is_leader: false, slot: 7 },
    { name: "RB3", class: "Ranger", discord_id: "1349759401522626623", is_leader: false, slot: 8 },
    { name: "Glory", class: "Ranger", discord_id: "222228541654302730", is_leader: false, slot: 9 },
    { name: "TaKa", class: "Sorcerer", discord_id: "486190677323939848", is_leader: true, slot: 10 },
  ];

  for (const m of initialMembers) {
    await query(`
      INSERT INTO ludra_static_team_members (
        team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by
      )
      VALUES (7, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        is_leader = EXCLUDED.is_leader,
        slot_index = EXCLUDED.slot_index
    `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
  }
}

/**
 * Ensures Team #8 (E1's Lead Team - Raid 6 Boss Divisions) is seeded in the database.
 */
export async function seedTeam8IfMissing() {
  await initLudraStaticTeamsDB();

  const check = await query(`SELECT * FROM ludra_static_teams WHERE team_number = 8 LIMIT 1`);
  if (check.rows.length === 0) {
    await query(`
      INSERT INTO ludra_static_teams (
        team_number, team_name, leader_discord_id, leader_name, channel_id, logo_filename, col1_title, col2_title, embed_color
      )
      VALUES (
        8, 'الريد السادس (فريق #8)', '170003210147201024', 'E1', $1, 'team_8_logo.jpg',
        '🐉 تشكيلة Rahu', '🐍 تشكيلة Ketu', '0xe67e22'
      )
    `, [STATIC_TEAMS_CHANNEL_ID]);
  } else {
    await query(`
      UPDATE ludra_static_teams
      SET team_name = 'الريد السادس (فريق #8)',
          leader_discord_id = '170003210147201024',
          leader_name = 'E1',
          logo_filename = 'team_8_logo.jpg',
          col1_title = '🐉 تشكيلة Rahu',
          col2_title = '🐍 تشكيلة Ketu',
          embed_color = '0xe67e22'
      WHERE team_number = 8
    `);
  }

  const initialMembers = [
    // Rahu Boss (Slots 1-5)
    { name: "AZiRYK", class: "Cleric", discord_id: "519584657797545987", is_leader: false, slot: 1 },
    { name: "E1", class: "Templar", discord_id: "170003210147201024", is_leader: true, slot: 2 },
    { name: "SIKA", class: "Chanter", discord_id: "535869005420953610", is_leader: false, slot: 3 },
    { name: "Nmro", class: "Spiritmaster", discord_id: "399729584477831189", is_leader: false, slot: 4 },
    { name: "OQ", class: "Sorcerer", discord_id: "541784149459992583", is_leader: false, slot: 5 },

    // Ketu Boss (Slots 6-10 - All slots filled)
    { name: "Qzz99", class: "Cleric", discord_id: "1457508000196464660", is_leader: false, slot: 6 },
    { name: "3D", class: "Gladiator", discord_id: "363680711129169922", is_leader: false, slot: 7 },
    { name: "RaMIX", class: "Ranger", discord_id: "272992479832178688", is_leader: false, slot: 8 },
    { name: "OO", class: "Spiritmaster", discord_id: "272056886369583104", is_leader: false, slot: 9 },
    { name: "Aquila", class: "Ranger", discord_id: "713506957956219001", is_leader: false, slot: 10 },
  ];

  for (const m of initialMembers) {
    await query(`
      INSERT INTO ludra_static_team_members (
        team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by
      )
      VALUES (8, $1, $2, $3, $4, $5, 'SYSTEM_INIT')
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        is_leader = EXCLUDED.is_leader,
        slot_index = EXCLUDED.slot_index
    `, [m.discord_id, m.name, m.class, m.is_leader, m.slot]);
  }
}

export function getVacantSlotLabel(teamNumber, slot) {
  const num = parseInt(teamNumber, 10);
  if (num >= 3 && num <= 8) {
    if (slot === 1 || slot === 6) return "Healer";
    if (slot === 2 || slot === 7) return "Tank";
    if (slot === 3 || slot === 8) return "Chanter";
    return "DPS";
  }
  if (num === 1) {
    if (slot === 1 || slot === 6) return "Tank";
    if (slot === 3) return "Chanter";
    if (slot === 4 || slot === 5) return "Healer";
    return "DPS";
  }
  if (num === 2) {
    if (slot === 1) return "Chanter";
    if (slot === 3 || slot === 7) return "Tank";
    if (slot === 5 || slot === 6) return "Healer";
    return "DPS";
  }
  return "";
}

/**
 * Builds the visual Embed, components and attachment for a static team.
 */
export async function buildTeamEmbedAndComponents(teamNumber) {
  await initLudraStaticTeamsDB();

  const teamRes = await query(`SELECT * FROM ludra_static_teams WHERE team_number = $1 LIMIT 1`, [teamNumber]);
  const team = teamRes.rows[0];
  if (!team) throw new Error(`Team #${teamNumber} not found in database.`);

  const membersRes = await query(`
    SELECT * FROM ludra_static_team_members
    WHERE team_number = $1
    ORDER BY slot_index ASC, id ASC
  `, [teamNumber]);
  const members = membersRes.rows;

  const count = members.length;
  const isFull = count >= 10;

  // Map members by slot for balanced 10-slot rendering (1..5 left, 6..10 right)
  const memberBySlot = new Map();
  members.forEach(m => memberBySlot.set(m.slot_index, m));

  const formatSlot = (slot) => {
    const m = memberBySlot.get(slot);
    if (!m) {
      const neededRole = getVacantSlotLabel(team.team_number, slot);
      return neededRole ? `**${slot}.** ▫️ *شاغر - ${neededRole}*` : `**${slot}.** ▫️ *شاغر*`;
    }
    const normClass = normalizeClassName(m.class_name);
    const emoji = CLASS_EMOJIS[normClass] || "🔹";
    let text = `**${slot}.** ${emoji} **${m.character_name}**`;
    if (m.is_leader) {
      text += ` 👑`;
    }
    return text;
  };

  const col1Text = [1, 2, 3, 4, 5].map(formatSlot).join("\n");
  const col2Text = [6, 7, 8, 9, 10].map(formatSlot).join("\n");

  let col1Title = team.col1_title || "👥 الفريق الرسمي";
  let col2Title = team.col2_title || "\u200b";

  let embedColor = 0x3498db;
  if (team.embed_color) {
    embedColor = parseInt(team.embed_color, 16) || embedColor;
  } else if (team.team_number === 2) {
    embedColor = 0xc0392b;
  } else if (team.team_number === 3) {
    embedColor = 0x2ecc71;
  } else if (team.team_number === 4) {
    embedColor = 0x9b59b6;
  } else if (team.team_number === 5) {
    embedColor = 0xf1c40f;
  } else if (team.team_number === 6) {
    embedColor = 0x00cec9;
  } else if (team.team_number === 7) {
    embedColor = 0x48dbfb;
  } else if (team.team_number === 8) {
    embedColor = 0xe67e22;
  }

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`🛡️ ${team.team_name} — Ludra Raid`)
    .setDescription(
      `⚔️ **تحالف M3RGEEN • منظومة الفرق الثابتة**\n\n` +
      `👑 **قائد الفريق:** <@${team.leader_discord_id}> (\`${team.leader_name}\`)\n` +
      `📊 **حالة الفريق:** ${isFull ? "مكتمل" : "غير مكتمل"} \`${count} / 10\` لاعبين\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      {
        name: col1Title,
        value: col1Text,
        inline: true,
      },
      {
        name: col2Title,
        value: col2Text,
        inline: true,
      }
    )
    .setFooter({ text: "تحالف M3RGEEN • نظام الفرق الثابتة لريد Ludra" })
    .setTimestamp();

  // Logo Attachment
  let attachment = null;
  const logoFilename = team.logo_filename || `team_${teamNumber}_logo.jpg`;
  const logoPath = path.resolve(__dirname, "../../assets", logoFilename);
  if (fs.existsSync(logoPath)) {
    attachment = new AttachmentBuilder(logoPath, { name: "team_logo.png" });
    embed.setThumbnail("attachment://team_logo.png");
  }

  const publicRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ludra_static:panel:${teamNumber}`)
      .setLabel("🎛️ لوحة إدارة الفريق")
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, components: [publicRow], attachment, team, members };
}

/**
 * Deploys or updates the team embed in the static teams room.
 */
export async function deployOrUpdateTeamEmbed(client, teamNumber) {
  const { embed, components, attachment, team } = await buildTeamEmbedAndComponents(teamNumber);

  const channel =
    client.channels?.cache?.get(team.channel_id) ||
    (await client.channels?.fetch?.(team.channel_id).catch(() => null));

  if (!channel) {
    throw new Error(`Target static teams channel ${team.channel_id} not accessible.`);
  }

  const payload = {
    embeds: [embed],
    components,
    allowedMentions: { parse: [] },
  };
  if (attachment) {
    payload.files = [attachment];
  }

  let messageId = team.message_id;
  if (messageId) {
    const existingMsg = await channel.messages.fetch(messageId).catch(() => null);
    if (existingMsg) {
      await existingMsg.edit(payload);
      return { messageId, team, updated: true };
    }
  }

  // If no message or previously deleted, send a new one
  const newMsg = await channel.send(payload);
  await query(`UPDATE ludra_static_teams SET message_id = $1, updated_at = NOW() WHERE team_number = $2`, [
    newMsg.id,
    teamNumber,
  ]);

  return { messageId: newMsg.id, team, updated: false, created: true };
}

/**
 * Checks whether user is the Team Leader, Server Owner, or Server Administrator.
 */
function isAuthorizedForTeam(interaction, team) {
  if (!team) return false;
  // Team Leader
  if (String(interaction.user.id) === String(team.leader_discord_id)) return true;
  // Server Owner (Full authority)
  if (interaction.guild && String(interaction.guild.ownerId) === String(interaction.user.id)) return true;
  // Administrator / ManageGuild
  const perms = interaction.memberPermissions || interaction.member?.permissions;
  if (perms?.has(PermissionsBitField.Flags.Administrator)) return true;
  if (perms?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  return false;
}

/**
 * Automatically schedules deletion of an interaction reply after 5 minutes (300,000 ms).
 */
function scheduleAutoDelete(interaction, delayMs = 5 * 60 * 1000) {
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, delayMs);
}

async function safeReply(interaction, options, delayMs = 5 * 60 * 1000) {
  scheduleAutoDelete(interaction, delayMs);
  const payload = typeof options === "string" ? { content: options, ephemeral: true } : { ...options, ephemeral: true };
  return interaction.reply(payload);
}

async function safeEditReply(interaction, options, delayMs = 5 * 60 * 1000) {
  scheduleAutoDelete(interaction, delayMs);
  const payload = typeof options === "string" ? { content: options } : options;
  return interaction.editReply(payload);
}

/**
 * Interaction Handler for Static Teams
 */
export async function handleLudraStaticInteraction(interaction) {
  const customId = interaction.customId || "";
  const parts = customId.split(":");
  const action = parts[1];
  const param = parts[2];
  const extra = parts[3];

  // ── 1. Team Action Buttons (From Team Card or Leader Panel) ──────────────────
  if (action === "panel" || action === "mention" || action === "dm" || action === "add" || action === "remove") {
    const teamNumber = parseInt(param, 10) || 1;
    const team = await getCachedTeam(teamNumber);
    if (!team) {
      return safeReply(interaction, "❌ تعذر العثور على بيانات هذا الفريق.");
    }

    if (!isAuthorizedForTeam(interaction, team)) {
      return safeReply(
        interaction,
        `❌ عذراً، لوحة إدارة الفريق مخصصة لقائد الفريق (<@${team.leader_discord_id}>) وإدارة السيرفر فقط. لا تملك صلاحية استخدام هذا الزر.`
      );
    }

    // ── Open Leader Private Control Panel ──
    if (action === "panel") {
      await interaction.deferReply({ ephemeral: true });

      const panelEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`🎛️ لوحة إدارة ${team.team_name}`)
        .setDescription(
          `أهلاً بك يا كابتن <@${interaction.user.id}>!\n` +
          `من هنا يمكنك التحكم بفريقك الثابت بشكل خاص ومباشر:\n\n` +
          `• **📢 منشن الفريق:** لتنبيه الأعضاء بالتجمع والاستعداد (يُحذف تلقائياً بعد 5 دقائق).\n` +
          `• **✉️ إرسال للخاص:** لإرسال رسالة رسمية لخاص جميع أعضاء الفريق مباشرة.\n` +
          `• **➕ إضافة لاعب:** اختيار كلاس وإضافة لاعب جديد في مقعد شاغر.\n` +
          `• **➖ حذف لاعب:** اختيار لاعب ورفع طلب استبعاد مسبّب للإدارة للمراجعة.`
        )
        .setFooter({ text: "تحالف M3RGEEN • لوحة تحكم القائد الخاصة (تختفي تلقائياً بعد 5 دقائق)" });

      const panelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ludra_static:mention:${teamNumber}`)
          .setLabel("📢 منشن الفريق")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ludra_static:dm:${teamNumber}`)
          .setLabel("✉️ إرسال للخاص")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`ludra_static:add:${teamNumber}`)
          .setLabel("➕ إضافة لاعب")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ludra_static:remove:${teamNumber}`)
          .setLabel("➖ حذف لاعب")
          .setStyle(ButtonStyle.Danger)
      );

      return safeEditReply(interaction, {
        embeds: [panelEmbed],
        components: [panelRow],
      });
    }

    // ── Mention Team ──
    if (action === "mention") {
      await interaction.deferReply({ ephemeral: true });

      const membersRes = await query(`SELECT discord_id, character_name FROM ludra_static_team_members WHERE team_number = $1`, [teamNumber]);
      const validMentions = membersRes.rows.filter(m => m.discord_id).map(m => `<@${m.discord_id}>`);

      if (validMentions.length === 0) {
        return safeEditReply(interaction, "⚠️ لا يوجد أعضاء بمعرفات ديسكورد مسجلة في الفريق لمنشنهم.");
      }

      const channel = interaction.channel;
      const sentAlert = await channel.send({
        content:
          `📢 **تجمع فريق Ludra الثابت #${team.team_number} (${team.team_name})!**\n` +
          `قائد الفريق <@${interaction.user.id}> يدعوكم للاستعداد والجاهزية للريد:\n\n` +
          validMentions.join(" ") +
          `\n\n*(سيتم حذف رسالة التنبيه هذه تلقائياً بعد 5 دقائق للحفاظ على نظافة الروم)*`,
        allowedMentions: {
          users: membersRes.rows.filter(m => m.discord_id).map(m => m.discord_id),
        },
      });

      // Automatically delete the mention message after 5 minutes
      setTimeout(() => {
        sentAlert.delete().catch(() => {});
      }, 5 * 60 * 1000);

      return safeEditReply(interaction, "✅ **تم إرسال المنشن وتنبيه أعضاء الفريق بنجاح!** (سيتم حذفه تلقائياً بعد 5 دقائق لحماية نظافة الروم).");
    }

    // ── Send DM ──
    if (action === "dm") {
      const modal = new ModalBuilder()
        .setCustomId(`ludra_static:modal_dm:${teamNumber}`)
        .setTitle(`إرسال رسالة لخاص فريق #${teamNumber}`);

      const input = new TextInputBuilder()
        .setCustomId("dm_content")
        .setLabel("نص الرسالة لأعضاء الفريق")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("اكتب التوجيهات أو الموعد أو التعليمات التي تريد إيصالها لخاص أعضاء فريقك...")
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(1500);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ── Add Player (Step 1: Choose Class from List) ──
    if (action === "add") {
      await interaction.deferReply({ ephemeral: true });

      const countRes = await query(`SELECT COUNT(*)::int AS cnt FROM ludra_static_team_members WHERE team_number = $1`, [teamNumber]);
      if (countRes.rows[0].cnt >= 10) {
        return safeEditReply(
          interaction,
          "⚠️ **الفريق مكتمل بالفعل (10 / 10 لاعبين).**\nيجب استبعاد أو نقل لاعب أولاً لتوفير مكان شاغر."
        );
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`ludra_static:select_class_add:${teamNumber}`)
        .setPlaceholder("اختر كلاس اللاعب المراد إضافته...")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Templar (تمبلر)").setValue("Templar").setEmoji("🛡️"),
          new StringSelectMenuOptionBuilder().setLabel("Gladiator (جلاديتور)").setValue("Gladiator").setEmoji("⚔️"),
          new StringSelectMenuOptionBuilder().setLabel("Cleric (كليريك)").setValue("Cleric").setEmoji("💖"),
          new StringSelectMenuOptionBuilder().setLabel("Chanter (تشانتر)").setValue("Chanter").setEmoji("🎶"),
          new StringSelectMenuOptionBuilder().setLabel("Assassin (أساسن)").setValue("Assassin").setEmoji("🗡️"),
          new StringSelectMenuOptionBuilder().setLabel("Ranger (رينجر)").setValue("Ranger").setEmoji("🏹"),
          new StringSelectMenuOptionBuilder().setLabel("Sorcerer (ساحر)").setValue("Sorcerer").setEmoji("🔥"),
          new StringSelectMenuOptionBuilder().setLabel("Spiritmaster (سبيريت ماستر)").setValue("Spiritmaster").setEmoji("🔮")
        );

      return safeEditReply(interaction, {
        content:
          `🛡️ **إضافة لاعب — فريق #${teamNumber} (الخطوة 1 من 2):**\n\n` +
          `📌 **تنبيه هام:** يشترط أن يكون اللاعب مسجلاً مسبقاً في **نظام تسجيل لودرا** ليتم قبوله في الفريق الثابت.\n` +
          `إذا لم يكن اللاعب مسجلاً بعد، يرجى الطلب منه التسجيل أولاً عبر الرابط:\n` +
          `https://discord.com/channels/861355983975874601/1566867947786473583 (<#1566867947786473583>)\n\n` +
          `الرجاء تحديد **كلاس اللاعب** من القائمة أدناه:`,
        components: [new ActionRowBuilder().addComponents(select)],
      });
    }

    // ── Remove Player (Step 1: Select Player) ──
    if (action === "remove") {
      await interaction.deferReply({ ephemeral: true });

      const membersRes = await query(`
        SELECT * FROM ludra_static_team_members
        WHERE team_number = $1
        ORDER BY slot_index ASC, id ASC
      `, [teamNumber]);

      if (membersRes.rows.length === 0) {
        return safeEditReply(interaction, "⚠️ لا يوجد أعضاء في هذا الفريق لحذفهم.");
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`ludra_static:select_remove:${teamNumber}`)
        .setPlaceholder("اختر اللاعب الذي تريد استبعاده من الفريق...")
        .setMinValues(1)
        .setMaxValues(1);

      membersRes.rows.forEach(m => {
        const normClass = normalizeClassName(m.class_name);
        select.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${m.character_name} (${normClass})`)
            .setValue(m.character_name)
            .setDescription(`Slot #${m.slot_index} ${m.is_leader ? "• القائد" : ""}`)
        );
      });

      return safeEditReply(interaction, {
        content: "🔻 **الرجاء تحديد اللاعب المراد استبعاده من القائمة أدناه:**",
        components: [new ActionRowBuilder().addComponents(select)],
      });
    }
  }

  // ── 2. Select Menu: Chosen Member to Remove -> Open Reason Modal ───────────
  if (action === "select_remove" && interaction.isStringSelectMenu()) {
    const teamNumber = parseInt(param, 10) || 1;
    const chosenChar = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`ludra_static:modal_remove:${teamNumber}:${encodeURIComponent(chosenChar)}`)
      .setTitle(`سبب استبعاد ${chosenChar}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId("removal_reason")
      .setLabel("سبب الاستبعاد (يُرفع لموافقة الإدارة)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("اكتب سبب طلب استبعاد اللاعب بمصداقية؛ سيظهر هذا السبب لإدارة السيرفر في روم اللوج...")
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal);
  }

  // ── 2b. Select Menu: Chosen Class to Add -> Open Name Modal ────────────────
  if (action === "select_class_add" && interaction.isStringSelectMenu()) {
    const teamNumber = parseInt(param, 10) || 1;
    const chosenClass = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`ludra_static:modal_add:${teamNumber}:${chosenClass}`)
      .setTitle(`إضافة لاعب (${chosenClass})`);

    const nameInput = new TextInputBuilder()
      .setCustomId("char_name")
      .setLabel("اسم الشخصية (يشترط التسجيل في لودرا)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("مثال: xN7R (يشترط أن يكون مسجلاً في لودرا)")
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(30);

    const discordInput = new TextInputBuilder()
      .setCustomId("discord_id_input")
      .setLabel("معرف ديسكورد اللاعب (اختياري - يجلب تلقائياً)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("مثال: 140247495832764417 أو @Boo (يجلب تلقائياً إن ترك فارغاً)")
      .setRequired(false)
      .setMaxLength(40);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(discordInput)
    );
    return interaction.showModal(modal);
  }

  // ── 3. Modal Submit: Removal Reason -> Submit to Admin Log ──────────────────
  if (action === "modal_remove" && interaction.isModalSubmit()) {
    const teamNumber = parseInt(param, 10) || 1;
    const targetCharName = decodeURIComponent(extra || "");
    const reason = interaction.fields.getTextInputValue("removal_reason");

    await interaction.deferReply({ ephemeral: true });

    const memberRes = await query(`
      SELECT * FROM ludra_static_team_members
      WHERE team_number = $1 AND character_name = $2
      LIMIT 1
    `, [teamNumber, targetCharName]);

    const targetMember = memberRes.rows[0];
    if (!targetMember) {
      return safeEditReply(interaction, "❌ تعذر العثور على هذا اللاعب في تشكيلة الفريق.");
    }

    const teamRes = await query(`SELECT * FROM ludra_static_teams WHERE team_number = $1 LIMIT 1`, [teamNumber]);
    const team = teamRes.rows[0];

    // Create pending request
    const ins = await query(`
      INSERT INTO ludra_team_removal_requests (
        team_number, requested_by_discord_id, requested_by_name,
        target_discord_id, target_character_name, target_class_name, reason, status, log_channel_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8)
      RETURNING id
    `, [
      teamNumber,
      interaction.user.id,
      interaction.user.username,
      targetMember.discord_id,
      targetMember.character_name,
      targetMember.class_name,
      reason,
      STATIC_LOG_CHANNEL_ID,
    ]);
    const reqId = ins.rows[0].id;

    // Send embed to private admin log channel
    const logChannel =
      interaction.client.channels?.cache?.get(STATIC_LOG_CHANNEL_ID) ||
      (await interaction.client.channels?.fetch?.(STATIC_LOG_CHANNEL_ID).catch(() => null));

    let logMsgId = null;
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle(`📋 طلب استبعاد لاعب — فريق #${teamNumber}`)
        .setDescription(
          `تقدم قائد الفريق بطلب رسمي لاستبعاد لاعب من التشكيلة الثابتة.\n` +
          `يتطلب الطلب موافقة أو استفسار الإدارة لضمان عدم سحب الأعضاء أو التلاعب بالفرق.`
        )
        .addFields(
          { name: "👑 قائد الفريق (مقدم الطلب)", value: `<@${interaction.user.id}> (\`${interaction.user.username}\`)`, inline: true },
          { name: "👤 اللاعب المستهدف", value: `**${targetMember.character_name}** (${targetMember.class_name})\nDiscord: ${targetMember.discord_id ? `<@${targetMember.discord_id}>` : "*غير محدد*"}`, inline: true },
          { name: "🛡️ الفريق", value: `${team?.team_name || `فريق #${teamNumber}`}`, inline: true },
          { name: "📝 سبب الاستبعاد", value: `\`\`\`${reason}\`\`\``, inline: false },
          { name: "📊 الحالة", value: "⏳ **قيد المراجعة الإدارية**", inline: false }
        )
        .setFooter({ text: `طلب رقم #${reqId} • نظام رقابة الفرق الثابتة` })
        .setTimestamp();

      const logRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ludra_static:admin_approve:${reqId}`)
          .setLabel("✅ موافقة على الحذف")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ludra_static:admin_reject:${reqId}`)
          .setLabel("❌ رفض الطلب")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ludra_static:admin_inquire:${reqId}`)
          .setLabel("❓ استفسار")
          .setStyle(ButtonStyle.Secondary)
      );

      const logMsg = await logChannel.send({ embeds: [logEmbed], components: [logRow] });
      logMsgId = logMsg.id;
      await query(`UPDATE ludra_team_removal_requests SET log_message_id = $1 WHERE id = $2`, [logMsgId, reqId]);
    }

    return safeEditReply(interaction, {
      content:
        `⏳ **تم رفع طلب استبعاد اللاعب \`${targetMember.character_name}\` إلى الإدارة للمراجعة.**\n\n` +
        `• سيتم مراجعة السبب من قبل الإدارة في روم المراقبة.\n` +
        `• لن يتم استبعاد اللاعب حتى تصدر الإدارة قرارها لضمان استقرار وتماسك الفرق.\n` +
        `• سيصلك إشعار بالقرار فور اعتماده.\n\n*(تختفي هذه الرسالة تلقائياً بعد 5 دقائق)*`,
    });
  }

  // ── 4. Modal Submit: Add Player ───────────────────────────────────────────
  if (action === "modal_add" && interaction.isModalSubmit()) {
    const teamNumber = parseInt(param, 10) || 1;
    const chosenClass = extra || "Gladiator";
    const charName = interaction.fields.getTextInputValue("char_name").trim();
    const discordRaw = interaction.fields.getTextInputValue("discord_id_input")?.trim() || "";

    await interaction.deferReply({ ephemeral: true });

    const normClass = normalizeClassName(chosenClass);

    // Extract Discord ID if provided as mention or raw digits
    let parsedDiscordId = null;
    const match = discordRaw.match(/\d{17,20}/);
    if (match) parsedDiscordId = match[0];

    // Verify player is registered in Ludra Raid Registration
    let regRes = await query(`
      SELECT * FROM ludra_raid_registrations
      WHERE LOWER(character_name) = LOWER($1)
      LIMIT 1
    `, [charName]);

    // If not found by name and discord id was provided, check by discord_id
    if (regRes.rows.length === 0 && parsedDiscordId) {
      regRes = await query(`
        SELECT * FROM ludra_raid_registrations
        WHERE discord_id = $1
        LIMIT 1
      `, [parsedDiscordId]);
    }

    if (regRes.rows.length === 0) {
      return safeEditReply(interaction, {
        content:
          `❌ **عذراً، اللاعب \`${charName}\` غير مسجل في نظام تسجيل لودرا!**\n\n` +
          `⚠️ **شرط أساسي:** يجب أن يكون اللاعب مسجلاً مسبقاً في نظام تسجيل لودرا لتتمكن من إضافته للفرق الثابتة.\n\n` +
          `🔗 **رابط روم التسجيل:**\n` +
          `يرجى الطلب من اللاعب الدخول والتسجيل أولاً عبر الرابط التالي:\n` +
          `https://discord.com/channels/861355983975874601/1566867947786473583 (<#1566867947786473583>)\n\n` +
          `*(بعد إتمام اللاعب للتسجيل، يمكنك إضافته هنا فوراً وسيتم التحقق وقبوله تلقائياً).*`,
      });
    }

    const regRecord = regRes.rows[0];
    const verifiedCharName = regRecord.character_name || charName;
    const finalDiscordId = parsedDiscordId || regRecord.discord_id || null;

    // Check if player is already in another static team
    const alreadyInTeamRes = await query(`
      SELECT * FROM ludra_static_team_members
      WHERE LOWER(character_name) = LOWER($1)
      LIMIT 1
    `, [verifiedCharName]);

    if (alreadyInTeamRes.rows.length > 0) {
      const existingTeam = alreadyInTeamRes.rows[0];
      return safeEditReply(interaction, {
        content: `⚠️ **اللاعب \`${verifiedCharName}\` مسجل بالفعل في الفريق الثابت #${existingTeam.team_number}!**\nلا يمكن إضافة لاعب لأكثر من فريق ثابت في نفس الوقت.`,
      });
    }

    const teamRes = await query(`SELECT * FROM ludra_static_teams WHERE team_number = $1 LIMIT 1`, [teamNumber]);
    const team = teamRes.rows[0];

    // Find lowest available slot index (1..10)
    const existingSlots = await query(`SELECT slot_index FROM ludra_static_team_members WHERE team_number = $1`, [teamNumber]);
    const usedSlots = new Set(existingSlots.rows.map(r => r.slot_index));
    let nextSlot = 1;
    while (nextSlot <= 10 && usedSlots.has(nextSlot)) nextSlot++;

    if (nextSlot > 10) {
      return safeEditReply(interaction, "⚠️ لا توجد مقاعد شاغرة في هذا الفريق (الحد الأقصى 10).");
    }

    await query(`
      INSERT INTO ludra_static_team_members (team_number, discord_id, character_name, class_name, is_leader, slot_index, combat_power, added_by)
      VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7)
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        slot_index = EXCLUDED.slot_index,
        combat_power = EXCLUDED.combat_power
    `, [teamNumber, finalDiscordId, verifiedCharName, normClass, nextSlot, regRecord.combat_power || null, interaction.user.id]);

    // Update Live Embed in Static Teams channel
    await deployOrUpdateTeamEmbed(interaction.client, teamNumber).catch(console.error);

    // Log addition in Log Channel
    const logChannel =
      interaction.client.channels?.cache?.get(STATIC_LOG_CHANNEL_ID) ||
      (await interaction.client.channels?.fetch?.(STATIC_LOG_CHANNEL_ID).catch(() => null));

    if (logChannel) {
      const addLogEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`📥 إضافة لاعب جديد — فريق #${teamNumber}`)
        .setDescription(
          `قام <@${interaction.user.id}> بإضافة لاعب جديد إلى التشكيلة الثابتة بعد التحقق من تسجيله في نظام لودرا.\n` +
          `• **اللاعب:** \`${verifiedCharName}\` (${CLASS_EMOJIS[normClass] || "🔹"} ${normClass})\n` +
          `• **الديسكورد:** ${finalDiscordId ? `<@${finalDiscordId}>` : "*غير محدد*"}\n` +
          `• **القوة (CP):** \`${regRecord.combat_power ? regRecord.combat_power.toLocaleString() : "غير محدد"}\`\n` +
          `• **المقعد:** Slot #${nextSlot}\n` +
          `• **بواسطة:** <@${interaction.user.id}>`
        )
        .setTimestamp();
      await logChannel.send({ embeds: [addLogEmbed] }).catch(() => {});
    }

    const cpText = regRecord.combat_power ? ` • CP: **${regRecord.combat_power.toLocaleString()}**` : "";
    return safeEditReply(
      interaction,
      `✅ **تم التحقق بنجاح من تسجيل اللاعب في نظام لودرا!**\n` +
      `• **اللاعب:** \`${verifiedCharName}\` (${CLASS_EMOJIS[normClass] || "🔹"} ${normClass})${cpText}\n` +
      `• **الديسكورد:** ${finalDiscordId ? `<@${finalDiscordId}>` : "*غير محدد*"}\n` +
      `• **المقعد:** Slot #${nextSlot}\n\n` +
      `🎉 تمت إضافة اللاعب إلى التشكيلة وتحديث بطاقة الفريق في الروم بنجاح!\n*(تختفي هذه الرسالة تلقائياً بعد 5 دقائق)*`
    );
  }

  // ── 5. Modal Submit: DM Broadcast to Team Members ──────────────────────────
  if (action === "modal_dm" && interaction.isModalSubmit()) {
    const teamNumber = parseInt(param, 10) || 1;
    const dmContent = interaction.fields.getTextInputValue("dm_content");

    await interaction.deferReply({ ephemeral: true });

    const team = await getCachedTeam(teamNumber);

    const membersRes = await query(`
      SELECT discord_id, character_name FROM ludra_static_team_members
      WHERE team_number = $1 AND discord_id IS NOT NULL
    `, [teamNumber]);

    const dmEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📨 رسالة من قائد فريقك (${team?.team_name || `فريق #${teamNumber}`})`)
      .setDescription(
        `وجه إليك قائد الفريق (<@${interaction.user.id}>) الرسالة التالية:\n\n` +
        `\`\`\`\n${dmContent}\n\`\`\``
      )
      .setFooter({ text: "تحالف M3RGEEN • تنبيهات الفرق الثابتة" })
      .setTimestamp();

    const results = await Promise.allSettled(
      membersRes.rows.map(async (m) => {
        const user = await interaction.client.users.fetch(m.discord_id).catch(() => null);
        if (!user) throw new Error("User not found");
        return await user.send({ embeds: [dmEmbed] });
      })
    );

    const delivered = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return safeEditReply(interaction, {
      content:
        `✅ **تم إرسال الرسالة بنجاح إلى الخاص!**\n` +
        `• **تم التوصيل بنجاح:** \`${delivered}\` عضواً\n` +
        (failed > 0 ? `• **تعذر التوصيل:** \`${failed}\` (بسبب إغلاق الخاص DMs لديهم)\n` : "") +
        `\n*(تختفي هذه الرسالة تلقائياً بعد 5 دقائق)*`,
    });
  }

  // ── 6. Admin Actions (In Log Channel) ───────────────────────────────────────
  if (action === "admin_approve" || action === "admin_reject" || action === "admin_inquire") {
    // Check Admin permissions
    if (
      !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return safeReply(interaction, "❌ هذه الإجراءات مخصصة لإدارة السيرفر فقط.");
    }

    const reqId = parseInt(param, 10);
    const reqRes = await query(`SELECT * FROM ludra_team_removal_requests WHERE id = $1 LIMIT 1`, [reqId]);
    const req = reqRes.rows[0];
    if (!req) return safeReply(interaction, "❌ تعذر العثور على هذا الطلب.");

    if (req.status !== "PENDING" && action !== "admin_inquire") {
      return safeReply(interaction, `ℹ️ تم البت في هذا الطلب مسبقاً (الحالة: ${req.status}).`);
    }

    // ── Admin Approve ──
    if (action === "admin_approve") {
      await interaction.deferReply({ ephemeral: true });

      await query(`UPDATE ludra_team_removal_requests SET status = 'APPROVED', reviewed_by_discord_id = $1, reviewed_at = NOW() WHERE id = $2`, [
        interaction.user.id,
        reqId,
      ]);

      // Remove player from team members
      await query(`
        DELETE FROM ludra_static_team_members
        WHERE team_number = $1 AND character_name = $2
      `, [req.team_number, req.target_character_name]);

      // Re-render and update the Team Embed in channel
      await deployOrUpdateTeamEmbed(interaction.client, req.team_number).catch(console.error);

      // Update Log Embed
      if (interaction.message) {
        const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x2ecc71)
          .spliceFields(4, 1, {
            name: "📊 الحالة والقرار",
            value: `✅ **تمت الموافقة على الاستبعاد بواسطة** <@${interaction.user.id}>\n*تم استبعاد اللاعب وتحديث بطاقة الفريق تلقائياً.*`,
            inline: false,
          });

        await interaction.message.edit({ embeds: [oldEmbed], components: [] }).catch(() => {});
      }

      // Notify Leader via DM
      try {
        const leaderUser = await interaction.client.users.fetch(req.requested_by_discord_id).catch(() => null);
        if (leaderUser) {
          await leaderUser.send({
            content: `✅ **إشعار إداري:** تمت الموافقة على استبعاد اللاعب \`${req.target_character_name}\` من فريقك الثابت (#${req.team_number}) وتحديث بطاقة الفريق.`,
          });
        }
      } catch (_) {}

      return safeEditReply(interaction, `✅ **تمت الموافقة بنجاح واستبعاد اللاعب \`${req.target_character_name}\` وتحديث الإمبد.**`);
    }

    // ── Admin Reject ──
    if (action === "admin_reject") {
      await interaction.deferReply({ ephemeral: true });

      await query(`UPDATE ludra_team_removal_requests SET status = 'REJECTED', reviewed_by_discord_id = $1, reviewed_at = NOW() WHERE id = $2`, [
        interaction.user.id,
        reqId,
      ]);

      if (interaction.message) {
        const oldEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0xe74c3c)
          .spliceFields(4, 1, {
            name: "📊 الحالة والقرار",
            value: `❌ **تم رفض طلب الاستبعاد بواسطة** <@${interaction.user.id}>\n*يبقى اللاعب في الفريق دون تغيير.*`,
            inline: false,
          });

        await interaction.message.edit({ embeds: [oldEmbed], components: [] }).catch(() => {});
      }

      // Notify Leader via DM
      try {
        const leaderUser = await interaction.client.users.fetch(req.requested_by_discord_id).catch(() => null);
        if (leaderUser) {
          await leaderUser.send({
            content: `❌ **إشعار إداري:** تم رفض طلب استبعاد اللاعب \`${req.target_character_name}\` من فريقك (#${req.team_number}). يرجى التواصل مع الإدارة للمزيد من التفاصيل.`,
          });
        }
      } catch (_) {}

      return safeEditReply(interaction, `❌ **تم رفض طلب الاستبعاد وإبقاء اللاعب في الفريق.**`);
    }

    // ── Admin Inquire (Choose Leader or Member) ──
    if (action === "admin_inquire") {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`ludra_static:select_inquire:${reqId}`)
        .setPlaceholder("اختر من تريد إرسال الاستفسار إليه...")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`القائد: @${req.requested_by_name}`)
            .setValue(`LEADER:${req.requested_by_discord_id}`)
            .setDescription("إرسال استفسار خاص إلى قائد الفريق في الخاص"),
          new StringSelectMenuOptionBuilder()
            .setLabel(`اللاعب: ${req.target_character_name}`)
            .setValue(`MEMBER:${req.target_discord_id || "NONE"}`)
            .setDescription("إرسال استفسار خاص إلى اللاعب المستهدف في الخاص")
        );

      return safeReply(interaction, {
        content: "❓ **من هو الطرف الذي تريد توجيه الاستفسار إليه؟**",
        components: [new ActionRowBuilder().addComponents(select)],
      });
    }
  }

  // ── 7. Select Inquire Target -> Open Inquiry Question Modal ────────────────
  if (action === "select_inquire" && interaction.isStringSelectMenu()) {
    const reqId = parseInt(param, 10);
    const chosenVal = interaction.values[0]; // e.g. "LEADER:140247..."
    const [targetType, targetId] = chosenVal.split(":");

    if (targetType === "MEMBER" && (!targetId || targetId === "NONE")) {
      return safeReply(interaction, "⚠️ هذا اللاعب ليس لديه معرف ديسكورد مسجل لإرسال رسالة له في الخاص.");
    }

    const modal = new ModalBuilder()
      .setCustomId(`ludra_static:modal_inquire:${reqId}:${targetType}:${targetId}`)
      .setTitle("نص الاستفسار الإداري");

    const qInput = new TextInputBuilder()
      .setCustomId("inquiry_question")
      .setLabel("اكتب السؤال أو التوضيح المطلوب منه")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("اكتب استفسارك هنا؛ سيصله السؤال في الخاص ومعه زر مباشر للرد عليك...")
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(qInput));
    return interaction.showModal(modal);
  }

  // ── 8. Modal Submit: Send Inquiry Question via DM Bridge ───────────────────
  if (action === "modal_inquire" && interaction.isModalSubmit()) {
    const reqId = parseInt(param, 10);
    const targetType = extra;
    const targetId = parts[4];
    const question = interaction.fields.getTextInputValue("inquiry_question");

    await interaction.deferReply({ ephemeral: true });

    const reqRes = await query(`SELECT * FROM ludra_team_removal_requests WHERE id = $1 LIMIT 1`, [reqId]);
    const req = reqRes.rows[0];
    if (!req) return safeEditReply(interaction, "❌ تعذر العثور على الطلب.");

    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      return safeEditReply(interaction, "❌ تعذر الوصول لحساب الديسكورد للطرف المستهدف.");
    }

    const dmEmbed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle("❓ استفسار إداري بخصوص فريق Ludra الثابت")
      .setDescription(
        `السلام عليكم،\n\nوجهت إليك إدارة السيرفر الاستفسار التالي بخصوص طلب الاستبعاد الخاص بفريق #${req.team_number}:\n\n` +
        `**السؤال:**\n> "${question}"\n\n` +
        `يرجى الضغط على الزر أدناه للرد والتوضيح للإدارة مباشرة.`
      )
      .setFooter({ text: "تحالف M3RGEEN • استفسارات الإدارة" })
      .setTimestamp();

    const dmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ludra_static:inquiry_reply:${reqId}`)
        .setLabel("💬 الرد على الإدارة")
        .setStyle(ButtonStyle.Primary)
    );

    try {
      await targetUser.send({ embeds: [dmEmbed], components: [dmRow] });
    } catch (err) {
      return safeEditReply(interaction, "❌ تعذر إرسال الرسالة إلى خاص المستخدم (الخاص لديه مغلق DMs closed).");
    }

    // Record in DB and update Log message
    await query(`
      UPDATE ludra_team_removal_requests
      SET inquiry_question = $1, inquiry_target_id = $2, inquiry_target_type = $3
      WHERE id = $4
    `, [question, targetId, targetType, reqId]);

    const logChannel =
      interaction.client.channels?.cache?.get(STATIC_LOG_CHANNEL_ID) ||
      (await interaction.client.channels?.fetch?.(STATIC_LOG_CHANNEL_ID).catch(() => null));

    if (logChannel && req.log_message_id) {
      const logMsg = await logChannel.messages.fetch(req.log_message_id).catch(() => null);
      if (logMsg) {
        const updatedEmbed = EmbedBuilder.from(logMsg.embeds[0]).addFields({
          name: `❓ استفسار مرسل إلى ${targetType === "LEADER" ? "القائد" : "اللاعب"} (<@${targetId}>)`,
          value: `"${question}"\n*(بانتظار رده عبر البوت)*`,
          inline: false,
        });
        await logMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
      }
    }

    return safeEditReply(interaction, `✅ **تم إرسال الاستفسار بنجاح إلى خاص <@${targetId}>.**`);
  }

  // ── 9. Member Clicks "💬 الرد على الإدارة" in DM ───────────────────────────
  if (action === "inquiry_reply") {
    const reqId = parseInt(param, 10);
    const modal = new ModalBuilder()
      .setCustomId(`ludra_static:modal_reply:${reqId}`)
      .setTitle("الرد والتوضيح لإدارة السيرفر");

    const replyInput = new TextInputBuilder()
      .setCustomId("inquiry_answer")
      .setLabel("اكتب توضيحك وردك هنا")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("اكتب ردك الواضح على استفسار الإدارة ليتم إرساله لروم المراجعة الإدارية...")
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
    return interaction.showModal(modal);
  }

  // ── 10. Modal Submit: Member Reply -> Post into Log Channel ────────────────
  if (action === "modal_reply" && interaction.isModalSubmit()) {
    const reqId = parseInt(param, 10);
    const answer = interaction.fields.getTextInputValue("inquiry_answer");

    await interaction.deferReply({ ephemeral: true });

    const reqRes = await query(`SELECT * FROM ludra_team_removal_requests WHERE id = $1 LIMIT 1`, [reqId]);
    const req = reqRes.rows[0];
    if (!req) return safeEditReply(interaction, "❌ تعذر العثور على بيانات هذا الطلب.");

    await query(`UPDATE ludra_team_removal_requests SET inquiry_answer = $1 WHERE id = $2`, [answer, reqId]);

    const logChannel =
      interaction.client.channels?.cache?.get(STATIC_LOG_CHANNEL_ID) ||
      (await interaction.client.channels?.fetch?.(STATIC_LOG_CHANNEL_ID).catch(() => null));

    if (logChannel && req.log_message_id) {
      const logMsg = await logChannel.messages.fetch(req.log_message_id).catch(() => null);
      if (logMsg) {
        const updatedEmbed = EmbedBuilder.from(logMsg.embeds[0]).addFields({
          name: `💬 رد <@${interaction.user.id}> على الاستفسار:`,
          value: `\`\`\`\n${answer}\n\`\`\``,
          inline: false,
        });
        await logMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
      }
    }

    return safeEditReply(interaction, "✅ **تم استلام ردك وإرساله إلى إدارة السيرفر بنجاح. شكراً لك!**");
  }
}

/**
 * Handles Ludra Player Intent Survey Interactions (Choice: Normal 2800 vs Hard 3000)
 */
export async function handleLudraSurveyInteraction(interaction) {
  const customId = interaction.customId || "";
  const parts = customId.split(":");
  const choice = parts[2]; // 'NORMAL_2800' or 'HARD_3000'

  await interaction.deferReply({ ephemeral: true });

  const label =
    choice === "NORMAL_2800"
      ? "بكمل معكم لودرا نورمال حتى النيرف"
      : "بلعب لودرا هارد، طلعوني من التشكيلة";

  // Check character name from ludra_raid_registrations or ludra_static_team_members
  const regRes = await query(
    `SELECT character_name FROM ludra_raid_registrations WHERE discord_id = $1 LIMIT 1`,
    [interaction.user.id]
  );
  let charName = regRes.rows[0]?.character_name || null;
  if (!charName) {
    const memRes = await query(
      `SELECT character_name FROM ludra_static_team_members WHERE discord_id = $1 LIMIT 1`,
      [interaction.user.id]
    );
    charName = memRes.rows[0]?.character_name || null;
  }

  // Ensure table exists
  await query(`
    CREATE TABLE IF NOT EXISTS ludra_player_intent_survey (
      id SERIAL PRIMARY KEY,
      discord_id TEXT UNIQUE NOT NULL,
      character_name TEXT,
      choice TEXT NOT NULL,
      choice_label TEXT NOT NULL,
      channel_type TEXT,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await query(`
    INSERT INTO ludra_player_intent_survey (discord_id, character_name, choice, choice_label, channel_type, submitted_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (discord_id) DO UPDATE SET
      character_name = COALESCE(EXCLUDED.character_name, ludra_player_intent_survey.character_name),
      choice = EXCLUDED.choice,
      choice_label = EXCLUDED.choice_label,
      channel_type = EXCLUDED.channel_type,
      updated_at = NOW();
  `, [
    interaction.user.id,
    charName,
    choice,
    label,
    interaction.channel?.type === 1 ? "DM" : "GUILD_CHANNEL"
  ]);

  if (choice === "NORMAL_2800") {
    return safeEditReply(
      interaction,
      `✅ **تم تسجيل اختيارك بنجاح!**\n` +
      `• **التوجه المختار:** \`بكمل معكم لودرا نورمال حتى النيرف\` 🛡️\n` +
      `سعداء بوجودك ومشاركتك معنا بالفرق الثابتة لحين نزول نيرف الريد.`
    );
  } else {
    // ── Choice is HARD_3000 -> Auto-vacate static team slot ──────────────────
    const teamMemberships = await query(
      `SELECT * FROM ludra_static_team_members WHERE discord_id = $1`,
      [interaction.user.id]
    );

    const vacatedTeams = [];

    if (teamMemberships.rows.length > 0) {
      for (const mem of teamMemberships.rows) {
        // Delete member row to free the slot
        await query(`DELETE FROM ludra_static_team_members WHERE id = $1`, [mem.id]);
        invalidateTeamCache(mem.team_number);

        const neededRole = getVacantSlotLabel(mem.team_number, mem.slot_index);
        vacatedTeams.push({
          teamNumber: mem.team_number,
          slotIndex: mem.slot_index,
          characterName: mem.character_name,
          className: mem.class_name,
          neededRole,
        });

        // Auto-update team card in static teams channel
        try {
          await deployOrUpdateTeamEmbed(interaction.client, mem.team_number);
        } catch (updateErr) {
          console.error(`[LudraSurvey] Failed to auto-update team #${mem.team_number} embed:`, updateErr);
        }

        // Post audit log to log channel
        try {
          const logChannel =
            interaction.client.channels?.cache?.get(STATIC_LOG_CHANNEL_ID) ||
            (await interaction.client.channels?.fetch?.(STATIC_LOG_CHANNEL_ID).catch(() => null));

          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("🔻 استبعاد لاعب وتفريغ مقعد تلقائياً (استبيان الهارد)")
              .setDescription(
                `اختار اللاعب <@${interaction.user.id}> (\`${mem.character_name}\`) خيار **الهارد 3000+**، وتم تفريغ مقعده تلقائياً في الفريق الثابت:\n\n` +
                `• **الفريق:** فريق #${mem.team_number}\n` +
                `• **المقعد المفرغ:** Slot #${mem.slot_index}\n` +
                `• **الكلاس السابق:** \`${mem.class_name}\`\n` +
                `• **حالة المقعد الآن:** ▫️ *شاغر - ${neededRole}*\n` +
                `• **التحديث:** تم تحديث بطاقة الفريق مباشرة في الروم المعتمد.`
              )
              .setFooter({ text: "تحالف M3RGEEN • سجل تحديثات الفرق الثابتة" })
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }
        } catch (logErr) {
          console.error("[LudraSurvey] Failed to send audit log:", logErr);
        }
      }
    }

    let extraNote = "";
    if (vacatedTeams.length > 0) {
      const details = vacatedTeams.map(v => `فريق #${v.teamNumber} (مقعد #${v.slotIndex} — ${v.neededRole})`).join("، ");
      extraNote = `\n\n📌 **تم تفريغ مقعدك تلقائياً في:** ${details} لتوفير مكان لبديل، وتحديث بطاقة الفريق في الروم.`;
    }

    return safeEditReply(
      interaction,
      `✅ **تم تسجيل اختيارك بنجاح!**\n` +
      `• **التوجه المختار:** \`بلعب لودرا هارد، طلعوني من التشكيلة\` ⚔️${extraNote}\n\n` +
      `نتمنى لك كامل التوفيق في محاولات الهارد!`
    );
  }
}
