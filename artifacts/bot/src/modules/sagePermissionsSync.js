import { PermissionFlagsBits } from "discord.js";
import { query } from "../database/index.js";

export const SAGE_GUILD_ID = "1507696012410749030";

export const ROLE_IDS = {
  LEADER: "1507733275278577916",      // 👑 ┃ Alliance Leader
  COUNCIL: "1507733319989858435",     // 📜 ┃ Alliance Council
  SHOTCALLER: "1507733404781645874",  // 🎙️ ┃ Shotcaller
  GUILD_LEADER: "1507733486671233175",// 🛡️ ┃ Guild Leader
  ASSASSIN: "1507733628640039032",    // 🥷 ┃ Assassin
  MEMBER: "1571516616435302410",      // ⚔️ ┃ Alliance Member
  RECRUIT: "1508443474960060487",     // 🆕 New Recruit
  VERIFICATION: "1508444579488075868",// 🔒 Verification
};

export const CHANNEL_IDS = {
  // 📌 ┃ بوابة التحالف
  CAT_GATEWAY: "1507700341167362058",
  RULES: "1507701269035225188",        // 📜┊القوانين
  REGISTRATION: "1507702008906252310", // 📝┊التسجيل
  LEADERS: "1508696447674093608",      // 🛡️┊القادة
  MEMBERS: "1507778645962522817",      // 👥┊الأعضاء
  GUILDS: "1507703833223233567",       // 🏰┊القيلدات

  // 📢 ┃ القيادة والسيطرة
  CAT_COMMAND: "1507704306428678295",
  ORDERS: "1507705678809272410",       // 📣┊الأوامر
  TACTICS: "1507706122281160744",      // 🗺️┊الخطط
  DEPLOYMENT: "1508678825066762280",   // 📊┊توزيع-القوات

  // ⚔️ ┃ ساحة التحالف
  CAT_WARROOM: "1507706560074350683",
  CHAT: "1507706953521041509",         // 💬┊شات-التحالف

  // 🔊 ┃ صوت التحالف
  CAT_VOICE: "1507707354626527232",
  WAR_STAGE: "1571540894061039788",    // 🏟️┊سيج-الحلف
  COMMAND_VC: "1507696013551472683",   // 🎙️┊غرفة-القيادة
  GENERAL_VC: "1507708086171992125",   // 🔊┊الكول-العام
  GENERAL_VC2: "1571540896401326090",  // 🔊┊الكول-العام-2
  ASSASSIN_VC1: "1507709012022526005", // 🗡️┊فرقة-اغتيال-1
  ASSASSIN_VC2: "1507709389283393577", // 🗡️┊فرقة-اغتيال-2

  // 🔐 ┃ إدارة السيرفر
  CAT_ADMIN: "1507797281662046301",
  UPDATES: "1507797482606952512",      // ⚙️┊تحديثات
  LEADER_APP: "1508469394873913549",   // 📥┊طلب-قيادة
  ALL_APP: "1508451380560531586",      // 📋┊طلبات-الانضمام
  MANAGEMENT: "1508477241896730736",   // 🛠️┊الإدارة
  PERMS: "1508489408251171080",        // 🔑┊الصلاحيات
};

/**
 * Ensures the core '⚔️ ┃ Alliance Member' role exists and returns it.
 */
export async function ensureAllianceMemberRole(guild) {
  await guild.roles.fetch();
  let role = guild.roles.cache.find(
    (r) => r.id === ROLE_IDS.MEMBER || r.name === "⚔️ ┃ Alliance Member" || r.name === "⚔️ عضو التحالف"
  );

  if (!role) {
    console.log("[SagePerms] Creating '⚔️ ┃ Alliance Member' base role...");
    const assassinRole = guild.roles.cache.get(ROLE_IDS.ASSASSIN);
    const targetPos = assassinRole ? Math.max(1, assassinRole.position - 1) : 4;

    role = await guild.roles.create({
      name: "⚔️ ┃ Alliance Member",
      color: 0x2ecc71,
      hoist: true,
      mentionable: true,
      position: targetPos,
      reason: "Automated base role for all accepted siege alliance members",
    });
    console.log(`[SagePerms] Created role: ${role.name} (${role.id})`);
  }

  return role;
}

/**
 * Automatically configures and syncs all channel & role permissions across the SAGE server.
 */
export async function syncAllSagePermissions(guild) {
  if (guild.id !== SAGE_GUILD_ID) return;

  console.log(`[SagePerms] Starting full permission sync for guild ${guild.name} (${guild.id})...`);
  await guild.roles.fetch();
  await guild.channels.fetch();

  const memberRole = await ensureAllianceMemberRole(guild);
  const everyoneRole = guild.roles.everyone;

  const roles = {
    everyone: everyoneRole,
    member: memberRole,
    verification: guild.roles.cache.get(ROLE_IDS.VERIFICATION),
    recruit: guild.roles.cache.get(ROLE_IDS.RECRUIT),
    leader: guild.roles.cache.get(ROLE_IDS.LEADER),
    council: guild.roles.cache.get(ROLE_IDS.COUNCIL),
    shotcaller: guild.roles.cache.get(ROLE_IDS.SHOTCALLER),
    guildLeader: guild.roles.cache.get(ROLE_IDS.GUILD_LEADER),
    assassin: guild.roles.cache.get(ROLE_IDS.ASSASSIN),
  };

  const botMember = await guild.members.fetchMe();

  // ─────────────────────────────────────────────────────────────────────────
  // A. Server-Level Role Permissions (Security & Moderation Control)
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Council (المستشارين): Timeout (ModerateMembers) ONLY. No Kick, No Ban.
  if (roles.council?.editable) {
    await roles.council.setPermissions(
      [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers, // Timeout capability
      ],
      "Sage Security: Council Timeout only (No Kick/Ban)"
    ).catch((err) => console.warn(`[SagePerms] Could not update Council permissions: ${err.message}`));
    console.log("[SagePerms] ✅ Configured Council role: ModerateMembers (Timeout) enabled, Kick/Ban strictly disabled.");
  }

  // 2. Guild Leader: No Kick, No Ban, No Timeout. (ManageMessages granted per channel)
  if (roles.guildLeader?.editable) {
    await roles.guildLeader.setPermissions(
      [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
      "Sage Security: Guild Leader safe permissions"
    ).catch((err) => console.warn(`[SagePerms] Could not update Guild Leader permissions: ${err.message}`));
  }

  // 3. Shotcaller: Tactical voice, Priority speaker, No Kick/Ban/Timeout
  if (roles.shotcaller?.editable) {
    await roles.shotcaller.setPermissions(
      [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.PrioritySpeaker,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers,
      ],
      "Sage Security: Shotcaller tactical permissions"
    ).catch((err) => console.warn(`[SagePerms] Could not update Shotcaller permissions: ${err.message}`));
  }

  // 4. Alliance Member: Safe baseline permissions
  if (roles.member?.editable) {
    await roles.member.setPermissions(
      [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.UseVAD,
      ],
      "Sage Security: Alliance Member baseline permissions"
    ).catch((err) => console.warn(`[SagePerms] Could not update Member permissions: ${err.message}`));
  }

  // Helper to safely set overwrites on a channel or category
  async function applyOverwrites(channelId, overwritesList) {
    const ch = guild.channels.cache.get(channelId);
    if (!ch) {
      console.warn(`[SagePerms] Channel/Category ${channelId} not found.`);
      return;
    }

    // Always include bot full access
    const finalOverwrites = [
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      ...overwritesList.filter((ow) => Boolean(ow.id)),
    ];

    try {
      await ch.permissionOverwrites.set(finalOverwrites, "Automated Sage Permission Sync");
      console.log(`[SagePerms] ✅ Synced permissions for: ${ch.name}`);
    } catch (err) {
      console.error(`[SagePerms] ❌ Failed to set permissions for ${ch.name}:`, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. 📌 ┃ بوابة التحالف
  // ─────────────────────────────────────────────────────────────────────────
  await applyOverwrites(CHANNEL_IDS.CAT_GATEWAY, [
    {
      id: roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ]);

  // 📜┊القوانين: Read-Only for EVERYONE, ReadMessageHistory enabled
  await applyOverwrites(CHANNEL_IDS.RULES, [
    {
      id: roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
    },
    {
      id: roles.verification?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ]);

  // 📝┊التسجيل: Default onboarding channel - @everyone read-only, hidden from Verification
  await applyOverwrites(CHANNEL_IDS.REGISTRATION, [
    {
      id: roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.recruit?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages],
    },
    {
      id: roles.council?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.leader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
  ]);

  // 🛡️┊القادة: Leaders Showcase Roster - View & ReadMessageHistory for all, ManageMessages for Guild Leaders & above
  await applyOverwrites(CHANNEL_IDS.LEADERS, [
    {
      id: roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.member?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.guildLeader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
      deny: [PermissionFlagsBits.SendMessages],
    },
    {
      id: roles.council?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.leader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
  ]);

  // 👥┊الأعضاء & 🏰┊القيلدات: Default onboarding channels - Read-Only, ReadMessageHistory enabled
  const rosterChannels = [CHANNEL_IDS.MEMBERS, CHANNEL_IDS.GUILDS];
  for (const rChId of rosterChannels) {
    await applyOverwrites(rChId, [
      {
        id: roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageMessages],
      },
      {
        id: roles.verification?.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.member?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
      },
      {
        id: roles.guildLeader?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: roles.council?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
      },
      {
        id: roles.leader?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
      },
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. 📢 ┃ القيادة والسيطرة (📣┊الأوامر, 🗺️┊الخطط, 📊┊توزيع-القوات)
  // ─────────────────────────────────────────────────────────────────────────
  await applyOverwrites(CHANNEL_IDS.CAT_COMMAND, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.recruit?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.member?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.guildLeader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageMessages],
      deny: [PermissionFlagsBits.SendMessages],
    },
    {
      id: roles.shotcaller?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.council?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.leader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
  ]);

  // 📣┊الأوامر: Strictly Alliance Leader ONLY for sending messages. Council/Shotcaller/GuildLeader/Members CANNOT write (Reactions only).
  await applyOverwrites(CHANNEL_IDS.ORDERS, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.recruit?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.member?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.guildLeader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.shotcaller?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.council?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages], // Council strictly blocked from writing
    },
    {
      id: roles.leader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.AddReactions,
      ],
    },
  ]);

  // 🗺️┊الخطط & 📊┊توزيع-القوات: Guild Leaders & Leaders/Council/Shotcaller can write and read history. Members read-only (reactions allowed).
  const planningChannels = [CHANNEL_IDS.TACTICS, CHANNEL_IDS.DEPLOYMENT];
  for (const pChId of planningChannels) {
    await applyOverwrites(pChId, [
      {
        id: roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.verification?.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.recruit?.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.member?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
      },
      {
        id: roles.guildLeader?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: roles.shotcaller?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: roles.council?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: roles.leader?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. ⚔️ ┃ ساحة التحالف (💬┊شات-التحالف)
  // Manage Messages granted to Guild Leaders and above!
  // Read Message History, Send Messages, Attach Files, Emojis for all Members!
  // ─────────────────────────────────────────────────────────────────────────
  await applyOverwrites(CHANNEL_IDS.CAT_WARROOM, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.recruit?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.member?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.SendVoiceMessages,
      ],
      deny: [PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.guildLeader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages, // Manage Messages for Guild Leaders!
      ],
    },
    {
      id: roles.shotcaller?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    {
      id: roles.council?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    {
      id: roles.leader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ]);

  await applyOverwrites(CHANNEL_IDS.CHAT, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.recruit?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.member?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.SendVoiceMessages,
      ],
      deny: [PermissionFlagsBits.ManageMessages],
    },
    {
      id: roles.guildLeader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages, // Manage Messages for Guild Leaders!
      ],
    },
    {
      id: roles.shotcaller?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    {
      id: roles.council?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    {
      id: roles.leader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // 4. 🔊 ┃ صوت التحالف
  // ─────────────────────────────────────────────────────────────────────────
  await applyOverwrites(CHANNEL_IDS.CAT_VOICE, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.recruit?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.member?.id,
      allow: [PermissionFlagsBits.ViewChannel],
    },
  ]);

  // 🏟️┊سيج-الحلف (War Stage Channel - Unlimited listeners, zero noise)
  await applyOverwrites(CHANNEL_IDS.WAR_STAGE, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: roles.recruit?.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: roles.member?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [
        PermissionFlagsBits.RequestToSpeak, // Keep stage pure for war shotcalls
      ],
    },
    {
      id: roles.guildLeader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.RequestToSpeak,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: roles.shotcaller?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.RequestToSpeak,
        PermissionFlagsBits.PrioritySpeaker,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: roles.council?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.RequestToSpeak,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: roles.leader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.RequestToSpeak,
        PermissionFlagsBits.PrioritySpeaker,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ]);

  // 🔊┊الكول-العام & 🔊┊الكول-العام-2: All members can connect, speak, stream, use VAD
  const generalVcs = [CHANNEL_IDS.GENERAL_VC, CHANNEL_IDS.GENERAL_VC2];
  for (const gVcId of generalVcs) {
    await applyOverwrites(gVcId, [
      {
        id: roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.verification?.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.recruit?.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.member?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
        ],
      },
      {
        id: roles.guildLeader?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.MoveMembers,
        ],
      },
      {
        id: roles.shotcaller?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
          PermissionFlagsBits.PrioritySpeaker,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
        ],
      },
      {
        id: roles.council?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
        ],
      },
      {
        id: roles.leader?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
          PermissionFlagsBits.PrioritySpeaker,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers,
        ],
      },
    ]);
  }

  // 🎙️┊غرفة-القيادة: Strictly Leaders, Council, Shotcaller, and Guild Leaders
  await applyOverwrites(CHANNEL_IDS.COMMAND_VC, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: roles.member?.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    },
    {
      id: roles.guildLeader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream],
    },
    {
      id: roles.shotcaller?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.PrioritySpeaker],
    },
    {
      id: roles.council?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream],
    },
    {
      id: roles.leader?.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream],
    },
  ]);

  // 🗡️┊فرقة-اغتيال-1 & 2: Strictly Assassins, Shotcaller, Council, Leader
  const assassinChannels = [CHANNEL_IDS.ASSASSIN_VC1, CHANNEL_IDS.ASSASSIN_VC2];
  for (const aChId of assassinChannels) {
    await applyOverwrites(aChId, [
      {
        id: roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      {
        id: roles.member?.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      {
        id: roles.assassin?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream],
      },
      {
        id: roles.shotcaller?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream],
      },
      {
        id: roles.council?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream],
      },
      {
        id: roles.leader?.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream],
      },
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. 🔐 ┃ إدارة السيرفر (100% PRIVATE TO COUNCIL & ALLIANCE LEADER)
  // ─────────────────────────────────────────────────────────────────────────
  await applyOverwrites(CHANNEL_IDS.CAT_ADMIN, [
    {
      id: roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.verification?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.recruit?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.member?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.guildLeader?.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: roles.council?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    },
    {
      id: roles.leader?.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ]);

  const adminChildren = [
    CHANNEL_IDS.UPDATES,
    CHANNEL_IDS.LEADER_APP,
    CHANNEL_IDS.ALL_APP,
    CHANNEL_IDS.MANAGEMENT,
    CHANNEL_IDS.PERMS,
  ];
  for (const admChId of adminChildren) {
    await applyOverwrites(admChId, [
      {
        id: roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.member?.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.guildLeader?.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: roles.council?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: roles.leader?.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Backfill all accepted members with the new '⚔️ ┃ Alliance Member' role
  // ─────────────────────────────────────────────────────────────────────────
  const acceptedRes = await query("SELECT user_id FROM sage_recruitment WHERE status = 'accepted'");
  let backfilledCount = 0;
  for (const row of acceptedRes.rows) {
    const m = await guild.members.fetch(row.user_id).catch(() => null);
    if (m && !m.roles.cache.has(memberRole.id)) {
      await m.roles.add(memberRole.id).catch(() => {});
      backfilledCount++;
    }
  }

  console.log(`[SagePerms] ✅ Backfilled ${backfilledCount} accepted member(s) with '⚔️ ┃ Alliance Member' role.`);
  console.log("[SagePerms] 🎉 All SAGE Alliance permissions successfully synced and stabilized!");
  return { memberRole, backfilledCount };
}
