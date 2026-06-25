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
  fetchLbank,
  fetchBingx,
} from "./fetchers/stubs.js";
import { fetchFromAnnouncements } from "./fetchers/announcements.js";

const EXCHANGE_FETCHERS = [
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
  { name: "LBank", fn: fetchLbank },
  { name: "BingX", fn: fetchBingx },
];

function sourceKind(source) {
  if (source === "announcement") return "announcement";
  if (String(source ?? "").startsWith("site:")) return "site";
  return "api";
}

function mergeRestrictedMeta(target, source) {
  if (source.eligibility && !target.eligibility) {
    target.eligibility = source.eligibility;
  }

  const tags = new Set([...(target.eligibilityTags ?? []), ...(source.eligibilityTags ?? [])]);
  target.eligibilityTags = [...tags];
  target.restricted = Boolean(target.restricted || source.restricted || target.eligibilityTags.length);
}

/** Prefer direct products; fill gaps from announcements; merge by exchange+asset+type+duration */
function mergeProducts(directProducts, annProducts) {
  const map = new Map();

  for (const p of directProducts) {
    const kind = sourceKind(p.source);
    const key = `${p.exchange}:${p.asset}:${p.productType}:${p.duration}:${p.sourceId ?? ""}`;
    map.set(key, {
      ...p,
      sourceRef: p.source,
      source: kind,
      sources: [kind],
    });
  }

  for (const p of annProducts) {
    const key = `${p.exchange}:${p.asset}:${p.productType}:${p.duration}:${p.sourceId ?? ""}`;
    if (map.has(key)) {
      const existing = map.get(key);
      if (!existing.sources.includes("announcement")) {
        existing.sources.push("announcement");
      }
      mergeRestrictedMeta(existing, p);
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
  const directResult = await entry.fn();
  const annResult = await fetchFromAnnouncements(entry.name);

  const directProducts = (directResult.products ?? []).map((p) => ({
    ...p,
    source: p.source || "api",
  }));
  const annProducts = annResult.products ?? [];
  const merged = mergeProducts(directProducts, annProducts);

  const errors = [...(directResult.errors ?? []), ...(annResult.errors ?? [])].filter(
    Boolean,
  );
  const directKinds = [...new Set(directProducts.map((p) => sourceKind(p.source)))];
  const hasAnn = annProducts.length > 0;

  return {
    exchange: entry.name,
    products: merged,
    errors: merged.length ? [] : [...new Set(errors)],
    ok: merged.length > 0,
    apiCount: directProducts.filter((p) => sourceKind(p.source) === "api").length,
    siteCount: directProducts.filter((p) => sourceKind(p.source) === "site").length,
    announcementCount: annProducts.length,
    sources: [...directKinds, hasAnn && "announcement"].filter(Boolean),
  };
}

export async function fetchAllProducts() {
  const startedAt = new Date().toISOString();
  const exchangeResults = await Promise.all(EXCHANGE_FETCHERS.map(fetchExchange));

  const products = exchangeResults.flatMap((r) => r.products);
  const exchangeStatus = exchangeResults.map((r) => ({
    exchange: r.exchange,
    count: r.products.length,
    apiCount: r.apiCount,
    siteCount: r.siteCount,
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
