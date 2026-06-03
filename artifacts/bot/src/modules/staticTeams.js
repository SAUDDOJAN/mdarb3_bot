import { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  EmbedBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import { query } from "../database/index.js";
import { getPlayerData } from "./management.js";

const CLASS_DATA = {
  Gladiator:    { emoji: "<:Gladiator:1504471947831017532>", nameAr: "جلاديتور" },
  Templar:      { emoji: "<:Templar:1504472027724255414>", nameAr: "تمبلر" },
  Ranger:       { emoji: "<:Ranger:1504471982006341783>", nameAr: "رينجر" },
  Assassin:     { emoji: "<:Assassin:1504471833695748156>", nameAr: "أساسن" },
  Spiritmaster: { emoji: "<:Elementalist:1504471920219783209>", nameAr: "سبيريت ماستر" },
  Mentalist:    { emoji: "<:Elementalist:1504471920219783209>", nameAr: "سبيريت ماستر" },
  Sorcerer:     { emoji: "<:Sorcerer:1504472006610124961>", nameAr: "ساحر" },
  Cleric:       { emoji: "<:Cleric:1504471892755611678>", nameAr: "كليريك" },
  Chanter:      { emoji: "<:Chanter:1504471867141128272>", nameAr: "تشانتر" },
};

const TANKS    = ["Gladiator", "Templar"];
const SUPPORTS = ["Cleric", "Chanter"];

function getSlotType(className) {
  if (TANKS.includes(className))    return "tank";
  if (SUPPORTS.includes(className)) return "support";
  return "dps";
}

export async function handleInteraction(interaction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];

  if (action === "init") {
    const modal = new ModalBuilder()
      .setCustomId("static_team:modal_create")
      .setTitle("إنشاء فريق جديد");

    const nameInput = new TextInputBuilder()
      .setCustomId("team_name")
      .setLabel("اسم الفريق")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("مثال: صقور الأبيس")
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(50);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal);
  } else if (action === "modal_create") {
    await interaction.deferReply({ flags: 64 });
    const teamName = interaction.fields.getTextInputValue("team_name");
    
    const isMainGuild = interaction.guildId === (process.env.MAIN_GUILD_ID || "861355983975874601");
    let targetChannel = interaction.guild.channels.cache.find(c => c.name.includes("الفرق-الثابتة") || c.name.includes("static-teams"));
    if (!targetChannel && isMainGuild) {
      const fallbackId = "1504446225594716242";
      targetChannel = interaction.guild.channels.cache.get(fallbackId) || 
                      await interaction.guild.channels.fetch(fallbackId).catch(() => null);
    }
    if (!targetChannel) {
      targetChannel = interaction.channel;
    }
    const targetChannelId = targetChannel.id;

    // Insert skeleton
    const res = await query(
      "INSERT INTO static_teams (guild_id, team_name, leader_id, channel_id) VALUES ($1,$2,$3,$4) RETURNING id",
      [interaction.guildId, teamName, interaction.user.id, targetChannelId]
    );
    const teamId = res.rows[0].id;

    const embed = buildTeamEmbed(teamName, null, teamId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`static_team:join:${teamId}`)
        .setLabel("انضم للفريق")
        .setEmoji("🤝")
        .setStyle(ButtonStyle.Success)
    );

    const msg = await targetChannel.send({ embeds: [embed], components: [row] });
    await query("UPDATE static_teams SET message_id=$1 WHERE id=$2", [msg.id, teamId]);

    await interaction.editReply({ content: `✅ تم إنشاء هيكل فريق **${teamName}** ونشره في ${targetChannel}!` });

  } else if (action === "join") {
    const teamId = parts[2];
    await handleJoinTeam(interaction, teamId);
  } else if (action === "leave") {
    const teamId = parts[2];
    await handleLeaveTeam(interaction, teamId);
  }
}

async function handleLeaveTeam(interaction, teamId) {
  await interaction.deferReply({ flags: 64 });
  const uid = interaction.user.id;

  const res = await query("SELECT * FROM static_teams WHERE id=$1", [teamId]);
  const team = res.rows[0];
  if (!team) return interaction.editReply({ content: "❌ هذا الفريق لم يعد موجوداً." });

  let targetSlot = null;
  if (team.slot_tank?.userId === uid) targetSlot = "slot_tank";
  else if (team.slot_support?.userId === uid) targetSlot = "slot_support";
  else if (team.slot_dps1?.userId === uid) targetSlot = "slot_dps1";
  else if (team.slot_dps2?.userId === uid) targetSlot = "slot_dps2";

  if (!targetSlot) {
    return interaction.editReply({ content: "⚠️ أنت لست عضواً في هذا الفريق." });
  }

  await query(`UPDATE static_teams SET ${targetSlot}='{"status":"empty"}'::jsonb WHERE id=$1`, [teamId]);
  
  // Refresh Embed
  await updateTeamEmbed(interaction.guild, teamId);

  await interaction.editReply({ content: `✅ تم خروجك من فريق **${team.team_name}** بنجاح.` });
}

async function updateTeamEmbed(guild, teamId) {
  const res = await query("SELECT * FROM static_teams WHERE id=$1", [teamId]);
  const team = res.rows[0];
  if (!team || !team.message_id || !team.channel_id) return;

  const channel = guild.channels.cache.get(team.channel_id) || await guild.channels.fetch(team.channel_id).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(team.message_id).catch(() => null);
  if (!msg) return;

  const embed = buildTeamEmbed(team.team_name, team, teamId);
  const isFull = [team.slot_tank, team.slot_support, team.slot_dps1, team.slot_dps2].every(s => s.status === "accepted");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`static_team:join:${teamId}`)
      .setLabel("انضم للفريق")
      .setEmoji("🤝")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(`static_team:leave:${teamId}`)
      .setLabel("خروج من الفريق")
      .setEmoji("🚪")
      .setStyle(ButtonStyle.Danger)
  );

  await msg.edit({ embeds: [embed], components: [row] });
}

async function handleJoinTeam(interaction, teamId) {
  await interaction.deferReply({ flags: 64 });
  
  const player = await getPlayerData(interaction.guildId, interaction.user.id);
  if (!player) {
    return interaction.editReply({ content: "⚠️ عذراً، يجب أن تكون عضواً مسجلاً ومقبولاً في القيلد لتتمكن من الانضمام." });
  }

  const res = await query("SELECT * FROM static_teams WHERE id=$1", [teamId]);
  const team = res.rows[0];
  if (!team) return interaction.editReply({ content: "❌ هذا الفريق لم يعد موجوداً." });

  // Check if already in
  const alreadyIn = [team.slot_tank, team.slot_support, team.slot_dps1, team.slot_dps2].some(s => s?.userId === interaction.user.id);
  if (alreadyIn) return interaction.editReply({ content: "⚠️ أنت عضو في هذا الفريق بالفعل." });

  const role = getSlotType(player.class);
  let targetSlot = null;

  if (role === "tank" && team.slot_tank.status === "empty") targetSlot = "slot_tank";
  else if (role === "support" && team.slot_support.status === "empty") targetSlot = "slot_support";
  else if (role === "dps") {
    if (team.slot_dps1.status === "empty") targetSlot = "slot_dps1";
    else if (team.slot_dps2.status === "empty") targetSlot = "slot_dps2";
  }

  if (!targetSlot) {
    return interaction.editReply({ content: `❌ عذراً، لا يوجد مقعد شاغر لفئة **${player.class}** (${role.toUpperCase()}) في هذا الفريق حالياً.` });
  }

  const slotData = JSON.stringify({ status: "accepted", userId: interaction.user.id, name: player.name, className: player.class, image: player.image });
  await query(`UPDATE static_teams SET ${targetSlot}=$1::jsonb WHERE id=$2`, [slotData, teamId]);

  // Refresh Embed
  await updateTeamEmbed(interaction.guild, teamId);

  const emoji = CLASS_DATA[player.class]?.emoji || "👤";
  await interaction.editReply({ content: `✅ تم انضمامك لفريق **${team.team_name}** بنجاح كـ ${emoji}!` });
}

function buildTeamEmbed(teamName, team, teamId) {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`💎 فريق: ${teamName}`)
    .setDescription("✨ **تشكيلة الفريق النخبة (Static Team)** ✨\n*انضم الآن لتكون جزءاً من هذه التشكيلة الدائمة!*")
    .setTimestamp()
    .setFooter({ text: `ID: ${teamId} • M3RGEEN Static Teams` });

  const render = (slot, label) => {
    if (!slot || slot.status === "empty") return `▪️ **فارغ**\n*(دور ${label})*`;
    const cData = CLASS_DATA[slot.className] || { emoji: "👤", nameAr: slot.className };
    return `${cData.emoji} **${slot.name}**\n*كلاس: ${cData.nameAr}*`;
  };

  // Using fields with some spacing logic
  embed.addFields(
    { name: "🛡️ Tank",      value: render(team?.slot_tank, "التانك"),      inline: true },
    { name: "✨ Support",   value: render(team?.slot_support, "المعالج"), inline: true },
    { name: "\u200B",       value: "\u200B",                              inline: true }, // Spacer
    
    { name: "\u200B",       value: "\u200B",                              inline: false }, // Horizontal Spacer
    
    { name: "⚔️ DPS 1",     value: render(team?.slot_dps1, "مهاجم"),        inline: true },
    { name: "⚔️ DPS 2",     value: render(team?.slot_dps2, "مهاجم"),        inline: true },
    { name: "\u200B",       value: "\u200B",                              inline: true }
  );

  // Set thumbnail to first available member
  const members = [team?.slot_tank, team?.slot_support, team?.slot_dps1, team?.slot_dps2].filter(s => s?.status === "accepted");
  if (members.length > 0 && members[0].image) {
    embed.setThumbnail(members[0].image);
  }

  return embed;
}
