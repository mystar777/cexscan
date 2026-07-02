import crypto from "crypto";
import { EXCHANGES } from "./config.js";
import { getAnalyticsSummary } from "./analytics.js";

const ADMIN_USERNAME = "plm2000";
const ADMIN_PASSWORD = "dudguslcjswo12#$";
const SESSION_SECRET = "cexscan-admin-session-v1-dudguslcjswo12#$";
const SESSION_COOKIE = "cexscan_admin";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const CHART_COLORS = ["#3fb950", "#58a6ff", "#a371f7", "#d29922", "#ff7b72", "#ffa657"];
const COUNTRY_NAMES = {
  AU: "Australia",
  BD: "Bangladesh",
  BR: "Brazil",
  CA: "Canada",
  CN: "China",
  DE: "Germany",
  FR: "France",
  HK: "Hong Kong",
  HU: "Hungary",
  IN: "India",
  JP: "Japan",
  KR: "South Korea",
  NL: "Netherlands",
  NO: "Norway",
  RO: "Romania",
  RU: "Russia",
  SG: "Singapore",
  TH: "Thailand",
  UA: "Ukraine",
  UK: "United Kingdom",
  GB: "United Kingdom",
  US: "United States",
  VN: "Vietnam",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return Object.fromEntries(
    header.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return [name, decodeURIComponent(rest.join("="))];
    }),
  );
}

function sign(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({
      user: ADMIN_USERNAME,
      exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeEqualText(signature, sign(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.user === ADMIN_USERNAME && Number(session.exp) > Date.now();
  } catch {
    return false;
  }
}

function cookieOptions(req) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function isAuthenticated(req) {
  return verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
}

function setNoIndex(res) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "no-store");
}

function pageShell({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --panel-2: #0f141b;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #3fb950;
      --link: #58a6ff;
      --danger: #ff7b72;
      --purple: #a371f7;
      --warning: #d29922;
      font-family: "IBM Plex Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--bg);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); }
    a { color: var(--link); }
    .wrap { width: min(1400px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 40px; }
    .login-wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .login-card, .panel, .metric, .api-hero, .api-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
    .login-card { width: min(420px, 100%); padding: 24px; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 1.65rem; margin-bottom: 6px; }
    h2 { font-size: 1rem; margin-bottom: 14px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    label { display: grid; gap: 6px; margin-top: 14px; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
    input { width: 100%; min-height: 42px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); padding: 8px 10px; font: inherit; }
    button { min-height: 38px; border: 1px solid rgba(63,185,80,.55); border-radius: 6px; background: rgba(63,185,80,.12); color: var(--accent); padding: 8px 12px; font: inherit; font-weight: 700; cursor: pointer; }
    .error { margin: 12px 0 0; color: #ffa198; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; }
    .topbar p { color: var(--muted); margin: 4px 0 0; }
    .logout { display: inline-flex; gap: 8px; align-items: center; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric { padding: 14px; min-width: 0; }
    .metric span { display: block; color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
    .metric strong { display: block; margin-top: 6px; font-size: 1.35rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .panel { margin-top: 16px; overflow: hidden; }
    .panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border); background: var(--panel-2); }
    .panel-head h2 { margin: 0; }
    .panel-head span { color: var(--muted); font-size: .8rem; }
    details.panel > summary.panel-head { cursor: pointer; list-style: none; }
    details.panel > summary.panel-head::-webkit-details-marker { display: none; }
    details.panel > summary.panel-head::after { content: "Open"; color: var(--accent); font-size: .78rem; font-weight: 800; }
    details.panel[open] > summary.panel-head::after { content: "Close"; }
    .api-dashboard { display: grid; gap: 14px; margin-bottom: 16px; }
    .api-hero { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.85fr); gap: 14px; padding: 16px; background: linear-gradient(135deg, rgba(63,185,80,.14), rgba(88,166,255,.08) 48%, rgba(163,113,247,.08)); }
    .api-title { min-width: 0; }
    .api-kicker { color: var(--accent); font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    .api-title h2 { margin: 8px 0 0; color: var(--text); font-size: 1.65rem; letter-spacing: 0; text-transform: none; }
    .api-title p { margin: 8px 0 0; color: var(--muted); line-height: 1.45; }
    .api-payto { margin-top: 14px; display: grid; gap: 4px; color: var(--muted); font-size: .76rem; }
    .api-payto code { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .api-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .api-metric { min-width: 0; padding: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(13,17,23,.62); }
    .api-metric span { display: block; color: var(--muted); font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; }
    .api-metric strong { display: block; margin-top: 6px; font-size: 1.35rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .api-metric.accent strong { color: var(--accent); }
    .api-card-grid { display: grid; grid-template-columns: minmax(19rem, .9fr) minmax(0, 1.1fr) minmax(0, 1fr); gap: 12px; }
    .api-card { min-width: 0; padding: 14px; }
    .api-card h3 { margin: 0 0 12px; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }
    .donut-wrap { display: grid; grid-template-columns: 8.75rem minmax(0, 1fr); align-items: center; gap: 14px; }
    .donut { width: 8.75rem; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--border) 0 100%); position: relative; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
    .donut::after { content: ""; position: absolute; width: 58%; aspect-ratio: 1; border-radius: 50%; background: var(--panel); border: 1px solid rgba(255,255,255,.08); }
    .donut-center { position: relative; z-index: 1; display: grid; gap: 2px; text-align: center; }
    .donut-center strong { font-size: 1rem; }
    .donut-center span { color: var(--muted); font-size: .65rem; text-transform: uppercase; letter-spacing: .04em; }
    .legend, .bar-list, .recent-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
    .legend-row, .bar-row, .recent-row { min-width: 0; display: grid; align-items: center; gap: 8px; }
    .legend-row { grid-template-columns: .7rem minmax(0, 1fr) auto; }
    .legend-dot { width: .65rem; height: .65rem; border-radius: 50%; background: var(--accent); }
    .legend-label, .bar-label, .recent-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .legend-value, .bar-value, .recent-price { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--text); }
    .bar-row { grid-template-columns: minmax(0, 1fr) 5rem; }
    .bar-track { grid-column: 1 / -1; height: 8px; border-radius: 999px; background: rgba(88,166,255,.08); overflow: hidden; }
    .bar-fill { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--link)); }
    .recent-row { grid-template-columns: minmax(0, 1fr) auto; padding-bottom: 9px; border-bottom: 1px solid rgba(48,54,61,.72); }
    .recent-row:last-child { border-bottom: 0; padding-bottom: 0; }
    .recent-meta { color: var(--muted); font-size: .75rem; }
    .section-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .section-grid .country-card, .section-grid .panel { margin-top: 0; }
    .country-card { margin-top: 16px; background: linear-gradient(180deg, #151a23 0%, #11161d 100%); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .country-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--border); background: rgba(13,17,23,.46); }
    .country-head h2 { margin: 0; }
    .country-tabs { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg); }
    .country-tab { min-width: 72px; padding: 6px 10px; border-radius: 999px; color: var(--muted); text-align: center; text-decoration: none; font-size: .82rem; font-weight: 700; }
    .country-tab.active { color: var(--text); background: rgba(255,255,255,.08); }
    .country-list { list-style: none; margin: 0; padding: 0; }
    .country-row { display: grid; grid-template-columns: minmax(10rem, 1.1fr) minmax(8rem, 1fr) 4rem 3rem; align-items: center; gap: 12px; padding: 11px 16px; border-bottom: 1px solid rgba(48,54,61,.72); }
    .country-row:last-child { border-bottom: 0; }
    .country-name { display: inline-flex; align-items: center; min-width: 0; gap: 10px; }
    .country-flag { width: 24px; height: 18px; object-fit: cover; border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,.12); flex-shrink: 0; }
    .country-flag-fallback { width: 24px; color: var(--muted); text-align: center; font-size: .9rem; flex-shrink: 0; }
    .country-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .country-bar { height: 7px; border-radius: 999px; background: rgba(88,166,255,.06); overflow: hidden; }
    .country-bar span { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: linear-gradient(90deg, #58a6ff, #a371f7); }
    .country-count { text-align: right; font-variant-numeric: tabular-nums; }
    .country-percent { text-align: right; color: var(--muted); font-size: .82rem; font-variant-numeric: tabular-nums; }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .86rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    th { color: var(--muted); font-weight: 600; background: #0b1016; }
    tr:last-child td { border-bottom: 0; }
    td.num { color: var(--accent); font-weight: 700; }
    .muted { color: var(--muted); }
    .empty { color: var(--muted); padding: 18px; }
    @media (max-width: 840px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .api-hero, .api-card-grid, .section-grid { grid-template-columns: 1fr; }
      .api-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .topbar { align-items: flex-start; flex-direction: column; }
      .country-row { grid-template-columns: minmax(8rem, 1fr) minmax(5rem, .8fr) 3.5rem 2.8rem; padding-inline: 12px; }
    }
    @media (max-width: 520px) {
      .wrap { width: min(100% - 20px, 1400px); padding-top: 18px; }
      .grid, .api-metrics, .donut-wrap { grid-template-columns: 1fr; }
      .donut { justify-self: center; }
      .country-head { grid-template-columns: 1fr; }
      .country-tabs { width: 100%; }
      .country-tab { flex: 1; }
      .country-row { grid-template-columns: minmax(0, 1fr) 4rem 2.8rem; gap: 8px; }
      .country-bar { grid-column: 1 / -1; grid-row: 2; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function renderRows(rows, columns, emptyText = "No data yet.") {
  if (!rows.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `<div class="table-scroll"><table><thead><tr>${columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => {
            const value = column.render ? column.render(row) : row[column.key];
            return `<td class="${column.className ?? ""}">${escapeHtml(value)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatUsd(value) {
  const amount = Number(value) || 0;
  return `$${amount.toFixed(2)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function panel(title, subtitle, rows, columns, emptyText) {
  return `<section class="panel">
    <div class="panel-head"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle)}</span></div>
    ${renderRows(rows, columns, emptyText)}
  </section>`;
}

function detailPanel(title, subtitle, rows, columns, emptyText) {
  return `<details class="panel">
    <summary class="panel-head"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle)}</span></summary>
    ${renderRows(rows, columns, emptyText)}
  </details>`;
}

function percent(part, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function cssGradientForRows(rows, total) {
  if (!rows.length || !total) return "var(--border) 0 100%";

  let cursor = 0;
  return rows
    .slice(0, CHART_COLORS.length)
    .map((row, index) => {
      const size = (Number(row.count) || 0) / total * 100;
      const start = cursor;
      cursor += size;
      return `${CHART_COLORS[index]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    })
    .join(", ");
}

function renderLegend(rows, total, keyName) {
  if (!rows.length) return `<div class="empty">No API sales yet.</div>`;

  return `<ul class="legend">${rows
    .slice(0, CHART_COLORS.length)
    .map((row, index) => {
      const label = row[keyName] ?? "Unknown";
      return `<li class="legend-row">
        <span class="legend-dot" style="background:${CHART_COLORS[index]}"></span>
        <span class="legend-label">${escapeHtml(label)}</span>
        <span class="legend-value">${formatNumber(row.count)} · ${percent(row.count, total)}%</span>
      </li>`;
    })
    .join("")}</ul>`;
}

function renderDonutCard(title, rows, total, centerValue, centerLabel, keyName) {
  return `<section class="api-card">
    <h3>${escapeHtml(title)}</h3>
    <div class="donut-wrap">
      <div class="donut" style="background: conic-gradient(${cssGradientForRows(rows, total)})">
        <div class="donut-center"><strong>${escapeHtml(centerValue)}</strong><span>${escapeHtml(centerLabel)}</span></div>
      </div>
      ${renderLegend(rows, total, keyName)}
    </div>
  </section>`;
}

function renderBars(title, rows, keyName, valueLabel = "count") {
  const max = Math.max(...rows.map((row) => Number(row.count) || 0), 0);
  const content = rows.length
    ? `<ul class="bar-list">${rows
        .slice(0, 6)
        .map((row) => {
          const label = keyName === "country" ? countryDisplayName(row[keyName]) : row[keyName] ?? "Unknown";
          return `<li class="bar-row">
            <span class="bar-label">${escapeHtml(label)}</span>
            <span class="bar-value">${valueLabel === "revenue" ? formatUsd(row.revenueUsd) : formatNumber(row.count)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${percent(row.count, max)}%"></span></span>
          </li>`;
        })
        .join("")}</ul>`
    : `<div class="empty">No API sales yet.</div>`;

  return `<section class="api-card"><h3>${escapeHtml(title)}</h3>${content}</section>`;
}

function renderRecentSales(rows) {
  const content = rows.length
    ? `<ul class="recent-list">${rows
        .slice(0, 5)
        .map(
          (row) => `<li class="recent-row">
            <div>
              <div class="recent-title">${escapeHtml(row.title || row.itemId || "Unknown item")}</div>
              <div class="recent-meta">${escapeHtml(formatDateTime(row.ts))} · ${escapeHtml(row.country || "Unknown")}</div>
            </div>
            <strong class="recent-price">${formatUsd(row.priceUsd)}</strong>
          </li>`,
        )
        .join("")}</ul>`
    : `<div class="empty">No paid API calls yet.</div>`;

  return `<section class="api-card"><h3>Recent paid API calls</h3>${content}</section>`;
}

function renderApiDashboard(summary) {
  const sales = summary.sales;
  const itemRows = sales.byItem ?? [];
  const countryRows = sales.byCountry ?? [];
  const totalSales = sales.total || 0;
  const topItem = itemRows[0]?.item ?? "No sales yet";
  const topCountry = countryRows[0]?.country ? countryDisplayName(countryRows[0].country) : "No sales yet";

  return `<section class="api-dashboard" aria-label="X402 API sales overview">
    <div class="api-hero">
      <div class="api-title">
        <span class="api-kicker">X402 API revenue</span>
        <h2>Paid data API dashboard</h2>
        <p>Sales, revenue, and endpoint demand are now the first thing visible after login.</p>
        <div class="api-payto">
          <span>Receiving wallet</span>
          <code>0xd25f1f178cc0f63a4feb86cfc450ab27e23337a7</code>
        </div>
      </div>
      <div class="api-metrics">
        <div class="api-metric accent"><span>Revenue</span><strong>${formatUsd(sales.revenueUsd)}</strong></div>
        <div class="api-metric"><span>Total sales</span><strong>${formatNumber(totalSales)}</strong></div>
        <div class="api-metric"><span>Today</span><strong>${formatNumber(sales.today)}</strong></div>
        <div class="api-metric"><span>Last 24h</span><strong>${formatNumber(sales.last24h)}</strong></div>
        <div class="api-metric"><span>Top product</span><strong title="${escapeHtml(topItem)}">${escapeHtml(topItem)}</strong></div>
        <div class="api-metric"><span>Top country</span><strong>${escapeHtml(topCountry)}</strong></div>
        <div class="api-metric"><span>Page views</span><strong>${formatNumber(summary.access.total)}</strong></div>
        <div class="api-metric"><span>Exchange clicks</span><strong>${formatNumber(summary.clicks.total)}</strong></div>
      </div>
    </div>
    <div class="api-card-grid">
      ${renderDonutCard("Sales by data product", itemRows, totalSales, formatNumber(totalSales), "sales", "item")}
      ${renderBars("Sales by country", countryRows, "country")}
      ${renderRecentSales(sales.recent)}
    </div>
  </section>`;
}

function countryDisplayName(country) {
  if (!country || country === "Unknown") return "Unknown / Internal";
  return COUNTRY_NAMES[country] ?? country;
}

function countryFlagCode(country) {
  if (country === "UK") return "GB";
  return country;
}

function countryFlagHtml(country) {
  const code = countryFlagCode(country);
  if (!/^[A-Z]{2}$/.test(code ?? "")) {
    return `<span class="country-flag-fallback" aria-hidden="true">-</span>`;
  }

  const lowerCode = code.toLowerCase();
  const label = countryDisplayName(country);
  return `<img class="country-flag" src="https://flagcdn.com/24x18/${lowerCode}.png" srcset="https://flagcdn.com/48x36/${lowerCode}.png 2x" alt="${escapeHtml(label)} flag" loading="lazy" decoding="async" />`;
}

function renderCountryVisitors(summary, range) {
  const isToday = range === "today";
  const rows = isToday ? summary.access.byCountryToday : summary.access.byCountry;
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  const content = rows.length
    ? `<ul class="country-list">${rows
        .map((row) => {
          const percent = total > 0 ? Math.round((row.count / total) * 100) : 0;
          return `<li class="country-row">
            <div class="country-name">
              ${countryFlagHtml(row.country)}
              <span class="country-label">${escapeHtml(countryDisplayName(row.country))}</span>
            </div>
            <div class="country-bar"><span style="width:${percent}%"></span></div>
            <strong class="country-count">${row.count}</strong>
            <span class="country-percent">${percent}%</span>
          </li>`;
        })
        .join("")}</ul>`
    : `<div class="empty">No country traffic yet.</div>`;

  return `<section class="country-card">
    <div class="country-head">
      <h2>Visitors by Country</h2>
      <nav class="country-tabs" aria-label="Visitors by country range">
        <a class="country-tab ${isToday ? "active" : ""}" href="/adm?countryRange=today" rel="nofollow">Today</a>
        <a class="country-tab ${isToday ? "" : "active"}" href="/adm?countryRange=all" rel="nofollow">All-time</a>
      </nav>
    </div>
    ${content}
  </section>`;
}

function renderLogin(error = "") {
  return pageShell({
    title: "CEXScan Admin Login",
    body: `<main class="login-wrap">
      <form class="login-card" method="post" action="/adm/login" autocomplete="off">
        <h1>CEXScan Admin</h1>
        <p class="muted">Sign in to view private analytics.</p>
        <label>Account
          <input name="username" autocomplete="username" required />
        </label>
        <label>Password
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
        <p style="margin:18px 0 0"><button type="submit">Sign in</button></p>
      </form>
    </main>`,
  });
}

function renderAdmin(req) {
  const summary = getAnalyticsSummary(EXCHANGES);
  const countryRange = req.query?.countryRange === "today" ? "today" : "all";
  const clickColumns = [
    { key: "exchange", label: "Exchange" },
    { key: "total", label: "Total", className: "num" },
    { key: "today", label: "Today", className: "num" },
    { key: "last24h", label: "Last 24h", className: "num" },
    { key: "topDate", label: "Top date" },
    { key: "topHour", label: "Top hour" },
    { key: "topCountry", label: "Top country" },
    { key: "lastClickAt", label: "Last click", render: (row) => formatDateTime(row.lastClickAt) },
  ];
  const exchangeBreakdownColumns = [
    { key: "exchange", label: "Exchange" },
    { key: "date", label: "Date" },
    { key: "hour", label: "Hour" },
    { key: "country", label: "Country" },
    { key: "count", label: "Count", className: "num" },
  ];
  const accessColumns = [
    { key: "date", label: "Date" },
    { key: "hour", label: "Hour" },
    { key: "country", label: "Country" },
    { key: "count", label: "Count", className: "num" },
  ];
  const recentClickColumns = [
    { key: "ts", label: "Time", render: (row) => formatDateTime(row.ts) },
    { key: "exchange", label: "Exchange" },
    { key: "country", label: "Country" },
  ];
  const recentAccessColumns = [
    { key: "ts", label: "Time", render: (row) => formatDateTime(row.ts) },
    { key: "path", label: "Path" },
    { key: "country", label: "Country" },
  ];
  const salesColumns = [
    { key: "item", label: "Item" },
    { key: "date", label: "Date" },
    { key: "hour", label: "Hour" },
    { key: "country", label: "Country" },
    { key: "count", label: "Sales", className: "num" },
    { key: "revenueUsd", label: "Revenue", className: "num", render: (row) => formatUsd(row.revenueUsd) },
  ];
  const recentSalesColumns = [
    { key: "ts", label: "Time", render: (row) => formatDateTime(row.ts) },
    { key: "title", label: "Item" },
    { key: "priceUsd", label: "Price", className: "num", render: (row) => formatUsd(row.priceUsd) },
    { key: "network", label: "Network" },
    { key: "country", label: "Country" },
    { key: "paymentSignatureHash", label: "Payment hash" },
  ];

  const clickDateRows = summary.clicks.byDate.map((row) => ({
    exchange: row.exchange,
    date: row.date,
    hour: "-",
    country: "-",
    count: row.count,
  }));
  const clickHourRows = summary.clicks.byHour.map((row) => ({
    exchange: row.exchange,
    date: "-",
    hour: row.hour,
    country: "-",
    count: row.count,
  }));
  const clickCountryRows = summary.clicks.byCountry.map((row) => ({
    exchange: row.exchange,
    date: "-",
    hour: "-",
    country: row.country,
    count: row.count,
  }));
  const accessDateRows = summary.access.byDate.map((row) => ({
    date: row.date,
    hour: "-",
    country: "-",
    count: row.count,
  }));
  const accessHourRows = summary.access.byHour.map((row) => ({
    date: "-",
    hour: row.hour,
    country: "-",
    count: row.count,
  }));
  const accessCountryRows = summary.access.byCountry.map((row) => ({
    date: "-",
    hour: "-",
    country: row.country,
    count: row.count,
  }));
  const salesItemRows = summary.sales.byItem.map((row) => ({
    item: row.item,
    date: "-",
    hour: "-",
    country: "-",
    count: row.count,
    revenueUsd: row.revenueUsd,
  }));
  const salesDateRows = summary.sales.byDate.map((row) => ({
    item: "-",
    date: row.date,
    hour: "-",
    country: "-",
    count: row.count,
    revenueUsd: row.revenueUsd,
  }));
  const salesHourRows = summary.sales.byHour.map((row) => ({
    item: "-",
    date: "-",
    hour: row.hour,
    country: "-",
    count: row.count,
    revenueUsd: row.revenueUsd,
  }));
  const salesCountryRows = summary.sales.byCountry.map((row) => ({
    item: "-",
    date: "-",
    hour: "-",
    country: row.country,
    count: row.count,
    revenueUsd: row.revenueUsd,
  }));

  return pageShell({
    title: "CEXScan Admin",
    body: `<main class="wrap">
      <header class="topbar">
        <div>
          <h1>CEXScan Admin</h1>
          <p>Private analytics dashboard. Times are grouped in ${escapeHtml(summary.timeZone)}.</p>
        </div>
        <form class="logout" method="post" action="/adm/logout">
          <a href="/" rel="nofollow">Back to site</a>
          <button type="submit">Sign out</button>
        </form>
      </header>

      ${renderApiDashboard(summary)}

      <section class="grid">
        <div class="metric"><span>Views today</span><strong>${formatNumber(summary.access.today)}</strong></div>
        <div class="metric"><span>Views last 24h</span><strong>${formatNumber(summary.access.last24h)}</strong></div>
        <div class="metric"><span>Clicks today</span><strong>${formatNumber(summary.clicks.exchangeRows.reduce((sum, row) => sum + row.today, 0))}</strong></div>
        <div class="metric"><span>Clicks last 24h</span><strong>${formatNumber(summary.clicks.exchangeRows.reduce((sum, row) => sum + row.last24h, 0))}</strong></div>
      </section>

      <section class="section-grid">
        ${renderCountryVisitors(summary, countryRange)}
        ${panel("Exchange click stats", "By exchange", summary.clicks.exchangeRows, clickColumns)}
      </section>

      ${detailPanel("X402 data sales by item", "Paid API/item", salesItemRows, salesColumns)}
      ${detailPanel("X402 data sales by date", "Paid API/date", salesDateRows, salesColumns)}
      ${detailPanel("X402 data sales by hour", "Paid API/hour", salesHourRows, salesColumns)}
      ${detailPanel("X402 data sales by country", "Paid API/country", salesCountryRows, salesColumns)}
      ${detailPanel("Click totals by date", "Exchange/date", clickDateRows, exchangeBreakdownColumns)}
      ${detailPanel("Click totals by hour", "Exchange/hour", clickHourRows, exchangeBreakdownColumns)}
      ${detailPanel("Click totals by country", "Exchange/country", clickCountryRows, exchangeBreakdownColumns)}
      ${detailPanel("Access totals by date", "Site/date", accessDateRows, accessColumns)}
      ${detailPanel("Access totals by hour", "Site/hour", accessHourRows, accessColumns)}
      ${detailPanel("Access totals by country", "Site/country", accessCountryRows, accessColumns)}
      ${detailPanel("Recent X402 data sales", "Latest 20", summary.sales.recent, recentSalesColumns)}
      ${detailPanel("Recent exchange clicks", "Latest 20", summary.clicks.recent, recentClickColumns)}
      ${detailPanel("Recent page views", "Latest 20", summary.access.recent, recentAccessColumns)}
    </main>`,
  });
}

export function noIndexAdmin(req, res, next) {
  if (req.path.startsWith("/adm") || req.path.startsWith("/api/admin")) {
    setNoIndex(res);
  }
  next();
}

export function handleAdminPage(req, res) {
  setNoIndex(res);
  if (!isAuthenticated(req)) {
    res.status(401).type("html").send(renderLogin());
    return;
  }
  res.type("html").send(renderAdmin(req));
}

export function handleAdminLogin(req, res) {
  setNoIndex(res);
  const username = req.body?.username;
  const password = req.body?.password;

  if (!timingSafeEqualText(username, ADMIN_USERNAME) || !timingSafeEqualText(password, ADMIN_PASSWORD)) {
    res.status(401).type("html").send(renderLogin("Invalid account or password."));
    return;
  }

  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken())}; ${cookieOptions(req)}`);
  res.redirect(303, "/adm");
}

export function handleAdminLogout(req, res) {
  setNoIndex(res);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.redirect(303, "/adm");
}

export function handleAdminAnalytics(req, res) {
  setNoIndex(res);
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(getAnalyticsSummary(EXCHANGES));
}
