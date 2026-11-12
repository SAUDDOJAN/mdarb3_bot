import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from "discord.js";
import { pool, query } from "../../database/index.js";
import { getCurrentMonthlyCycle } from "./utils/timeCycles.js";
import { insertLedgerRow } from "./db/ledgerRepository.js";
import { setLeaderboardDirty } from "./leaderboard/render.js";

export const LFG_CONTROL_PANEL_CHANNEL_ID = "1548358065945059428"; // ⚔️┊ʟꜰɢ・ابحث-عن-دنجن
export const OPEN_DUNGEONS_CHANNEL_ID = "1548359577307717683";     // 📅┊ᴇᴠᴇɴᴛꜱ・الدنجنات-المفتوحة
export const VOICE_CATEGORY_ID = "1552456426885087284";            // 🎙️︱Team Voice・رومات الفرق
export const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";

// ── In-Memory Tracking for Active Instant Voice Channels ──
// Map<voiceChannelId, { groupId, eventsMsgId, capacity, actKey, modeKey, creatorId, previousVoiceChannelId, participants: Set<string>, emptyTimer: NodeJS.Timeout | null }>
export const activeDungeonRooms = new Map();

export const DUNGEON_ACTIVITIES = {
  // --- EXPEDITIONS (5 Players) ---
  Fire_Temple: {
    nameAr: "فاير تمبل",
    typeAr: "إكسبدشن",
    type: "DUNGEON",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      EXPLORATION:     { labelAr: "اكسبلوريشن", roomSuffix: "اكسبلوريشن", minILvl: 500 },
      CONQUEST_NORMAL: { labelAr: "كونكوست نورمال", roomSuffix: "نورمال", minILvl: 1400 },
      CONQUEST_HARD:   { labelAr: "كونكوست هارد", roomSuffix: "هارد", minILvl: 2100 },
    },
  },
  Krao: {
    nameAr: "كراو كيف",
    typeAr: "إكسبدشن",
    type: "DUNGEON",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      EXPLORATION:     { labelAr: "اكسبلوريشن", roomSuffix: "اكسبلوريشن", minILvl: 200 },
      CONQUEST_NORMAL: { labelAr: "كونكوست نورمال", roomSuffix: "نورمال", minILvl: 500 },
      CONQUEST_HARD:   { labelAr: "كونكوست هارد", roomSuffix: "هارد", minILvl: 700 },
    },
  },
  Draupnir: {
    nameAr: "دراوبنير",
    typeAr: "إكسبدشن",
    type: "DUNGEON",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      EXPLORATION:     { labelAr: "اكسبلوريشن", roomSuffix: "اكسبلوريشن", minILvl: 700 },
      CONQUEST_NORMAL: { labelAr: "كونكوست نورمال", roomSuffix: "نورمال", minILvl: 700 },
      CONQUEST_HARD:   { labelAr: "كونكوست هارد", roomSuffix: "هارد", minILvl: 1000 },
    },
  },
  Urugugu: {
    nameAr: "اوروغوغو",
    typeAr: "إكسبدشن",
    type: "DUNGEON",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      EXPLORATION:     { labelAr: "اكسبلوريشن", roomSuffix: "اكسبلوريشن", minILvl: 300 },
      CONQUEST_NORMAL: { labelAr: "كونكوست نورمال", roomSuffix: "نورمال", minILvl: 1000 },
      CONQUEST_HARD:   { labelAr: "كونكوست هارد", roomSuffix: "هارد", minILvl: 1400 },
    },
  },
  Vakron: {
    nameAr: "فاكرون ايلاند",
    typeAr: "إكسبدشن",
    type: "DUNGEON",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      EXPLORATION:     { labelAr: "اكسبلوريشن", roomSuffix: "اكسبلوريشن", minILvl: 1400 },
      CONQUEST_NORMAL: { labelAr: "كونكوست نورمال", roomSuffix: "نورمال", minILvl: 1400 },
      CONQUEST_HARD:   { labelAr: "كونكوست هارد", roomSuffix: "هارد", minILvl: 1700 },
    },
  },
  Ferocious_Horn_Den: {
    nameAr: "فيروشس هورن",
    typeAr: "إكسبدشن",
    type: "DUNGEON",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      EXPLORATION:     { labelAr: "اكسبلوريشن", roomSuffix: "اكسبلوريشن", minILvl: 2100 },
      CONQUEST_NORMAL: { labelAr: "كونكوست نورمال", roomSuffix: "نورمال", minILvl: 2100 },
      CONQUEST_HARD:   { labelAr: "كونكوست هارد", roomSuffix: "هارد", minILvl: 2400 },
    },
  },

  // --- TRANSCENDENCE (5 Players) ---
  Shattered_Arkanis: {
    nameAr: "ترانسندنس اركنس",
    typeAr: "ترانسندنس",
    type: "TRANSCENDENCE",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      STAGE_1: { labelAr: "مرحلة 1", roomSuffix: "مرحلة 1", minILvl: 1600 },
      STAGE_2: { labelAr: "مرحلة 2", roomSuffix: "مرحلة 2", minILvl: 1900 },
      STAGE_3: { labelAr: "مرحلة 3", roomSuffix: "مرحلة 3", minILvl: 2200 },
      STAGE_4: { labelAr: "مرحلة 4", roomSuffix: "مرحلة 4", minILvl: 2500 },
    },
  },
  Deus_Research_Base: {
    nameAr: "ترانسندنس ديوس",
    typeAr: "ترانسندنس",
    type: "TRANSCENDENCE",
    capacity: 5,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      STAGE_1: { labelAr: "مرحلة 1", roomSuffix: "مرحلة 1", minILvl: 1600 },
      STAGE_2: { labelAr: "مرحلة 2", roomSuffix: "مرحلة 2", minILvl: 1900 },
      STAGE_3: { labelAr: "مرحلة 3", roomSuffix: "مرحلة 3", minILvl: 2200 },
      STAGE_4: { labelAr: "مرحلة 4", roomSuffix: "مرحلة 4", minILvl: 2500 },
    },
  },

  // --- SANCTUARY (10 Players) ---
  Sanctuary: {
    nameAr: "سانكشوري",
    typeAr: "ريد سانكشوري",
    type: "SANCTUARY",
    capacity: 10,
    basePoints: 30,
    creatorBonus: 6,
    modes: {
      NORMAL: { labelAr: "10 لاعبين", roomSuffix: "", minILvl: null },
    },
  },

  // --- ABYSS (20 Players) ---
  Abyss: {
    nameAr: "ابيس",
    typeAr: "ابيس",
    type: "ABYSS",
    capacity: 20,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      NORMAL: { labelAr: "فارم وريفيل", roomSuffix: "", minILvl: null },
    },
  },

  // --- WORLD BOSS (20 Players) ---
  World_Boss: {
    nameAr: "زعماء العالم",
    typeAr: "زعماء العالم",
    type: "WORLD_BOSS",
    capacity: 20,
    basePoints: 10,
    creatorBonus: 2,
    modes: {
      NORMAL: { labelAr: "غارة عالمية", roomSuffix: "", minILvl: null },
    },
  },
};

/**
 * Builds the Main Instant Dungeon Voice Control Panel Payload
 */
export function buildControlPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x9A67D2)
    .setTitle("🎮 نظام رومات الدنجنات الفورية | AION 2 Voice Rooms")
    .setDescription([
      "**مرحباً بكم في منظومة تشكيل الفرق الفورية لتحالف M3RGEEN!**",
      "اختر النشاط الذي ترغب في خوضه، وسيقوم البوت بإنشاء روم صوتي فوري ومفتوح للجميع مباشرة.",
      "",
      "🛡️ **الأنشطة المتاحة:**",
      "• **🗡️ إكسبدشن (5 لاعبين):** فاير تمبل، كراو كيف، دراوبنير، اوروغوغو، فاكرون ايلاند، فيروشس هورن *(اكسبلوريشن، نورمال، هارد)*.",
      "• **✨ ترانسندنس (5 لاعبين):** ترانسندنس اركنس، ترانسندنس ديوس *(المراحل 1 إلى 4)*.",
      "• **⛩️ سانكشوري (10 لاعبين):** غارة الـ 10 لاعبين (فريقين متكاملين).",
      "• **⚔️ ابيس:** رومات فارم ونقاط وريفيل في الابيس.",
      "• **👹 زعماء العالم:** مواجهة بوسات العالم المفتوح.",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "📢 **طريقة الاستخدام:**",
      "1️⃣ اضغط على نوع النشاط بالأسفل واختر الدنجن والصعوبة المطلوبة.",
      `2️⃣ يُنشأ الروم الصوتي فوراً، وتُنشر بطاقة بالرابط المباشر في <#${OPEN_DUNGEONS_CHANNEL_ID}>.`,
      "3️⃣ الروم مفتوح للجميع بدون قيود، ويُحذف تلقائياً عند فراغه من اللاعبين.",
      "🏆 **يتم توثيق نقاط النشاط لجميع المتواجدين بالصوت عند الضغط على زر إنهاء الدنجن!**",
    ].join("\n"))
    .setFooter({ text: "تحالف M3RGEEN • رومات الدنجنات الفورية" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aion2_lfg_v_dungeons")
      .setLabel("إكسبدشن (5P)")
      .setEmoji("🗡️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("aion2_lfg_v_transcendence")
      .setLabel("ترانسندنس (5P)")
      .setEmoji("✨")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("aion2_lfg_v_sanctuary")
      .setLabel("سانكشوري (10P)")
      .setEmoji("⛩️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("aion2_lfg_v_abyss")
      .setLabel("ابيس")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("aion2_lfg_v_world_boss")
      .setLabel("زعماء العالم")
      .setEmoji("👹")
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Automatically schedule deletion of ephemeral replies after 5 minutes
 */
function scheduleEphemeralDismiss(interaction, delayMs = 5 * 60 * 1000) {
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, delayMs);
}

/**
 * Handles interactions originating from the Control Panel or Active Cards
 */
export async function handleInstantVoiceInteraction(interaction) {
  const cid = interaction.customId;

  // 1. Expeditions Menu (18 options: 6 dungeons x [اكسبلوريشن, نورمال, هارد])
  if (cid === "aion2_lfg_v_dungeons") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("aion2_lfg_v_sel_dungeon")
      .setPlaceholder("اختر دنجن الإكسبدشن والصعوبة...")
      .addOptions([
        { label: "فاير تمبل [اكسبلوريشن]", value: "Fire_Temple_EXPLORATION", description: "Exploration • 500 iLvl", emoji: "🔥" },
        { label: "فاير تمبل [نورمال]", value: "Fire_Temple_CONQUEST_NORMAL", description: "Conquest Normal • 1400 iLvl", emoji: "⚔️" },
        { label: "فاير تمبل [هارد]", value: "Fire_Temple_CONQUEST_HARD", description: "Conquest Hard • 2100 iLvl", emoji: "💀" },

        { label: "كراو كيف [اكسبلوريشن]", value: "Krao_EXPLORATION", description: "Exploration • 200 iLvl", emoji: "🦇" },
        { label: "كراو كيف [نورمال]", value: "Krao_CONQUEST_NORMAL", description: "Conquest Normal • 500 iLvl", emoji: "⚔️" },
        { label: "كراو كيف [هارد]", value: "Krao_CONQUEST_HARD", description: "Conquest Hard • 700 iLvl", emoji: "💀" },

        { label: "دراوبنير [اكسبلوريشن]", value: "Draupnir_EXPLORATION", description: "Exploration • 700 iLvl", emoji: "🏛️" },
        { label: "دراوبنير [نورمال]", value: "Draupnir_CONQUEST_NORMAL", description: "Conquest Normal • 700 iLvl", emoji: "⚔️" },
        { label: "دراوبنير [هارد]", value: "Draupnir_CONQUEST_HARD", description: "Conquest Hard • 1000 iLvl", emoji: "💀" },

        { label: "اوروغوغو [اكسبلوريشن]", value: "Urugugu_EXPLORATION", description: "Exploration • 300 iLvl", emoji: "🗿" },
        { label: "اوروغوغو [نورمال]", value: "Urugugu_CONQUEST_NORMAL", description: "Conquest Normal • 1000 iLvl", emoji: "⚔️" },
        { label: "اوروغوغو [هارد]", value: "Urugugu_CONQUEST_HARD", description: "Conquest Hard • 1400 iLvl", emoji: "💀" },

        { label: "فاكرون ايلاند [اكسبلوريشن]", value: "Vakron_EXPLORATION", description: "Exploration • 1400 iLvl", emoji: "🏝️" },
        { label: "فاكرون ايلاند [نورمال]", value: "Vakron_CONQUEST_NORMAL", description: "Conquest Normal • 1400 iLvl", emoji: "⚔️" },
        { label: "فاكرون ايلاند [هارد]", value: "Vakron_CONQUEST_HARD", description: "Conquest Hard • 1700 iLvl", emoji: "💀" },

        { label: "فيروشس هورن [اكسبلوريشن]", value: "Ferocious_Horn_Den_EXPLORATION", description: "Exploration • 2100 iLvl", emoji: "🦏" },
        { label: "فيروشس هورن [نورمال]", value: "Ferocious_Horn_Den_CONQUEST_NORMAL", description: "Conquest Normal • 2100 iLvl", emoji: "⚔️" },
        { label: "فيروشس هورن [هارد]", value: "Ferocious_Horn_Den_CONQUEST_HARD", description: "Conquest Hard • 2400 iLvl", emoji: "💀" },
      ]);

    await interaction.reply({
      content: "🗡️ **اختر دنجن الإكسبدشن والصعوبة المطلوبة:**",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
    return scheduleEphemeralDismiss(interaction);
  }

  // 2. Transcendence Menu
  if (cid === "aion2_lfg_v_transcendence") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("aion2_lfg_v_sel_trans")
      .setPlaceholder("اختر دنجن ترانسندنس والمرحلة...")
      .addOptions([
        { label: "ترانسندنس اركنس [مرحلة 1]", value: "Shattered_Arkanis_STAGE_1", description: "Stage 1 • 1600 iLvl", emoji: "🔮" },
        { label: "ترانسندنس اركنس [مرحلة 2]", value: "Shattered_Arkanis_STAGE_2", description: "Stage 2 • 1900 iLvl", emoji: "🔮" },
        { label: "ترانسندنس اركنس [مرحلة 3]", value: "Shattered_Arkanis_STAGE_3", description: "Stage 3 • 2200 iLvl", emoji: "🔮" },
        { label: "ترانسندنس اركنس [مرحلة 4]", value: "Shattered_Arkanis_STAGE_4", description: "Stage 4 • 2500 iLvl", emoji: "🔮" },
        { label: "ترانسندنس ديوس [مرحلة 1]", value: "Deus_Research_Base_STAGE_1", description: "Stage 1 • 1600 iLvl", emoji: "🏛️" },
        { label: "ترانسندنس ديوس [مرحلة 2]", value: "Deus_Research_Base_STAGE_2", description: "Stage 2 • 1900 iLvl", emoji: "🏛️" },
        { label: "ترانسندنس ديوس [مرحلة 3]", value: "Deus_Research_Base_STAGE_3", description: "Stage 3 • 2200 iLvl", emoji: "🏛️" },
        { label: "ترانسندنس ديوس [مرحلة 4]", value: "Deus_Research_Base_STAGE_4", description: "Stage 4 • 2500 iLvl", emoji: "🏛️" },
      ]);

    await interaction.reply({
      content: "✨ **اختر دنجن ترانسندنس والمرحلة المطلوبة:**",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
    return scheduleEphemeralDismiss(interaction);
  }

  // 3. Sanctuary Confirm Button
  if (cid === "aion2_lfg_v_sanctuary") {
    const btn = new ButtonBuilder()
      .setCustomId("aion2_lfg_v_create_Sanctuary_NORMAL")
      .setLabel("تأكيد إنشاء روم سانكشوري (10 لاعبين)")
      .setEmoji("⛩️")
      .setStyle(ButtonStyle.Success);

    await interaction.reply({
      content: "⛩️ **هل ترغب في إنشاء روم صوتي لغارة سانكشوري (10 لاعبين)؟**",
      components: [new ActionRowBuilder().addComponents(btn)],
      ephemeral: true,
    });
    return scheduleEphemeralDismiss(interaction);
  }

  // 4. Abyss Confirm Button
  if (cid === "aion2_lfg_v_abyss") {
    const btn = new ButtonBuilder()
      .setCustomId("aion2_lfg_v_create_Abyss_NORMAL")
      .setLabel("تأكيد إنشاء روم ابيس (فارم وريفيل)")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Danger);

    await interaction.reply({
      content: "⚔️ **هل ترغب في إنشاء روم صوتي لعمليات الابيس (فارم / ريفيل)؟**",
      components: [new ActionRowBuilder().addComponents(btn)],
      ephemeral: true,
    });
    return scheduleEphemeralDismiss(interaction);
  }

  // 5. World Boss Confirm Button
  if (cid === "aion2_lfg_v_world_boss") {
    const btn = new ButtonBuilder()
      .setCustomId("aion2_lfg_v_create_World_Boss_NORMAL")
      .setLabel("تأكيد إنشاء روم زعماء العالم")
      .setEmoji("👹")
      .setStyle(ButtonStyle.Danger);

    await interaction.reply({
      content: "👹 **هل ترغب في إنشاء روم صوتي لغارة زعماء العالم (World Bosses)؟**",
      components: [new ActionRowBuilder().addComponents(btn)],
      ephemeral: true,
    });
    return scheduleEphemeralDismiss(interaction);
  }

  // ── Handling Selections & Confirmations ──
  if (cid === "aion2_lfg_v_sel_dungeon" || cid === "aion2_lfg_v_sel_trans") {
    const selected = interaction.values[0];
    const match = parseActivityMode(selected);
    return createInstantVoiceRoom(interaction, match.actKey, match.modeKey);
  }

  if (cid.startsWith("aion2_lfg_v_create_")) {
    const payload = cid.replace("aion2_lfg_v_create_", "");
    const match = parseActivityMode(payload);
    return createInstantVoiceRoom(interaction, match.actKey, match.modeKey);
  }

  // ── Handling Finish & Award Points ──
  if (cid.startsWith("aion2_lfg_v_finish_")) {
    const voiceChannelId = cid.replace("aion2_lfg_v_finish_", "");
    return handleInstantVoiceFinish(interaction, voiceChannelId);
  }

  // ── Handling Manual Close ──
  if (cid.startsWith("aion2_lfg_v_close_")) {
    const voiceChannelId = cid.replace("aion2_lfg_v_close_", "");
    return handleInstantVoiceClose(interaction, voiceChannelId);
  }
}

/**
 * Robust parser for activityKey and modeKey from compound identifiers
 */
function parseActivityMode(payload) {
  for (const actKey of Object.keys(DUNGEON_ACTIVITIES)) {
    if (payload.startsWith(actKey + "_")) {
      const modeKey = payload.substring(actKey.length + 1);
      return { actKey, modeKey };
    }
  }
  const lastUnderscore = payload.lastIndexOf("_");
  return {
    actKey: payload.substring(0, lastUnderscore),
    modeKey: payload.substring(lastUnderscore + 1),
  };
}

/**
 * Creates the Voice Channel & Posts the Announcement Card in OPEN_DUNGEONS_CHANNEL_ID
 */
export async function createInstantVoiceRoom(interaction, actKey, modeKey) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const act = DUNGEON_ACTIVITIES[actKey];
  if (!act) {
    await interaction.editReply({ content: "❌ نشاط غير صالح أو غير معرف." });
    return scheduleEphemeralDismiss(interaction);
  }

  const mode = act.modes[modeKey] || { labelAr: modeKey, roomSuffix: modeKey };
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ لا يمكن تنفيذ الأمر خارج السيرفر." });
    return scheduleEphemeralDismiss(interaction);
  }

  // Capture original voice room so creator can be returned upon closing
  const previousVoiceChannelId = interaction.member?.voice?.channelId || null;

  // Build clean room name e.g. "🔊・فاير تمبل هارد" or "🔊・كراو كيف نورمال"
  const roomTitle = mode.roomSuffix ? `${act.nameAr} ${mode.roomSuffix}` : act.nameAr;
  const channelName = `🔊・${roomTitle}`;

  // 1. Create Temporary Voice Channel in Category
  let voiceChannel;
  try {
    voiceChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: VOICE_CATEGORY_ID,
      userLimit: act.capacity,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone open to all
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
          ],
        },
      ],
      reason: `Instant Dungeon Voice: ${roomTitle} by ${interaction.user.tag}`,
    });
  } catch (err) {
    console.error("[InstantVoice] Error creating voice channel:", err);
    await interaction.editReply({ content: "❌ فشل إنشاء الروم الصوتي. يرجى التأكد من صلاحيات البوت في السيرفر." });
    return scheduleEphemeralDismiss(interaction);
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const voiceUrl = `https://discord.com/channels/${guild.id}/${voiceChannel.id}`;

  // 2. Post Announcement Card in OPEN_DUNGEONS_CHANNEL_ID
  let eventsMsg;
  try {
    const eventsChannel = await guild.channels.fetch(OPEN_DUNGEONS_CHANNEL_ID).catch(() => null);
    if (eventsChannel && eventsChannel.isTextBased()) {
      const cardEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(`⚔️ تم فتح روم دنجن | ${roomTitle}`)
        .setDescription([
          `👑 **المنشئ:** <@${interaction.user.id}>`,
          `🎯 **النشاط:** ${act.typeAr} • ${mode.labelAr}`,
          `👥 **السعة:** \`${act.capacity} لاعبين\``,
          `🔊 **الروم الصوتي:** <#${voiceChannel.id}>`,
          `📊 **الحالة:** 🟢 **مفتوح للجميع (0/${act.capacity} متواجدين بالصوت)**`,
          `⏰ **وقت البدء:** <t:${nowUnix}:R>`,
          "",
          "🏆 *اضغط على زر الإنهاء بالأسفل عند إكمال الدنجن لتوثيق نقاط النشاط.*",
        ].join("\n"))
        .setFooter({ text: "تحالف M3RGEEN • رومات الدنجنات المفتوحة" })
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("الانتقال للروم الصوتي")
          .setEmoji("🔊")
          .setStyle(ButtonStyle.Link)
          .setURL(voiceUrl),
        new ButtonBuilder()
          .setCustomId(`aion2_lfg_v_finish_${voiceChannel.id}`)
          .setLabel("إنهاء وتوزيع النقاط")
          .setEmoji("🏁")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`aion2_lfg_v_close_${voiceChannel.id}`)
          .setLabel("إغلاق الروم")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger)
      );

      eventsMsg = await eventsChannel.send({
        embeds: [cardEmbed],
        components: [actionRow],
      });
    }
  } catch (err) {
    console.error("[InstantVoice] Error posting announcement card:", err);
  }

  // 3. Register in Database
  let groupId = null;
  try {
    const res = await query(
      `INSERT INTO aion2_lfg_groups (
        creator_id, activity_type, activity_name, state, voice_channel_id, events_message_id, created_at
      ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NOW()) RETURNING id`,
      [interaction.user.id, act.type, `${actKey}_${modeKey}`, voiceChannel.id, eventsMsg?.id || null]
    );
    groupId = res.rows[0]?.id;
  } catch (err) {
    console.error("[InstantVoice] Error recording group in DB:", err);
  }

  // 4. Track in Memory
  const roomData = {
    groupId,
    eventsMsgId: eventsMsg?.id || null,
    eventsChannelId: OPEN_DUNGEONS_CHANNEL_ID,
    capacity: act.capacity,
    actKey,
    modeKey,
    roomTitle,
    creatorId: interaction.user.id,
    previousVoiceChannelId,
    voiceChannelId: voiceChannel.id,
    participants: new Set([interaction.user.id]),
    emptyTimer: null,
    createdAt: Date.now(),
  };
  activeDungeonRooms.set(voiceChannel.id, roomData);

  // Set initial 3-minute empty countdown if creator doesn't join
  scheduleEmptyVoiceCleanup(guild.client, voiceChannel.id, 3 * 60 * 1000);

  // 5. Try moving creator if they are currently in any voice channel
  try {
    if (interaction.member?.voice?.channelId) {
      await interaction.member.voice.setChannel(voiceChannel).catch(() => {});
    }
  } catch (_) {}

  // 6. Reply to Creator with Auto-Dismiss after 5 minutes
  const replyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("دخول الروم الصوتي الآن")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Link)
      .setURL(voiceUrl)
  );

  await interaction.editReply({
    content: [
      `✅ **تم إنشاء الروم الصوتي بنجاح: \`${channelName}\`!**`,
      `📍 **الروم الصوتي:** <#${voiceChannel.id}>`,
      `📢 **تم نشر بطاقة الإعلان في:** <#${OPEN_DUNGEONS_CHANNEL_ID}>`,
      "",
      `*الروم مفتوح للجميع بسعة \`${act.capacity} لاعبين\`، وسيتم حذفه تلقائياً عند انتهاء الدنجن وفراغه من الأعضاء.*`,
    ].join("\n"),
    components: [replyRow],
  });

  return scheduleEphemeralDismiss(interaction);
}

/**
 * Handles Voice State Updates (Member joins/leaves active dungeon voice rooms)
 */
export async function handleInstantVoiceState(oldState, newState, client) {
  const leftChannelId = oldState.channelId;
  const joinedChannelId = newState.channelId;

  // ── Member Joined ──
  if (joinedChannelId && activeDungeonRooms.has(joinedChannelId)) {
    const data = activeDungeonRooms.get(joinedChannelId);
    if (!newState.member.user.bot) {
      data.participants.add(newState.member.id);
    }

    // Cancel empty timer if anyone is present
    if (data.emptyTimer) {
      clearTimeout(data.emptyTimer);
      data.emptyTimer = null;
    }

    await updateLiveCardStatus(client, joinedChannelId);
  }

  // ── Member Left ──
  if (leftChannelId && leftChannelId !== joinedChannelId && activeDungeonRooms.has(leftChannelId)) {
    const data = activeDungeonRooms.get(leftChannelId);
    const channel = oldState.channel;
    const currentCount = channel ? channel.members.filter((m) => !m.user.bot).size : 0;

    await updateLiveCardStatus(client, leftChannelId);

    // If room is empty, start 2-minute countdown to delete
    if (currentCount === 0) {
      scheduleEmptyVoiceCleanup(client, leftChannelId, 2 * 60 * 1000);
    }
  }
}

/**
 * Schedules auto-deletion for empty dungeon voice channels
 */
function scheduleEmptyVoiceCleanup(client, voiceChannelId, delayMs) {
  const data = activeDungeonRooms.get(voiceChannelId);
  if (!data) return;

  if (data.emptyTimer) clearTimeout(data.emptyTimer);

  data.emptyTimer = setTimeout(async () => {
    try {
      const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
      if (!guild) return;

      const voiceChannel = guild.channels.cache.get(voiceChannelId) || (await guild.channels.fetch(voiceChannelId).catch(() => null));
      if (voiceChannel) {
        const humanMembers = voiceChannel.members.filter((m) => !m.user.bot);
        if (humanMembers.size === 0) {
          console.log(`[InstantVoice] Voice channel ${voiceChannelId} empty after grace period. Deleting...`);
          await voiceChannel.delete("Auto-deleted empty dungeon room").catch(() => {});
        } else {
          return; // Still has members
        }
      }

      // Delete announcement card from OPEN_DUNGEONS_CHANNEL_ID
      if (data.eventsMsgId) {
        const eventsChannel = guild.channels.cache.get(OPEN_DUNGEONS_CHANNEL_ID) || (await guild.channels.fetch(OPEN_DUNGEONS_CHANNEL_ID).catch(() => null));
        if (eventsChannel) {
          await eventsChannel.messages.delete(data.eventsMsgId).catch(() => {});
        }
      }

      // Update DB
      if (data.groupId) {
        await query(
          `UPDATE aion2_lfg_groups SET state = 'EXPIRED', expired_at = NOW() WHERE id = $1`,
          [data.groupId]
        ).catch(() => {});
      }

      activeDungeonRooms.delete(voiceChannelId);
    } catch (err) {
      console.error("[InstantVoice] Error during auto-cleanup:", err);
    }
  }, delayMs);
}

/**
 * Updates the Live Announcement Card embed with real-time voice participant count
 */
async function updateLiveCardStatus(client, voiceChannelId) {
  const data = activeDungeonRooms.get(voiceChannelId);
  if (!data || !data.eventsMsgId) return;

  try {
    const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
    if (!guild) return;

    const voiceChannel = guild.channels.cache.get(voiceChannelId) || (await guild.channels.fetch(voiceChannelId).catch(() => null));
    const eventsChannel = guild.channels.cache.get(OPEN_DUNGEONS_CHANNEL_ID) || (await guild.channels.fetch(OPEN_DUNGEONS_CHANNEL_ID).catch(() => null));
    if (!eventsChannel) return;

    const msg = await eventsChannel.messages.fetch(data.eventsMsgId).catch(() => null);
    if (!msg || msg.embeds.length === 0) return;

    const count = voiceChannel ? voiceChannel.members.filter((m) => !m.user.bot).size : 0;
    const isFull = count >= data.capacity;

    const act = DUNGEON_ACTIVITIES[data.actKey];
    const mode = act?.modes[data.modeKey] || { labelAr: data.modeKey };

    const statusText = isFull
      ? `🔒 **الفريق مكتمل (${count}/${data.capacity}) — الدنجن جارٍ حالياً**`
      : `🟢 **مفتوح للجميع (${count}/${data.capacity} متواجدين بالصوت)**`;

    const embed = EmbedBuilder.from(msg.embeds[0])
      .setColor(isFull ? 0xE67E22 : 0x2ECC71)
      .setDescription([
        `👑 **المنشئ:** <@${data.creatorId}>`,
        `🎯 **النشاط:** ${data.roomTitle || act?.nameAr}`,
        `👥 **السعة:** \`${data.capacity} لاعبين\``,
        `🔊 **الروم الصوتي:** <#${voiceChannelId}>`,
        `📊 **الحالة:** ${statusText}`,
        `⏰ **وقت البدء:** <t:${Math.floor(data.createdAt / 1000)}:R>`,
        "",
        "🏆 *اضغط على زر الإنهاء بالأسفل عند إكمال الدنجن لتوثيق نقاط النشاط.*",
      ].join("\n"));

    await msg.edit({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("[InstantVoice] Error updating live card status:", err.message);
  }
}

/**
 * Handles "🏁 إنهاء وتوزيع النقاط" button click
 */
export async function handleInstantVoiceFinish(interaction, voiceChannelId) {
  await interaction.deferReply({ ephemeral: true });

  const data = activeDungeonRooms.get(voiceChannelId);
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ خطأ في السيرفر." });
    return scheduleEphemeralDismiss(interaction);
  }

  // Permissions check: Only Creator or Server Admin / Moderator
  const isCreator = data ? data.creatorId === interaction.user.id : false;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                  interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!isCreator && !isAdmin) {
    await interaction.editReply({
      content: "❌ عذراً، فقط منشئ الروم أو المشرف يمكنه إنهاء الدنجن وتوثيق النقاط.",
    });
    return scheduleEphemeralDismiss(interaction);
  }

  const voiceChannel = guild.channels.cache.get(voiceChannelId) || (await guild.channels.fetch(voiceChannelId).catch(() => null));

  // Return creator to their original voice room if available before closing
  if (data?.previousVoiceChannelId && data?.creatorId) {
    try {
      const prevChan = guild.channels.cache.get(data.previousVoiceChannelId) || (await guild.channels.fetch(data.previousVoiceChannelId).catch(() => null));
      if (prevChan && prevChan.isVoiceBased()) {
        const creatorMember = guild.members.cache.get(data.creatorId) || (await guild.members.fetch(data.creatorId).catch(() => null));
        if (creatorMember && creatorMember.voice?.channelId === voiceChannelId) {
          await creatorMember.voice.setChannel(prevChan).catch(() => {});
        }
      }
    } catch (_) {}
  }

  // Gather participants from current voice members + logged participants
  const participantsSet = new Set(data?.participants || []);
  if (voiceChannel) {
    for (const [id, m] of voiceChannel.members) {
      if (!m.user.bot) participantsSet.add(id);
    }
  }

  if (participantsSet.size === 0) {
    participantsSet.add(interaction.user.id);
  }

  const act = DUNGEON_ACTIVITIES[data?.actKey] || {
    basePoints: 10,
    creatorBonus: 2,
    type: "DUNGEON",
    nameAr: "دنجن",
  };

  const { cycleId } = getCurrentMonthlyCycle();
  const rewardedList = [];

  for (const userId of participantsSet) {
    const isMemberCreator = userId === (data?.creatorId || interaction.user.id);
    const finalPoints = act.basePoints + (isMemberCreator ? act.creatorBonus : 0);

    // 1. Insert into aion2_lfg_ledger for /dungeon_points
    if (data?.groupId) {
      await insertLedgerRow({
        groupId: data.groupId,
        discordId: userId,
        activityType: act.type,
        activityName: `${data?.actKey || "Dungeon"}_${data?.modeKey || "NORMAL"}`,
        basePoints: act.basePoints,
        creatorBonus: isMemberCreator ? act.creatorBonus : 0,
        antiFarmMultiplier: 1.0,
        finalPoints,
        monthlyCycleId: cycleId,
        qualificationStatus: "QUALIFIED",
        cumulativeVoiceSeconds: 600,
        antiFarmNValue: 1,
        antiFarmCoreLineage: null,
        eligibilityCycleId: `MONTHLY_${cycleId}`,
        voiceRequiredSeconds: 0,
        isCreator: isMemberCreator,
      }).catch((e) => console.warn("[InstantVoice] Error recording ledger:", e.message));
    }

    // 2. Increment general points table
    await query(
      `INSERT INTO points (guild_id, user_id, total_points, weekly_points, monthly_points, updated_at)
       VALUES ($1, $2, $3, $3, $3, NOW())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         total_points = points.total_points + EXCLUDED.total_points,
         weekly_points = points.weekly_points + EXCLUDED.weekly_points,
         monthly_points = points.monthly_points + EXCLUDED.monthly_points,
         updated_at = NOW()`,
      [guild.id, userId, finalPoints]
    ).catch(() => {});

    rewardedList.push(`• <@${userId}>: **+${finalPoints} نقطة** ${isMemberCreator ? "*(منشئ الفريق 👑)*" : ""}`);
  }

  // Refresh leaderboard cache
  await setLeaderboardDirty().catch(() => {});

  // Update DB Group State
  if (data?.groupId) {
    await query(
      `UPDATE aion2_lfg_groups SET state = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
      [data.groupId]
    ).catch(() => {});
  }

  // Update Announcement Card
  try {
    const eventsChannel = guild.channels.cache.get(OPEN_DUNGEONS_CHANNEL_ID) || (await guild.channels.fetch(OPEN_DUNGEONS_CHANNEL_ID).catch(() => null));
    if (eventsChannel && data?.eventsMsgId) {
      const msg = await eventsChannel.messages.fetch(data.eventsMsgId).catch(() => null);
      if (msg) {
        const finishEmbed = new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle(`🏆 تم إنهاء الدنجن وتوثيق النقاط بنجاح!`)
          .setDescription([
            `⚔️ **النشاط:** ${data?.roomTitle || act.nameAr}`,
            `👑 **أنهى النشاط:** <@${interaction.user.id}>`,
            "",
            "📊 **النقاط الموزعة على الأبطال المشاركين:**",
            ...rewardedList,
            "",
            "✨ *تم تحديث متصدري الدنجنات بأمر `/dungeon_points` بنجاح!*",
            "⏳ *سيتم إغلاق الروم وحذف البطاقة تلقائياً بعد 30 ثانية.*",
          ].join("\n"))
          .setFooter({ text: "تحالف M3RGEEN • تم توثيق النقاط" })
          .setTimestamp();

        await msg.edit({ embeds: [finishEmbed], components: [] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[InstantVoice] Error updating finish card:", err);
  }

  // Schedule deletion of voice room and announcement card after 30 seconds
  setTimeout(async () => {
    try {
      if (voiceChannel) await voiceChannel.delete("Dungeon completed & points awarded").catch(() => {});
      if (data?.eventsMsgId) {
        const eventsChannel = guild.channels.cache.get(OPEN_DUNGEONS_CHANNEL_ID);
        if (eventsChannel) await eventsChannel.messages.delete(data.eventsMsgId).catch(() => {});
      }
      activeDungeonRooms.delete(voiceChannelId);
    } catch (_) {}
  }, 30 * 1000);

  await interaction.editReply({
    content: `✅ **تم توثيق إنهاء الدنجن وتوزيع النقاط على ${participantsSet.size} لاعبين بنجاح!**`,
  });

  return scheduleEphemeralDismiss(interaction);
}

/**
 * Handles "❌ إغلاق الروم" button click
 */
export async function handleInstantVoiceClose(interaction, voiceChannelId) {
  await interaction.deferReply({ ephemeral: true });

  const data = activeDungeonRooms.get(voiceChannelId);
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "❌ خطأ في السيرفر." });
    return scheduleEphemeralDismiss(interaction);
  }

  const isCreator = data ? data.creatorId === interaction.user.id : false;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                  interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!isCreator && !isAdmin) {
    await interaction.editReply({
      content: "❌ عذراً، فقط منشئ الروم أو المشرف يمكنه إغلاق الروم يدوياً.",
    });
    return scheduleEphemeralDismiss(interaction);
  }

  const voiceChannel = guild.channels.cache.get(voiceChannelId) || (await guild.channels.fetch(voiceChannelId).catch(() => null));

  // Return creator to their original voice room if available before deleting
  if (data?.previousVoiceChannelId && data?.creatorId) {
    try {
      const prevChan = guild.channels.cache.get(data.previousVoiceChannelId) || (await guild.channels.fetch(data.previousVoiceChannelId).catch(() => null));
      if (prevChan && prevChan.isVoiceBased()) {
        const creatorMember = guild.members.cache.get(data.creatorId) || (await guild.members.fetch(data.creatorId).catch(() => null));
        if (creatorMember && creatorMember.voice?.channelId === voiceChannelId) {
          await creatorMember.voice.setChannel(prevChan).catch(() => {});
        }
      }
    } catch (moveErr) {
      console.warn("[InstantVoice] Could not move creator back to original channel:", moveErr.message);
    }
  }

  if (voiceChannel) {
    await voiceChannel.delete(`Closed by ${interaction.user.tag}`).catch(() => {});
  }

  try {
    const eventsChannel = guild.channels.cache.get(OPEN_DUNGEONS_CHANNEL_ID) || (await guild.channels.fetch(OPEN_DUNGEONS_CHANNEL_ID).catch(() => null));
    if (eventsChannel && data?.eventsMsgId) {
      const msg = await eventsChannel.messages.fetch(data.eventsMsgId).catch(() => null);
      if (msg) {
        const closeEmbed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle("🛑 تم إغلاق الدنجن")
          .setDescription(`تم إغلاق هذا الروم الصوتي بواسطة <@${interaction.user.id}>.`)
          .setTimestamp();
        await msg.edit({ embeds: [closeEmbed], components: [] }).catch(() => {});
        setTimeout(() => msg.delete().catch(() => {}), 10 * 1000);
      }
    }
  } catch (_) {}

  if (data?.groupId) {
    await query(
      `UPDATE aion2_lfg_groups SET state = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
      [data.groupId]
    ).catch(() => {});
  }

  activeDungeonRooms.delete(voiceChannelId);

  await interaction.editReply({
    content: "✅ تم إغلاق الروم الصوتي وحذف بطاقة الدنجن بنجاح.",
  });

  // Auto-dismiss the ephemeral message after 5 minutes
  return scheduleEphemeralDismiss(interaction);
}
