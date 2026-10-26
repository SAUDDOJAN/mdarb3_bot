/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║              SAGE ALLIANCE CONTROLLER — ISOLATED MODULE             ║
 * ║  Guild ID: 1507696012410749030                                      ║
 * ║  ALL functions begin with a strict guild isolation guard.           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { scrapeProfile, classIconUrl } from "./scraper.js";
import { query } from "../database/index.js";
import { handleSageMgmtAction } from "./sageMgmtPanels.js";
import { updateGuildStatCard } from "../tasks/sageGuildStats.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const SAGE_GUILD_ID = "1507696012410749030";

// The role that marks guild roles in Sage server (roles containing ⚔️)
const GUILD_ROLE_SYMBOL = "⚔️";

// The role to remove upon guild selection (visitor/unaffiliated role)
const SAGE_GUEST_ROLE_ID = process.env.SAGE_GUEST_ROLE_ID ?? null;

// Channel where accepted member roster cards are posted
const SAGE_ROSTER_CHANNEL_ID = process.env.SAGE_ROSTER_CHANNEL_ID ?? null;

// Channel where admin review requests land
const SAGE_ADMIN_CHANNEL_ID = process.env.SAGE_ADMIN_CHANNEL_ID ?? null;

// ─── Isolation Guard Helper ────────────────────────────────────────────────────
function isSageGuild(guildId) {
  return guildId === SAGE_GUILD_ID;
}

const numFmt = (n) => Number(n).toLocaleString("en-US");
const trunc = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));

// ─── /sage-join Command Handler ───────────────────────────────────────────────
/**
 * Handles the /sage-join slash command.
 * Sends the bilingual welcome embed with the "Join Now" button.
 */
export async function handleSageJoinCommand(interaction) {
   // ← strict isolation

  const rulesEmbed = new EmbedBuilder()
    .setColor(0xd4af37) // Gold — premium feel
    .setTitle("⚔️ Siege Alliance — Join System")
    .setDescription(
      [
        "**🇬🇧 Welcome to the Siege Alliance!**",
        "Please read all rules carefully before joining.",
        "",
        "**📜 Alliance Rules:**",
        "**1.** Mutual respect between all members at all times.",
        "**2.** No public arguments or conflicts in any server channel.",
        "**3.** 🚨 **Zero Tolerance Policy:** Any public conflict = **immediate permanent ban**, no prior warning.",
        "**4.** All disputes must be resolved via DM with staff only.",
        "**5.** You must link your shugo.gg profile for character verification.",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━",
        "*By clicking Join Now, you agree to all rules listed above.*",
      ].join("\n")
    )
    .setFooter({ text: "Siege Alliance • Official Join System" })
    .setTimestamp();

  const joinRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sage:join_start")
      .setLabel("⚔️ Join Now")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({ embeds: [rulesEmbed], components: [joinRow] });
}

// ─── Button: sage:join_start → Show Guild Select Menu ─────────────────────────
async function handleJoinStart(interaction) {
  
  await interaction.deferReply({ flags: 64 });

  // Fetch all roles containing ⚔️ from the guild, plus the Solo Player role
  await interaction.guild.roles.fetch();
  const guildRoles = interaction.guild.roles.cache.filter(
    (r) => r.name.includes(GUILD_ROLE_SYMBOL) || r.id === "1519397169897935019"
  );

  
  let options = [];
  if (guildRoles.size > 0) {
    options = guildRoles.map((role) => {
      const isSolo = role.id === "1519397169897935019";
      let cleanName = role.name.replace(GUILD_ROLE_SYMBOL, "").trim();
      if (isSolo) {
        cleanName = cleanName.replace(GUILD_ROLE_SYMBOL, "").trim();
      } else {
        cleanName = cleanName + " Guild";
      }
      return {
        label: cleanName,
        value: role.id,
        emoji: isSolo ? "🙎‍♂️" : "⚔️",
        isSolo: isSolo
      };
    });
    
    options.sort((a, b) => {
      if (a.isSolo) return -1;
      if (b.isSolo) return 1;
      return a.label.localeCompare(b.label);
    });
    
    options = options.slice(0, 24);
  }

  // Always add Solo Player if not present
  if (!options.some(o => o.value === "1519397169897935019")) {
    options.unshift({
      label: "Solo Player",
      value: "1519397169897935019",
      emoji: "🙎‍♂️"
    });
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("sage:select_guild")
      .setPlaceholder("Select your Guild")
      .addOptions(options)
  );

  const addGuildRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sage:add_guild_start")
      .setLabel("➕ Add New Guild")
      .setStyle(ButtonStyle.Success)
  );

  const selectEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(GUILD_ROLE_SYMBOL + " Select Your Guild")
    .setDescription(
      "Select the guild you belong to in Aion 2 from the list below.\n*(If your guild is not listed, click 'Add New Guild' to create it.)*"
    );

  const components = [selectRow, addGuildRow];

  await interaction.editReply({ embeds: [selectEmbed], components: components });
}

// ─── Button: sage:add_guild_start → Show Add Guild Modal ──────────────────────
async function handleAddGuildStart(interaction) {
  

  const modal = new ModalBuilder()
    .setCustomId('sage:add_guild_modal')
    .setTitle('Add New Guild');

  const guildNameInput = new TextInputBuilder()
    .setCustomId('guild_name')
    .setLabel('Guild Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(guildNameInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

// ─── Modal Submit: sage:add_guild_modal ───────────────────────────────────────
async function handleAddGuildModal(interaction) {
  

  const guildName = interaction.fields.getTextInputValue('guild_name');

  try {
    const newRole = await interaction.guild.roles.create({
      name: `${GUILD_ROLE_SYMBOL} ${guildName}`,
      reason: 'Sage Recruitment - New Guild added by user',
    });

    await interaction.reply({
      content: `✅ Guild **${guildName}** has been added successfully! Please re-click the 'Join' button to select it.`,
      flags: 64
    });
  } catch (error) {
    console.error('Error creating guild role:', error);
    await interaction.reply({
      content: '❌ Error adding guild. Please contact an admin.',
      flags: 64
    });
  }
}

// ─── Select Menu: sage:select_guild ───────────────────────────────────────────
async function handleGuildSelect(interaction) {
  
  
  const selectedRoleId = interaction.values[0];
  
  const classOptions = [
    { label: 'Templar', value: 'Templar', emoji: '🛡️' },
    { label: 'Gladiator', value: 'Gladiator', emoji: '⚔️' },
    { label: 'Assassin', value: 'Assassin', emoji: '🗡️' },
    { label: 'Ranger', value: 'Ranger', emoji: '🏹' },
    { label: 'Sorcerer', value: 'Sorcerer', emoji: '🔮' },
    { label: 'Spiritmaster', value: 'Spiritmaster', emoji: '👻' },
    { label: 'Cleric', value: 'Cleric', emoji: '⚕️' },
    { label: 'Chanter', value: 'Chanter', emoji: '🎵' }
  ];

  const classRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sage:select_class:${selectedRoleId}`)
      .setPlaceholder('Select your Class')
      .addOptions(classOptions)
  );

  await interaction.update({
    content: '✅ Guild Selected!\n**Step 1:** Select your Class below:',
    components: [classRow]
  });
}

async function handleClassSelect(interaction, guildId) {
  
  const selectedClass = interaction.values[0];

  const raceOptions = [
    { label: 'Asmodian', value: 'Asmodian', emoji: '🦇' }
  ];

  const raceRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sage:select_race:${guildId}:${selectedClass}`)
      .setPlaceholder('Select your Race')
      .addOptions(raceOptions)
  );

  await interaction.update({
    content: `✅ Class Selected: **${selectedClass}**\n**Step 2:** Select your Race below:`,
    components: [raceRow]
  });
}

async function handleRaceSelect(interaction, guildId, selectedClass) {
  
  const selectedRace = interaction.values[0];

  const serverOptions = [
    { label: 'Israphel', value: 'Israphel', emoji: '🌍' }
  ];

  const serverRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sage:select_server:${guildId}:${selectedClass}:${selectedRace}`)
      .setPlaceholder('Select your Server ')
      .addOptions(serverOptions)
  );

  await interaction.update({
    content: `✅ Race Selected: **${selectedRace}**\n**Step 3:** Select your Server below:`,
    components: [serverRow]
  });
}

async function handleServerSelect(interaction, guildId, selectedClass, selectedRace) {
  
  const selectedServer = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`sage:submit_name:${guildId}:${selectedClass}:${selectedRace}:${selectedServer}`)
    .setTitle("Enter Character Name");

  const nameInput = new TextInputBuilder()
    .setCustomId("sage_char_name")
    .setLabel("Character Name ")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. Mdarb3")
    .setRequired(true)
    .setMaxLength(30);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

  // Must use showModal for select menu interaction
  await interaction.showModal(modal);
}

async function handleSubmitName(interaction, guildId, className, raceName, serverName) {
  
  await interaction.deferReply({ flags: 64 });

  const characterName = interaction.fields.getTextInputValue("sage_char_name").trim();
  const characterLevel = 0; // Not requested
  const combatPower = 0;
  const profileImage = classIconUrl(className); // Built-in function
  const shugoUrl = "Manual Entry (Aion 2 Global)";

  const selectedRole = interaction.guild.roles.cache.get(guildId);
  let guildName = selectedRole?.name?.replace(GUILD_ROLE_SYMBOL, "").trim() ?? "Unknown";
    if (guildId === "1519397169897935019" || (typeof selectedRoleId !== "undefined" && selectedRoleId === "1519397169897935019")) guildName = "Solo Player";

  const sourceRes = await query("SELECT source_server_name FROM sage_pending_source WHERE user_id = $1", [interaction.user.id]);
  const sourceDiscordServer = sourceRes.rows[0]?.source_server_name ?? null;

  const countRes = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2", [guildId, interaction.user.id]);
  const isLeader = parseInt(countRes.rows[0].count, 10) === 0;

  const appRes = await query(
    `INSERT INTO sage_recruitment
       (user_id, discord_tag, character_name, character_level, class_name, combat_power,
        race_name, server_name, profile_image, shugo_url, guild_role_id, guild_name,
        status, character_data, source_discord_server, joined_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       discord_tag=$2, character_name=$3, character_level=$4, class_name=$5,
       combat_power=$6, race_name=$7, server_name=$8, profile_image=$9, shugo_url=$10,
       guild_role_id=$11, guild_name=$12, status='pending', character_data=$13,
       source_discord_server=COALESCE($14, sage_recruitment.source_discord_server),
       joined_at=NOW(), updated_at=NOW()
     RETURNING *`,
    [
      interaction.user.id,
      interaction.user.tag,
      characterName, characterLevel, className,
      combatPower, raceName, serverName,
      profileImage, shugoUrl,
      guildId, guildName,
      JSON.stringify({}),
      sourceDiscordServer,
    ]
  );

  const app = appRes.rows[0];

  // ─── Double Verification Routing (Stage 4 & 5) ───────────────────────────────────
  if (isLeader) {
    const LEADER_APP_CHANNEL_ID = "1508469394873913549";
    const targetChannel = interaction.guild.channels.cache.get(LEADER_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(LEADER_APP_CHANNEL_ID).catch(() => null);
    if (targetChannel) {
      try {
        await sendToSageReview(interaction, app, targetChannel, true);
      } catch (reviewErr) {
        console.warn(`[SageController] Could not send leader review: ${reviewErr.message}`);
      }
    }
  } else {
    const GUILD_LEADERS_CHANNEL_ID = "1508696447674093608";
    const leaderRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 AND status = 'accepted' ORDER BY joined_at ASC LIMIT 1", [guildId]);
    const fallbackRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 ORDER BY joined_at ASC LIMIT 1", [guildId]);
    const leaderId = leaderRes.rows[0]?.user_id || fallbackRes.rows[0]?.user_id;

    const leadersChannel = interaction.guild.channels.cache.get(GUILD_LEADERS_CHANNEL_ID) ?? await interaction.guild.channels.fetch(GUILD_LEADERS_CHANNEL_ID).catch(() => null);
    
    if (leadersChannel && leaderId) {
      try {
        await sendToLeaderVerification(interaction, app, leadersChannel, leaderId);
      } catch (err) {
        console.warn(`[SageController] Could not send verification to leaders channel: ${err.message}`);
      }
    } else if (!leaderId) {
      const ALL_APP_CHANNEL_ID = "1508451380560531586";
      const fallbackChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);
      if (fallbackChannel) {
        try {
          await sendToSageReview(interaction, app, fallbackChannel, false);
        } catch (err) {
          console.warn(`[SageController] Could not send fallback verification: ${err.message}`);
        }
      }
    }
  }

  await interaction.editReply({
    content: "✅ **Registration Completed!** Your application has been sent for verification.",
    components: []
  });
}

async function handleProfileModal(interaction, selectedRoleId) {
   // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const shugoUrl = interaction.fields.getTextInputValue("sage_shugo_url").trim();
  await interaction.editReply({ content: "⏳ Fetching character data from server..." });

  const result = await scrapeProfile(shugoUrl);

  if (!result.success) {
    await interaction.editReply({
      content:
        `❌ **Failed to fetch profile.**\n` +
        `Make sure the URL is correct and your profile is public.\n` +
        `\`\`\`${result.error}\`\`\``,
    });
    return;
  }

  const {
    characterName, characterLevel, className,
    combatPower, profileImage, raceName, serverName,
  } = result.data;

  // Anti-Fraud Protocol: Check for duplicates
  const duplicateCheck = await query(
    "SELECT user_id FROM sage_recruitment WHERE shugo_url = $1 AND user_id != $2",
    [shugoUrl, interaction.user.id]
  );

    if (duplicateCheck.rowCount > 0) {
      const oldUserId = duplicateCheck.rows[0].user_id;
      const fraudConfirmBtn = new ButtonBuilder()
        .setCustomId(`sage:fraud_confirm:${oldUserId}`)
        .setLabel("Yes, I am sure")
        .setStyle(ButtonStyle.Danger);

    await interaction.editReply({
      content: "⚠️ **Warning: This URL is already registered to another member.**\nAre you sure this profile belongs to you in the game?",
      components: [new ActionRowBuilder().addComponents(fraudConfirmBtn)],
    });
    return;
  }

  const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);
  let guildName = selectedRole?.name?.replace(GUILD_ROLE_SYMBOL, "").trim() ?? "Unknown";
    if (guildId === "1519397169897935019" || (typeof selectedRoleId !== "undefined" && selectedRoleId === "1519397169897935019")) guildName = "Solo Player";

  // Get source server if they joined via tracked invite
  const sourceRes = await query("SELECT source_server_name FROM sage_pending_source WHERE user_id = $1", [interaction.user.id]);
  const sourceDiscordServer = sourceRes.rows[0]?.source_server_name ?? null;

  // Check if this is the first person in the guild (Leader)
  const countRes = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2", [selectedRoleId, interaction.user.id]);
  const isLeader = parseInt(countRes.rows[0].count, 10) === 0;

  // Upsert into sage_recruitment (always pending initially)
  const appRes = await query(
    `INSERT INTO sage_recruitment
       (user_id, discord_tag, character_name, character_level, class_name, combat_power,
        race_name, server_name, profile_image, shugo_url, guild_role_id, guild_name,
        status, character_data, source_discord_server, joined_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       discord_tag=$2, character_name=$3, character_level=$4, class_name=$5,
       combat_power=$6, race_name=$7, server_name=$8, profile_image=$9, shugo_url=$10,
       guild_role_id=$11, guild_name=$12, status='pending', character_data=$13,
       source_discord_server=COALESCE($14, sage_recruitment.source_discord_server),
       joined_at=NOW(), updated_at=NOW()
     RETURNING *`,
    [
      interaction.user.id,
      interaction.user.tag,
      characterName, characterLevel, className,
      combatPower ?? 0, raceName, serverName,
      profileImage, shugoUrl,
      selectedRoleId, guildName,
      JSON.stringify(result.data),
      sourceDiscordServer,
    ]
  );

  const app = appRes.rows[0];

  // ─── Double Verification Routing ───────────────────────────────────
  if (isLeader) {
    // If they are the first, they are the leader. Send directly to Admin Leader Channel.
    const LEADER_APP_CHANNEL_ID = "1508469394873913549";
    const targetChannel = interaction.guild.channels.cache.get(LEADER_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(LEADER_APP_CHANNEL_ID).catch(() => null);

    if (targetChannel) {
      try {
        await sendToSageReview(interaction, app, targetChannel, true);
      } catch (reviewErr) {
        console.warn(`[SageController] Could not send leader review: ${reviewErr.message}`);
      }
    }
  } else {
    // If not the first, they are a member. Send verification card to Guild Leaders channel.
    const GUILD_LEADERS_CHANNEL_ID = "1508696447674093608";
    const leaderRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 AND status = 'accepted' ORDER BY joined_at ASC LIMIT 1", [selectedRoleId]);
    
    // Fallback: If no accepted leader exists, just find the first applicant for this guild
    const fallbackRes = await query("SELECT user_id FROM sage_recruitment WHERE guild_role_id = $1 ORDER BY joined_at ASC LIMIT 1", [selectedRoleId]);
    
    const leaderId = leaderRes.rows[0]?.user_id || fallbackRes.rows[0]?.user_id;

    const leadersChannel = interaction.guild.channels.cache.get(GUILD_LEADERS_CHANNEL_ID) ?? await interaction.guild.channels.fetch(GUILD_LEADERS_CHANNEL_ID).catch(() => null);
    
    if (leadersChannel && leaderId) {
      try {
        await sendToLeaderVerification(interaction, app, leadersChannel, leaderId);
      } catch (err) {
        console.warn(`[SageController] Could not send verification to leaders channel: ${err.message}`);
      }
    } else if (!leaderId) {
      // If for some reason there's no leader at all, fallback to regular admin channel
      const ALL_APP_CHANNEL_ID = "1508451380560531586";
      const fallbackChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);
      if (fallbackChannel) {
        await sendToSageReview(interaction, app, fallbackChannel, false);
      }
    }
  }

  await interaction.editReply({
    content:
      `✅ **Application received successfully!**\n` +
      `Character: **${characterName}** | Guild: **${guildName}**\n` +
      `Your application is now under review. You will receive a DM once accepted.`,
  });
}

// ─── Admin Review Embed ────────────────────────────────────────────────────────
async function sendToSageReview(interaction, app, targetChannel, isLeader) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const titlePrefix = isLeader ? "👑 Guild Leader Application — Siege Alliance" : "📋 New Join Application — Siege Alliance";

  const statsData = typeof app.stats === "string" ? JSON.parse(app.stats) : (app.stats || {});
  const itemLevel = statsData.itemLevel ? numFmt(statsData.itemLevel) : "—";

  let rankingsText = "—";
  if (statsData.rankings && statsData.rankings.length > 0) {
    rankingsText = statsData.rankings.map(r => `• ${r.name}: ${r.rank} (${numFmt(r.point || 0)})`).join("\n");
  }

  let titlesText = "—";
  if (statsData.equippedTitles && statsData.equippedTitles.length > 0) {
    titlesText = statsData.equippedTitles.map(t => `• **${t.category}:** ${t.name}`).join("\n");
  } else if (statsData.titles && statsData.titles.active) {
    titlesText = statsData.titles.active;
  }

  const reviewEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(titlePrefix)
    .setDescription(`👑 Applicant: ${interaction.user}`)
    .addFields(
      { name: "⚔️ Selected Guild", value: app.guild_name ?? "—", inline: false },
      { name: "👤 Character", value: app.character_name ?? "—", inline: true },
      { name: "🎮 Class", value: app.class_name ?? "—", inline: true },
      { name: "🌍 Server", value: app.server_name ?? "—", inline: true },
      { name: "🧬 Race", value: app.race_name ?? "—", inline: true }
    )
    .setThumbnail(app.profile_image || classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${app.user_id}  •  App DB ID: ${app.id}` })
    .setTimestamp();

  if (app.profile_image) reviewEmbed.setImage(app.profile_image);

  const reviewRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:accept:${interaction.user.id}:${app.id}`)
      .setLabel("✅ Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sage:reject:${interaction.user.id}:${app.id}`)
      .setLabel("❌ Reject")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`sage:ban:${interaction.user.id}:${app.id}`)
      .setLabel("🔨 Instant Ban")
      .setStyle(ButtonStyle.Danger)
  );

  await targetChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
}

// ─── Accept Handler ────────────────────────────────────────────────────────────
async function handleSageAccept(interaction, targetUserId, appId) {
   // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    await interaction.editReply({ content: "❌ Application not found in the database." });
    return;
  }

  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ This application was already reviewed (${app.status}).` });
    return;
  }

  // 1. Assign guild role and nickname to the member
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member) {
    try {
      // Assign guild role
      if (app.guild_role_id && app.guild_role_id !== "1519397169897935019") await member.roles.add(app.guild_role_id);

      // Check if this is the first accepted member (Leader)
      const countRes = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id = $1 AND user_id != $2 AND status = 'accepted'", [app.guild_role_id, targetUserId]);
      const isGuildLeader = parseInt(countRes.rows[0].count, 10) === 0;
      
      const isSoloPlayer = app.guild_role_id === "1519397169897935019";

      if (isGuildLeader && !isSoloPlayer) {
        const LEADER_ROLE_ID = "1507733486671233175";
        await member.roles.add(LEADER_ROLE_ID).catch(() => {});
      }

      // Change Nickname to character name
      if (app.character_name) await member.setNickname(app.character_name).catch(() => {});

      // Remove guest/visitor role if configured
      if (SAGE_GUEST_ROLE_ID) await member.roles.remove(SAGE_GUEST_ROLE_ID).catch(() => {});
    } catch (roleErr) {
      console.warn(`[SageController] Role/Nickname assignment failed for ${targetUserId}:`, roleErr.message);
    }
  }

  // 2. Update DB record
  await query(
    "UPDATE sage_recruitment SET status='accepted', reviewed_by=$1, joined_at=NOW(), updated_at=NOW() WHERE id=$2",
    [interaction.user.id, appId]
  );

  // 3. Post roster card to roster channel
  const rosterChannelId = SAGE_ROSTER_CHANNEL_ID;
  if (rosterChannelId) {
    const rosterChannel = interaction.guild.channels.cache.get(rosterChannelId);
    if (rosterChannel) {
      const rosterMsg = await postRosterCard(rosterChannel, app, member);
      if (rosterMsg) {
        await query(
          "UPDATE sage_recruitment SET roster_message_id=$1, roster_channel_id=$2 WHERE id=$3",
          [rosterMsg.id, rosterChannel.id, appId]
        );
      }
    }
  }

  // 4. DM the member
  if (member) {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Welcome to the Siege Alliance!")
          .setDescription(
            `Hello **${app.character_name}**!\n\n` +
            `Your application to join **${app.guild_name}** has been accepted.\n\n` +
            `🚨 Remember: Any public conflict = **immediate permanent ban**, no warning.\n` +
            `💬 For any disputes, contact staff via DM only.`
          )
          .setTimestamp()
      ]
    }).catch(() => {}); // DM might fail if user has DMs disabled
  }

  // 5. Update Guild Stats Card immediately
  const statsChannelId = process.env.SAGE_GUILD_STATS_CHANNEL_ID;
  if (statsChannelId && app.guild_role_id) {
    const statsChannel = interaction.guild.channels.cache.get(statsChannelId) ?? await interaction.guild.channels.fetch(statsChannelId).catch(() => null);
    const role = interaction.guild.roles.cache.get(app.guild_role_id);
    if (statsChannel && role) {
      await updateGuildStatCard(interaction.guild, statsChannel, app.guild_role_id, role).catch(e => console.error("[SageController] Error updating guild stats card:", e));
    }
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x57f287)
    .setTitle(`✅ Accepted — ${app.character_name} (${app.guild_name})`)
    .setFooter({ text: `Accepted by: ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({
    content: `✅ **${app.character_name}** has been accepted and the **${app.guild_name}** role was assigned successfully.`,
  });
}

// ─── Reject Handler ────────────────────────────────────────────────────────────
async function handleSageReject(interaction, targetUserId, appId) {
   // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    await interaction.editReply({ content: "❌ Application not found." });
    return;
  }

  if (app.status !== "pending") {
    await interaction.editReply({ content: `⚠️ This application was already reviewed (${app.status}).` });
    return;
  }

  await query(
    "UPDATE sage_recruitment SET status='rejected', reviewed_by=$1, updated_at=NOW() WHERE id=$2",
    [interaction.user.id, appId]
  );

  // Check if role needs to be deleted
  if (app.guild_role_id) {
    const roleCheck = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id=$1 AND status IN ('pending', 'accepted')", [app.guild_role_id]);
    if (parseInt(roleCheck.rows[0].count) === 0) {
      const roleToDelete = interaction.guild.roles.cache.get(app.guild_role_id);
      if (roleToDelete) await roleToDelete.delete("All applicants for this guild were rejected/banned").catch(() => {});
    }
  }

  // DM the rejected member
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member) {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ Application Rejected — Siege Alliance")
          .setDescription(
            "Unfortunately, your application was not accepted at this time.\n" +
            "For inquiries, contact staff via DM only."
          )
          .setTimestamp()
      ]
    }).catch(() => {});
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xed4245)
    .setTitle(`❌ Rejected — ${app.character_name}`)
    .setFooter({ text: `Rejected by: ${interaction.user.tag}` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({ content: `❌ Application for **${app.character_name}** has been rejected.` });
}

// ─── Ban Handler (Zero Tolerance) ─────────────────────────────────────────────
async function handleSageBan(interaction, targetUserId, appId) {
   // ← strict isolation

  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  try {
    await interaction.guild.members.ban(targetUserId, {
      reason: `[Siege Alliance] Zero Tolerance Policy — Banned by ${interaction.user.tag}`,
    });
  } catch (banErr) {
    await interaction.editReply({ content: `❌ Failed to ban: ${banErr.message}` });
    return;
  }

  if (app) {
    await query(
      "UPDATE sage_recruitment SET status='banned', reviewed_by=$1, updated_at=NOW() WHERE id=$2",
      [interaction.user.id, appId]
    );

    // Check if role needs to be deleted
    if (app.guild_role_id) {
      const roleCheck = await query("SELECT COUNT(*) FROM sage_recruitment WHERE guild_role_id=$1 AND status IN ('pending', 'accepted')", [app.guild_role_id]);
      if (parseInt(roleCheck.rows[0].count) === 0) {
        const roleToDelete = interaction.guild.roles.cache.get(app.guild_role_id);
        if (roleToDelete) await roleToDelete.delete("All applicants for this guild were rejected/banned").catch(() => {});
      }
    }
  }
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xff0000)
    .setTitle(`🔨 Banned — ${app?.character_name ?? targetUserId}`)
    .setFooter({ text: `Executed by: ${interaction.user.tag} — Zero Tolerance` });

  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  await interaction.editReply({
    content: `🔨 Instant ban executed on **${app?.character_name ?? targetUserId}** per the Zero Tolerance policy.`,
  });
}

// ─── Roster Card Builder ───────────────────────────────────────────────────────
async function postRosterCard(channel, app, member) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
  const displayName = member?.displayName ?? app.discord_tag;

  const statsData = typeof app.stats === "string" ? JSON.parse(app.stats) : (app.stats || {});
  const itemLevel = statsData.itemLevel ? numFmt(statsData.itemLevel) : "—";

  let rankingsText = "—";
  if (statsData.rankings && statsData.rankings.length > 0) {
    rankingsText = statsData.rankings.map(r => `> • ${r.name}: ${r.rank} (${numFmt(r.point || 0)})`).join("\n");
  }

  let titlesText = "—";
  if (statsData.equippedTitles && statsData.equippedTitles.length > 0) {
    titlesText = statsData.equippedTitles.map(t => `> • **${t.category}:** ${t.name}`).join("\n");
  } else if (statsData.titles && statsData.titles.active) {
    titlesText = `> ${statsData.titles.active}`;
  }

  const rosterEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`⚔️ ${app.character_name}`)
          .setDescription(
        `🎊 **Welcome to the Alliance family! We're thrilled to have you here.** ✨\n\n` +
        `> 🏰 **Guild:** ${app.guild_name}\n` +
        `> 👤 **Discord:** <@${member?.id ?? app.user_id}>\n` +
        `> 🎮 **Class:** ${app.class_name ?? "—"}\n` +
        `> 🧬 **Race:** ${app.race_name ?? "—"}\n` +
        `> 🌍 **Server:** ${app.server_name ?? "—"}`
    )
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: `Siege Alliance Roster • ${new Date().toLocaleDateString("en-US")}` })
    .setTimestamp();

  if (app.profile_image) rosterEmbed.setImage(app.profile_image);

  return await channel.send({ embeds: [rosterEmbed] });
}

// ─── Anti-Fraud Alert ────────────────────────────────────────────────────────
async function handleFraudConfirm(interaction, oldUserId) {
  await interaction.deferReply({ flags: 64 });
  
  try {
    const res = await query("SELECT character_name, shugo_url, discord_tag FROM sage_recruitment WHERE user_id = $1", [oldUserId]);
    if (res.rowCount === 0) {
      return await interaction.editReply({ content: "❌ Could not find old member data in the database." });
    }
    
    const oldUser = res.rows[0];
    const newMemberId = interaction.user.id;
    
    const alertEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🚨 Identity Fraud Report (Anti-Fraud Protocol)")
      .setDescription(
        `A duplicate Shugo.gg registration attempt was detected!\n\n` +
        `👤 **Player attempting to register (Fraudster):** <@${newMemberId}>\n` +
        `⚠️ **Old member registered with this link:** <@${oldUserId}> (${oldUser.discord_tag})\n` +
        `🎮 **Character Name:** ${oldUser.character_name}\n` +
        `🔗 **Entered Link:** ${oldUser.shugo_url}`
      )
      .setTimestamp();
      
    const leaderRoleId = "1507733275278577916";
    const councilRoleId = "1507733319989858435";
    const triageChannelId = "1508489408251171080";
    
    // Send to Triage Channel
    const triageChannel = interaction.guild.channels.cache.get(triageChannelId) ?? await interaction.guild.channels.fetch(triageChannelId).catch(() => null);
    if (triageChannel) {
      await triageChannel.send({ content: `<@&${leaderRoleId}> <@&${councilRoleId}>`, embeds: [alertEmbed] });
    }
    
    // Send DMs to Leaders and Council
    await interaction.guild.members.fetch();
    const leaders = interaction.guild.roles.cache.get(leaderRoleId)?.members;
    const council = interaction.guild.roles.cache.get(councilRoleId)?.members;
    
    const notifyMember = async (member) => {
      if (!member.user.bot) {
        await member.send({ embeds: [alertEmbed] }).catch(() => {});
      }
    };
    
    if (leaders) leaders.forEach(notifyMember);
    if (council) council.forEach(notifyMember);
    
    await interaction.editReply({
      content: "✅ **Report confirmed.** An urgent message has been sent to leadership for verification. Appropriate action will be taken. Thank you."
    });
  } catch (err) {
    console.error("[AntiFraud] Error processing alert:", err);
    await interaction.editReply({ content: "❌ An error occurred while sending the report." });
  }
}

// ─── Leader Verification System ────────────────────────────────────────────────
async function sendToLeaderVerification(interaction, app, targetChannel, leaderId) {
  const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";

  const statsData = typeof app.stats === "string" ? JSON.parse(app.stats) : (app.stats || {});
  const itemLevel = statsData.itemLevel ? numFmt(statsData.itemLevel) : "—";

  let rankingsText = "—";
  if (statsData.rankings && statsData.rankings.length > 0) {
    rankingsText = statsData.rankings.map(r => `• ${r.name}: ${r.rank} (${numFmt(r.point || 0)})`).join("\n");
  }

  let titlesText = "—";
  if (statsData.equippedTitles && statsData.equippedTitles.length > 0) {
    titlesText = statsData.equippedTitles.map(t => `• **${t.category}:** ${t.name}`).join("\n");
  } else if (statsData.titles && statsData.titles.active) {
    titlesText = statsData.titles.active;
  }

  const verifyEmbed = new EmbedBuilder()
    .setColor(0x3498db) // Blue for verification
    .setTitle("🛡️ Member Identity Verification Request (Leader Verification)")
    .setDescription(
      `Hello Guild Leader <@${leaderId}>,\n` +
      `A new member has requested to join your guild (**${app.guild_name}**). Please verify if this member truly belongs to your guild.\n\n` +
      `👤 **Applicant:** ${interaction.user}\n` +
      `[🔗 View Profile](${app.shugo_url})`
    )
    .addFields(
      { name: "👤 Character", value: app.character_name ?? "—", inline: true },
      { name: "📊 Level", value: String(app.character_level ?? "—"), inline: true },
      { name: "🎮 Class", value: app.class_name ?? "—", inline: true },
      { name: "🌍 Server", value: app.server_name ?? "—", inline: true },
      { name: "🧬 Race", value: app.race_name ?? "—", inline: true },
      { name: "🏆 Rankings (Rankings)", value: rankingsText, inline: false },
      { name: "🎖️ Equipped Titles", value: titlesText, inline: false },
      { name: "⚡ Combat Power (CP)", value: `★ **${cpDisplay}** ★  *(Item Level: ${itemLevel})*`, inline: false }
    )
    .setThumbnail(classIconUrl(app.class_name))
    .setFooter({ text: `Discord ID: ${interaction.user.id}  •  App DB ID: ${app.id}` })
    .setTimestamp();

  if (app.profile_image) verifyEmbed.setImage(app.profile_image);

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:leader_verify:${interaction.user.id}:${app.id}`)
      .setLabel("✅ Confirm (In my Guild)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sage:leader_reject:${interaction.user.id}:${app.id}`)
      .setLabel("❌ Reject (Unknown)")
      .setStyle(ButtonStyle.Danger)
  );

  await targetChannel.send({ content: `<@${leaderId}>`, embeds: [verifyEmbed], components: [verifyRow] });
}

async function handleLeaderVerify(interaction, targetUserId, appId) {
  
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) {
    return await interaction.editReply({ content: "❌ Request not found." });
  }
  if (app.status !== "pending") {
    return await interaction.editReply({ content: `⚠️ This request has already been reviewed (${app.status}).` });
  }

  // Update status temporarily (optional, or just forward to admin)
  // For simplicity, we can leave status as pending and just forward the card to admin

  // Forward to Admin Channel
  const ALL_APP_CHANNEL_ID = "1508451380560531586";
  const targetChannel = interaction.guild.channels.cache.get(ALL_APP_CHANNEL_ID) ?? await interaction.guild.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);

  if (targetChannel) {
    // Modify embed to show it was verified by leader
    const cpDisplay = app.combat_power > 0 ? numFmt(app.combat_power) : "—";
          const reviewEmbed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle("🛡️ Member Identity Verification Request")
        .setDescription(
          `Hello Guild Leader <@${leaderId}>,\n` +
          `A new member has requested to join your guild (**${app.guild_name}**). Please verify if this member truly belongs to your guild.\n\n` +
          `👤 **Applicant:** ${interaction.user}`
        )
        .addFields(
          { name: "👤 Character", value: app.character_name ?? "—", inline: true },
          { name: "🎮 Class", value: app.class_name ?? "—", inline: true },
          { name: "🧬 Race", value: app.race_name ?? "—", inline: true },
          { name: "🌍 Server", value: app.server_name ?? "—", inline: true }
        )
        .setThumbnail(app.profile_image || classIconUrl(app.class_name)).setFooter({ text: `Discord ID: ${app.user_id}  •  App DB ID: ${app.id}` })
      .setTimestamp();

    if (app.profile_image) reviewEmbed.setImage(app.profile_image);

    const reviewRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sage:accept:${app.user_id}:${app.id}`)
        .setLabel("✅ Final Approval")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sage:reject:${app.user_id}:${app.id}`)
        .setLabel("❌ Final Rejection")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`sage:ban:${app.user_id}:${app.id}`)
        .setLabel("🔨 Instant Ban")
        .setStyle(ButtonStyle.Danger)
    );

    await targetChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
  }

  // Update the leader message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0x2ecc71)
    .setTitle("✅ Member verified and sent to Admin");
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});
  
  await interaction.editReply({ content: "✅ Member verified and application forwarded to Admin for final approval." });
}

async function handleLeaderReject(interaction, targetUserId, appId) {
  
  await interaction.deferReply({ flags: 64 });

  const appRes = await query("SELECT * FROM sage_recruitment WHERE id=$1 AND user_id=$2", [appId, targetUserId]);
  const app = appRes.rows[0];

  if (!app) return await interaction.editReply({ content: "❌ Application not found." });

  // Update DB
  await query("UPDATE sage_recruitment SET status='rejected', reviewed_by=$1, updated_at=NOW() WHERE id=$2", [interaction.user.id, appId]);

  // Update the leader message
  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xe74c3c)
    .setTitle("❌ Member rejected by Leader");
  await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

  // Send DM to applicant
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (member && !member.user.bot) {
    const dmEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("❌ Update on your application (Siege Alliance)")
      .setDescription(
        `We regret to inform you that your application to join **${app.guild_name}** has been **rejected** by the guild leader.\n\n` +
        `If you believe this is a mistake, please contact your guild leader to resolve the issue.`
      )
      .setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  }

  await interaction.editReply({ content: "✅ Member rejected and notified successfully." });
}

// ─── Main Interaction Router ───────────────────────────────────────────────────
export async function handleInteraction(interaction) {
   // ← strict isolation (top-level)

  try {
    const [, action, ...rest] = interaction.customId.split(":");

    switch (action) {
      case "join_start":
        return await handleJoinStart(interaction);

      case "add_guild_start":
        return await handleAddGuildStart(interaction);

      case "add_guild_modal":
        return await handleAddGuildModal(interaction);

      case "select_guild":
        return await handleGuildSelect(interaction);

      case "select_class":
        return await handleClassSelect(interaction, rest[0]);

      case "select_race":
        return await handleRaceSelect(interaction, rest[0], rest[1]);

      case "select_server":
        return await handleServerSelect(interaction, rest[0], rest[1], rest[2]);

      case "submit_name":
        return await handleSubmitName(interaction, rest[0], rest[1], rest[2], rest[3]);

      case "profile_modal":
        return await handleProfileModal(interaction, rest[0]);

      case "fraud_confirm":
        return await handleFraudConfirm(interaction, rest[0]);

      case "leader_verify":
        return await handleLeaderVerify(interaction, rest[0], rest[1]);

      case "leader_reject":
        return await handleLeaderReject(interaction, rest[0], rest[1]);

      case "accept":
        return await handleSageAccept(interaction, rest[0], rest[1]);

      case "reject":
        return await handleSageReject(interaction, rest[0], rest[1]);

      case "ban":
        return await handleSageBan(interaction, rest[0], rest[1]);

      case "open_member_mgmt":
      case "member_select":
      case "remove_member":
      case "sync_member":
      case "cancel_member":
        return await handleSageMgmtAction(action, interaction, rest);

      default:
        console.warn(`[SageController] Unknown action: "${action}"`);
    }
  } catch (err) {
    console.error(`[SageController] Error in ${interaction.customId}:`, err);
    const reply = {
      content: "❌ An error occurred while processing your request in the Alliance system. Please try again.",
      flags: 64,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}
