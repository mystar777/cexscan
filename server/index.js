import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { readCache, refreshCache } from "./cache.js";
import { EXCHANGES, STABLE_COINS } from "./config.js";
import {
  broadcastSnapshot,
  getVisitorStats,
  handleEvents,
  startCacheWatcher,
} from "./live-events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3344;
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/meta", (_req, res) => {
  const cache = readCache();
  res.json({
    exchanges: EXCHANGES,
    stableCoins: STABLE_COINS,
    ...cache.meta,
    exchangeStatus: cache.exchangeStatus,
  });
});

app.get("/api/products", (_req, res) => {
  res.json(readCache());
});

app.get("/api/visitor-stats", (_req, res) => {
  res.json(getVisitorStats());
});

app.get("/api/events", handleEvents);

app.post("/api/refresh", async (_req, res) => {
  try {
    const snapshot = await refreshCache();
    broadcastSnapshot("manual-refresh");
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (isProd) {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

async function main() {
  const cache = readCache();
  if (!cache.meta?.fetchedAt) {
    console.log("[server] cache is empty; fetching CEX staking rates once...");
    await refreshCache();
  } else {
    console.log(`[server] using cache from ${cache.meta.fetchedAt}`);
  }

  startCacheWatcher();

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[server] listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
