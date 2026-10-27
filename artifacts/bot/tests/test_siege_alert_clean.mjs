import { data, execute } from "../src/commands/admin/aion2_alert.js";
import { getAttendees, buildSiegeComponents, handleInteraction } from "../src/modules/aion2SiegeAlert.js";
import assert from "assert";

console.log("=== RUNNING SIEGE ALERT CLEAN VERIFICATION ===");

// 1. Verify Command Structure
assert.strictEqual(data.name, "aion2_alert");
assert.ok(data.options.length >= 8, "Expected 8 options on command");
console.log("✔ Command structure verified: name=aion2_alert, options count=" + data.options.length);

// 2. Test Execution Payload Generation (Dry Run)
let sentPayload = null;
let reactedEmoji = null;

const fakeTargetChannel = {
  id: "1548357027758219378",
  isTextBased: () => true,
  send: async (payload) => {
    sentPayload = payload;
    return {
      id: "fake_msg_123",
      react: async (emoji) => { reactedEmoji = emoji; }
    };
  }
};

const fakeInteraction = {
  channel: fakeTargetChannel,
  client: {
    channels: {
      fetch: async () => fakeTargetChannel
    }
  },
  deferReply: async () => {},
  editReply: async (res) => res,
  options: {
    getInteger: (name) => {
      if (name === "gathering_hour") return 10;
      if (name === "siege_hour") return 11;
      if (name === "teleport_number") return 20;
      return 0;
    },
    getString: (name) => {
      if (name === "gathering_minute") return "00";
      if (name === "gathering_period") return "مساءً";
      if (name === "siege_minute") return "30";
      if (name === "siege_period") return "مساءً";
      if (name === "notes") return "تجمع الابيس LFG";
      return "";
    }
  }
};

await execute(fakeInteraction);

assert.ok(sentPayload, "sentPayload should not be null");
assert.strictEqual(sentPayload.files, undefined, "CRITICAL: sentPayload.files MUST be undefined so no image appears under mention!");
assert.strictEqual(sentPayload.content, "<@&1555617080521269368>", "Mention should be M3RGEEN Guild");
assert.ok(sentPayload.embeds && sentPayload.embeds.length === 1, "Embed should be present");

const embedData = sentPayload.embeds[0].data;
console.log("Embed Image URL:", embedData.image?.url);
assert.strictEqual(
  embedData.image?.url, 
  "https://raw.githubusercontent.com/SAUDDOJAN/mdarb3_bot/main/artifacts/bot/assets/aion2_siege_banner.jpg",
  "Embed image MUST point to direct GitHub raw banner URL"
);
assert.ok(embedData.footer?.text.includes("تحالف M3RGEEN"), "Footer should be present");
assert.strictEqual(reactedEmoji, "✅", "Bot should react with ✅");
console.log("✔ New alert payload verified: ZERO files attached, pure embed with footer banner!");

// 3. Test Interaction with an existing message that has old attachments
let editedPayload = null;
const fakeOldMessage = {
  id: "fake_msg_siege_legacy",
  attachments: { size: 1 },
  embeds: [
    {
      data: {
        title: "⚔️ إعلان حصار AION 2 | نداء الحرب لكتيبة M3RGEEN ⚔️",
        description: "👥 **عدد الحضور المؤكدين:** `21 لاعب`",
        image: { url: "attachment://aion2_siege_banner.jpg" },
        footer: { text: "تحالف M3RGEEN" }
      }
    }
  ],
  edit: async (payload) => {
    editedPayload = payload;
  }
};

const fakeButtonInteraction = {
  customId: "aion2_siege_attend",
  user: { id: "user_test_999" },
  message: fakeOldMessage,
  reply: async () => {}
};

await handleInteraction(fakeButtonInteraction);

assert.ok(editedPayload, "editedPayload should not be null");
assert.deepStrictEqual(editedPayload.attachments, [], "CRITICAL: Legacy attachments MUST be cleared on edit!");
const editedEmbed = editedPayload.embeds[0].data;
assert.strictEqual(
  editedEmbed.image?.url,
  "https://raw.githubusercontent.com/SAUDDOJAN/mdarb3_bot/main/artifacts/bot/assets/aion2_siege_banner.jpg",
  "Legacy attachment:// image MUST be migrated to direct URL!"
);
console.log("✔ Legacy message interaction test passed: detached attachments cleared, embed image migrated!");

console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎯");
