/**
 * M3RGEEN Ticket System — Interaction Router & Lifecycle Controller
 * 
 * Manages modal submissions, ticket creation, permissions, living embed updates,
 * atomic claims, transfers, and confidential reports pipeline.
 */

import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  OverwriteType,
} from "discord.js";
import {
  TICKET_TYPES,
  TICKET_ROLES,
  TICKET_CHANNELS,
  SUPPORT_CATEGORY_ID,
  GUILD_NAMES,
  GUILD_LEADERSHIP,
  getGuildAuthorizedUserIds,
  getTicketAuthorizedGuildUserIds,
  getStaffGuildRoleLabel,
} from "./config.js";
import {
  createTicketRecord,
  hasActiveTicket,
  setControlMessageId,
  getTicketByChannel,
  claimTicketAtomic,
  transferTicket,
  addCollaborator,
  requestInfo,
  closeTicketAtomic,
  getTicketAuditLogs,
} from "./db.js";
import {
  buildTicketModal,
  buildRequestInfoModal,
  buildCloseTicketModal,
} from "./modals.js";
import {
  buildLivingEmbed,
  buildTicketActionRows,
  buildReportsChannelEmbed,
  buildRegularLogsEmbed,
} from "./embeds.js";
import {
  notifyOwnerConfidentialReport,
  notifyStaffReferred,
  notifyUserInformationRequested,
  notifyUserTicketClosed,
  logToRegularLogsChannel,
  logToReportsChannel,
} from "./notifications.js";
import { isEncryptionAvailable } from "./crypto.js";
import { archiveAndCloseTicket } from "./archiver.js";

/**
 * Check if the user is authorized to perform staff actions on this ticket.
 */
export function checkStaffPermissions(interaction, ticket) {
  const isServerOwner = interaction.guild?.ownerId === interaction.user.id;

  if (ticket.is_confidential) {
    // STRICTLY: Server Owner only for confidential reports!
    return isServerOwner;
  }

  if (isServerOwner) return true;
  if (interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  const hasRole = (roleId) => {
    if (!roleId) return false;
    const m = interaction.member;
    if (!m) return false;
    if (m.roles?.cache) return m.roles.cache.has(roleId);
    if (Array.isArray(m.roles)) return m.roles.includes(roleId);
    return false;
  };

  return hasRole(TICKET_ROLES.MODERATOR) || hasRole(TICKET_ROLES.GUILD_LEADER);
}

/**
 * Strict role and role-on-ticket verification for every ticket management action.
 * Enforces the approved permissions matrix:
 * - Server Owner (guild.ownerId): Retains authority to execute all actions on all tickets.
 * - Primary Assignee (claimed_by): Can reply, request_info, transfer, add_staff, and close.
 * - Collaborator (collaborators[]): Can reply and request_info. CANNOT transfer, add_staff, or close.
 * - Unassigned Staff: Can only claim unclaimed tickets. Cannot manage tickets claimed by others.
 * - Confidential Reports: Strictly restricted to Server Owner (guild.ownerId).
 */
export function checkStaffActionPermission(interaction, ticket, action) {
  const userId = interaction.user.id;
  const isServerOwner = interaction.guild?.ownerId === userId;

  // 1. Confidential Reports: Strictly Server Owner ONLY
  if (ticket.is_confidential) {
    if (!isServerOwner) {
      return {
        allowed: false,
        reason: "❌ هذا البلاغ سري للغاية ومخصص لقائد السيرفر (المالك) حصراً.",
      };
    }
    return { allowed: true };
  }

  // 2. Server Owner has full authority on all tickets
  if (isServerOwner) {
    if (action === "add_staff" && Array.isArray(ticket.collaborators) && ticket.collaborators.length >= 3) {
      return {
        allowed: false,
        reason: "⚠️ تم الوصول إلى الحد الأقصى للمسؤولين المشاركين في هذه التذكرة (3 مسؤولين كحد أقصى).",
      };
    }
    return { allowed: true };
  }

  // Helper to check member roles
  const m = interaction.member;
  const hasRole = (roleId) => {
    if (!roleId || !m) return false;
    if (m.roles?.cache) return m.roles.cache.has(roleId);
    if (Array.isArray(m.roles)) return m.roles.includes(roleId);
    return false;
  };

  const isPrimaryAssignee = ticket.claimed_by === userId;
  const isCollaborator = Array.isArray(ticket.collaborators) && ticket.collaborators.includes(userId);

  // 3. Primary Assignee can execute all actions
  if (isPrimaryAssignee) {
    // Check collaborator limit if action is add_staff
    if (action === "add_staff" && Array.isArray(ticket.collaborators) && ticket.collaborators.length >= 3) {
      return {
        allowed: false,
        reason: "⚠️ تم الوصول إلى الحد الأقصى للمسؤولين المشاركين في هذه التذكرة (3 مسؤولين كحد أقصى).",
      };
    }
    return { allowed: true };
  }

  // 4. Collaborator permissions
  if (isCollaborator) {
    if (action === "request_info") {
      return { allowed: true };
    }
    // Collaborator cannot transfer, add_staff, or close
    return {
      allowed: false,
      reason: "❌ بصفتك مسؤولاً مشاركاً، يمكنك الرد وطلب المعلومات فقط. لا تملك صلاحية إحالة التذكرة أو إضافة مسؤولين أو إغلاقها (هذه الصلاحيات للمسؤول الأساسي أو قائد السيرفر).",
    };
  }

  // 5. Claim action (when ticket is unclaimed)
  if (action === "claim") {
    if (ticket.claimed_by) {
      return {
        allowed: false,
        reason: "⚠️ تم استلام هذه التذكرة بالفعل بواسطة مسؤول آخر.",
      };
    }

    if (ticket.type === "guild_join" || ticket.type === "guild_transfer") {
      const authorizedStaffIds = getTicketAuthorizedGuildUserIds(ticket);
      const isGuildStaff = authorizedStaffIds.includes(userId);
      const isMod = hasRole(TICKET_ROLES.MODERATOR);

      if (!isGuildStaff && !isMod) {
        return {
          allowed: false,
          reason: "❌ هذه التذكرة مخصصة لقادة وضباط الجيلد المعني أو مشرفي السيرفر.",
        };
      }
      return { allowed: true };
    } else {
      const isMod = hasRole(TICKET_ROLES.MODERATOR);
      if (!isMod) {
        return {
          allowed: false,
          reason: "❌ عذراً، إدارة هذا القسم مخصصة لمشرفي السيرفر العامين فقط.",
        };
      }
      return { allowed: true };
    }
  }

  // For any action other than claim, check if ticket is claimed
  if (!ticket.claimed_by) {
    return {
      allowed: false,
      reason: "⚠️ يجب استلام التذكرة رسميًا أولاً قبل تنفيذ أي إجراء إداري عليها.",
    };
  }

  // Unassigned staff trying to manage another staff member's ticket
  return {
    allowed: false,
    reason: "❌ هذه التذكرة مستلمة ومسندة لمسؤول آخر. لا يمكنك تنفيذ هذا الإجراء إلا إذا تمت إحالتها إليك أو إضافتك كمسؤول مشارك.",
  };
}

/**
 * Check if the user is allowed to open a ticket (must have Member role or be Admin).
 */
export function canOpenTicket(interaction) {
  if (interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const m = interaction.member;
  if (!m) return false;
  if (m.roles?.cache) return m.roles.cache.has(TICKET_ROLES.MEMBER);
  if (Array.isArray(m.roles)) return m.roles.includes(TICKET_ROLES.MEMBER);
  return false;
}

/**
 * Retrieve list of eligible staff members for a specific ticket action.
 * - For transfer: Returns ALL Server Moderators regardless of guild.
 * - For add_staff: Returns ONLY Guild Leaders & Officers.
 */
export async function getEligibleStaffMembers(guild, ticket, { action = "transfer", excludeIds = [] } = {}) {
  await guild.members.fetch().catch(() => {});
  const eligible = new Map();

  // Confidential tickets: strictly Server Owner only
  if (ticket.is_confidential) {
    if (guild.ownerId && !excludeIds.includes(guild.ownerId)) {
      const ownerMember = guild.members.cache.get(guild.ownerId);
      if (ownerMember && !ownerMember.user.bot) {
        eligible.set(guild.ownerId, {
          id: guild.ownerId,
          displayName: ownerMember.displayName || ownerMember.user.username,
          username: ownerMember.user.username,
          roleLabel: "مالك السيرفر",
          isLeader: true,
        });
      }
    }
    return Array.from(eligible.values());
  }

  // 1. ACTION: ADD_STAFF (مسؤول مشارك) -> Show ONLY Guild Leaders & Officers
  if (action === "add_staff") {
    // Add mapped leaders and officers from GUILD_LEADERSHIP
    for (const [gKey, gData] of Object.entries(GUILD_LEADERSHIP)) {
      const staffIds = [gData.leaderId, ...(gData.officerIds || [])].filter(Boolean);
      for (const staffId of staffIds) {
        if (excludeIds.includes(staffId)) continue;
        const member = guild.members.cache.get(staffId);
        if (!member || member.user.bot) continue;

        const roleLabel = getStaffGuildRoleLabel(staffId, gData.name);
        eligible.set(staffId, {
          id: staffId,
          displayName: member.displayName || member.user.username,
          username: member.user.username,
          roleLabel,
          isLeader: true,
        });
      }
    }

    // Add any member holding the GUILD_LEADER role
    const leaderRole = guild.roles.cache.get(TICKET_ROLES.GUILD_LEADER);
    if (leaderRole?.members) {
      for (const [id, member] of leaderRole.members) {
        if (!member.user.bot && !excludeIds.includes(id) && !eligible.has(id)) {
          const roleLabel = getStaffGuildRoleLabel(id) || "قائد جيلد";
          eligible.set(id, {
            id,
            displayName: member.displayName || member.user.username,
            username: member.user.username,
            roleLabel,
            isLeader: true,
          });
        }
      }
    }

    // Add Server Owner if not excluded
    if (guild.ownerId && !excludeIds.includes(guild.ownerId) && !eligible.has(guild.ownerId)) {
      const ownerMember = guild.members.cache.get(guild.ownerId);
      if (ownerMember && !ownerMember.user.bot) {
        eligible.set(guild.ownerId, {
          id: guild.ownerId,
          displayName: ownerMember.displayName || ownerMember.user.username,
          username: ownerMember.user.username,
          roleLabel: "قائد السيرفر / المعرقين",
          isLeader: true,
        });
      }
    }

    return Array.from(eligible.values());
  }

  // 2. ACTION: TRANSFER (إحالة لمشرف آخر) -> Show ALL Server Moderators regardless of guild
  const modRole = guild.roles.cache.get(TICKET_ROLES.MODERATOR);
  if (modRole?.members) {
    for (const [id, member] of modRole.members) {
      if (!member.user.bot && !excludeIds.includes(id)) {
        const roleLabel = getStaffGuildRoleLabel(id) || "مشرف سيرفر";
        eligible.set(id, {
          id,
          displayName: member.displayName || member.user.username,
          username: member.user.username,
          roleLabel: roleLabel.includes("قائد") || roleLabel.includes("ضابط") ? roleLabel : "مشرف سيرفر",
          isLeader: false,
        });
      }
    }
  }

  // Add Server Owner if not excluded
  if (guild.ownerId && !excludeIds.includes(guild.ownerId) && !eligible.has(guild.ownerId)) {
    const ownerMember = guild.members.cache.get(guild.ownerId);
    if (ownerMember && !ownerMember.user.bot) {
      eligible.set(guild.ownerId, {
        id: guild.ownerId,
        displayName: ownerMember.displayName || ownerMember.user.username,
        username: ownerMember.user.username,
        roleLabel: "مالك السيرفر",
        isLeader: false,
      });
    }
  }

  return Array.from(eligible.values());
}

/**
 * Validate that a target user is genuinely authorized on the server for this ticket action.
 */
export async function validateStaffEligibility(guild, ticket, targetUserId, action = "transfer") {
  if (!targetUserId) return false;

  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member || member.user.bot) return false;

  // Server owner always valid
  if (guild.ownerId === targetUserId) {
    return true;
  }

  // Confidential tickets strictly restricted to Server Owner
  if (ticket.is_confidential) {
    return guild.ownerId === targetUserId;
  }

  // If adding as collaborator (add_staff): Target must be a Guild Leader or Officer
  if (action === "add_staff") {
    const allGuildLeaderIds = new Set();
    for (const g of Object.values(GUILD_LEADERSHIP)) {
      if (g.leaderId) allGuildLeaderIds.add(g.leaderId);
      if (Array.isArray(g.officerIds)) g.officerIds.forEach(id => allGuildLeaderIds.add(id));
    }
    if (allGuildLeaderIds.has(targetUserId)) return true;
    return member.roles.cache.has(TICKET_ROLES.GUILD_LEADER);
  }

  // If transferring (transfer): Target must be a Server Moderator
  return member.roles.cache.has(TICKET_ROLES.MODERATOR);
}

/**
 * Update the living embed inside the ticket channel.
 */
export async function updateLivingEmbed(channel, ticket, client) {
  try {
    const auditLogs = await getTicketAuditLogs(ticket.id, 4);
    const newEmbed = buildLivingEmbed(ticket, auditLogs);
    const newRows = buildTicketActionRows(ticket);

    if (ticket.control_message_id) {
      const message = await channel.messages.fetch(ticket.control_message_id).catch(() => null);
      if (message) {
        await message.edit({ embeds: [newEmbed], components: newRows });
        return;
      }
    }

    // If message not found, send new one and update ID
    const newMsg = await channel.send({ embeds: [newEmbed], components: newRows });
    await setControlMessageId(channel.id, newMsg.id);
  } catch (err) {
    console.error("[TicketRouter] Failed to update living embed:", err.message);
  }
}

/**
 * Main interaction handler called by centralized interactionRouter.js
 */
export async function handleTicketInteraction(interaction) {
  const customId = interaction.customId || "";

  // 1. Panel Select Menu Selection (Regular Tickets)
  if (customId === "ticket_open_menu") {
    const selectedValue = interaction.values?.[0] || "";
    const typeId = selectedValue.replace("ticket_select:", "");
    return await handleOpenSelection(interaction, typeId);
  }

  // Guild Pick for guild_join
  if (customId === "ticket_pick_guild:guild_join") {
    const targetGuild = interaction.values?.[0];
    if (!targetGuild || !GUILD_NAMES.includes(targetGuild)) {
      return await interaction.reply({ content: "❌ جيلد غير صالح.", ephemeral: true });
    }
    const modal = buildTicketModal("guild_join", { targetGuild });
    return await interaction.showModal(modal);
  }

  // Guild Pick Step 1 for guild_transfer
  if (customId === "ticket_pick_transfer_from") {
    const currentGuild = interaction.values?.[0];
    if (!currentGuild || !GUILD_NAMES.includes(currentGuild)) {
      return await interaction.reply({ content: "❌ جيلد غير صالح.", ephemeral: true });
    }
    const availableTargets = GUILD_NAMES.filter(g => g !== currentGuild);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`ticket_pick_transfer_to:${currentGuild}`)
      .setPlaceholder("اختر الجيلد المراد الانتقال إليه...")
      .addOptions(
        availableTargets.map(name => ({
          label: name,
          value: name,
          description: `الانتقال إلى جيلد ${name}`,
          emoji: "🎯",
        }))
      );
    const row = new ActionRowBuilder().addComponents(selectMenu);
    return await interaction.update({
      content: `🔄 **النقل بين الجيلدات (الخطوة 2 من 2)**\nالجيلد الحالي: **${currentGuild}**\nيرجى اختيار **الجيلد المراد الانتقال إليه** من القائمة أدناه:`,
      components: [row],
    });
  }

  // Guild Pick Step 2 for guild_transfer
  if (customId.startsWith("ticket_pick_transfer_to:")) {
    const currentGuild = customId.replace("ticket_pick_transfer_to:", "");
    const targetGuild = interaction.values?.[0];
    if (!targetGuild || !GUILD_NAMES.includes(targetGuild) || currentGuild === targetGuild) {
      return await interaction.reply({ content: "❌ خيار جيلد غير صالح أو مماثل للجيلد الحالي.", ephemeral: true });
    }
    const modal = buildTicketModal("guild_transfer", { currentGuild, targetGuild });
    return await interaction.showModal(modal);
  }

  // 2. Panel Button Selection (Confidential Report)
  if (customId.startsWith("ticket_open_btn:")) {
    const typeId = customId.replace("ticket_open_btn:", "");
    return await handleOpenSelection(interaction, typeId);
  }

  // 3. Modal Submissions for ticket creation
  if (customId.startsWith("ticket_submit:")) {
    const rawTypePayload = customId.replace("ticket_submit:", "");
    return await handleModalSubmission(interaction, rawTypePayload);
  }

  // 4. Ticket Control Actions (claim, transfer, add_staff, request_info, close)
  if (customId.startsWith("ticket_ctrl:")) {
    const action = customId.replace("ticket_ctrl:", "");
    return await handleControlAction(interaction, action);
  }

  // 5. Staff Select Menu Submissions (transfer, add_staff)
  if (customId.startsWith("ticket_user_select:") || customId.startsWith("ticket_staff_select:")) {
    const action = customId.replace("ticket_user_select:", "").replace("ticket_staff_select:", "");
    return await handleUserSelectAction(interaction, action);
  }

  // 6. Action Modal Submissions (request_info, close)
  if (customId.startsWith("ticket_action_modal:")) {
    const action = customId.replace("ticket_action_modal:", "");
    return await handleActionModalSubmission(interaction, action);
  }
}

/**
 * Handle initial open selection (Show modal or guild picker).
 */
async function handleOpenSelection(interaction, typeId) {
  // Authorization check: must have Member role
  if (!canOpenTicket(interaction)) {
    return await interaction.reply({
      content: "❌ عذراً، فتح التذاكر متاح فقط للأعضاء الحاصلين على رول **المعرقين**.",
      ephemeral: true,
    });
  }

  const typeConfig = Object.values(TICKET_TYPES).find(t => t.id === typeId);
  if (!typeConfig) {
    return await interaction.reply({
      content: "❌ نوع تذكرة غير معروف.",
      ephemeral: true,
    });
  }

  // Security Fail-Closed: Verify encryption subsystem is operational for confidential reports
  if (typeConfig.isConfidential && !isEncryptionAvailable()) {
    return await interaction.reply({
      content: "🔒 عذراً، خدمة البلاغات السرية معطلة حالياً للصيانة الأمنية. يرجى مراجعة إدارة السيرفر مباشرة.",
      ephemeral: true,
    });
  }

  // Duplicate ticket prevention check
  const existing = await hasActiveTicket(interaction.guildId, interaction.user.id, typeId);
  if (existing) {
    return await interaction.reply({
      content: `⚠️ لديك تذكرة مفتوحة بالفعل من هذا القسم: <#${existing.channel_id}> (رقم #${existing.ticket_number}). يرجى متابعتها هناك.`,
      ephemeral: true,
    });
  }

  // Dynamic guild selection for guild_join
  if (typeId === "guild_join") {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_pick_guild:guild_join")
      .setPlaceholder("اختر الجيلد المعني بمشكلة الانضمام...")
      .addOptions(
        GUILD_NAMES.map(name => ({
          label: name,
          value: name,
          description: `مشكلة في طلب انضمام جيلد ${name}`,
          emoji: "⚔️",
        }))
      );
    const row = new ActionRowBuilder().addComponents(selectMenu);
    return await interaction.reply({
      content: "⚔️ **مشكلة في الانضمام إلى الجيلد**\nيرجى اختيار الجيلد المعني من القائمة أدناه:",
      components: [row],
      ephemeral: true,
    });
  }

  // Dynamic guild selection for guild_transfer (Step 1)
  if (typeId === "guild_transfer") {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_pick_transfer_from")
      .setPlaceholder("اختر جيلدك الحالي المراد النقل منه...")
      .addOptions(
        GUILD_NAMES.map(name => ({
          label: name,
          value: name,
          description: `الانتقال من جيلد ${name}`,
          emoji: "🛡️",
        }))
      );
    const row = new ActionRowBuilder().addComponents(selectMenu);
    return await interaction.reply({
      content: "🔄 **النقل بين الجيلدات (الخطوة 1 من 2)**\nيرجى اختيار **جيلدك الحالي** المراد النقل منه:",
      components: [row],
      ephemeral: true,
    });
  }

  // Build and show modal for general tickets and confidential reports
  try {
    const modal = buildTicketModal(typeId);
    await interaction.showModal(modal);
  } catch (err) {
    console.error("[TicketRouter] Error displaying modal:", err.message);
    await interaction.reply({
      content: "❌ تعذر عرض نموذج التذكرة، يرجى المحاولة لاحقاً.",
      ephemeral: true,
    });
  }
}

/**
 * Handle modal submission and create ticket channel safely.
 */
async function handleModalSubmission(interaction, rawTypePayload) {
  await interaction.deferReply({ ephemeral: true });

  let typeId = rawTypePayload;
  const preselectedGuilds = {};

  if (rawTypePayload.startsWith("guild_join:")) {
    typeId = "guild_join";
    preselectedGuilds.target_guild = rawTypePayload.split(":")[1];
  } else if (rawTypePayload.startsWith("guild_transfer:")) {
    const parts = rawTypePayload.split(":");
    typeId = "guild_transfer";
    preselectedGuilds.current_guild = parts[1];
    preselectedGuilds.target_guild = parts[2];
  }

  const typeConfig = Object.values(TICKET_TYPES).find(t => t.id === typeId);
  if (!typeConfig) {
    return await interaction.editReply({ content: "❌ نوع تذكرة غير معروف." });
  }

  const isConfidential = Boolean(typeConfig.isConfidential);

  // Security Fail-Closed: Verify encryption before accepting confidential payload
  if (isConfidential && !isEncryptionAvailable()) {
    return await interaction.editReply({
      content: "🔒 عذراً، خدمة البلاغات السرية معطلة حالياً لعدم توفر متطلبات التشفير الصارم. لم يتم تسجيل أي بيانات حفاظاً على السرية.",
    });
  }

  // Re-verify duplicate check (anti-spam)
  const existing = await hasActiveTicket(interaction.guildId, interaction.user.id, typeId);
  if (existing) {
    return await interaction.editReply({
      content: `⚠️ لديك تذكرة مفتوحة بالفعل: <#${existing.channel_id}>.`,
    });
  }

  // Extract submitted modal data
  const modalData = { ...preselectedGuilds };
  for (const [key, field] of interaction.fields.fields) {
    modalData[key] = field.value?.trim() || "";
  }

  // Strict guild name validation for guild tickets
  if (typeId === "guild_join") {
    if (!modalData.target_guild || !GUILD_NAMES.includes(modalData.target_guild)) {
      return await interaction.editReply({
        content: `❌ يرجى تحديد جيلد معتمد صحيح من جيلدات التحالف: ${GUILD_NAMES.join("، ")}.`,
      });
    }
  }

  if (typeId === "guild_transfer") {
    if (!modalData.current_guild || !modalData.target_guild || !GUILD_NAMES.includes(modalData.current_guild) || !GUILD_NAMES.includes(modalData.target_guild)) {
      return await interaction.editReply({
        content: `❌ يرجى تحديد جيلدات معتمدة صحيحة من جيلدات التحالف: ${GUILD_NAMES.join("، ")}.`,
      });
    }
    if (modalData.current_guild === modalData.target_guild) {
      return await interaction.editReply({
        content: "❌ لا يمكن اختيار نفس الجيلد كنقطة انطلاق ووجهة في طلب النقل.",
      });
    }
  }

  const guild = interaction.guild;
  const user = interaction.user;
  const ownerId = guild.ownerId;

  // Build Permission Overwrites with Fail-Closed Strategy
  let permissionOverwrites = [];

  if (isConfidential) {
    // STRICT CONFIDENTIALITY:
    // Only Reporter, Server Owner, and Bot.
    // Explicit DENY for staff and guild leaders to prevent category inheritance leak.
    permissionOverwrites = [
      {
        id: guild.id, // @everyone
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: TICKET_ROLES.MODERATOR,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: TICKET_ROLES.GUILD_LEADER,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id, // Reporter
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: interaction.client.user.id, // Bot
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    if (ownerId) {
      permissionOverwrites.push({
        id: ownerId, // Server Owner
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      });
    }
  } else if (typeId === "guild_join" || typeId === "guild_transfer") {
    // STRICT GUILD ISOLATION:
    // Only Reporter, Bot, Server Owner, and strictly authorized Leaders/Officers of the involved guild(s).
    // Explicitly DENY MODERATOR and GUILD_LEADER roles to prevent cross-guild visibility leak!
    permissionOverwrites = [
      {
        id: guild.id, // @everyone
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: TICKET_ROLES.MODERATOR,
        type: OverwriteType.Role,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: TICKET_ROLES.GUILD_LEADER,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id, // Ticket Owner
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: interaction.client.user.id, // Bot
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    if (ownerId) {
      permissionOverwrites.push({
        id: ownerId,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      });
    }

    // Grant access strictly to authorized guild leaders and officers
    const authorizedStaffIds = getTicketAuthorizedGuildUserIds({ type: typeId, modal_data: modalData });
    for (const staffId of authorizedStaffIds) {
      if (staffId && staffId !== ownerId && staffId !== user.id) {
        permissionOverwrites.push({
          id: staffId,
          type: OverwriteType.Member,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
          ],
        });
      }
    }
  } else {
    // Regular / General Ticket Overwrites (Tech Support, Admin Complaint, Suggestion, General Inquiry)
    permissionOverwrites = [
      {
        id: guild.id, // @everyone
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: TICKET_ROLES.GUILD_LEADER,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id, // Ticket Owner
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: TICKET_ROLES.MODERATOR,
        type: OverwriteType.Role,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: interaction.client.user.id, // Bot
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    if (ownerId) {
      permissionOverwrites.push({
        id: ownerId,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      });
    }
  }

  // Create channel securely
  let channel = null;
  try {
    const channelPrefix = isConfidential ? "report" : "ticket";
    channel = await guild.channels.create({
      name: `${channelPrefix}-${user.username.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`,
      type: ChannelType.GuildText,
      parent: SUPPORT_CATEGORY_ID || null,
      permissionOverwrites,
    });
  } catch (chanErr) {
    console.error("[TicketRouter] Fail-closed: Channel creation failed:", chanErr.message);
    return await interaction.editReply({
      content: "❌ تعذر إنشاء غرفة التذكرة بشكل آمن. لم يتم تسجيل أي بيانات حفاظاً على السرية.",
    });
  }

  // Insert DB record
  let ticketRecord = null;
  try {
    ticketRecord = await createTicketRecord({
      guildId: guild.id,
      channelId: channel.id,
      ownerId: user.id,
      type: typeId,
      isConfidential,
      modalData,
    });

    // Rename channel to include clean sequential number
    const formattedNumber = String(ticketRecord.ticket_number).padStart(4, "0");
    await channel.setName(`${isConfidential ? "report" : "ticket"}-${formattedNumber}`).catch(() => {});
  } catch (dbErr) {
    console.error("[TicketRouter] Database insertion error:", dbErr.message);
    await channel.delete().catch(() => {});
    return await interaction.editReply({
      content: "❌ حدث خطأ أثناء حفظ بيانات التذكرة، تم إلغاء العملية.",
    });
  }

  // Send Initial Living Embed
  const livingEmbed = buildLivingEmbed(ticketRecord, []);
  const actionRows = buildTicketActionRows(ticketRecord);

  const welcomeMessage = isConfidential
    ? `🔒 مرحباً <@${user.id}>، تم استلام بلاغك السري وسيطلع عليه مالك السيرفر حصراً.`
    : `مرحباً <@${user.id}>! تم فتح تذكرتك وسيقوم فريق الدعم بالرد عليك قريباً.`;

  const controlMsg = await channel.send({
    content: welcomeMessage,
    embeds: [livingEmbed],
    components: actionRows,
  });

  await setControlMessageId(channel.id, controlMsg.id);

  // Dispatch Notifications & Logs
  const channelUrl = `https://discord.com/channels/${guild.id}/${channel.id}`;

  if (isConfidential) {
    // 1. Post to REPORTS channel
    const reportEmbed = buildReportsChannelEmbed(ticketRecord, channelUrl);
    const reportLogRes = await logToReportsChannel(guild, reportEmbed);

    // 2. DM Server Owner (1 alert only)
    const ownerDmRes = await notifyOwnerConfidentialReport(interaction.client, guild, ticketRecord);

    if (reportLogRes && !reportLogRes.success) {
      console.warn(`[TicketRouter] Notice: Failed to log report #${ticketRecord.ticket_number} to REPORTS channel (${reportLogRes.error}). Report safely preserved in encrypted DB & channel.`);
    }

    if (ownerDmRes && !ownerDmRes.success && !ownerDmRes.closedDm) {
      console.warn(`[TicketRouter] Notice: Could not DM owner for confidential report #${ticketRecord.ticket_number}: ${ownerDmRes.error}`);
    }

    // 3. ZERO leakage to LOGS channel or console!
  } else {
    // 1. Post to Regular LOGS channel
    const logEmbed = buildRegularLogsEmbed({
      ticket: ticketRecord,
      action: "OPENED",
      actorId: user.id,
    });
    await logToRegularLogsChannel(guild, logEmbed);
  }

  return await interaction.editReply({
    content: `✅ تم إنشاء تذكرتك بنجاح: <#${channel.id}> (رقم #${ticketRecord.ticket_number})`,
  });
}

/**
 * Handle staff control buttons (claim, transfer, add_staff, request_info, close).
 */
async function handleControlAction(interaction, action) {
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) {
    return await interaction.reply({ content: "❌ لم يتم العثور على تذكرة مرتبطة بهذه القناة.", ephemeral: true });
  }

  // Authorization Check
  const auth = checkStaffActionPermission(interaction, ticket, action);
  if (!auth.allowed) {
    return await interaction.reply({ content: auth.reason, ephemeral: true });
  }

  if (ticket.status === "CLOSED") {
    return await interaction.reply({ content: "⚠️ هذه التذكرة مغلقة بالفعل.", ephemeral: true });
  }

  // 1. Claim Action
  if (action === "claim") {
    const result = await claimTicketAtomic(ticket.channel_id, interaction.user.id);
    if (!result.success) {
      return await interaction.reply({
        content: "⚠️ عذراً، تم استلام هذه التذكرة بالفعل بواسطة مسؤول آخر.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: `✅ تم استلام التذكرة بواسطة <@${interaction.user.id}>.`,
    });

    await updateLivingEmbed(interaction.channel, result.ticket, interaction.client);

    if (!result.ticket.is_confidential) {
      const logEmbed = buildRegularLogsEmbed({
        ticket: result.ticket,
        action: "CLAIMED",
        actorId: interaction.user.id,
      });
      await logToRegularLogsChannel(interaction.guild, logEmbed);
    }
    return;
  }

  // 2. Transfer Action (Show Staff Select Menu)
  if (action === "transfer") {
    // Exclude current assigned staff member if any
    const excludeIds = [ticket.claimed_by].filter(Boolean);
    const staffList = await getEligibleStaffMembers(interaction.guild, ticket, { action: "transfer", excludeIds });

    if (staffList.length === 0) {
      return await interaction.reply({
        content: "⚠️ لا يوجد مشرفون آخرون مخولون متاحون للإحالة حالياً.",
        ephemeral: true,
      });
    }

    const options = staffList.slice(0, 25).map(s =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.displayName.substring(0, 50))
        .setDescription(`[${s.roleLabel}] @${s.username}`.substring(0, 100))
        .setValue(s.id)
        .setEmoji(s.isLeader ? "⚔️" : "🛡️")
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_staff_select:transfer")
      .setPlaceholder("اختر المشرف الجديد لإحالة التذكرة إليه...")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    return await interaction.reply({
      content: "🔄 **إحالة التذكرة لمشرف آخر:** اختر المشرف المخوّل من القائمة أدناه:",
      components: [new ActionRowBuilder().addComponents(selectMenu)],
      ephemeral: true,
    });
  }

  // 3. Add Staff Action (Show Staff Select Menu)
  if (action === "add_staff") {
    const existingCollaborators = Array.isArray(ticket.collaborators) ? ticket.collaborators : [];
    if (existingCollaborators.length >= 3) {
      return await interaction.reply({
        content: "⚠️ تم الوصول إلى الحد الأقصى للمسؤولين المشاركين في هذه التذكرة (3 مسؤولين كحد أقصى).",
        ephemeral: true,
      });
    }

    // Exclude current assigned staff member and already added collaborators
    const excludeIds = [
      ticket.claimed_by,
      ...existingCollaborators,
    ].filter(Boolean);

    const staffList = await getEligibleStaffMembers(interaction.guild, ticket, { action: "add_staff", excludeIds });

    if (staffList.length === 0) {
      return await interaction.reply({
        content: "⚠️ تم إضافة جميع المسؤولين المخولين بالفعل أو لا يوجد مسؤولون متاحون حالياً.",
        ephemeral: true,
      });
    }

    const options = staffList.slice(0, 25).map(s =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.displayName.substring(0, 50))
        .setDescription(`[${s.roleLabel}] @${s.username}`.substring(0, 100))
        .setValue(s.id)
        .setEmoji(s.isLeader ? "⚔️" : "🛡️")
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_staff_select:add_staff")
      .setPlaceholder("اختر المسؤول المشارك لإضافته للقناة...")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    return await interaction.reply({
      content: "➕ **إضافة مسؤول مشارك:** اختر المسؤول المخوّل لإضافته للتذكرة:",
      components: [new ActionRowBuilder().addComponents(selectMenu)],
      ephemeral: true,
    });
  }

  // 4. Request Info Action (Show Modal)
  if (action === "request_info") {
    const modal = buildRequestInfoModal(ticket.ticket_number);
    return await interaction.showModal(modal);
  }

  // 5. Close Ticket Action (Show Modal)
  if (action === "close") {
    const modal = buildCloseTicketModal(ticket.ticket_number);
    return await interaction.showModal(modal);
  }
}

/**
 * Handle staff select actions (transfer or add_staff).
 */
async function handleUserSelectAction(interaction, action) {
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status === "CLOSED") {
    return await interaction.reply({ content: "❌ التذكرة غير متاحة أو مغلقة.", ephemeral: true });
  }

  // Authorization Check
  const auth = checkStaffActionPermission(interaction, ticket, action);
  if (!auth.allowed) {
    return await interaction.reply({ content: auth.reason, ephemeral: true });
  }

  const selectedUserId = interaction.values?.[0];
  if (!selectedUserId) {
    return await interaction.reply({ content: "❌ لم يتم تحديد مستخدم.", ephemeral: true });
  }

  // Server-side strict authorization validation
  const isAuthorized = await validateStaffEligibility(interaction.guild, ticket, selectedUserId, action);
  if (!isAuthorized) {
    return await interaction.reply({
      content: action === "add_staff"
        ? "❌ عذراً، لا يمكن إضافة إلا قادة وضباط الجيلدات كمسؤولين مشاركين."
        : "❌ عذراً، المستخدم المختار ليس من مشرفي السيرفر المخولين باستلام التذاكر.",
      ephemeral: true,
    });
  }

  if (action === "transfer") {
    if (ticket.claimed_by === selectedUserId) {
      return await interaction.reply({
        content: "⚠️ هذا المشرف هو المسؤول الحالي عن التذكرة بالفعل.",
        ephemeral: true,
      });
    }

    const res = await transferTicket(ticket.channel_id, selectedUserId, interaction.user.id);
    if (!res.success) {
      return await interaction.reply({ content: "❌ تعذر إحالة التذكرة.", ephemeral: true });
    }

    // Grant channel permission to the new staff
    await interaction.channel.permissionOverwrites.edit(selectedUserId, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true,
      EmbedLinks: true,
    }, { type: OverwriteType.Member }).catch(() => {});

    await interaction.reply({
      content: `🔄 تمت إحالة التذكرة رسمياً إلى <@${selectedUserId}> بواسطة <@${interaction.user.id}>.`,
    });

    await updateLivingEmbed(interaction.channel, res.ticket, interaction.client);

    // Send 1 DM to the referred staff
    await notifyStaffReferred(interaction.client, interaction.guild, selectedUserId, res.ticket, interaction.user.id);

    if (!res.ticket.is_confidential) {
      const logEmbed = buildRegularLogsEmbed({
        ticket: res.ticket,
        action: "TRANSFERRED",
        actorId: interaction.user.id,
        details: { to: selectedUserId },
      });
      await logToRegularLogsChannel(interaction.guild, logEmbed);
    }
    return;
  }

  if (action === "add_staff") {
    const existingCollaborators = Array.isArray(ticket.collaborators) ? ticket.collaborators : [];
    if (existingCollaborators.length >= 3) {
      return await interaction.reply({
        content: "⚠️ تم الوصول إلى الحد الأقصى للمسؤولين المشاركين في هذه التذكرة (3 مسؤولين كحد أقصى).",
        ephemeral: true,
      });
    }

    if (ticket.claimed_by === selectedUserId || existingCollaborators.includes(selectedUserId)) {
      return await interaction.reply({
        content: "⚠️ هذا المسؤول مسجل بالفعل في هذه التذكرة.",
        ephemeral: true,
      });
    }

    const res = await addCollaborator(ticket.channel_id, selectedUserId, interaction.user.id);
    if (!res.success) {
      if (res.maxReached) {
        return await interaction.reply({
          content: "⚠️ تم الوصول إلى الحد الأقصى للمسؤولين المشاركين (3 مسؤولين كحد أقصى).",
          ephemeral: true,
        });
      }
      return await interaction.reply({
        content: res.alreadyAdded ? "⚠️ هذا المسؤول مضاف بالفعل للتذكرة." : "❌ تعذر إضافة المسؤول.",
        ephemeral: true,
      });
    }

    // Grant channel permission to the collaborator
    await interaction.channel.permissionOverwrites.edit(selectedUserId, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true,
      EmbedLinks: true,
    }, { type: OverwriteType.Member }).catch(() => {});

    await interaction.reply({
      content: `👥 تمت إضافة <@${selectedUserId}> كمسؤول مشارك في التذكرة.`,
    });

    await updateLivingEmbed(interaction.channel, res.ticket, interaction.client);

    if (!res.ticket.is_confidential) {
      const logEmbed = buildRegularLogsEmbed({
        ticket: res.ticket,
        action: "COLLABORATOR_ADDED",
        actorId: interaction.user.id,
        details: { to: selectedUserId },
      });
      await logToRegularLogsChannel(interaction.guild, logEmbed);
    }
    return;
  }
}

/**
 * Handle action modal submissions (request_info or close).
 */
async function handleActionModalSubmission(interaction, action) {
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status === "CLOSED") {
    return await interaction.reply({ content: "❌ التذكرة غير متاحة أو مغلقة.", ephemeral: true });
  }

  // Authorization Check
  const auth = checkStaffActionPermission(interaction, ticket, action);
  if (!auth.allowed) {
    return await interaction.reply({ content: auth.reason, ephemeral: true });
  }

  if (action === "request_info") {
    const questionText = interaction.fields.getTextInputValue("question_text")?.trim();
    const res = await requestInfo(ticket.channel_id, interaction.user.id, questionText);
    if (!res.success) {
      return await interaction.reply({ content: "❌ تعذر تحديث حالة التذكرة.", ephemeral: true });
    }

    await interaction.reply({
      content: `❓ **طلب معلومات إضافية من <@${ticket.owner_id}>:**\n> "${questionText}"`,
    });

    await updateLivingEmbed(interaction.channel, res.ticket, interaction.client);

    // Notify ticket owner via DM
    await notifyUserInformationRequested(interaction.client, interaction.guild, res.ticket, questionText, interaction.user.id);

    if (!res.ticket.is_confidential) {
      const logEmbed = buildRegularLogsEmbed({
        ticket: res.ticket,
        action: "INFO_REQUESTED",
        actorId: interaction.user.id,
      });
      await logToRegularLogsChannel(interaction.guild, logEmbed);
    }
    return;
  }

  if (action === "close") {
    const closeReason = interaction.fields.getTextInputValue("close_reason")?.trim() || "تم حل الموضوع بنجاح";

    // Execute fail-safe archive and auto-deletion pipeline
    const result = await archiveAndCloseTicket({
      interaction,
      channel: interaction.channel,
      ticket,
      actor: interaction.user,
      closeReason,
    });

    if (!result.success) {
      if (result.error === "TICKET_ALREADY_CLOSED" || result.error === "ALREADY_CLOSED_IN_DB") {
        if (!interaction.replied) {
          await interaction.reply({ content: "⚠️ التذكرة مغلقة أو جاري أرشفتها بالفعل.", ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // Brief status notification to user via DM for regular tickets only (files are NEVER sent in DM)
    await notifyUserTicketClosed(interaction.client, interaction.guild, ticket, closeReason);
    return;
  }
}
