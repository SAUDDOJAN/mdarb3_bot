import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { query } from "../database/index.js";
import { scrapeProfile } from "./scraper.js";
import { updateGuildStatCard } from "../tasks/sageGuildStats.js";

const CLASS_EMOJI = {
  Gladiator:    "<:Gladiator:1504471947831017532>",
  Templar:      "<:Templar:1504472027724255414>",
  Ranger:       "<:Ranger:1504471982006341783>",
  Assassin:     "<:Assassin:1504471833695748156>",
  Spiritmaster: "<:Elementalist:1504471920219783209>",
  Mentalist:    "<:Elementalist:1504471920219783209>",
  Sorcerer:     "<:Sorcerer:1504472006610124961>",
  Cleric:       "<:Cleric:1504471892755611678>",
  Chanter:      "<:Chanter:1504471867141128272>",
};

const numFmt = (n) => Number(n).toLocaleString("en-US");

function isAdmin(interaction) {
  return interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

export async function handleSageMgmtAction(action, interaction, rest) {
  if (!isAdmin(interaction)) {
    const reply = { content: "❌ هذا الإجراء مخصص للمسؤولين فقط.", flags: 64 };
    if (interaction.replied || interaction.deferred)
      await interaction.followUp(reply).catch(() => {});
    else
      await interaction.reply(reply).catch(() => {});
    return;
  }

  switch (action) {
    case "open_member_mgmt":  return handleOpenMemberMgmt(interaction);
    case "member_select":     return handleMemberSelect(interaction);
    case "remove_member":     return handleRemoveMember(interaction, rest[0]);
    case "sync_member":       return handleSyncMember(interaction, rest[0]);
    case "cancel_member":     return handleCancelMember(interaction);
    default:
      console.warn(`[SageMgmt] Unknown action: ${action}`);
  }
}

async function handleOpenMemberMgmt(interaction) {
  await interaction.deferReply({ flags: 64 });

  const res = await query(
    `SELECT user_id, discord_tag, character_name, character_level, class_name,
            combat_power, guild_name, joined_at
     FROM sage_recruitment
     WHERE status = 'accepted'
     ORDER BY joined_at DESC
     LIMIT 25`
  );

  if (res.rows.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("⚙️ إدارة الأعضاء (Siege Alliance)")
          .setDescription("لا يوجد أعضاء مقبولون في السجل حتى الآن.")
          .setTimestamp(),
      ],
    });
    return;
  }

  const options = res.rows.map((row) => {
    const rawEmoji   = CLASS_EMOJI[row.class_name] ?? "👤";
    const emojiMatch = rawEmoji.match(/:(\d+)>$/);
    const emojiObj   = emojiMatch ? { id: emojiMatch[1] } : rawEmoji;

    const cpVal = Number(row.combat_power || 0);
    const cp    = cpVal > 0 ? ` • CP: ${cpVal.toLocaleString()}` : "";
    const label = String(row.character_name || row.discord_tag || row.user_id || "Unknown").slice(0, 100);
    const desc  = String(`[${row.guild_name}] Lv.${row.character_level ?? 0} ${row.class_name ?? "—"}${cp}`).slice(0, 100);

    return new StringSelectMenuOptionBuilder()
      .setValue(String(row.user_id))
      .setLabel(label || "Member")
      .setDescription(desc || "No details")
      .setEmoji(emojiObj);
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId("sage:member_select")
    .setPlaceholder("اختر عضواً لإدارته...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚙️ إدارة الأعضاء")
    .setDescription(
      `📋 يوجد **${res.rows.length}** عضو مقبول في السجل.\n\n` +
      "اختر العضو الذي تريد إدارته من القائمة أدناه.\n" +
      "سيتم عرض بطاقته مع خيارات الإجراءات."
    )
    .setFooter({ text: "يُعرض الأعضاء بترتيب تاريخ القبول (الأحدث أولاً)" })
    .setTimestamp();

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function handleMemberSelect(interaction) {
  await interaction.deferUpdate();
  const userId = interaction.values[0];

  const res = await query(
    `SELECT * FROM sage_recruitment WHERE user_id = $1 AND status = 'accepted' LIMIT 1`,
    [userId]
  );

  if (!res.rows[0]) {
    await interaction.editReply({
      content: "❌ لم يتم العثور على سجل هذا العضو (ربما تم إزالته مسبقاً).",
      embeds: [], components: [],
    });
    return;
  }

  const rec = res.rows[0];
  const member = await interaction.guild.members.fetch(userId).catch(() => null);

  const cp = rec.combat_power > 0 ? numFmt(rec.combat_power) : "—";
  const acceptedTs = rec.joined_at
    ? `<t:${Math.floor(new Date(rec.joined_at).getTime() / 1000)}:D>`
    : (rec.accepted_at ? `<t:${Math.floor(new Date(rec.accepted_at).getTime() / 1000)}:D>` : "—");
  const classEmoji = CLASS_EMOJI[rec.class_name] ?? "👤";
  const mention = member ? `<@${userId}>` : `\`${rec.discord_tag}\``;

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`${classEmoji} ${rec.character_name ?? "غير معروف"}`)
    .setDescription(
      `> **${mention}** — سجل العضو\n` +
      `> \`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\``
    )
    .setThumbnail(
      rec.profile_image ??
      member?.user.displayAvatarURL({ dynamic: true }) ??
      null
    )
    .addFields(
      { name: "⚔️ الكلاس", value: rec.class_name ?? "—", inline: true },
      { name: "📊 المستوى", value: `${rec.character_level ?? 0}`, inline: true },
      { name: "💪 قوة القتال", value: `\`${cp}\``, inline: true },
      { name: "🏰 القيلد", value: rec.guild_name ?? "—", inline: true },
      { name: "🌍 السيرفر", value: rec.server_name ?? "—", inline: true },
      { name: "📅 تاريخ القبول", value: acceptedTs, inline: true },
      { name: "🆔 Discord ID", value: `\`${userId}\``, inline: false },
    )
    .setFooter({ text: "اختر الإجراء المناسب من الأزرار أدناه" })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sage:remove_member:${userId}`)
      .setLabel("إزالة العضو وحذف بياناته")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`sage:sync_member:${userId}`)
      .setLabel("مزامنة الإحصائيات")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary),
  );

  const row2Components = [];
  if (rec.shugo_url) {
    row2Components.push(
      new ButtonBuilder()
        .setURL(rec.shugo_url)
        .setLabel("View Profile")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Link)
    );
  }
  row2Components.push(
    new ButtonBuilder()
      .setCustomId("sage:cancel_member")
      .setLabel("إغلاق")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({ embeds: [embed], components: [row1, new ActionRowBuilder().addComponents(row2Components)] });
}

async function handleRemoveMember(interaction, userId) {
  await interaction.deferUpdate();

  if (!userId) {
    await interaction.editReply({ content: "❌ معرف العضو مفقود.", components: [], embeds: [] });
    return;
  }

  const recRes = await query("SELECT character_name, guild_role_id FROM sage_recruitment WHERE user_id=$1", [userId]);
  const charName = recRes.rows[0]?.character_name ?? userId;
  const roleId = recRes.rows[0]?.guild_role_id;

  const member = await interaction.guild.members.fetch(userId).catch(() => null);

  if (member && roleId) {
    await member.roles.remove(roleId, "Sage Admin Panel: member removal").catch(() => {});
  }
  
  // Assign guest role back if configured
  const SAGE_GUEST_ROLE_ID = process.env.SAGE_GUEST_ROLE_ID;
  if (member && SAGE_GUEST_ROLE_ID) {
    await member.roles.add(SAGE_GUEST_ROLE_ID).catch(() => {});
  }

  await query("DELETE FROM sage_recruitment WHERE user_id=$1", [userId]);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ تمت إزالة العضو")
    .setDescription(
      `تم تنفيذ الإجراءات التالية على **${charName}** (<@${userId}>):\n\n` +
      "• ✅ تمت إزالة العضو من سجل الانضمام للتحالف\n" +
      "• ✅ تمت إزالة رول القيلد وإعادة رتبة الزائر\n" +
      "• ✅ تم تحديث بطاقة القيلد في الرادارات بنجاح"
    )
    .setFooter({ text: `تم بواسطة ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });
  console.log(`[SageMgmt] Member ${charName} (${userId}) removed by ${interaction.user.tag}`);

  // Update Guild Stats Card immediately
  const statsChannelId = process.env.SAGE_GUILD_STATS_CHANNEL_ID;
  if (statsChannelId && roleId) {
    const statsChannel = interaction.guild.channels.cache.get(statsChannelId) ?? await interaction.guild.channels.fetch(statsChannelId).catch(() => null);
    const role = interaction.guild.roles.cache.get(roleId);
    if (statsChannel && role) {
      await updateGuildStatCard(interaction.guild, statsChannel, roleId, role).catch(e => console.error("[SageMgmt] Error updating guild stats card:", e));
    }
  }
}

async function handleSyncMember(interaction, userId) {
  await interaction.deferUpdate();

  if (!userId) {
    await interaction.editReply({ content: "❌ معرف العضو مفقود.", components: [], embeds: [] });
    return;
  }

  const recRes = await query("SELECT character_name, shugo_url FROM sage_recruitment WHERE user_id=$1 AND status='accepted'", [userId]);
  const rec = recRes.rows[0];

  if (!rec?.shugo_url) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ فشل المزامنة")
          .setDescription("لا يوجد رابط Shugo.gg مسجل لهذا العضو.\nلا يمكن مزامنة الإحصائيات بدون رابط.")
          .setTimestamp(),
      ],
      components: [],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🔄 جارٍ مزامنة الإحصائيات...")
        .setDescription(
          `**${rec.character_name ?? userId}**\n\n` +
          "⏳ يتم الآن جلب أحدث البيانات من Shugo.gg...\n" +
          "قد يستغرق هذا بضع ثوانٍ."
        )
        .setTimestamp(),
    ],
    components: [],
  });

  const result = await scrapeProfile(rec.shugo_url);

  if (!result.success) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ فشل المزامنة")
          .setDescription(
            `**${rec.character_name ?? userId}**\n\n` +
            `تعذّر جلب البيانات من Shugo.gg:\n\`\`\`${result.error}\`\`\``
          )
          .setTimestamp(),
      ],
      components: [],
    });
    return;
  }

  const d = result.data;

  await query(
    `UPDATE sage_recruitment
     SET character_name   = $1,
         character_level  = $2,
         class_name       = $3,
         combat_power     = $4,
         profile_image    = $5,
         race_name        = $6,
         server_name      = $7,
         updated_at       = NOW()
     WHERE user_id = $8`,
    [
      d.characterName,
      d.characterLevel,
      d.className,
      d.combatPower ?? 0,
      d.profileImage ?? null,
      d.raceName ?? null,
      d.serverName ?? null,
      userId,
    ]
  );

  const cp = d.combatPower > 0 ? numFmt(d.combatPower) : "—";
  const classEmoji = CLASS_EMOJI[d.className] ?? "👤";

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`✅ تمت المزامنة — ${classEmoji} ${d.characterName}`)
    .setDescription(`> بيانات <@${userId}> محدّثة بنجاح من Shugo.gg\n> \`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\``)
    .setThumbnail(d.profileImage ?? null)
    .addFields(
      { name: "⚔️ الكلاس", value: d.className ?? "—", inline: true },
      { name: "📊 المستوى", value: `${d.characterLevel ?? 0}`, inline: true },
      { name: "💪 قوة القتال", value: `\`${cp}\``, inline: true },
      { name: "🌍 السيرفر", value: d.serverName ?? "—", inline: true },
      { name: "🔄 تحديث", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: `تمت المزامنة بواسطة ${interaction.user.tag}` })
    .setTimestamp();

  const linkRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setURL(rec.shugo_url)
      .setLabel("عرض البروفايل على Shugo.gg")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Link)
  );

  await interaction.editReply({ embeds: [embed], components: [linkRow] });
  console.log(`[SageMgmt] ✅ Synced ${d.characterName} (${userId})`);

  // Update Guild Stats Card immediately
  const roleIdRes = await query("SELECT guild_role_id FROM sage_recruitment WHERE user_id=$1", [userId]);
  const roleId = roleIdRes.rows[0]?.guild_role_id;
  const statsChannelId = process.env.SAGE_GUILD_STATS_CHANNEL_ID;
  if (statsChannelId && roleId) {
    const statsChannel = interaction.guild.channels.cache.get(statsChannelId) ?? await interaction.guild.channels.fetch(statsChannelId).catch(() => null);
    const role = interaction.guild.roles.cache.get(roleId);
    if (statsChannel && role) {
      await updateGuildStatCard(interaction.guild, statsChannel, roleId, role).catch(e => console.error("[SageMgmt] Error updating guild stats card:", e));
    }
  }
}

async function handleCancelMember(interaction) {
  await interaction.update({ content: "↩️ تم إغلاق لوحة إدارة الأعضاء.", embeds: [], components: [] });
}
