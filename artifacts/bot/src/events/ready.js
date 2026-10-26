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
      
      try {
        const { recoverStuckProcessing, recoverEarlyTransitions, recoverStuckRemovals } = await import("../modules/aion2GlobalTemp.js");
        await recoverStuckProcessing(null, client);
        await recoverEarlyTransitions(client);
        await recoverStuckRemovals(client);
      } catch (e) {
        console.error("[Bot] Failed to run AION 2 recovery:", e);
      }
      
      try {
        const { reconcileLfgEventsCards } = await import("../modules/aion2Lfg/reconciler.js");
        await reconcileLfgEventsCards(client);
      } catch (e) {
        console.error("[Bot] Failed to run LFG Reconciler on startup:", e);
      }

      // B3.1 Workers
      try {
        const { processDeadlines, processActivityDeadlines } = await import("../modules/aion2Lfg/workers/deadlines.js");
        const { processNotifications, recoverStaleNotifications } = await import("../modules/aion2Lfg/workers/notifications.js");
        const { periodicDirtyReconciliation } = await import("../modules/aion2Lfg/reconciler.js");
        
        // Recover stale
        await recoverStaleNotifications();
        
        // Run immediately on boot
        await processDeadlines();
        await processActivityDeadlines(client);
        await processNotifications();
        
        // Set intervals (e.g., 60 seconds)
        setInterval(() => processDeadlines().catch(e => console.error("[LFG Deadlines Worker] Error:", e)), 60000);
        setInterval(() => processActivityDeadlines(client).catch(e => console.error("[LFG Activity Deadlines Worker] Error:", e)), 60000);
        setInterval(() => processNotifications().catch(e => console.error("[LFG Notifications Worker] Error:", e)), 5000);
        setInterval(() => periodicDirtyReconciliation(client).catch(e => console.error("[LFG Periodic Reconciler] Error:", e)), 60000);
      } catch (e) {
        console.error("[Bot] Failed to start B3.1 LFG workers:", e);
      }
      
      // B3.3 Voice Lifecycle Workers
      try {
        const { startupVoiceRecovery, processVoiceHeartbeat, processVoiceEntryTimeouts, processEmptyVoiceTimeouts, processLowVoiceTimeouts, processDurableDeletions, processPeriodicReconciliation } = await import("../modules/aion2Lfg/workers/voiceLifecycle.js");
        
        await startupVoiceRecovery(client);
        await processVoiceEntryTimeouts(client);
        await processEmptyVoiceTimeouts(client);
        await processLowVoiceTimeouts(client);
        await processDurableDeletions(client);
        
        setInterval(() => processVoiceHeartbeat(client).catch(() => {}), 60000);
        setInterval(() => processVoiceEntryTimeouts(client).catch(() => {}), 60000);
        setInterval(() => processEmptyVoiceTimeouts(client).catch(() => {}), 60000);
        setInterval(() => processLowVoiceTimeouts(client).catch(() => {}), 60000);
        setInterval(() => processDurableDeletions(client).catch(() => {}), 60000);
        setInterval(() => processPeriodicReconciliation(client).catch(() => {}), 180000);
      } catch (e) {
        console.error("[Bot] Failed to start B3.3 Voice Lifecycle workers:", e);
      }

      console.log("[Bot] All background tasks started successfully.");
    } catch (err) {
      console.error("[Bot] Failed to start background tasks:", err);
    }
  },
};
