import fs from "fs";

const DATA_FILE = "./m3rgeen_radar.json";

// تجهيز وقراءة البيانات من ملف الـ JSON
export function getSyncedChannels() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    return {};
  }
  try {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data || "{}");
  } catch (error) {
    console.error("[Database] خطأ في قراءة ملف الرادارات:", error);
    return {};
  }
}

// حفظ البيانات في ملف الـ JSON
export function saveSyncedChannel(guildId, channelId) {
  const data = getSyncedChannels();
  data[guildId] = channelId;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// حذف سيرفر من ملف الـ JSON
export function removeSyncedChannel(guildId) {
  const data = getSyncedChannels();
  if (data[guildId]) {
    delete data[guildId];
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}
