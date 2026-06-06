import 'dotenv/config';
import { initPush, broadcastPushNotification } from './src/services/push.js';
import { initDb } from './src/database/index.js';

async function run() {
  console.log("Initializing DB...");
  await initDb();
  console.log("Initializing Push...");
  await initPush();
  console.log("Sending push notification...");
  await broadcastPushNotification("رسالة تجريبية 🚀", "أهلاً بك! هذا الإشعار مخصص لتجربة نظام الإشعارات الجديد. إذا وصلك فهذا يعني أن النظام يعمل بكفاءة 100%.");
  console.log("Done.");
  process.exit(0);
}

run();
