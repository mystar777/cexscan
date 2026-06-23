import crypto from "crypto";
import fs from "fs";
import path from "path";
import { readCache, CACHE_PATH, DATA_DIR } from "./cache.js";
import { EXCHANGES, STABLE_COINS } from "./config.js";

const STATS_PATH = path.join(DATA_DIR, "visitor-stats.json");
const clients = new Map();

let clientSeq = 0;
let statsCache = null;
let watcherStarted = false;
let lastBroadcastFetchedAt = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStats() {
  if (statsCache) return statsCache;
  ensureDataDir();
  if (!fs.existsSync(STATS_PATH)) {
    statsCache = { totalVisits: 0, visitorIds: [] };
    return statsCache;
  }

  try {
    const stats = JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
    statsCache = {
      totalVisits: Number(stats.totalVisits) || 0,
      visitorIds: Array.isArray(stats.visitorIds) ? stats.visitorIds : [],
    };
  } catch (err) {
    console.warn(`[live] visitor stats reset after read failure: ${err.message}`);
    statsCache = { totalVisits: 0, visitorIds: [] };
  }
  return statsCache;
}

function saveStats(stats) {
  ensureDataDir();
  fs.writeFileSync(
    STATS_PATH,
    JSON.stringify(
      {
        totalVisits: stats.totalVisits,
        visitorIds: stats.visitorIds,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function normalizeVisitorId(value) {
  if (typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    return value;
  }
  return crypto.randomUUID();
}

function registerVisitor(visitorId) {
  const stats = loadStats();
  const knownVisitors = new Set(stats.visitorIds);
  if (!knownVisitors.has(visitorId)) {
    knownVisitors.add(visitorId);
    stats.visitorIds = [...knownVisitors];
    stats.totalVisits = Math.max(stats.totalVisits + 1, stats.visitorIds.length);
    saveStats(stats);
  }
}

function currentViewerCount() {
  return new Set([...clients.values()].map((client) => client.visitorId)).size;
}

export function getVisitorStats() {
  const stats = loadStats();
  return {
    online: currentViewerCount(),
    total: stats.totalVisits,
  };
}

function buildSnapshot() {
  const cache = readCache();
  return {
    products: cache,
    meta: {
      exchanges: EXCHANGES,
      stableCoins: STABLE_COINS,
      ...cache.meta,
      exchangeStatus: cache.exchangeStatus,
    },
    pushedAt: new Date().toISOString(),
  };
}

function writeEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(event, payload) {
  for (const client of clients.values()) {
    writeEvent(client.res, event, payload);
  }
}

function broadcastStats() {
  broadcast("stats", getVisitorStats());
}

export function broadcastSnapshot(reason = "cache") {
  try {
    const snapshot = buildSnapshot();
    const fetchedAt = snapshot.meta?.fetchedAt ?? null;
    if (fetchedAt && fetchedAt === lastBroadcastFetchedAt && reason === "file-watch") {
      return;
    }
    lastBroadcastFetchedAt = fetchedAt;
    broadcast("snapshot", { ...snapshot, reason });
  } catch (err) {
    console.warn(`[live] snapshot broadcast failed: ${err.message}`);
  }
}

export function handleEvents(req, res) {
  const visitorId = normalizeVisitorId(req.query.visitorId);
  registerVisitor(visitorId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const clientId = ++clientSeq;
  clients.set(clientId, { res, visitorId });

  writeEvent(res, "stats", getVisitorStats());
  writeEvent(res, "snapshot", { ...buildSnapshot(), reason: "connect" });
  broadcastStats();

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
    broadcastStats();
  });
}

export function startCacheWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  ensureDataDir();

  try {
    fs.watch(DATA_DIR, (eventType, filename) => {
      if (String(filename) !== path.basename(CACHE_PATH)) return;
      setTimeout(() => broadcastSnapshot("file-watch"), 500);
    });
    console.log(`[live] watching ${CACHE_PATH} for SSE updates`);
  } catch (err) {
    console.warn(`[live] cache watcher unavailable: ${err.message}`);
  }
}
