import {pool} from './src/database/index.js'; pool.query("DELETE FROM aion2_lfg_groups WHERE activity_name LIKE 'B33_V3_%'").then(()=>pool.end());
