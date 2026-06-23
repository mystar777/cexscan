import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchAllProducts } from "./fetch-all.js";
import { FETCH_INTERVAL_MINUTES } from "./config.js";
import { computeNextFetchAt } from "./lib/schedule.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, "data", "cache.json");
const HISTORY_PATH = path.join(__dirname, "data", "history.json");

function ensureDir() {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readCache() {
  ensureDir();
  if (!fs.existsSync(CACHE_PATH)) {
    return {
      products: [],
      exchangeStatus: [],
      meta: { fetchedAt: null, productCount: 0, exchangeCount: 0 },
    };
  }
  return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
}

function appendHistory(snapshot) {
  ensureDir();
  let history = [];
  if (fs.existsSync(HISTORY_PATH)) {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  }
  history.push({
    fetchedAt: snapshot.meta.fetchedAt,
    avgApy: averageApy(snapshot.products),
    count: snapshot.products.length,
  });
  if (history.length > 96) history = history.slice(-96);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function averageApy(products) {
  if (!products.length) return 0;
  const sum = products.reduce((a, p) => a + (p.apyMax ?? p.apy ?? 0), 0);
  return Math.round((sum / products.length) * 100) / 100;
}

export async function refreshCache() {
  ensureDir();
  const snapshot = await fetchAllProducts();
  const completedAt = new Date();
  snapshot.meta.fetchedAt = completedAt.toISOString();
  snapshot.meta.nextFetchAt = computeNextFetchAt(completedAt).toISOString();
  snapshot.meta.intervalMinutes = FETCH_INTERVAL_MINUTES;

  fs.writeFileSync(CACHE_PATH, JSON.stringify(snapshot, null, 2));
  appendHistory(snapshot);
  return snapshot;
}
