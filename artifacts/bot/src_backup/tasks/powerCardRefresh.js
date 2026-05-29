import { refreshAllCards } from "../modules/powercards.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // check every 15 minutes

export function startPowerCardRefresh(client) {
  console.log("[PowerCards] Power card refresh task started (checks for overdue cards every 15 min).");

  const run = async () => {
    await refreshAllCards(client).catch((e) =>
      console.error("[PowerCards] Refresh error:", e)
    );
    setTimeout(run, CHECK_INTERVAL_MS);
  };

  // Run the first check 1 minute after startup
  setTimeout(run, 60 * 1000);
}
