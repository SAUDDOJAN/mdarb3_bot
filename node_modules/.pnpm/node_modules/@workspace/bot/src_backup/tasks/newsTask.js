import { fetchAndPostNews } from "../services/news-fetcher.js";

// Fetch interval: 60 minutes
const FETCH_INTERVAL_MS = 60 * 60 * 1000;

export function startNewsTask(client) {
  console.log("[NewsTask] Starting automated news fetcher task...");
  
  // Run immediately on startup
  fetchAndPostNews(client).catch((err) => {
    console.error("[NewsTask] Error during initial fetch:", err);
  });

  // Schedule to run periodically
  setInterval(() => {
    fetchAndPostNews(client).catch((err) => {
      console.error("[NewsTask] Error during scheduled fetch:", err);
    });
  }, FETCH_INTERVAL_MS);
}
