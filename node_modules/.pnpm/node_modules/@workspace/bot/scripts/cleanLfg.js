import 'dotenv/config';
import { query } from '../src/database/index.js';

async function run() {
  try {
    const res = await query("UPDATE dungeon_lfg_groups SET status='expired' WHERE status != 'expired' AND created_at <= NOW() - INTERVAL '59 minutes'");
    console.log('Expired groups:', res.rowCount);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
