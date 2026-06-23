import { fetchBybit } from "./fetchers/bybit.js";
import { fetchOkx, fetchGate } from "./fetchers/okx-gate.js";
import {
  fetchBinance,
  fetchCoinbase,
  fetchBitget,
  fetchKraken,
  fetchKucoin,
  fetchHtx,
  fetchMexc,
  fetchCryptocom,
} from "./fetchers/stubs.js";
import { fetchFromAnnouncements } from "./fetchers/announcements.js";

const API_FETCHERS = [
  { name: "Binance", fn: fetchBinance },
  { name: "Coinbase", fn: fetchCoinbase },
  { name: "Bybit", fn: fetchBybit },
  { name: "OKX", fn: fetchOkx },
  { name: "Bitget", fn: fetchBitget },
  { name: "Kraken", fn: fetchKraken },
  { name: "KuCoin", fn: fetchKucoin },
  { name: "Gate.io", fn: fetchGate },
  { name: "HTX", fn: fetchHtx },
  { name: "MEXC", fn: fetchMexc },
  { name: "Crypto.com", fn: fetchCryptocom },
];

/** Prefer API products; fill gaps from announcements; merge by exchange+asset+duration */
function mergeProducts(apiProducts, annProducts) {
  const map = new Map();

  for (const p of apiProducts) {
    const key = `${p.exchange}:${p.asset}:${p.duration}`;
    map.set(key, { ...p, source: "api", sources: ["api"] });
  }

  for (const p of annProducts) {
    const key = `${p.exchange}:${p.asset}:${p.duration}`;
    if (map.has(key)) {
      const existing = map.get(key);
      if (!existing.sources.includes("announcement")) {
        existing.sources.push("announcement");
      }
      if ((p.apyMax ?? 0) > (existing.apyMax ?? 0)) {
        existing.annNote = p.note;
        existing.announcementUrl = p.announcementUrl ?? existing.announcementUrl;
      }
    } else {
      map.set(key, { ...p, source: "announcement", sources: ["announcement"] });
    }
  }

  return [...map.values()];
}

async function fetchExchange(entry) {
  const apiResult = await entry.fn();
  const annResult = await fetchFromAnnouncements(entry.name);

  const apiProducts = (apiResult.products ?? []).map((p) => ({
    ...p,
    source: p.source || "api",
  }));
  const annProducts = annResult.products ?? [];
  const merged = mergeProducts(apiProducts, annProducts);

  const errors = [...(apiResult.errors ?? []), ...(annResult.errors ?? [])].filter(
    Boolean,
  );
  const hasApi = apiProducts.length > 0;
  const hasAnn = annProducts.length > 0;

  return {
    exchange: entry.name,
    products: merged,
    errors: merged.length ? [] : [...new Set(errors)],
    ok: merged.length > 0,
    apiCount: apiProducts.length,
    announcementCount: annProducts.length,
    sources: [hasApi && "api", hasAnn && "announcement"].filter(Boolean),
  };
}

export async function fetchAllProducts() {
  const startedAt = new Date().toISOString();
  const exchangeResults = await Promise.all(API_FETCHERS.map(fetchExchange));

  const products = exchangeResults.flatMap((r) => r.products);
  const exchangeStatus = exchangeResults.map((r) => ({
    exchange: r.exchange,
    count: r.products.length,
    apiCount: r.apiCount,
    announcementCount: r.announcementCount,
    sources: r.sources,
    errors: r.errors,
    ok: r.ok,
  }));

  return {
    products,
    exchangeStatus,
    meta: {
      fetchedAt: startedAt,
      productCount: products.length,
      exchangeCount: exchangeStatus.filter((e) => e.ok).length,
    },
  };
}
