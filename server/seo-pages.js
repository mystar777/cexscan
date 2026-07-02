import { readCache } from "./cache.js";
import { EXCHANGES, STABLE_COINS } from "./config.js";

const SITE_URL = "https://cexscan.mystarbot.xyz";
const SITE_NAME = "CEX Stable Staking";
const EXCHANGE_NAMES = EXCHANGES.map((exchange) => exchange.name);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function absoluteUrl(pathname = "/") {
  return `${SITE_URL}${pathname}`;
}

function formatDate(value) {
  if (!value) return "Not refreshed yet";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatApy(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(numeric >= 100 ? 0 : 2)}%`;
}

function productApy(product) {
  return Number(product?.apyMax ?? product?.apy ?? 0);
}

function exchangeBySlug(slug) {
  return EXCHANGES.find((exchange) => exchange.id === slug);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function listify(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  return value ? [String(value)] : [];
}

function sourceLabel(product) {
  const sources = listify(product?.sources?.length ? product.sources : product?.source);
  return unique(sources).join(", ") || "public source";
}

function summarizeExchange(cache, exchange) {
  const products = (cache.products ?? [])
    .filter((product) => product.exchange === exchange.name)
    .sort((left, right) => productApy(right) - productApy(left));
  const status = (cache.exchangeStatus ?? []).find((entry) => entry.exchange === exchange.name);
  const assets = unique(products.map((product) => product.asset));
  const productTypes = unique(products.map((product) => product.productType));
  const topProduct = products[0] ?? null;
  const topApy = topProduct ? productApy(topProduct) : 0;
  const sourceTypes = status?.sources?.length
    ? listify(status.sources)
    : unique(products.flatMap((product) => listify(product.sources ?? product.source)));

  return {
    exchange,
    products,
    status,
    assets,
    productTypes,
    topProduct,
    topApy,
    sourceTypes,
  };
}

function pageShell({ title, description, canonicalPath, jsonLd = [], body }) {
  const canonical = absoluteUrl(canonicalPath);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${SITE_URL}/brand/logo.svg" />
    <meta name="twitter:card" content="summary" />
    <meta name="theme-color" content="#0b0f14" />
    <link rel="icon" href="/brand/favicon.ico" sizes="any" />
    <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="/site.webmanifest" />
    <style>
      :root { color-scheme: dark; --bg:#0d1117; --panel:#161b22; --panel2:#0f141b; --border:#30363d; --text:#e6edf3; --muted:#8b949e; --accent:#3fb950; --link:#58a6ff; }
      * { box-sizing: border-box; }
      body { margin:0; background:var(--bg); color:var(--text); font-family:"IBM Plex Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }
      a { color:var(--link); text-decoration:none; }
      a:hover { text-decoration:underline; }
      .wrap { width:min(1120px, calc(100% - 32px)); margin:0 auto; padding:28px 0 48px; }
      .top { display:flex; justify-content:space-between; align-items:center; gap:16px; padding-bottom:20px; border-bottom:1px solid var(--border); }
      .brand { display:flex; align-items:center; gap:12px; color:var(--text); font-weight:800; }
      .brand img { width:34px; height:34px; }
      .nav { display:flex; flex-wrap:wrap; gap:12px; font-size:.92rem; }
      .hero { padding:28px 0 20px; }
      .kicker { margin:0 0 8px; color:var(--accent); font-size:.78rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2rem, 4vw, 3.1rem); line-height:1.08; letter-spacing:0; }
      h2 { margin:0; font-size:1.05rem; }
      h3 { margin:0 0 8px; font-size:1rem; }
      p { color:var(--muted); }
      .lead { max-width:820px; font-size:1.04rem; }
      .board { display:grid; gap:12px; margin-top:18px; }
      .board-row, .panel { display:block; border:1px solid var(--border); border-radius:8px; background:linear-gradient(180deg, #161b22, #11161d); }
      .board-row { padding:16px; color:inherit; }
      .board-row:hover { border-color:rgba(63,185,80,.55); text-decoration:none; }
      .row-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }
      .rank { color:var(--muted); font-size:.8rem; }
      .summary { margin:8px 0 0; }
      .stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; margin-top:14px; }
      .stat { padding:10px 12px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(13,17,23,.55); }
      .stat span { display:block; color:var(--muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; }
      .stat strong { display:block; margin-top:4px; color:var(--text); }
      .article-grid { display:grid; grid-template-columns:minmax(0, 1fr) 18rem; gap:16px; align-items:start; }
      .panel { padding:16px; }
      .panel + .panel { margin-top:16px; }
      .tag-list { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 0; padding:0; list-style:none; }
      .tag-list li { padding:4px 8px; border:1px solid var(--border); border-radius:999px; color:var(--muted); background:var(--panel2); font-size:.82rem; }
      table { width:100%; border-collapse:collapse; font-size:.9rem; }
      th, td { padding:10px 8px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
      th { color:var(--muted); font-weight:700; }
      td.num { color:var(--accent); font-weight:800; }
      .note { color:var(--muted); font-size:.85rem; }
      .footer { margin-top:28px; padding-top:18px; border-top:1px solid var(--border); color:var(--muted); font-size:.86rem; }
      @media (max-width: 760px) {
        .top, .row-head { flex-direction:column; align-items:flex-start; }
        .stats, .article-grid { grid-template-columns:1fr; }
        th:nth-child(4), td:nth-child(4) { display:none; }
      }
    </style>
    ${jsonLd
      .map((entry) => `<script type="application/ld+json">${escapeScriptJson(entry)}</script>`)
      .join("\n    ")}
  </head>
  <body>
    <main class="wrap">
      <header class="top">
        <a class="brand" href="/">
          <img src="/brand/logo.svg" alt="" />
          <span>${SITE_NAME}</span>
        </a>
        <nav class="nav" aria-label="SEO pages">
          <a href="/">Dashboard</a>
          <a href="/history">History Board</a>
          <a href="/api/meta">API Meta</a>
        </nav>
      </header>
      ${body}
      <footer class="footer">
        CEXScan publishes crypto stablecoin staking history for search and research. This is informational data, not financial advice.
      </footer>
    </main>
  </body>
</html>`;
}

function exchangeExcerpt(summary) {
  const assetText = summary.assets.length ? summary.assets.slice(0, 6).join(", ") : STABLE_COINS.slice(0, 4).join(", ");
  const topText = summary.topProduct
    ? `${formatApy(summary.topApy)} on ${summary.topProduct.asset} ${summary.topProduct.duration}`
    : "no active APY in the latest snapshot";
  return `${summary.exchange.name} crypto Earn history currently tracks ${summary.products.length} stablecoin products across ${assetText}. The latest top observed APY is ${topText}.`;
}

function buildHistoryJsonLd(cache, summaries) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Crypto Exchange Staking History Board",
      url: absoluteUrl("/history"),
      description:
        "A crawlable history board for crypto stablecoin staking APY across Binance, Coinbase, Bybit, OKX, Bitget, Kraken, KuCoin, Gate.io, HTX, MEXC, Crypto.com, LBank, and BingX.",
      dateModified: cache.meta?.fetchedAt ?? new Date().toISOString(),
      mainEntity: summaries.map((summary) => ({
        "@type": "Article",
        headline: `${summary.exchange.name} crypto Earn and stablecoin APY history`,
        url: absoluteUrl(`/history/${summary.exchange.id}`),
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "CEXScan stablecoin staking APY dataset",
      url: absoluteUrl("/"),
      dateModified: cache.meta?.fetchedAt ?? new Date().toISOString(),
      keywords: ["crypto staking", "stablecoin APY", ...EXCHANGE_NAMES],
    },
  ];
}

export function renderHistoryIndex() {
  const cache = readCache();
  const summaries = EXCHANGES.map((exchange) => summarizeExchange(cache, exchange));
  const updated = formatDate(cache.meta?.fetchedAt);
  const body = `<section class="hero">
    <p class="kicker">Crypto staking history board</p>
    <h1>Crypto Exchange Staking History for Binance, Bybit, OKX, Gate.io and More</h1>
    <p class="lead">
      CEXScan keeps a crawlable text history of stablecoin staking and crypto Earn products across ${escapeHtml(EXCHANGE_NAMES.join(", "))}.
      Each board entry summarizes the latest public API, Earn page, and notice data so search engines can understand the exchange, coin, APY, source, and update context.
    </p>
    <p class="note">Latest refresh: ${escapeHtml(updated)}. Products in cache: ${escapeHtml(cache.meta?.productCount ?? 0)}. Exchanges monitored: ${escapeHtml(cache.meta?.exchangeCount ?? EXCHANGES.length)}.</p>
  </section>
  <section class="board" aria-label="Exchange history board">
    ${summaries
      .map(
        (summary) => `<a class="board-row" href="/history/${summary.exchange.id}">
          <div class="row-head">
            <div>
              <span class="rank">#${summary.exchange.rank} ${escapeHtml(summary.exchange.name)}</span>
              <h2>${escapeHtml(summary.exchange.name)} Crypto Earn and Stablecoin APY History</h2>
            </div>
            <strong>${escapeHtml(formatApy(summary.topApy))}</strong>
          </div>
          <p class="summary">${escapeHtml(exchangeExcerpt(summary))}</p>
          <div class="stats">
            <div class="stat"><span>Products</span><strong>${escapeHtml(summary.products.length)}</strong></div>
            <div class="stat"><span>Coins</span><strong>${escapeHtml(summary.assets.slice(0, 4).join(", ") || "-")}</strong></div>
            <div class="stat"><span>Sources</span><strong>${escapeHtml(summary.sourceTypes.join(", ") || "public")}</strong></div>
            <div class="stat"><span>Status</span><strong>${summary.status?.ok ? "Live" : "Check source"}</strong></div>
          </div>
        </a>`,
      )
      .join("")}
  </section>`;

  return pageShell({
    title: "Crypto Staking History Board | Binance, Bybit, OKX, Gate.io APY",
    description:
      "Crawlable crypto stablecoin staking history board for Binance, Coinbase, Bybit, OKX, Bitget, Kraken, KuCoin, Gate.io, HTX, MEXC, Crypto.com, LBank, and BingX.",
    canonicalPath: "/history",
    jsonLd: buildHistoryJsonLd(cache, summaries),
    body,
  });
}

function renderProductRows(products) {
  if (!products.length) {
    return `<p class="note">No active stablecoin staking products were present in the latest CEXScan snapshot for this exchange.</p>`;
  }

  return `<table>
    <thead>
      <tr>
        <th>Coin</th>
        <th>Type</th>
        <th>Duration</th>
        <th>Source</th>
        <th>APY</th>
      </tr>
    </thead>
    <tbody>
      ${products
        .slice(0, 24)
        .map(
          (product) => `<tr>
            <td>${escapeHtml(product.asset)}</td>
            <td>${escapeHtml(product.productType)}</td>
            <td>${escapeHtml(product.duration)}</td>
            <td>${escapeHtml(sourceLabel(product))}</td>
            <td class="num">${escapeHtml(formatApy(productApy(product)))}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function buildArticleJsonLd(cache, summary) {
  const title = `${summary.exchange.name} Crypto Earn and Stablecoin APY History`;
  const path = `/history/${summary.exchange.id}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      url: absoluteUrl(path),
      dateModified: cache.meta?.fetchedAt ?? new Date().toISOString(),
      datePublished: cache.meta?.fetchedAt ?? new Date().toISOString(),
      author: { "@type": "Organization", name: "CEXScan" },
      publisher: { "@type": "Organization", name: "CEXScan" },
      about: [
        { "@type": "Thing", name: summary.exchange.name },
        { "@type": "Thing", name: "crypto staking" },
        { "@type": "Thing", name: "stablecoin APY" },
      ],
      description: exchangeExcerpt(summary),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Dashboard", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: "History Board", item: absoluteUrl("/history") },
        { "@type": "ListItem", position: 3, name: summary.exchange.name, item: absoluteUrl(path) },
      ],
    },
  ];
}

export function renderHistoryArticle(exchangeId) {
  const exchange = exchangeBySlug(exchangeId);
  if (!exchange) return null;

  const cache = readCache();
  const summary = summarizeExchange(cache, exchange);
  const updated = formatDate(cache.meta?.fetchedAt);
  const assets = summary.assets.length ? summary.assets : STABLE_COINS.slice(0, 6);
  const productTypes = summary.productTypes.length ? summary.productTypes : ["flexible", "fixed", "promo"];
  const topProductText = summary.topProduct
    ? `${summary.topProduct.asset} ${summary.topProduct.duration} at ${formatApy(summary.topApy)}`
    : "no active stablecoin product in the latest snapshot";

  const body = `<article class="hero">
    <p class="kicker">Exchange history</p>
    <h1>${escapeHtml(exchange.name)} Crypto Earn and Stablecoin APY History</h1>
    <p class="lead">
      This ${escapeHtml(exchange.name)} history page describes the latest CEXScan snapshot for crypto stablecoin staking, Earn products, APY ranges, source types, and searchable context.
      It is designed for readers and search crawlers looking for ${escapeHtml(exchange.name)} USDT, USDC, USD1, and other stablecoin yield data.
    </p>
    <p class="note">Latest refresh: ${escapeHtml(updated)}. Current top observed item: ${escapeHtml(topProductText)}.</p>
  </article>
  <section class="article-grid">
    <div>
      <section class="panel">
        <h2>Latest ${escapeHtml(exchange.name)} Stablecoin Products</h2>
        <p>${escapeHtml(exchangeExcerpt(summary))}</p>
        ${renderProductRows(summary.products)}
      </section>
      <section class="panel">
        <h2>Searchable History Notes</h2>
        <p>
          CEXScan records ${escapeHtml(exchange.name)} crypto Earn data with stablecoin names, product duration, APY, source category, and update time.
          This helps compare ${escapeHtml(exchange.name)} against Binance, Coinbase, Bybit, OKX, Bitget, Kraken, KuCoin, Gate.io, HTX, MEXC, Crypto.com, LBank, and BingX without hiding the source context.
        </p>
        <p>
          The board is refreshed with the main CEXScan data pipeline, so changes in public APIs, exchange Earn pages, and exchange notices can update this page after the next scheduled refresh.
        </p>
      </section>
    </div>
    <aside>
      <section class="panel">
        <h2>Snapshot Summary</h2>
        <div class="stats">
          <div class="stat"><span>Products</span><strong>${escapeHtml(summary.products.length)}</strong></div>
          <div class="stat"><span>Top APY</span><strong>${escapeHtml(formatApy(summary.topApy))}</strong></div>
          <div class="stat"><span>Rank</span><strong>#${escapeHtml(exchange.rank)}</strong></div>
          <div class="stat"><span>Status</span><strong>${summary.status?.ok ? "Live" : "Check source"}</strong></div>
        </div>
      </section>
      <section class="panel">
        <h2>Coins Mentioned</h2>
        <ul class="tag-list">${assets.map((asset) => `<li>${escapeHtml(asset)}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h2>Product Types</h2>
        <ul class="tag-list">${productTypes.map((type) => `<li>${escapeHtml(type)}</li>`).join("")}</ul>
      </section>
    </aside>
  </section>`;

  return pageShell({
    title: `${exchange.name} Crypto Earn History | Stablecoin Staking APY`,
    description: `${exchange.name} crypto Earn and stablecoin staking APY history with searchable USDT, USDC, USD1, product type, duration, and source data from CEXScan.`,
    canonicalPath: `/history/${exchange.id}`,
    jsonLd: buildArticleJsonLd(cache, summary),
    body,
  });
}

export function renderSitemap() {
  const cache = readCache();
  const lastmod = (cache.meta?.fetchedAt ?? new Date().toISOString()).slice(0, 10);
  const urls = [
    { loc: absoluteUrl("/"), priority: "1.0", changefreq: "hourly" },
    { loc: absoluteUrl("/history"), priority: "0.8", changefreq: "hourly" },
    ...EXCHANGES.map((exchange) => ({
      loc: absoluteUrl(`/history/${exchange.id}`),
      priority: "0.7",
      changefreq: "hourly",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

export function handleHistoryIndex(_req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("html").send(renderHistoryIndex());
}

export function handleHistoryArticle(req, res) {
  const html = renderHistoryArticle(req.params.exchangeId);
  if (!html) {
    res.status(404).type("html").send(renderHistoryIndex());
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("html").send(html);
}

export function handleSitemap(_req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("application/xml").send(renderSitemap());
}
