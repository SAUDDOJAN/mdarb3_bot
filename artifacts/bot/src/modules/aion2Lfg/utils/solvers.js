export const CLASS_ROLES = {
  Templar: ['Tank'],
  Cleric: ['Healer'],
  Gladiator: ['Tank', 'DPS'],
  Chanter: ['Tank', 'Healer', 'DPS'],
  Sorcerer: ['DPS'],
  Spiritmaster: ['DPS'],
  Ranger: ['DPS'],
  Assassin: ['DPS']
};

const SANCTUARY_CLASS_ROLES = {
  Templar: ['Tank'],
  Cleric: ['Healer'],
  Gladiator: ['DPS', 'Tank'],
  Chanter: ['DPS', 'Healer'],
  Sorcerer: ['DPS'],
  Spiritmaster: ['DPS'],
  Ranger: ['DPS'],
  Assassin: ['DPS']
};

const DUNGEON_CLASS_ROLES = {
  Templar: ['Tank'],
  Cleric: ['Healer'],
  Gladiator: ['Tank', 'DPS'],
  Chanter: ['Tank', 'Healer', 'DPS'],
  Sorcerer: ['DPS'],
  Spiritmaster: ['DPS'],
  Ranger: ['DPS'],
  Assassin: ['DPS']
};

function getDungeonRoleScore(role, playerClass) {
  if (role === 'Tank') {
    if (playerClass === 'Templar') return 1000;
    if (playerClass === 'Gladiator') return 800;
    if (playerClass === 'Chanter') return 600;
  }
  if (role === 'Healer') {
    if (playerClass === 'Cleric') return 100;
    if (playerClass === 'Chanter') return 80;
  }
  if (role === 'DPS') {
    return 1;
  }
  return 0;
}

function solveDungeon(sorted) {
  if (sorted.length > 5) return null;

  let bestScore = -1;
  let bestAssignment = null;

  const currentAssignment = new Array(sorted.length);
  const state = { t: 0, h: 0, d: 0, templars: 0, clerics: 0 };

  function search(index, currentScore) {
    if (index === sorted.length) {
      if (sorted.length === 5) {
        if (state.t !== 1 || state.h !== 1 || state.d !== 3) {
          return;
        }
      }
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestAssignment = [...currentAssignment];
      }
      return;
    }

    const m = sorted[index];
    const roles = DUNGEON_CLASS_ROLES[m.player_class] || ['DPS'];

    for (const role of roles) {
      if (role === 'Tank') {
        if (state.t >= 1) continue;
        if (m.player_class === 'Templar' && state.templars >= 1) continue;
      } else if (role === 'Healer') {
        if (state.h >= 1) continue;
        if (m.player_class === 'Cleric' && state.clerics >= 1) continue;
      } else if (role === 'DPS') {
        if (state.d >= 3) continue;
      }

      if (role === 'Tank') {
        state.t++;
        if (m.player_class === 'Templar') state.templars++;
      } else if (role === 'Healer') {
        state.h++;
        if (m.player_class === 'Cleric') state.clerics++;
      } else if (role === 'DPS') {
        state.d++;
      }

      currentAssignment[index] = {
        discord_id: m.discord_id,
        assigned_party: 1,
        assigned_role: role
      };

      const score = getDungeonRoleScore(role, m.player_class);
      search(index + 1, currentScore + score);

      if (role === 'Tank') {
        state.t--;
        if (m.player_class === 'Templar') state.templars--;
      } else if (role === 'Healer') {
        state.h--;
        if (m.player_class === 'Cleric') state.clerics--;
      } else if (role === 'DPS') {
        state.d--;
      }
    }
  }

  search(0, 0);
  return bestAssignment;
}

function solveSanctuary(sorted) {
  if (sorted.length > 10) return null;

  const maxParties = 2;
  const maxTemplarsPerParty = 1;
  const maxClericsPerParty = 1;

  const state = {
    p1: { t: 0, h: 0, d: 0, templars: 0, clerics: 0 },
    p2: { t: 0, h: 0, d: 0, templars: 0, clerics: 0 }
  };
  const result = [];

  function canAssign(cls, role, pState) {
    if (role === 'Tank' && pState.t >= 1) return false;
    if (role === 'Healer' && pState.h >= 1) return false;
    if (role === 'DPS' && pState.d >= 3) return false;
    if (cls === 'Templar' && pState.templars >= maxTemplarsPerParty) return false;
    if (cls === 'Cleric' && pState.clerics >= maxClericsPerParty) return false;
    return true;
  }

  function applyAssign(cls, role, pState, modifier) {
    if (role === 'Tank') pState.t += modifier;
    if (role === 'Healer') pState.h += modifier;
    if (role === 'DPS') pState.d += modifier;
    if (cls === 'Templar') pState.templars += modifier;
    if (cls === 'Cleric') pState.clerics += modifier;
  }

  function backtrack(index) {
    if (index === sorted.length) return true;
    const m = sorted[index];
    const roles = SANCTUARY_CLASS_ROLES[m.player_class] || ['DPS'];

    for (let party = 1; party <= maxParties; party++) {
      const pState = party === 1 ? state.p1 : state.p2;
      for (const role of roles) {
        if (canAssign(m.player_class, role, pState)) {
          applyAssign(m.player_class, role, pState, 1);
          result[index] = { discord_id: m.discord_id, assigned_party: party, assigned_role: role };
          if (backtrack(index + 1)) return true;
          applyAssign(m.player_class, role, pState, -1);
        }
      }
    }
    return false;
  }

  if (backtrack(0)) return result;
  return null;
}

/**
 * Deterministic Solver with Full Re-solve on Join/Leave.
 * Dungeon: globally prioritizes Tank (Templar > Gladiator > Chanter)
 * and Healer (Cleric > Chanter), balancing partial and full groups.
 * Sanctuary: 2-party solver.
 * Abyss: 1-party FLEX solver.
 */
export function solveComposition(members, activityType) {
  const sorted = [...members].sort((a, b) => {
    const tA = new Date(a.joined_at).getTime();
    const tB = new Date(b.joined_at).getTime();
    if (tA !== tB) return tA - tB;
    return a.id - b.id; // stable tie-break
  });

  if (activityType === 'ABYSS' || activityType === 'WORLD_BOSS') {
    return sorted.map(m => ({ discord_id: m.discord_id, assigned_party: 1, assigned_role: 'FLEX' }));
  }

  if (activityType === 'SANCTUARY') {
    return solveSanctuary(sorted);
  }

  // DUNGEON, TRANSCENDENCE
  return solveDungeon(sorted);
}

export function getCapacity(activityType) {
  if (activityType === 'ABYSS' || activityType === 'WORLD_BOSS') return 20;
  if (activityType === 'SANCTUARY') return 10;
  return 5; // DUNGEON, TRANSCENDENCE
}

