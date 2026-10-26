import {
  checkAccessGate,
  handleClassSelect,
  handleClassConfirm,
  handleClassCancel,
  handleDungeonsNav,
  handleDungeonsSelect,
  handleTranscendenceNav,
  handleTranscendenceDunSelect,
  handleTranscendenceStageSelect,
  handleSanctuaryNav,
  handleAbyssNav,
  handleWorldBossNav
} from './navigation.js';

export async function lfgRouter(interaction) {
  const cid = interaction.customId;

  // Deprecated Class Selection Routing
  if (cid === 'aion2_lfg_class_select') {
    return handleClassSelect(interaction);
  }
  if (cid.startsWith('aion2_lfg_class_confirm_')) {
    return handleClassConfirm(interaction);
  }
  if (cid === 'aion2_lfg_class_cancel') {
    return handleClassCancel(interaction);
  }

  // Vote Actions (DM or Guild Channel, authorized directly via official roster in DB)
  if (cid.startsWith('aion2_lfg_vote_yes_')) {
    const { handleVoteSubmit } = await import('./handlers/voting.js');
    return handleVoteSubmit(interaction, cid.replace('aion2_lfg_vote_yes_', ''), 'YES');
  }
  if (cid.startsWith('aion2_lfg_vote_no_')) {
    const { handleVoteSubmit } = await import('./handlers/voting.js');
    return handleVoteSubmit(interaction, cid.replace('aion2_lfg_vote_no_', ''), 'NO');
  }
  if (cid.startsWith('aion2_lfg_btn_vote_start_')) {
    const { handleVoteStart } = await import('./handlers/voting.js');
    return handleVoteStart(interaction, cid.replace('aion2_lfg_btn_vote_start_', ''));
  }
  if (cid.startsWith('aion2_lfg_btn_vote_req_')) {
    const { handleVoteReq } = await import('./handlers/voting.js');
    return handleVoteReq(interaction, cid.replace('aion2_lfg_btn_vote_req_', ''));
  }
  if (cid.startsWith('aion2_lfg_btn_vote_conf_')) {
    const { handleVoteConf } = await import('./handlers/voting.js');
    return handleVoteConf(interaction, cid.replace('aion2_lfg_btn_vote_conf_', ''));
  }

  // Common Gate Check for main navigation
  const app = await checkAccessGate(interaction);
  if (!app) return; // Gate blocked it and already replied

  // Block creation navigation if user already has an active group
  const navCreationCids = [
    'aion2_lfg_nav_dungeons',
    'aion2_lfg_dun_select',
    'aion2_lfg_nav_transcendence',
    'aion2_lfg_trans_dun_select',
    'aion2_lfg_nav_sanctuary',
    'aion2_lfg_nav_abyss'
  ];
  if (navCreationCids.includes(cid) || cid.startsWith('aion2_lfg_trans_stage_select_')) {
    const { getUserActiveGroup } = await import('./handlers/recruitment.js');
    const activeGroup = await getUserActiveGroup(interaction.user.id);
    if (activeGroup) {
      const actDisplayName = activeGroup.activity_name?.replace(/_/g, ' ') || 'نشاط';
      const msg = activeGroup.is_creator
        ? `❌ لديك بالفعل مجموعة نشطة (${actDisplayName}). يجب إغلاق مجموعتك السابقة أولاً لتتمكن من إنشاء مجموعة جديدة.`
        : `❌ أنت مسجل بالفعل كعضو في مجموعة نشطة (${actDisplayName}). يجب مغادرة المجموعة الحالية أولاً لتتمكن من إنشاء مجموعة جديدة.`;

      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ content: msg, embeds: [], components: [] });
      } else {
        return interaction.reply({ content: msg, ephemeral: true });
      }
    }
  }

  // Main Navigation Routing
  if (cid === 'aion2_lfg_nav_dungeons') {
    return handleDungeonsNav(interaction);
  }
  if (cid === 'aion2_lfg_dun_select') {
    return handleDungeonsSelect(interaction);
  }
  if (cid === 'aion2_lfg_nav_transcendence') {
    return handleTranscendenceNav(interaction);
  }
  if (cid === 'aion2_lfg_trans_dun_select') {
    return handleTranscendenceDunSelect(interaction);
  }
  if (cid.startsWith('aion2_lfg_trans_stage_select_')) {
    const dungeon = cid.replace('aion2_lfg_trans_stage_select_', '');
    const stage = interaction.values[0];
    return handleTranscendenceStageSelect(interaction, dungeon, stage);
  }
  if (cid === 'aion2_lfg_nav_sanctuary') {
    return handleSanctuaryNav(interaction);
  }
  if (cid === 'aion2_lfg_nav_abyss') {
    return handleAbyssNav(interaction);
  }
  if (cid === 'aion2_lfg_nav_world_boss') {
    return handleWorldBossNav(interaction);
  }
  if (cid === 'aion2_lfg_nav_rifts') {
    return interaction.reply({ content: '🌀 حرب الريفتات (قريبًا)...', ephemeral: true });
  }

  // --- RECRUITMENT ROUTING ---
  
  if (cid === 'aion2_lfg_cancel_nav') {
    const { handleCancelNav } = await import('./handlers/recruitment.js');
    return handleCancelNav(interaction);
  }

  // Create Dungeon with Mode
  if (cid.startsWith('aion2_lfg_create_mode_')) {
    const payload = cid.replace('aion2_lfg_create_mode_', '');
    const lastUnderscore = payload.lastIndexOf('_');
    const dungeon = payload.substring(0, lastUnderscore);
    const mode = payload.substring(lastUnderscore + 1);
    const { handleCreateGroup } = await import('./handlers/recruitment.js');
    return handleCreateGroup(interaction, 'DUNGEON', dungeon, mode);
  }

  // Legacy Dungeon Create (fallback to EXPLORATION)
  if (cid.startsWith('aion2_lfg_create_dungeon_')) {
    const { handleCreateGroup } = await import('./handlers/recruitment.js');
    return handleCreateGroup(interaction, 'DUNGEON', cid.replace('aion2_lfg_create_dungeon_', ''), 'EXPLORATION');
  }

  if (cid === 'aion2_lfg_create_sanctuary') {
    const { handleCreateGroup } = await import('./handlers/recruitment.js');
    return handleCreateGroup(interaction, 'SANCTUARY', 'Sanctuary', 'NORMAL');
  }
  if (cid === 'aion2_lfg_create_abyss') {
    const { handleCreateGroup } = await import('./handlers/recruitment.js');
    return handleCreateGroup(interaction, 'ABYSS', 'Abyss', 'NORMAL');
  }
  if (cid === 'aion2_lfg_create_world_boss') {
    const { handleCreateGroup } = await import('./handlers/recruitment.js');
    return handleCreateGroup(interaction, 'WORLD_BOSS', 'World_Boss', 'NORMAL');
  }
  if (cid.startsWith('aion2_lfg_create_trans_')) {
    const payload = cid.replace('aion2_lfg_create_trans_', '');
    const match = payload.match(/^(.*)_(STAGE_[1-4])$/);
    if (match) {
      const dungeon = match[1];
      const stage = match[2];
      const { handleCreateGroup } = await import('./handlers/recruitment.js');
      return handleCreateGroup(interaction, 'TRANSCENDENCE', dungeon, stage);
    }
  }

  // Join / Leave / Close
  if (cid.startsWith('aion2_lfg_btn_join_')) {
    const { handleJoinGroup } = await import('./handlers/recruitment.js');
    return handleJoinGroup(interaction, cid.replace('aion2_lfg_btn_join_', ''));
  }
  if (cid.startsWith('aion2_lfg_btn_leave_')) {
    const { handleLeaveGroup } = await import('./handlers/recruitment.js');
    return handleLeaveGroup(interaction, cid.replace('aion2_lfg_btn_leave_', ''));
  }
  if (cid.startsWith('aion2_lfg_btn_close_')) {
    const { handleCloseGroupInit } = await import('./handlers/recruitment.js');
    return handleCloseGroupInit(interaction, cid.replace('aion2_lfg_btn_close_', ''));
  }
  if (cid.startsWith('aion2_lfg_sel_close_reason_')) {
    const { handleCloseReasonSelect } = await import('./handlers/recruitment.js');
    return handleCloseReasonSelect(interaction);
  }
  if (cid.startsWith('aion2_lfg_btn_start_voice_')) {
    const { handleStartVoice } = await import('./handlers/voice.js');
    return handleStartVoice(interaction, cid.replace('aion2_lfg_btn_start_voice_', ''));
  }

  // Fallback
  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({ content: 'Unknown LFG action.', ephemeral: true });
  }
}

export async function lfgModalRouter(interaction) {
  if (interaction.customId.startsWith('aion2_lfg_modal_close_other_')) {
    const { handleCloseModalSubmit } = await import('./handlers/recruitment.js');
    return handleCloseModalSubmit(interaction);
  }
}
