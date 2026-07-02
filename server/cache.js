import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchAllProducts } from "./fetch-all.js";
import { FETCH_INTERVAL_MINUTES } from "./config.js";
import { computeNextFetchAt } from "./lib/schedule.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.join(__dirname, "data");
const productionSharedDataDir = __dirname.includes(`${path.sep}opt${path.sep}cexscan${path.sep}releases${path.sep}`)
  ? "/opt/cexscan/shared/data"
  : defaultDataDir;

export const DATA_DIR = process.env.CEXSCAN_DATA_DIR || productionSharedDataDir;
export const CACHE_PATH = path.join(DATA_DIR, "cache.json");
const HISTORY_PATH = path.join(DATA_DIR, "history.json");
const POOL_HISTORY_POSTS_PATH = path.join(DATA_DIR, "pool-history-posts.json");

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

function poolHistorySlugFromDate(date) {
  return `${date}-crypto-cex-stable-pool-apy-apr-history`;
}

function productApy(product) {
  return Number(product?.apyMax ?? product?.apy ?? 0);
}

function compactProduct(product) {
  return {
    id: product.id,
    exchange: product.exchange,
    asset: product.asset,
    productType: product.productType,
    duration: product.duration,
    durationDays: product.durationDays,
    apy: product.apy,
    apyMin: product.apyMin,
    apyMax: product.apyMax,
    minAmount: product.minAmount,
    maxAmount: product.maxAmount,
    note: product.note,
    source: product.source,
    sourceUrl: product.sourceUrl,
    announcementUrl: product.announcementUrl,
    sources: product.sources,
    requirements: product.requirements,
    typeTags: product.typeTags,
  };
}

export function buildPoolHistoryPost(snapshot) {
  const fetchedAt = snapshot.meta?.fetchedAt ?? new Date().toISOString();
  const date = fetchedAt.slice(0, 10);
  const products = [...(snapshot.products ?? [])]
    .sort((left, right) => {
      const apyDiff = productApy(right) - productApy(left);
      if (apyDiff) return apyDiff;
      const exchangeDiff = String(left.exchange).localeCompare(String(right.exchange));
      if (exchangeDiff) return exchangeDiff;
      return String(left.asset).localeCompare(String(right.asset));
    })
    .map(compactProduct);
  const exchanges = new Set(products.map((product) => product.exchange).filter(Boolean));
  const top = products[0] ?? null;

  return {
    date,
    slug: poolHistorySlugFromDate(date),
    title: `${date} crypto cex stable pool apy apr history`,
    fetchedAt,
    productCount: products.length,
    exchangeCount: snapshot.meta?.exchangeCount ?? exchanges.size,
    topPool: top
      ? {
          exchange: top.exchange,
          asset: top.asset,
          apy: top.apyMax ?? top.apy,
          productType: top.productType,
          duration: top.duration,
        }
      : null,
    products,
  };
}

export function readPoolHistoryPosts() {
  ensureDir();
  if (!fs.existsSync(POOL_HISTORY_POSTS_PATH)) return [];

  try {
    const posts = JSON.parse(fs.readFileSync(POOL_HISTORY_POSTS_PATH, "utf8"));
    if (!Array.isArray(posts)) return [];
    return posts
      .filter((post) => post?.slug && Array.isArray(post.products))
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  } catch {
    return [];
  }
}

function writePoolHistoryPost(snapshot) {
  const post = buildPoolHistoryPost(snapshot);
  const posts = readPoolHistoryPosts().filter((entry) => entry.slug !== post.slug);
  posts.unshift(post);
  fs.writeFileSync(
    POOL_HISTORY_POSTS_PATH,
    JSON.stringify(posts, null, 2),
  );
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
  snapshot.meta.nextFetchAt = computeNextFetchAt(completedAt, FETCH_INTERVAL_MINUTES).toISOString();
  snapshot.meta.intervalMinutes = FETCH_INTERVAL_MINUTES;

  fs.writeFileSync(CACHE_PATH, JSON.stringify(snapshot, null, 2));
  appendHistory(snapshot);
  writePoolHistoryPost(snapshot);
  return snapshot;
}
