import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DATA_DIR } from "./cache.js";

const ANALYTICS_PATH = path.join(DATA_DIR, "admin-analytics.json");
const GEO_CACHE_PATH = path.join(DATA_DIR, "geo-cache.json");
const MAX_EVENTS = 20000;
const TIME_ZONE = "Asia/Seoul";
const GEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GEO_LOOKUP_TIMEOUT_MS = 1500;

let analyticsCache = null;
let geoCache = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyAnalytics() {
  return {
    clicks: [],
    access: [],
    sales: [],
    updatedAt: null,
  };
}

function loadAnalytics() {
  if (analyticsCache) return analyticsCache;
  ensureDataDir();

  if (!fs.existsSync(ANALYTICS_PATH)) {
    analyticsCache = emptyAnalytics();
    return analyticsCache;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(ANALYTICS_PATH, "utf8"));
    analyticsCache = {
      clicks: Array.isArray(parsed.clicks) ? parsed.clicks : [],
      access: Array.isArray(parsed.access) ? parsed.access : [],
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch (err) {
    console.warn(`[analytics] reset after read failure: ${err.message}`);
    analyticsCache = emptyAnalytics();
  }

  return analyticsCache;
}

function loadGeoCache() {
  if (geoCache) return geoCache;
  ensureDataDir();

  if (!fs.existsSync(GEO_CACHE_PATH)) {
    geoCache = {};
    return geoCache;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(GEO_CACHE_PATH, "utf8"));
    geoCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn(`[analytics] geo cache reset after read failure: ${err.message}`);
    geoCache = {};
  }

  return geoCache;
}

function saveGeoCache(cache) {
  ensureDataDir();
  fs.writeFileSync(GEO_CACHE_PATH, JSON.stringify(cache, null, 2));
}

function saveAnalytics(analytics) {
  ensureDataDir();
  analytics.updatedAt = new Date().toISOString();
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(analytics, null, 2));
}

function trimEvents(events) {
  if (events.length <= MAX_EVENTS) return events;
  return events.slice(events.length - MAX_EVENTS);
}

function headerValue(req, name) {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeCountry(value) {
  if (typeof value !== "string" || !value.trim()) return "Unknown";
  const cleaned = value.trim();
  if (/^[A-Za-z]{2}$/.test(cleaned)) return cleaned.toUpperCase();
  return cleaned.slice(0, 40);
}

function getHeaderCountry(req) {
  return normalizeCountry(
    headerValue(req, "cf-ipcountry") ||
      headerValue(req, "x-vercel-ip-country") ||
      headerValue(req, "x-country-code") ||
      headerValue(req, "x-forwarded-country"),
  );
}

function getLanguageCountry(req) {
  return normalizeCountry(inferCountryFromLanguage(headerValue(req, "accept-language")));
}

function inferCountryFromLanguage(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|,)\s*[a-z]{2,3}-([A-Za-z]{2})\b/);
  return match?.[1] ?? null;
}

function normalizeIp(value) {
  if (typeof value !== "string") return null;
  let ip = value.split(",")[0]?.trim();
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.includes(":") && ip.includes(".")) ip = ip.split(":").at(-1);
  return ip || null;
}

function getClientIp(req) {
  return (
    normalizeIp(headerValue(req, "cf-connecting-ip")) ||
    normalizeIp(headerValue(req, "x-real-ip")) ||
    normalizeIp(headerValue(req, "x-forwarded-for")) ||
    normalizeIp(req.ip) ||
    normalizeIp(req.socket?.remoteAddress)
  );
}

function isPublicIp(ip) {
  if (!ip) return false;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return false;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    return true;
  }

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd")) return false;
  if (lower.startsWith("fe80:")) return false;
  return lower.includes(":");
}

function geoCacheKey(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function lookupCountryByIp(ip) {
  if (!isPublicIp(ip)) return null;

  const cache = loadGeoCache();
  const key = geoCacheKey(ip);
  const cached = cache[key];
  if (cached?.country && Number(cached.expiresAt) > Date.now()) {
    return cached.country;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const country = normalizeCountry(data?.success ? data.country_code : null);
    if (country !== "Unknown") {
      cache[key] = {
        country,
        expiresAt: Date.now() + GEO_CACHE_TTL_MS,
        updatedAt: new Date().toISOString(),
      };
      saveGeoCache(cache);
      return country;
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.warn(`[analytics] geo lookup failed: ${err.message}`);
    }
  } finally {
    clearTimeout(timeout);
  }

  return null;
}

async function getCountry(req) {
  const headerCountry = getHeaderCountry(req);
  if (headerCountry !== "Unknown") return headerCountry;

  const ipCountry = await lookupCountryByIp(getClientIp(req));
  if (ipCountry) return ipCountry;

  return getLanguageCountry(req);
}

function getTimestampParts(ts) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: `${values.year}-${values.month}-${values.day} ${values.hour}:00`,
  };
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntry(rows) {
  return rows[0] ? `${rows[0].key} (${rows[0].count})` : "-";
}

function mapToRows(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

function groupEvents(events, selector) {
  const map = new Map();
  for (const event of events) increment(map, selector(event));
  return mapToRows(map);
}

function buildRows(events, selector, keyName, includeExchange = false) {
  const map = new Map();
  for (const event of events) {
    const key = includeExchange
      ? `${event.exchange || "Unknown"}\u0000${selector(event)}`
      : selector(event);
    increment(map, key);
  }

  return [...map.entries()]
    .map(([key, count]) => {
      if (!includeExchange) return { [keyName]: key, count };
      const [exchange, value] = key.split("\u0000");
      return { exchange, [keyName]: value, count };
    })
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));
}

function buildSalesRows(events, selector, keyName) {
  const map = new Map();
  for (const event of events) {
    const key = selector(event);
    const current = map.get(key) ?? { count: 0, revenueUsd: 0 };
    current.count += 1;
    current.revenueUsd += Number(event.priceUsd) || 0;
    map.set(key, current);
  }

  return [...map.entries()]
    .map(([key, value]) => ({
      [keyName]: key,
      count: value.count,
      revenueUsd: Math.round(value.revenueUsd * 100) / 100,
    }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd || b.count - a.count);
}

function withParts(events) {
  return events.map((event) => {
    const parts = getTimestampParts(event.ts);
    return { ...event, date: parts.date, hour: parts.hour };
  });
}

function todayKey() {
  return getTimestampParts(new Date().toISOString()).date;
}

function withinLast24Hours(event) {
  return new Date(event.ts).getTime() >= Date.now() - 24 * 60 * 60 * 1000;
}

export async function recordAccess(req) {
  const analytics = loadAnalytics();
  const country = await getCountry(req);
  analytics.access = trimEvents([
    ...analytics.access,
    {
      ts: new Date().toISOString(),
      path: req.originalUrl || req.url || "/",
      country,
    },
  ]);
  saveAnalytics(analytics);
}

export async function recordExchangeClick(req, exchange) {
  const analytics = loadAnalytics();
  const country = await getCountry(req);
  analytics.clicks = trimEvents([
    ...analytics.clicks,
    {
      ts: new Date().toISOString(),
      exchange,
      country,
    },
  ]);
  saveAnalytics(analytics);
}

export async function recordDataSale(req, item, details = {}) {
  const analytics = loadAnalytics();
  const country = await getCountry(req);
  const signature = headerValue(req, "payment-signature");
  const signatureHash =
    typeof signature === "string"
      ? crypto.createHash("sha256").update(signature).digest("hex").slice(0, 32)
      : null;

  analytics.sales = trimEvents([
    ...analytics.sales,
    {
      ts: new Date().toISOString(),
      itemId: item.id,
      title: item.title,
      priceUsd: item.priceUsd,
      network: item.network,
      payTo: item.payTo,
      path: req.originalUrl || req.url || item.path,
      country,
      paymentSignatureHash: signatureHash,
      ...details,
    },
  ]);
  saveAnalytics(analytics);
}

export function getAnalyticsSummary(exchanges = []) {
  const analytics = loadAnalytics();
  const clicks = withParts(analytics.clicks);
  const access = withParts(analytics.access);
  const sales = withParts(analytics.sales ?? []);
  const today = todayKey();
  const salesRevenue = sales.reduce((sum, event) => sum + (Number(event.priceUsd) || 0), 0);

  const exchangeRows = exchanges.map((exchange) => {
    const events = clicks.filter((event) => event.exchange === exchange.name);
    const byDate = groupEvents(events, (event) => event.date);
    const byHour = groupEvents(events, (event) => event.hour);
    const byCountry = groupEvents(events, (event) => event.country);
    return {
      exchange: exchange.name,
      total: events.length,
      today: events.filter((event) => event.date === today).length,
      last24h: events.filter(withinLast24Hours).length,
      topDate: topEntry(byDate),
      topHour: topEntry(byHour),
      topCountry: topEntry(byCountry),
      lastClickAt: events.at(-1)?.ts ?? null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    timeZone: TIME_ZONE,
    clicks: {
      total: clicks.length,
      exchangeRows,
      byDate: buildRows(clicks, (event) => event.date, "date", true),
      byHour: buildRows(clicks, (event) => event.hour, "hour", true),
      byCountry: buildRows(clicks, (event) => event.country, "country", true),
      recent: clicks.slice(-20).reverse(),
    },
    access: {
      total: access.length,
      today: access.filter((event) => event.date === today).length,
      last24h: access.filter(withinLast24Hours).length,
      byDate: buildRows(access, (event) => event.date, "date"),
      byHour: buildRows(access, (event) => event.hour, "hour"),
      byCountry: buildRows(access, (event) => event.country, "country"),
      byCountryToday: buildRows(
        access.filter((event) => event.date === today),
        (event) => event.country,
        "country",
      ),
      recent: access.slice(-20).reverse(),
    },
    sales: {
      total: sales.length,
      revenueUsd: Math.round(salesRevenue * 100) / 100,
      today: sales.filter((event) => event.date === today).length,
      last24h: sales.filter(withinLast24Hours).length,
      byItem: buildSalesRows(sales, (event) => event.title || event.itemId || "Unknown", "item"),
      byDate: buildSalesRows(sales, (event) => event.date, "date"),
      byHour: buildSalesRows(sales, (event) => event.hour, "hour"),
      byCountry: buildSalesRows(sales, (event) => event.country, "country"),
      recent: sales.slice(-20).reverse(),
    },
  };
}
