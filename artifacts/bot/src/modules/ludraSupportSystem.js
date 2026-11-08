/**
 * M3RGEEN Ludra Raid — Support & Reinforcement System (نظام الفزعة وطلب الدعم)
 *
 * Dedicated Channels:
 *  - 1568421405286998066: 👹┊ʟᴜᴅʀᴀ-ʀᴀɪᴅ・طلب-دعم (Support Request Panel)
 *  - 1568407430050611311: 👹┊ʟᴜᴅʀᴀ-ʀᴀɪᴅ・الطلبات (Live Dispatch Board)
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
  PermissionsBitField,
} from "discord.js";
import { query } from "../database/index.js";
import { CLASS_EMOJIS, normalizeClassName, getCachedTeam } from "./ludraStaticTeams.js";

export const LUDRA_SUPPORT_PANEL_CHANNEL_ID = "1568421405286998066"; // روم طلب الدعم
export const LUDRA_DISPATCH_CHANNEL_ID = "1568407430050611311";     // روم الطلبات

let dbInitialized = false;
let dbInitPromise = null;

export async function initLudraSupportDB() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS ludra_support_requests (
          id SERIAL PRIMARY KEY,
          team_number INT NOT NULL,
          team_name TEXT NOT NULL,
          leader_discord_id TEXT NOT NULL,
          leader_name TEXT NOT NULL,
          voice_channel_id TEXT,
          message_id TEXT,
          needed_classes TEXT[] NOT NULL,
          fulfilled_slots JSONB DEFAULT '[]'::jsonb,
          notes TEXT,
          status TEXT DEFAULT 'OPEN',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_ludra_support_status ON ludra_support_requests (status);
      `);
      dbInitialized = true;
    } catch (err) {
      if (!err.message?.includes("already exists")) {
        console.error("[LudraSupport] DB Init error:", err);
      } else {
        dbInitialized = true;
      }
    }
  })();

  return dbInitPromise;
}

// Auto init on import
initLudraSupportDB();

/**
 * Returns emoji identifier for button (e.g. { id: '...' } or string)
 */
function getEmojiForButton(className) {
  const norm = normalizeClassName(className);
  const rawEmoji = CLASS_EMOJIS[norm];
  if (!rawEmoji) return "⚔️";
  const match = rawEmoji.match(/:(\d+)>/);
  if (match) return { id: match[1] };
  return "⚔️";
}

/**
 * Deploys or refreshes the permanent Support Request Panel in 1568421405286998066
 */
export async function deployLudraSupportPanel(client) {
  await initLudraSupportDB();
  try {
    const channel = await client.channels.fetch(LUDRA_SUPPORT_PANEL_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn(`[LudraSupport] Channel ${LUDRA_SUPPORT_PANEL_CHANNEL_ID} not found or not text-based.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle("🚨 لوحة طلب الدعم والفزعة — تحالف M3RGEEN 🪽")
      .setDescription(
        `أهلاً بكم يا قادة الفرق في **نظام طلب الدعم والتعزيز لريدات لودرا**!\n\n` +
        `إذا كان فريقك الثابت يواجه نقصاً في أحد الكلاسات أو غياباً للاعبين، يمكنك الآن طلب فزعة فورية من الفرق الأخرى:\n\n` +
        `• **👑 خاص بالقادة:** اضغط الزر أدناه لاختيار الكلاسات الناقصة في فريقك.\n` +
        `• **📢 نشر فوري:** سيتم إرسال نداء الدعم فوراً في <#${LUDRA_DISPATCH_CHANNEL_ID}>.\n` +
        `• **⚡ ربط وسحب تلقائي:** عند تطوع أي لاعب مسجل، يُمنح صلاحية روم فريقك الصوتي ويُسحب إليه فوراً!\n\n` +
        `*(اضغط على الزر بالأسفل لتقديم طلب دعم لفريقك)*`
      )
      .setFooter({ text: "تحالف M3RGEEN • منظومة الفزعة المؤتمتة لريدات Ludra" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ludra_support:start_request")
        .setLabel("📢 طلب فزعة / دعم كلاسات")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🚨")
    );

    // Look for existing bot message in the channel
    const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
    const existingMsg = messages?.find(m => m.author.id === client.user.id && m.components.length > 0 && m.embeds.length > 0 && m.embeds[0].title?.includes("لوحة طلب الدعم"));

    if (existingMsg) {
      await existingMsg.edit({ embeds: [embed], components: [row] });
      console.log("[LudraSupport] Refreshed existing support panel message.");
    } else {
      await channel.send({ embeds: [embed], components: [row] });
      console.log("[LudraSupport] Deployed new support panel message.");
    }
  } catch (err) {
    console.error("[LudraSupport] Failed to deploy support panel:", err);
  }
}

/**
 * Builds the live card Embed and ActionRows for a Support Request in the Dispatch Channel
 */
export function buildDispatchCard(request) {
  const needed = request.needed_classes || [];
  const fulfilled = Array.isArray(request.fulfilled_slots) ? request.fulfilled_slots : [];
  const isCompleted = request.status === "COMPLETED";
  const isCancelled = request.status === "CANCELLED";

  let statusText = "⏳ **جاري البحث عن فزعة...**";
  let color = 0xe67e22; // Orange

  if (isCompleted) {
    statusText = "🟢 **تم اكتمال الدعم بنجاح وانطلق الفريق للريد!**";
    color = 0x2ecc71; // Green
  } else if (isCancelled) {
    statusText = "⚪ **تم إلغاء طلب الدعم.**";
    color = 0x95a5a6; // Grey
  }

  const lines = needed.map((cls, idx) => {
    const norm = normalizeClassName(cls);
    const emoji = CLASS_EMOJIS[norm] || "⚔️";
    const fill = fulfilled.find(f => f.class === cls && f.index === idx);
    if (fill) {
      const charInfo = fill.char_name ? `(${fill.char_name})` : "";
      const cpInfo = fill.cp ? `• ${fill.cp} CP` : "";
      return `${emoji} **${norm}:** 🟢 تم الدعم بواسطة <@${fill.filled_by_id}> ${charInfo} ${cpInfo}`;
    } else {
      return `${emoji} **${norm}:** 🔴 *شاغر (بانتظار فزعة)*`;
    }
  });

  const cleanTeamName = request.team_name?.includes("#")
    ? request.team_name
    : `${request.team_name} (فريق #${request.team_number})`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(
      isCompleted
        ? `🟢 اكتمل الدعم — ${cleanTeamName}`
        : isCancelled
        ? `⚪ ملغي — طلب دعم ${cleanTeamName}`
        : `🚨 نداء فزعة ودعم — ${cleanTeamName}`
    )
    .setDescription(
      `قائد الفريق <@${request.leader_discord_id}> يطلب دعماً لفريقه:\n\n` +
      `• **الحالة:** ${statusText}\n` +
      (request.voice_channel_id ? `• **الروم الصوتي:** <#${request.voice_channel_id}>\n` : "") +
      (request.notes ? `• **ملاحظة القائد:** ${request.notes}\n` : "") +
      `\n**الكلاسات المطلوبة:**\n` +
      lines.join("\n")
    )
    .setFooter({
      text: isCompleted
        ? "تحالف M3RGEEN • تم اكتمال المقاعد بنجاح"
        : isCancelled
        ? "تحالف M3RGEEN • طلب ملغي"
        : "تحالف M3RGEEN • اضغط الزر بالأسفل للفزعة بكلاسك",
    })
    .setTimestamp(new Date(request.created_at));

  const components = [];

  if (!isCompleted && !isCancelled) {
    const volunteerRow = new ActionRowBuilder();
    needed.forEach((cls, idx) => {
      const isFilled = fulfilled.some(f => f.class === cls && f.index === idx);
      if (!isFilled && volunteerRow.components.length < 4) {
        const norm = normalizeClassName(cls);
        volunteerRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ludra_support:volunteer:${request.id}:${norm}:${idx}`)
            .setLabel(`فزعة (${norm})`)
            .setStyle(ButtonStyle.Success)
            .setEmoji(getEmojiForButton(norm))
        );
      }
    });

    // Add Cancel button
    volunteerRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ludra_support:cancel:${request.id}`)
        .setLabel("❌ إلغاء الطلب")
        .setStyle(ButtonStyle.Danger)
    );

    components.push(volunteerRow);
  }

  return { embed, components };
}

/**
 * Queries registered players matching the needed classes and builds mention strings
 * grouped by class, excluding members of the requesting team and the leader.
 */
export async function buildClassMentions(neededClasses, teamNumber, leaderId) {
  if (!neededClasses || neededClasses.length === 0) return "";

  try {
    const teamMembersRes = await query(
      `SELECT discord_id FROM ludra_static_team_members WHERE team_number = $1 AND discord_id IS NOT NULL`,
      [teamNumber]
    );
    const excludeIds = new Set(teamMembersRes.rows.map(r => String(r.discord_id)));
    if (leaderId) excludeIds.add(String(leaderId));

    const allRes = await query(`
      SELECT DISTINCT discord_id, class_name FROM (
        SELECT discord_id, class_name FROM ludra_raid_registrations WHERE discord_id IS NOT NULL
        UNION
        SELECT discord_id, class_name FROM ludra_external_profiles WHERE discord_id IS NOT NULL
        UNION
        SELECT discord_id, class_name FROM ludra_static_team_members WHERE discord_id IS NOT NULL
      ) as t
    `);

    const mentionsByClass = {};
    for (const row of allRes.rows) {
      if (!row.discord_id || excludeIds.has(String(row.discord_id))) continue;
      const clsNorm = normalizeClassName(row.class_name || "");

      for (const target of neededClasses) {
        const targetNorm = normalizeClassName(target);
        if (clsNorm.toLowerCase() === targetNorm.toLowerCase()) {
          if (!mentionsByClass[targetNorm]) mentionsByClass[targetNorm] = [];
          if (!mentionsByClass[targetNorm].includes(row.discord_id)) {
            mentionsByClass[targetNorm].push(row.discord_id);
          }
        }
      }
    }

    const mentionLines = [];
    let totalMentions = 0;
    for (const cls of neededClasses) {
      const targetNorm = normalizeClassName(cls);
      const ids = mentionsByClass[targetNorm] || [];
      if (ids.length > 0) {
        const emoji = CLASS_EMOJIS[targetNorm] || "⚔️";
        // Limit mentions per class to 25 to avoid message length overflow
        const sliced = ids.slice(0, 25);
        totalMentions += sliced.length;
        mentionLines.push(`• ${emoji} **${targetNorm}:** ${sliced.map(id => `<@${id}>`).join(" ")}`);
      }
    }

    if (mentionLines.length === 0) return "";

    return `\n\n🔔 **نداء لأبطال الكلاسات المطلوبة (${totalMentions} لاعب متاح):**\n${mentionLines.join("\n")}`;
  } catch (err) {
    console.error("[LudraSupport] Error generating class mentions:", err);
    return "";
  }
}

/**
 * Main Interaction Handler for Support System
 */
export async function handleLudraSupportInteraction(interaction) {
  const customId = interaction.customId || "";
  const parts = customId.split(":");
  const action = parts[1];
  const param1 = parts[2];
  const param2 = parts[3];
  const param3 = parts[4];

  // ── 1. Start Request: Triggered from Panel or Leader Panel ──
  if (action === "start_request") {
    await interaction.deferReply({ ephemeral: true });

    // Check if user is a team leader
    const teamsRes = await query(
      `SELECT team_number, team_name, leader_discord_id, leader_name, voice_channel_id FROM ludra_static_teams WHERE leader_discord_id = $1 ORDER BY team_number`,
      [interaction.user.id]
    );

    const isGuildOwner = interaction.guild && String(interaction.guild.ownerId) === String(interaction.user.id);
    let leaderTeams = teamsRes.rows;

    if (leaderTeams.length === 0 && isGuildOwner) {
      // Owner fallback: if owner, allow them to manage or test
      const allTeams = await query(`SELECT team_number, team_name, leader_discord_id, leader_name, voice_channel_id FROM ludra_static_teams ORDER BY team_number LIMIT 8`);
      leaderTeams = allTeams.rows;
    }

    if (leaderTeams.length === 0) {
      return interaction.editReply({
        content:
          `❌ **عذراً، تقديم طلبات الدعم مخصص لقادة الفرق الثابتة فقط.**\n\n` +
          `• إذا كان فريقك الثابت يواجه نقصاً، يرجى الطلب من كابتن فريقك تقديم الطلب.\n` +
          `• إذا كنت ترغب في الفزعة للفرق الناقصة، تابع روم الطلبات المباشرة: <#${LUDRA_DISPATCH_CHANNEL_ID}>.`,
      });
    }

    // If param1 is provided (specific teamNumber), use it
    let selectedTeam = leaderTeams[0];
    if (param1) {
      const match = leaderTeams.find(t => String(t.team_number) === String(param1));
      if (match) selectedTeam = match;
    }

    const classSelect = new StringSelectMenuBuilder()
      .setCustomId(`ludra_support:select_classes:${selectedTeam.team_number}`)
      .setPlaceholder("اختر الكلاسات الناقصة في فريقك (يمكنك تحديد كلاس أو أكثر)...")
      .setMinValues(1)
      .setMaxValues(6)
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

    return interaction.editReply({
      content:
        `👑 **مرحباً بك يا كابتن <@${interaction.user.id}>!**\n` +
        `أنت بصدد طلب دعم لـ **${selectedTeam.team_name} (فريق #${selectedTeam.team_number})**.\n\n` +
        `🔻 **الرجاء تحديد الكلاسات الناقصة التي تحتاجها من القائمة المنسدلة أدناه:**`,
      components: [new ActionRowBuilder().addComponents(classSelect)],
    });
  }

  // ── 2. Classes Selected from Dropdown -> Show Notes Modal ──
  if (action === "select_classes" && interaction.isStringSelectMenu()) {
    const teamNumber = parseInt(param1, 10) || 1;
    const selectedClasses = interaction.values; // Array of class names
    const encodedClasses = encodeURIComponent(selectedClasses.join(","));

    const modal = new ModalBuilder()
      .setCustomId(`ludra_support:modal_submit:${teamNumber}:${encodedClasses}`)
      .setTitle(`تأكيد نداء الدعم — فريق #${teamNumber}`);

    const notesInput = new TextInputBuilder()
      .setCustomId("support_notes")
      .setLabel("ملاحظات التجمع أو الاستعداد (اختياري)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("مثال: متجمعين عند البوابة وجاهزين للانطلاق فوراً، الأولوية للأعلى CP...")
      .setRequired(false)
      .setMaxLength(300);

    modal.addComponents(new ActionRowBuilder().addComponents(notesInput));
    return interaction.showModal(modal);
  }

  // ── 3. Modal Submit -> Create DB Record & Post Live Dispatch Card ──
  if (action === "modal_submit" && interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });

    const teamNumber = parseInt(param1, 10) || 1;
    const rawClasses = decodeURIComponent(param2 || "");
    const classesList = rawClasses.split(",").filter(Boolean);
    const notes = interaction.fields.getTextInputValue("support_notes")?.trim() || "";

    const team = await getCachedTeam(teamNumber);
    if (!team) {
      return interaction.editReply("❌ تعذر العثور على بيانات هذا الفريق.");
    }

    // Fetch dispatch channel first
    const dispatchChannel = await interaction.guild.channels.fetch(LUDRA_DISPATCH_CHANNEL_ID).catch(() => null);
    if (!dispatchChannel || !dispatchChannel.isTextBased()) {
      return interaction.editReply(`❌ تعذر الوصول لروم الطلبات <#${LUDRA_DISPATCH_CHANNEL_ID}>.`);
    }

    // Cancel any older OPEN request for this team and clean up old card message
    const oldOpen = await query(
      `SELECT id, message_id FROM ludra_support_requests WHERE team_number = $1 AND status = 'OPEN'`,
      [teamNumber]
    );
    for (const oldReq of oldOpen.rows) {
      if (oldReq.message_id) {
        try {
          const oldMsg = await dispatchChannel.messages.fetch(oldReq.message_id).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        } catch (_) {}
      }
    }
    await query(`UPDATE ludra_support_requests SET status = 'CANCELLED', updated_at = NOW() WHERE team_number = $1 AND status = 'OPEN'`, [teamNumber]);

    // Insert new request
    const insertRes = await query(
      `INSERT INTO ludra_support_requests (
        team_number, team_name, leader_discord_id, leader_name, voice_channel_id, needed_classes, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN') RETURNING *`,
      [
        teamNumber,
        team.team_name,
        interaction.user.id,
        team.leader_name || interaction.user.username,
        team.voice_channel_id || null,
        classesList,
        notes || null,
      ]
    );

    const newRequest = insertRes.rows[0];

    // Build smart mentions for registered players of needed classes
    const mentionsText = await buildClassMentions(classesList, teamNumber, interaction.user.id);
    let messageContent =
      `📢 **نداء فزعة جديد لـ ${team.team_name || `فريق Ludra #${teamNumber}`}!**\n` +
      `• **الكلاسات المطلوبة:** ${classesList.map(c => `**${normalizeClassName(c)}**`).join("، ")}` +
      mentionsText;

    if (messageContent.length > 1950) {
      messageContent = messageContent.slice(0, 1900) + "...";
    }

    const { embed, components } = buildDispatchCard(newRequest);
    const sentMsg = await dispatchChannel.send({
      content: messageContent,
      embeds: [embed],
      components,
    });

    // Update message_id in DB
    await query(`UPDATE ludra_support_requests SET message_id = $1 WHERE id = $2`, [sentMsg.id, newRequest.id]);

    return interaction.editReply(
      `✅ **تم إرسال ونشر طلب الدعم بنجاح!**\n\n` +
      `• **روم الطلبات:** <#${LUDRA_DISPATCH_CHANNEL_ID}>\n` +
      `• **الكلاسات المطلوبة:** ${classesList.join(", ")}\n` +
      `• **الربط الصوتي:** بمجرد أن يتطوع أي لاعب بكلاسه، سيقوم البوت بمنحه صلاحية روم فريقك الصوتي وسحبه فوراً!\n\n` +
      `🔗 [اضغط هنا للانتقال مباشرة لبطاقة الطلب](https://discord.com/channels/${interaction.guild.id}/${LUDRA_DISPATCH_CHANNEL_ID}/${sentMsg.id})`
    );
  }

  // ── 4. Volunteer Button Click ──
  if (action === "volunteer") {
    await interaction.deferReply({ ephemeral: true });

    const requestId = parseInt(param1, 10);
    const targetClass = param2;
    const slotIndex = parseInt(param3, 10);

    const reqRes = await query(`SELECT * FROM ludra_support_requests WHERE id = $1 LIMIT 1`, [requestId]);
    const request = reqRes.rows[0];

    if (!request || request.status !== "OPEN") {
      return interaction.editReply("⚠️ هذا الطلب غير متاح حالياً أو تم اكتماله/إلغاؤه.");
    }

    // 1. Verify Player Registration in Ludra
    const regRes = await query(`
      SELECT character_name, class_name, combat_power FROM ludra_raid_registrations WHERE discord_id = $1
      UNION
      SELECT character_name, class_name, combat_power FROM ludra_external_profiles WHERE discord_id = $1
      UNION
      SELECT character_name, class_name, combat_power FROM ludra_static_team_members WHERE discord_id = $1
      LIMIT 1
    `, [interaction.user.id]);

    if (regRes.rows.length === 0) {
      return interaction.editReply(
        `⚠️ **يشترط التسجيل في نظام لودرا لتتمكن من الفزعة للفرق الثابتة.**\n\n` +
        `يرجى تسجيل شخصيتك أولاً عبر روم التسجيل الرسمي:\n` +
        `👉 <#1566867947786473583>`
      );
    }

    const player = regRes.rows[0];
    const fulfilled = Array.isArray(request.fulfilled_slots) ? request.fulfilled_slots : [];

    // Check if slot already taken
    if (fulfilled.some(f => f.class === targetClass && f.index === slotIndex)) {
      return interaction.editReply("⚠️ عذراً، تم شغل هذا المقعد بواسطة لاعب آخر قبل قليل.");
    }

    // Check if user already volunteered in this same request
    if (fulfilled.some(f => f.filled_by_id === interaction.user.id)) {
      return interaction.editReply("⚠️ لقد قمت بالفزعة في هذا الطلب مسبقاً!");
    }

    // Add fulfillment
    fulfilled.push({
      class: targetClass,
      index: slotIndex,
      filled_by_id: interaction.user.id,
      filled_by_name: interaction.user.tag,
      char_name: player.character_name || interaction.user.username,
      cp: player.combat_power || null,
      filled_at: new Date().toISOString(),
    });

    const isCompleted = fulfilled.length >= request.needed_classes.length;
    const newStatus = isCompleted ? "COMPLETED" : "OPEN";

    // Update DB
    await query(
      `UPDATE ludra_support_requests SET fulfilled_slots = $1, status = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(fulfilled), newStatus, requestId]
    );

    request.fulfilled_slots = fulfilled;
    request.status = newStatus;

    // Refresh Live Card in Dispatch Channel
    if (request.message_id) {
      try {
        const dispatchChannel = await interaction.guild.channels.fetch(LUDRA_DISPATCH_CHANNEL_ID).catch(() => null);
        if (dispatchChannel) {
          const cardMsg = await dispatchChannel.messages.fetch(request.message_id).catch(() => null);
          if (cardMsg) {
            const { embed, components } = buildDispatchCard(request);
            await cardMsg.edit({
              content: isCompleted
                ? `🟢 **اكتمل دعم فريق #${request.team_number} وانطلقوا للريد!**`
                : cardMsg.content,
              embeds: [embed],
              components,
            });
          }
        }
      } catch (cardErr) {
        console.error("[LudraSupport] Error updating card message:", cardErr);
      }
    }

    // Grant Voice Room Access & Pull Member if Connected
    let pulledVoice = false;
    let voiceChannel = null;
    const team = await getCachedTeam(request.team_number);
    const voiceChannelId = team?.voice_channel_id || request.voice_channel_id;

    if (voiceChannelId) {
      voiceChannel = interaction.guild.channels.cache.get(voiceChannelId) ||
        await interaction.guild.channels.fetch(voiceChannelId).catch(() => null);

      if (voiceChannel) {
        try {
          await voiceChannel.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            Stream: true,
            UseVAD: true,
            SendMessages: true,
            UseSoundboard: true,
            UseExternalSounds: true,
            UseEmbeddedActivities: true,
          }, { reason: `Ludra support volunteer for team #${request.team_number}` });

          if (interaction.member?.voice?.channelId && interaction.member.voice.channelId !== voiceChannel.id) {
            await interaction.member.voice.setChannel(voiceChannel, `Pulled into team #${request.team_number} voice room`);
            pulledVoice = true;
          }
        } catch (vErr) {
          console.error("[LudraSupport] Voice permission/move error:", vErr);
        }
      }
    }

    // Notify Leader in DM or channel
    try {
      const leaderUser = await interaction.client.users.fetch(request.leader_discord_id).catch(() => null);
      if (leaderUser) {
        await leaderUser.send({
          content:
            `📢 **فزعة جديدة لفريقك #${request.team_number}!**\n` +
            `قام البطل <@${interaction.user.id}> (${player.character_name} • ${targetClass}) بالفزعة لمقعد **${targetClass}** في فريقك!\n` +
            (isCompleted
              ? `🟢 **اكتملت جميع مقاعد الدعم المطلوبة ويمكنكم الانطلاق للريد فوراً!**`
              : `⏳ جاري انتظار باقي الكلاسات المطلوبة...`),
        }).catch(() => {});
      }
    } catch (_) {}

    return interaction.editReply(
      `🎯 **كفو يا بطل! تم قبول فزعتك كـ (${targetClass}) لفريق #${request.team_number} بنجاح!**\n\n` +
      `• **الفريق:** ${request.team_name}\n` +
      `• **الشخصية:** ${player.character_name} ${player.combat_power ? `(${player.combat_power} CP)` : ""}\n` +
      (voiceChannel
        ? (pulledVoice
          ? `🎙️ تم سحبك تلقائياً إلى روم الفريق الصوتي: <#${voiceChannel.id}>!`
          : `🎙️ تم فتح صلاحية الروم الصوتي لك، يمكنك الدخول الآن: <#${voiceChannel.id}>`)
        : `🎙️ *الروم الصوتي للفريق غير مفعّل حالياً، تواصل مع القائد <@${request.leader_discord_id}>.*`) +
      `\n\nشكراً لفزعتك ودعمك لإخوانك في التحالف! ⚔️`
    );
  }

  // ── 5. Cancel Request Button ──
  if (action === "cancel") {
    await interaction.deferReply({ ephemeral: true });

    const requestId = parseInt(param1, 10);
    const reqRes = await query(`SELECT * FROM ludra_support_requests WHERE id = $1 LIMIT 1`, [requestId]);
    const request = reqRes.rows[0];

    if (!request) {
      return interaction.editReply("❌ تعذر العثور على هذا الطلب.");
    }

    const isLeader = String(interaction.user.id) === String(request.leader_discord_id);
    const isOwner = interaction.guild && String(interaction.guild.ownerId) === String(interaction.user.id);
    if (!isLeader && !isOwner) {
      return interaction.editReply("❌ عذراً، إلغاء الطلب مخصص لقائد الفريق فقط.");
    }

    await query(`UPDATE ludra_support_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [requestId]);
    request.status = "CANCELLED";

    if (request.message_id) {
      try {
        const dispatchChannel = await interaction.guild.channels.fetch(LUDRA_DISPATCH_CHANNEL_ID).catch(() => null);
        if (dispatchChannel) {
          const cardMsg = await dispatchChannel.messages.fetch(request.message_id).catch(() => null);
          if (cardMsg) {
            const { embed, components } = buildDispatchCard(request);
            await cardMsg.edit({
              content: `⚪ **تم إلغاء طلب الدعم بواسطة كابتن الفريق.**`,
              embeds: [embed],
              components,
            });
          }
        }
      } catch (err) {
        console.error("[LudraSupport] Error updating cancelled message:", err);
      }
    }

    return interaction.editReply("✅ **تم إلغاء طلب الدعم بنجاح وتحديث بطاقة الطلب.**");
  }
}
