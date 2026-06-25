import fs from "fs";
import path from "path";
import { DATA_DIR } from "./cache.js";

const ANALYTICS_PATH = path.join(DATA_DIR, "admin-analytics.json");
const MAX_EVENTS = 20000;
const TIME_ZONE = "Asia/Seoul";

let analyticsCache = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyAnalytics() {
  return {
    clicks: [],
    access: [],
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
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch (err) {
    console.warn(`[analytics] reset after read failure: ${err.message}`);
    analyticsCache = emptyAnalytics();
  }

  return analyticsCache;
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

function getCountry(req) {
  return normalizeCountry(
    headerValue(req, "cf-ipcountry") ||
      headerValue(req, "x-vercel-ip-country") ||
      headerValue(req, "x-country-code") ||
      headerValue(req, "x-forwarded-country") ||
      inferCountryFromLanguage(headerValue(req, "accept-language")),
  );
}

function inferCountryFromLanguage(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|,)\s*[a-z]{2,3}-([A-Za-z]{2})\b/);
  return match?.[1] ?? null;
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

export function recordAccess(req) {
  const analytics = loadAnalytics();
  analytics.access = trimEvents([
    ...analytics.access,
    {
      ts: new Date().toISOString(),
      path: req.originalUrl || req.url || "/",
      country: getCountry(req),
    },
  ]);
  saveAnalytics(analytics);
}

export function recordExchangeClick(req, exchange) {
  const analytics = loadAnalytics();
  analytics.clicks = trimEvents([
    ...analytics.clicks,
    {
      ts: new Date().toISOString(),
      exchange,
      country: getCountry(req),
    },
  ]);
  saveAnalytics(analytics);
}

export function getAnalyticsSummary(exchanges = []) {
  const analytics = loadAnalytics();
  const clicks = withParts(analytics.clicks);
  const access = withParts(analytics.access);
  const today = todayKey();

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
      recent: access.slice(-20).reverse(),
    },
  };
}
