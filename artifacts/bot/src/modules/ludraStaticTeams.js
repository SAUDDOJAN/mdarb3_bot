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

export async function initLudraStaticTeamsDB() {
  if (dbInitialized) return;

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
  `);

  dbInitialized = true;
}

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

  // Split into left (1..5) and right (6..10)
  const col1 = members.slice(0, 5);
  const col2 = members.slice(5, 10);

  const formatList = (list, startIndex = 1) => {
    if (list.length === 0) return "*[شاغر]*";
    return list
      .map((m, idx) => {
        const num = startIndex + idx;
        const normClass = normalizeClassName(m.class_name);
        const emoji = CLASS_EMOJIS[normClass] || "🔹";
        return `**${num}.** ${emoji} **${m.character_name}**`;
      })
      .join("\n");
  };

  const col1Text = formatList(col1, 1);
  const col2Text = formatList(col2, 6);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`🛡️ ${team.team_name} — Ludra Raid`)
    .setDescription(
      `⚔️ **تحالف M3RGEEN • منظومة الفرق الثابتة**\n\n` +
      `👑 **قائد الفريق:** <@${team.leader_discord_id}> (\`${team.leader_name}\`)\n` +
      `📊 **حالة الفريق:** ${isFull ? "مكتمل" : "غير مكتمل"} \`${count} / 10\` لاعبين\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      {
        name: "👥 الفريق الرسمي",
        value: col1Text,
        inline: true,
      },
      {
        name: "\u200b",
        value: col2Text,
        inline: true,
      }
    )
    .setFooter({ text: "تحالف M3RGEEN • نظام الفرق الثابتة لريد Ludra" })
    .setTimestamp();

  // Logo Attachment
  let attachment = null;
  const logoPath = path.resolve(__dirname, "../../assets", team.logo_filename || "team_1_logo.jpg");
  if (fs.existsSync(logoPath)) {
    attachment = new AttachmentBuilder(logoPath, { name: "team_logo.png" });
    embed.setThumbnail("attachment://team_logo.png");
  }

  const row = new ActionRowBuilder().addComponents(
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

  return { embed, components: [row], attachment, team, members };
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
 * Checks whether user is the Team Leader or a server Administrator.
 */
function isAuthorizedForTeam(interaction, team) {
  if (String(interaction.user.id) === String(team.leader_discord_id)) return true;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  return false;
}

/**
 * Interaction Handler for Static Teams
 */
export async function handleLudraStaticInteraction(interaction) {
  await initLudraStaticTeamsDB();

  const customId = interaction.customId || "";
  const parts = customId.split(":");
  const action = parts[1];
  const param = parts[2];
  const extra = parts[3];

  // ── 1. Team Action Buttons (From Team Card) ──────────────────────────────────
  if (action === "mention" || action === "dm" || action === "add" || action === "remove") {
    const teamNumber = parseInt(param, 10) || 1;
    const teamRes = await query(`SELECT * FROM ludra_static_teams WHERE team_number = $1 LIMIT 1`, [teamNumber]);
    const team = teamRes.rows[0];
    if (!team) {
      return interaction.reply({ content: "❌ تعذر العثور على بيانات هذا الفريق.", ephemeral: true });
    }

    if (!isAuthorizedForTeam(interaction, team)) {
      return interaction.reply({
        content: `❌ عذراً، هذه الإجراءات مخصصة لقائد الفريق (<@${team.leader_discord_id}>) وإدارة السيرفر فقط.`,
        ephemeral: true,
      });
    }

    // ── Mention Team ──
    if (action === "mention") {
      const membersRes = await query(`SELECT discord_id, character_name FROM ludra_static_team_members WHERE team_number = $1`, [teamNumber]);
      const validMentions = membersRes.rows.filter(m => m.discord_id).map(m => `<@${m.discord_id}>`);

      if (validMentions.length === 0) {
        return interaction.reply({ content: "⚠️ لا يوجد أعضاء بمعرفات ديسكورد مسجلة في الفريق لمنشنهم.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
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

      return interaction.editReply({ content: "✅ **تم إرسال المنشن وتنبيه أعضاء الفريق بنجاح!** (سيتم حذفه تلقائياً بعد 5 دقائق لحماية نظافة الروم)." });
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
      const countRes = await query(`SELECT COUNT(*)::int AS cnt FROM ludra_static_team_members WHERE team_number = $1`, [teamNumber]);
      if (countRes.rows[0].cnt >= 10) {
        return interaction.reply({
          content: "⚠️ **الفريق مكتمل بالفعل (10 / 10 لاعبين).**\nيجب استبعاد أو نقل لاعب أولاً لتوفير مكان شاغر.",
          ephemeral: true,
        });
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

      return interaction.reply({
        content: "🛡️ **إضافة لاعب — الخطوة 1 من 2:** الرجاء تحديد **كلاس اللاعب** من القائمة أدناه:",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }

    // ── Remove Player (Step 1: Select Player) ──
    if (action === "remove") {
      const membersRes = await query(`
        SELECT * FROM ludra_static_team_members
        WHERE team_number = $1
        ORDER BY slot_index ASC, id ASC
      `, [teamNumber]);

      if (membersRes.rows.length === 0) {
        return interaction.reply({ content: "⚠️ لا يوجد أعضاء في هذا الفريق لحذفهم.", ephemeral: true });
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

      return interaction.reply({
        content: "🔻 **الرجاء تحديد اللاعب المراد استبعاده من القائمة أدناه:**",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
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
      .setLabel("اسم الشخصية في اللعبة")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("مثال: Boo")
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(30);

    const discordInput = new TextInputBuilder()
      .setCustomId("discord_id_input")
      .setLabel("معرف ديسكورد اللاعب (Discord ID أو منشن)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("مثال: 140247495832764417 أو @Boo (اختياري)")
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
      return interaction.editReply({ content: "❌ تعذر العثور على هذا اللاعب في تشكيلة الفريق." });
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

    return interaction.editReply({
      content:
        `⏳ **تم رفع طلب استبعاد اللاعب \`${targetMember.character_name}\` إلى الإدارة للمراجعة.**\n\n` +
        `• سيتم مراجعة السبب من قبل الإدارة في روم المراقبة.\n` +
        `• لن يتم استبعاد اللاعب حتى تصدر الإدارة قرارها لضمان استقرار وتماسك الفرق.\n` +
        `• سيصلك إشعار بالقرار فور اعتماده.`,
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

    const teamRes = await query(`SELECT * FROM ludra_static_teams WHERE team_number = $1 LIMIT 1`, [teamNumber]);
    const team = teamRes.rows[0];

    // Find lowest available slot index (1..10)
    const existingSlots = await query(`SELECT slot_index FROM ludra_static_team_members WHERE team_number = $1`, [teamNumber]);
    const usedSlots = new Set(existingSlots.rows.map(r => r.slot_index));
    let nextSlot = 1;
    while (nextSlot <= 10 && usedSlots.has(nextSlot)) nextSlot++;

    if (nextSlot > 10) {
      return interaction.editReply({ content: "⚠️ لا توجد مقاعد شاغرة في هذا الفريق (الحد الأقصى 10)." });
    }

    await query(`
      INSERT INTO ludra_static_team_members (team_number, discord_id, character_name, class_name, is_leader, slot_index, added_by)
      VALUES ($1, $2, $3, $4, FALSE, $5, $6)
      ON CONFLICT (team_number, character_name) DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        class_name = EXCLUDED.class_name,
        slot_index = EXCLUDED.slot_index
    `, [teamNumber, parsedDiscordId, charName, normClass, nextSlot, interaction.user.id]);

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
          `قام قائد الفريق بإضافة لاعب جديد إلى التشكيلة الثابتة.\n` +
          `• **اللاعب:** \`${charName}\` (${CLASS_EMOJIS[normClass] || "🔹"} ${normClass})\n` +
          `• **الديسكورد:** ${parsedDiscordId ? `<@${parsedDiscordId}>` : "*غير محدد*"}\n` +
          `• **المقعد:** Slot #${nextSlot}\n` +
          `• **بواسطة:** <@${interaction.user.id}>`
        )
        .setTimestamp();
      await logChannel.send({ embeds: [addLogEmbed] }).catch(() => {});
    }

    return interaction.editReply({
      content: `✅ **تمت إضافة اللاعب \`${charName}\` (${normClass}) إلى الفريق وتحديث بطاقة الفريق في الروم بنجاح!**`,
    });
  }

  // ── 5. Modal Submit: DM Broadcast to Team Members ──────────────────────────
  if (action === "modal_dm" && interaction.isModalSubmit()) {
    const teamNumber = parseInt(param, 10) || 1;
    const dmContent = interaction.fields.getTextInputValue("dm_content");

    await interaction.deferReply({ ephemeral: true });

    const teamRes = await query(`SELECT * FROM ludra_static_teams WHERE team_number = $1 LIMIT 1`, [teamNumber]);
    const team = teamRes.rows[0];

    const membersRes = await query(`
      SELECT discord_id, character_name FROM ludra_static_team_members
      WHERE team_number = $1 AND discord_id IS NOT NULL
    `, [teamNumber]);

    let delivered = 0;
    let failed = 0;

    for (const m of membersRes.rows) {
      try {
        const user = await interaction.client.users.fetch(m.discord_id).catch(() => null);
        if (user) {
          const dmEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`📨 رسالة من قائد فريقك (${team?.team_name || `فريق #${teamNumber}`})`)
            .setDescription(
              `وجه إليك قائد الفريق (<@${interaction.user.id}>) الرسالة التالية:\n\n` +
              `\`\`\`\n${dmContent}\n\`\`\``
            )
            .setFooter({ text: "تحالف M3RGEEN • تنبيهات الفرق الثابتة" })
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
          delivered++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }

    return interaction.editReply({
      content:
        `✅ **تم إرسال الرسالة بنجاح إلى الخاص!**\n` +
        `• **تم التوصيل بنجاح:** \`${delivered}\` عضواً\n` +
        (failed > 0 ? `• **تعذر التوصيل:** \`${failed}\` (بسبب إغلاق الخاص DMs لديهم)` : ""),
    });
  }

  // ── 6. Admin Actions (In Log Channel) ───────────────────────────────────────
  if (action === "admin_approve" || action === "admin_reject" || action === "admin_inquire") {
    // Check Admin permissions
    if (
      !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) &&
      !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return interaction.reply({ content: "❌ هذه الإجراءات مخصصة لإدارة السيرفر فقط.", ephemeral: true });
    }

    const reqId = parseInt(param, 10);
    const reqRes = await query(`SELECT * FROM ludra_team_removal_requests WHERE id = $1 LIMIT 1`, [reqId]);
    const req = reqRes.rows[0];
    if (!req) return interaction.reply({ content: "❌ تعذر العثور على هذا الطلب.", ephemeral: true });

    if (req.status !== "PENDING" && action !== "admin_inquire") {
      return interaction.reply({ content: `ℹ️ تم البت في هذا الطلب مسبقاً (الحالة: ${req.status}).`, ephemeral: true });
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

      return interaction.editReply({ content: `✅ **تمت الموافقة بنجاح واستبعاد اللاعب \`${req.target_character_name}\` وتحديث الإمبد.**` });
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

      return interaction.editReply({ content: `❌ **تم رفض طلب الاستبعاد وإبقاء اللاعب في الفريق.**` });
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

      return interaction.reply({
        content: "❓ **من هو الطرف الذي تريد توجيه الاستفسار إليه؟**",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }
  }

  // ── 7. Select Inquire Target -> Open Inquiry Question Modal ────────────────
  if (action === "select_inquire" && interaction.isStringSelectMenu()) {
    const reqId = parseInt(param, 10);
    const chosenVal = interaction.values[0]; // e.g. "LEADER:140247..."
    const [targetType, targetId] = chosenVal.split(":");

    if (targetType === "MEMBER" && (!targetId || targetId === "NONE")) {
      return interaction.reply({ content: "⚠️ هذا اللاعب ليس لديه معرف ديسكورد مسجل لإرسال رسالة له في الخاص.", ephemeral: true });
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
    if (!req) return interaction.editReply({ content: "❌ تعذر العثور على الطلب." });

    const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      return interaction.editReply({ content: "❌ تعذر الوصول لحساب الديسكورد للطرف المستهدف." });
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
      return interaction.editReply({ content: "❌ تعذر إرسال الرسالة إلى خاص المستخدم (الخاص لديه مغلق DMs closed)." });
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

    return interaction.editReply({ content: `✅ **تم إرسال الاستفسار بنجاح إلى خاص <@${targetId}>.**` });
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
    if (!req) return interaction.editReply({ content: "❌ تعذر العثور على بيانات هذا الطلب." });

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

    return interaction.editReply({ content: "✅ **تم استلام ردك وإرساله إلى إدارة السيرفر بنجاح. شكراً لك!**" });
  }
}
