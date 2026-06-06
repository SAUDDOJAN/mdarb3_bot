import { query } from './src/database/index.js'; query('DELETE FROM notifications WHERE type = ', ['tl_recruitment']).then(() => { console.log('Cleaned'); process.exit(0); }).catch(console.error);
