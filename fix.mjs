import { query } from './artifacts/bot/src/database/index.js';

const groups = await query(`SELECT * FROM dungeon_lfg_groups WHERE status = 'open'`);
for (let g of groups.rows) {
  for (let slotName of ['slot_tank', 'slot_healer', 'slot_dps1', 'slot_dps2']) {
    if (g[slotName]) {
       let slot = typeof g[slotName] === 'string' ? JSON.parse(g[slotName]) : g[slotName];
       if (!slot.cp) {
         console.log('Fixing slot for', slot.name);
         const user_id = slot.user_id;
         const profile = await query(`SELECT combat_power FROM power_cards WHERE user_id=$1`, [user_id]);
         if (profile.rows[0]) {
           slot.cp = profile.rows[0].combat_power;
           slot.avatar = 'https://cdn.discordapp.com/avatars/417409204899545088/53d4eb888591f1a58b87723908db66be.png';
           await query(`UPDATE dungeon_lfg_groups SET ` + slotName + `=$1 WHERE id=$2`, [JSON.stringify(slot), g.id]);
         }
       }
    }
  }
}
console.log('Done');
process.exit(0);
