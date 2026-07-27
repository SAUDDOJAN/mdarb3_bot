import { getTlSchedule } from './src/database/index.js';

(async () => {
  const schedule = await getTlSchedule(1);
  console.log("Monday Schedule:", schedule);
  process.exit(0);
})();
