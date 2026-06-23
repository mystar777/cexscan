import cron from "node-cron";
import { refreshCache } from "./cache.js";
import { FETCH_INTERVAL_MINUTES } from "./config.js";

let running = false;

export async function runFetchJob() {
  if (running) {
    console.log("[scheduler] fetch already running, skip");
    return;
  }
  running = true;
  try {
    console.log("[scheduler] fetching CEX staking rates...");
    const snapshot = await refreshCache();
    console.log(
      `[scheduler] done — ${snapshot.products.length} products from ${snapshot.meta.exchangeCount} exchanges`,
    );
  } catch (err) {
    console.error("[scheduler] fetch failed:", err);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  const expr = `*/${FETCH_INTERVAL_MINUTES} * * * *`;
  cron.schedule(expr, runFetchJob);
  console.log(`[scheduler] cron registered: every ${FETCH_INTERVAL_MINUTES} minutes`);
}
