/**
 * Central Activity & Dungeon Configuration for AION 2 LFG
 * Defines internal keys, display names, activity types, caps, voice requirements,
 * modes (Exploration / Conquest), and minimum item levels (iLvl).
 */

export const ACTIVITY_CONFIG = {
  Krao: {
    type: 'DUNGEON',
    displayName: 'Krao Cave',
    cap: null,
    modes: {
      EXPLORATION: { minimumItemLevel: 200, reqSeconds: 300, displayName: 'Exploration' },
      CONQUEST:    { minimumItemLevel: 700, reqSeconds: 300, displayName: 'Conquest' }
    }
  },
  Draupnir: {
    type: 'DUNGEON',
    displayName: 'Draupnir',
    cap: null,
    modes: {
      EXPLORATION: { minimumItemLevel: 700, reqSeconds: 300, displayName: 'Exploration' },
      CONQUEST:    { minimumItemLevel: 700, reqSeconds: 300, displayName: 'Conquest' }
    }
  },
  Urugugu: {
    type: 'DUNGEON',
    displayName: 'Urugugu',
    cap: null,
    modes: {
      EXPLORATION: { minimumItemLevel: 300,  reqSeconds: 480, displayName: 'Exploration' },
      CONQUEST:    { minimumItemLevel: 1400, reqSeconds: 480, displayName: 'Conquest' }
    }
  },
  Vakron: {
    type: 'DUNGEON',
    displayName: 'Vakron Island',
    cap: null,
    modes: {
      EXPLORATION: { minimumItemLevel: 1400, reqSeconds: 480, displayName: 'Exploration' },
      CONQUEST:    { minimumItemLevel: 1400, reqSeconds: 480, displayName: 'Conquest' }
    }
  },
  Fire_Temple: {
    type: 'DUNGEON',
    displayName: 'Fire Temple',
    cap: null,
    modes: {
      EXPLORATION: { minimumItemLevel: 500,  reqSeconds: 600, displayName: 'Exploration' },
      CONQUEST:    { minimumItemLevel: 2100, reqSeconds: 600, displayName: 'Conquest' }
    }
  },
  Ferocious_Horn_Den: {
    type: 'DUNGEON',
    displayName: 'Ferocious Horn Den',
    cap: null,
    modes: {
      EXPLORATION: { minimumItemLevel: 2100, reqSeconds: 600, displayName: 'Exploration' },
      CONQUEST:    { minimumItemLevel: 2100, reqSeconds: 600, displayName: 'Conquest' }
    }
  },
  Sanctuary: {
    type: 'SANCTUARY',
    displayName: 'Sanctuary',
    cap: 1,
    modes: {
      NORMAL: { minimumItemLevel: null, reqSeconds: 1500, displayName: 'Normal' }
    }
  },
  Abyss: {
    type: 'ABYSS',
    displayName: 'Abyss',
    cap: 1,
    modes: {
      NORMAL: { minimumItemLevel: null, reqSeconds: 1800, displayName: 'Normal' }
    }
  },
  World_Boss: {
    type: 'WORLD_BOSS',
    displayName: 'World Bosses',
    cap: 1,
    modes: {
      NORMAL: { minimumItemLevel: null, reqSeconds: 1800, displayName: 'Normal' }
    }
  },
  Shattered_Arkanis: {
    type: 'TRANSCENDENCE',
    displayName: 'Shattered Arkanis',
    cap: null,
    minCharacterLevel: 45,
    modes: {
      STAGE_1: { minimumItemLevel: 1600, reqSeconds: 300, displayName: 'Stage 1' },
      STAGE_2: { minimumItemLevel: 1900, reqSeconds: 300, displayName: 'Stage 2' },
      STAGE_3: { minimumItemLevel: 2200, reqSeconds: 300, displayName: 'Stage 3' },
      STAGE_4: { minimumItemLevel: 2500, reqSeconds: 300, displayName: 'Stage 4' }
    }
  },
  Deus_Research_Base: {
    type: 'TRANSCENDENCE',
    displayName: 'Deus Research Base',
    cap: null,
    minCharacterLevel: 45,
    modes: {
      STAGE_1: { minimumItemLevel: 1600, reqSeconds: 300, displayName: 'Stage 1' },
      STAGE_2: { minimumItemLevel: 1900, reqSeconds: 300, displayName: 'Stage 2' },
      STAGE_3: { minimumItemLevel: 2200, reqSeconds: 300, displayName: 'Stage 3' },
      STAGE_4: { minimumItemLevel: 2500, reqSeconds: 300, displayName: 'Stage 4' }
    }
  }
};

export const ALLOWED_GUILDS = Object.freeze(['EMPEROR', 'M3RGEEN_GLOBAL']);

export function getActivityConfig(activityName, activityMode = 'EXPLORATION') {
  const act = ACTIVITY_CONFIG[activityName];
  if (!act) return null;

  // Fallback mode resolution
  let modeKey = activityMode;
  if (!act.modes[modeKey]) {
    if (act.modes.STAGE_1) modeKey = 'STAGE_1';
    else if (act.modes.NORMAL) modeKey = 'NORMAL';
    else modeKey = 'EXPLORATION';
  }
  const modeConfig = act.modes[modeKey] || Object.values(act.modes)[0];

  return {
    activityName,
    activityType: act.type,
    type: act.type,
    displayName: act.displayName,
    cap: act.cap,
    minCharacterLevel: act.minCharacterLevel ?? null,
    activityMode: modeKey,
    modeDisplayName: modeConfig?.displayName || modeKey,
    minimumItemLevel: modeConfig?.minimumItemLevel ?? null,
    reqSeconds: modeConfig?.reqSeconds ?? 300
  };
}

export function getMinimumItemLevel(activityName, activityMode = 'EXPLORATION') {
  const conf = getActivityConfig(activityName, activityMode);
  return conf ? conf.minimumItemLevel : null;
}

export function getMinimumCharacterLevel(activityName, activityMode = 'EXPLORATION') {
  const conf = getActivityConfig(activityName, activityMode);
  return conf ? conf.minCharacterLevel : null;
}

export function getReqSeconds(activityName, activityMode = 'EXPLORATION') {
  const conf = getActivityConfig(activityName, activityMode);
  return conf ? conf.reqSeconds : 300;
}

