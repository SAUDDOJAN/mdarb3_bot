import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getActiveAion2Application } from './db/player.js';
import { ACTIVITY_CONFIG, getActivityConfig } from './utils/activitiesConfig.js';

const AION2_MEMBER_ROLE = '1401376073077231702';

/**
 * Access Gate logic
 * Strictly checks:
 * 1. Discord role AION2_MEMBER_ROLE
 * 2. Active accepted application with assigned_guild IN ('EMPEROR', 'M3RGEEN_GLOBAL')
 * 3. Registered shugo_url
 * 4. Registered selected_class
 */
export async function checkAccessGate(interaction) {
  // 1. Role check
  if (!interaction.member?.roles?.cache?.has(AION2_MEMBER_ROLE)) {
    await interaction.reply({ 
      content: '❌ عذراً، يجب أن تحمل رتبة AION 2 Member لاستخدام هذا النظام.', 
      ephemeral: true 
    });
    return null;
  }

  // 2. Database check (Strictly EMPEROR or M3RGEEN_GLOBAL)
  const app = await getActiveAion2Application(interaction.user.id);
  if (!app) {
    await interaction.reply({ 
      content: '❌ عذراً، نظام LFG مخصص حصرياً لأعضاء قيلد Emperor و M3RGEEN Global المعتمدين.\n(أعضاء المجتمع العام غير المنضمين لقيلد معتمد غير مؤهلين للـ LFG).', 
      ephemeral: true 
    });
    return null;
  }

  // 3. Shugo URL check
  if (!app.shugo_url) {
    await interaction.reply({
      content: '❌ لا يوجد رابط Shugo.gg مسجل لحسابك. يرجى إتمام التسجيل وتأكيد شخصيتك أولاً.',
      ephemeral: true
    });
    return null;
  }

  // 4. Class check
  if (!app.selected_class) {
    await interaction.reply({
      content: '❌ تعذر التحقق من كلاس شخصيتك من بروفايل شوقو. يرجى التحقق من صحة بروفايلك على Shugo.gg.',
      ephemeral: true
    });
    return null;
  }

  return app;
}

/**
 * Deprecated manual class gates (Fail Closed)
 */
export async function handleNullClassGate(interaction, app) {
  if (app.selected_class) return true;
  await interaction.reply({
    content: '❌ تعذر التحقق من كلاس شخصيتك من بروفايل شوقو.',
    ephemeral: true
  });
  return false;
}

export async function handleClassSelect(interaction) {
  await interaction.update({
    content: '❌ تم إيقاف اختيار الكلاس اليدوي. يتم جلب الكلاس وتحديثه تلقائياً من بروفايل Shugo.gg.',
    embeds: [],
    components: []
  });
}

export async function handleClassConfirm(interaction) {
  await interaction.update({
    content: '❌ تم إيقاف اختيار الكلاس اليدوي. يتم جلب الكلاس وتحديثه تلقائياً من بروفايل Shugo.gg.',
    embeds: [],
    components: []
  });
}

export async function handleClassCancel(interaction) {
  await interaction.update({ content: 'تم الإلغاء.', embeds: [], components: [] });
}

/**
 * UI Previews & Navigation
 */
export async function handleDungeonsNav(interaction) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('aion2_lfg_dun_select')
    .setPlaceholder('اختر الإكسبدشن...')
    .addOptions([
      { label: 'Krao Cave', value: 'Krao', description: 'Exploration: 200 iLvl | Conquest: 700 iLvl' },
      { label: 'Draupnir', value: 'Draupnir', description: 'Exploration: 700 iLvl | Conquest: 700 iLvl' },
      { label: 'Urugugu', value: 'Urugugu', description: 'Exploration: 300 iLvl | Conquest: 1400 iLvl' },
      { label: 'Vakron Island', value: 'Vakron', description: 'Exploration: 1400 iLvl | Conquest: 1400 iLvl' },
      { label: 'Fire Temple', value: 'Fire_Temple', description: 'Exploration: 500 iLvl | Conquest: 2100 iLvl' },
      { label: 'Ferocious Horn Den', value: 'Ferocious_Horn_Den', description: 'Exploration: 2100 iLvl | Conquest: 2100 iLvl' },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);
  
  await interaction.reply({
    content: '🗡️ **اختر الإكسبدشن المطلوب:**',
    components: [row],
    ephemeral: true
  });
}

export async function handleDungeonsSelect(interaction) {
  const dungeon = interaction.values[0];
  const config = ACTIVITY_CONFIG[dungeon];
  const displayName = config?.displayName || dungeon.replace(/_/g, ' ');

  const expILvl = config?.modes?.EXPLORATION?.minimumItemLevel ?? '—';
  const conILvl = config?.modes?.CONQUEST?.minimumItemLevel ?? '—';

  const embed = new EmbedBuilder()
    .setTitle(`معاينة الإكسبدشن: ${displayName}`)
    .setDescription(
      `مجموعة مكونة من 5 لاعبين\n\n` +
      `🛡️ **توزيع الخانات:**\n- 1 Tank\n- 1 Healer\n- 3 DPS\n\n` +
      `⚔️ **اختر نمط الإكسبدشن (Mode):**\n` +
      `🔹 **Exploration:** الحد الأدنى للعتاد: **${expILvl}** iLvl\n` +
      `🔸 **Conquest:** الحد الأدنى للعتاد: **${conILvl}** iLvl\n\n` +
      `⚠️ *سيتم فحص وتحديث بيانات شخصيتك ومستوى عتادك من Shugo.gg تلقائياً عند الإنشاء.*`
    )
    .setColor('#3498DB');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aion2_lfg_create_mode_${dungeon}_EXPLORATION`)
      .setLabel(`Exploration (${expILvl} iLvl)`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`aion2_lfg_create_mode_${dungeon}_CONQUEST`)
      .setLabel(`Conquest (${conILvl} iLvl)`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('aion2_lfg_cancel_nav')
      .setLabel('↩️ رجوع')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ content: '', embeds: [embed], components: [row] });
}

export async function handleSanctuaryNav(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('معاينة: سانكشوري (Sanctuary)')
    .setDescription(
      'مطلوب 10 لاعبين\n\n' +
      '🛡️ **التكوين:**\n' +
      '**Party 1:** 1 Tank, 1 Healer, 3 DPS\n' +
      '**Party 2:** 1 Tank, 1 Healer, 3 DPS\n\n' +
      '⚠️ سيتم فتح مجموعة بحث عن فريق.\n' +
      '⚠️ يسمح بمجموعة نشطة واحدة فقط لكل لاعب.\n' +
      '⚠️ المجموعة تبدأ مهلة البحث بمجرد الإنشاء.'
    )
    .setColor('#2ECC71');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aion2_lfg_create_sanctuary')
      .setLabel('✅ إنشاء المجموعة')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('aion2_lfg_cancel_nav')
      .setLabel('↩️ رجوع')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleAbyssNav(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('معاينة: أبيس (Abyss)')
    .setDescription(
      'مطلوب 20 لاعب\n\n' +
      '⚔️ **التكوين:**\n' +
      '- أي كلاسات (بدون قيود أدوار)\n\n' +
      '⚠️ سيتم فتح مجموعة بحث عن فريق.\n' +
      '⚠️ يسمح بمجموعة نشطة واحدة فقط لكل لاعب.\n' +
      '⚠️ المجموعة تبدأ مهلة البحث بمجرد الإنشاء.'
    )
    .setColor('#E74C3C');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aion2_lfg_create_abyss')
      .setLabel('✅ إنشاء المجموعة')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('aion2_lfg_cancel_nav')
      .setLabel('↩️ رجوع')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleWorldBossNav(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('معاينة: زعماء العالم (World Bosses)')
    .setDescription(
      'مطلوب 20 لاعب\n\n' +
      '⚔️ **التكوين:**\n' +
      '- أي كلاسات (بدون قيود أدوار)\n\n' +
      '⚠️ سيتم فتح مجموعة بحث عن فريق لزعماء العالم.\n' +
      '⚠️ يسمح بمجموعة نشطة واحدة فقط لكل لاعب.\n' +
      '⚠️ المجموعة تبدأ مهلة البحث بمجرد الإنشاء.'
    )
    .setColor('#9B59B6');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aion2_lfg_create_world_boss')
      .setLabel('✅ إنشاء المجموعة')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('aion2_lfg_cancel_nav')
      .setLabel('↩️ رجوع')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleTranscendenceNav(interaction) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('aion2_lfg_trans_dun_select')
    .setPlaceholder('اختر دنجن ترانسندنس...')
    .addOptions([
      {
        label: 'Shattered Arkanis',
        value: 'Shattered_Arkanis',
        description: '4 مراحل | 1600 - 2500 iLvl | مستوى 45',
        emoji: '🔮'
      },
      {
        label: 'Deus Research Base',
        value: 'Deus_Research_Base',
        description: '4 مراحل | 1600 - 2500 iLvl | مستوى 45',
        emoji: '🏛️'
      }
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  await interaction.reply({
    content: '✨ **اختر دنجن ترانسندنس (Transcendence):**',
    components: [row],
    ephemeral: true
  });
}

export async function handleTranscendenceDunSelect(interaction) {
  const dungeon = interaction.values[0];
  const config = ACTIVITY_CONFIG[dungeon];
  const displayName = config?.displayName || dungeon.replace(/_/g, ' ');

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`aion2_lfg_trans_stage_select_${dungeon}`)
    .setPlaceholder('اختر المرحلة المطلوبة...')
    .addOptions([
      { label: 'Stage 1', value: 'STAGE_1', description: 'الحد الأدنى للعتاد: 1600 iLvl | مستوى 45' },
      { label: 'Stage 2', value: 'STAGE_2', description: 'الحد الأدنى للعتاد: 1900 iLvl | مستوى 45' },
      { label: 'Stage 3', value: 'STAGE_3', description: 'الحد الأدنى للعتاد: 2200 iLvl | مستوى 45' },
      { label: 'Stage 4', value: 'STAGE_4', description: 'الحد الأدنى للعتاد: 2500 iLvl | مستوى 45' }
    ]);

  const row1 = new ActionRowBuilder().addComponents(menu);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('aion2_lfg_cancel_nav')
      .setLabel('↩️ رجوع')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({
    content: `✨ **ترانسندنس ${displayName}:** اختر المرحلة (Stage):`,
    embeds: [],
    components: [row1, row2]
  });
}

export async function handleTranscendenceStageSelect(interaction, dungeon, stage) {
  const config = getActivityConfig(dungeon, stage);
  const displayName = config?.displayName || dungeon.replace(/_/g, ' ');
  const stageName = config?.modeDisplayName || stage;
  const minILvl = config?.minimumItemLevel ?? '—';
  const minCharLvl = config?.minCharacterLevel ?? 45;

  const embed = new EmbedBuilder()
    .setTitle(`معاينة ترانسندنس: ${displayName} [${stageName}]`)
    .setDescription(
      `مجموعة مكونة من 5 لاعبين\n\n` +
      `🛡️ **توزيع الخانات:**\n- 1 Tank\n- 1 Healer\n- 3 DPS\n\n` +
      `📊 **شروط الأهلية:**\n` +
      `🔹 مستوى الشخصية المطلوب: **Lv${minCharLvl}**\n` +
      `🔹 الحد الأدنى للعتاد (Item Level): **${minILvl}** iLvl\n\n` +
      `⚠️ *سيتم فحص وتحديث بيانات شخصيتك ومستوى عتادك من Shugo.gg تلقائياً عند الإنشاء.*`
    )
    .setColor('#9B59B6');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aion2_lfg_create_trans_${dungeon}_${stage}`)
      .setLabel('✅ إنشاء الفريق')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('aion2_lfg_cancel_nav')
      .setLabel('↩️ رجوع')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.update({ content: '', embeds: [embed], components: [row] });
}

