import { ActivityType } from "discord.js";
import { startRadar } from "../tasks/radar.js";
import { startNewsTask } from "../tasks/newsTask.js";
import { startInactivityTask } from "../tasks/inactivityTracker.js";
import { startPowerCardQueue } from "../tasks/powerCardQueue.js";
import { startPowerCardRefresh } from "../tasks/powerCardRefresh.js";
import { startVoiceTracker } from "../tasks/voiceTracker.js";
import { startSageGuildStatsTask } from "../tasks/sageGuildStats.js";
import { cacheGuildInvites } from "./guildMemberAdd.js";

const SAGE_GUILD_ID = "1507696012410749030";

export default {
  name: "clientReady",
  once: true,
  async execute(client) {
    console.log(`[Bot] Logged in as ${client.user.tag}`);
    console.log(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);

    client.user.setPresence({
      activities: [{ name: "M3RGEEN | /help", type: ActivityType.Watching }],
      status: "online",
    });

    // Cache invites for Sage Guild
    const sageGuild = client.guilds.cache.get(SAGE_GUILD_ID);
    if (sageGuild) {
      cacheGuildInvites(sageGuild);
    }

    // Start background tasks
    try {
      startRadar(client);
      startNewsTask(client);
      startInactivityTask(client);
      startPowerCardQueue(client);
      startPowerCardRefresh(client);
      startVoiceTracker(client);
      startSageGuildStatsTask(client);
      console.log("[Bot] All background tasks started successfully.");
    } catch (err) {
      console.error("[Bot] Failed to start background tasks:", err);
    }
  },
};
