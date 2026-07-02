import { buildPoolHistoryPost, readCache, readPoolHistoryPosts } from "./cache.js";
import { EXCHANGES } from "./config.js";

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

function formatDateTime(value) {
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

function listify(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  return value ? [String(value)] : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sourceLabel(product) {
  return unique(listify(product.sources?.length ? product.sources : product.source)).join(", ") || "public";
}

function amountLabel(product) {
  const min = product.minAmount ? `min ${product.minAmount}` : "";
  const max = product.maxAmount ? `max ${product.maxAmount}` : "";
  return [min, max].filter(Boolean).join(" / ") || "-";
}

function shortText(value, maxLength = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function latestPostFromCache() {
  const cache = readCache();
  return buildPoolHistoryPost(cache);
}

function allPostsWithCurrent() {
  const latest = latestPostFromCache();
  const posts = readPoolHistoryPosts().filter((post) => post.slug !== latest.slug);
  return [latest, ...posts].sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

function findPost(slug) {
  return allPostsWithCurrent().find((post) => post.slug === slug) ?? null;
}

function exchangeSlugSet() {
  return new Set(EXCHANGES.map((exchange) => exchange.id));
}

function postExcerpt(post) {
  const top = post.topPool
    ? `${post.topPool.exchange} ${post.topPool.asset} ${formatApy(post.topPool.apy)}`
    : "no top pool";
  return `${post.productCount} crypto CEX stable pools captured as text. Top pool: ${top}. Exchanges covered: ${post.exchangeCount}.`;
}

function plainTextHistory(post) {
  const lines = [
    post.title,
    "",
    `Fetched at: ${post.fetchedAt}`,
    `Pool count: ${post.productCount}`,
    `Exchange count: ${post.exchangeCount}`,
    "",
    "Format: Exchange Coin APY APR | Type | Duration | Limits | Source | Note",
    "",
    ...post.products.map((product, index) => {
      const number = String(index + 1).padStart(3, "0");
      const note = shortText(product.note, 150);
      return `${number}. ${product.exchange} ${product.asset} ${formatApy(productApy(product))} APY APR | ${product.productType || "-"} | ${product.duration || "-"} | ${amountLabel(product)} | ${sourceLabel(product)}${note ? ` | ${note}` : ""}`;
    }),
  ];
  return lines.join("\n");
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
    <meta property="og:type" content="article" />
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
      :root { color-scheme: dark; --bg:#0d1117; --panel:#161b22; --panel2:#0f141b; --border:#30363d; --text:#e6edf3; --muted:#8b949e; --accent:#3fb950; --link:#58a6ff; --warning:#d29922; }
      * { box-sizing:border-box; }
      body { margin:0; background:var(--bg); color:var(--text); font-family:"IBM Plex Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }
      a { color:var(--link); text-decoration:none; }
      a:hover { text-decoration:underline; }
      .wrap { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:28px 0 48px; }
      .top { display:flex; justify-content:space-between; align-items:center; gap:16px; padding-bottom:20px; border-bottom:1px solid var(--border); }
      .brand { display:flex; align-items:center; gap:12px; color:var(--text); font-weight:800; }
      .brand img { width:34px; height:34px; }
      .nav { display:flex; flex-wrap:wrap; gap:12px; font-size:.92rem; }
      .hero { padding:28px 0 20px; }
      .kicker { margin:0 0 8px; color:var(--accent); font-size:.78rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2rem, 4vw, 3rem); line-height:1.08; letter-spacing:0; }
      h2 { margin:0; font-size:1.05rem; }
      h3 { margin:0; font-size:.98rem; }
      p { color:var(--muted); }
      .lead { max-width:850px; font-size:1.04rem; }
      .board-table, .pool-table { width:100%; border-collapse:collapse; font-size:.9rem; }
      .board-table { border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--panel); }
      th, td { padding:11px 10px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
      th { color:var(--muted); font-weight:800; background:var(--panel2); }
      tr:last-child td { border-bottom:0; }
      .title-link { color:var(--text); font-weight:800; }
      .summary { margin:.35rem 0 0; color:var(--muted); font-size:.86rem; }
      .num, .apy { color:var(--accent); font-weight:800; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .panel { margin-top:16px; padding:16px; border:1px solid var(--border); border-radius:8px; background:linear-gradient(180deg, #161b22, #11161d); }
      .stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; margin-top:14px; }
      .stat { padding:10px 12px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(13,17,23,.55); }
      .stat span { display:block; color:var(--muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; }
      .stat strong { display:block; margin-top:4px; color:var(--text); }
      .plain-text-history { margin:12px 0 0; padding:14px; max-height:680px; overflow:auto; border:1px solid var(--border); border-radius:8px; background:#080c12; color:#dbe9f4; font:13px/1.55 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; white-space:pre-wrap; }
      .pool-table-wrap { overflow:auto; margin-top:12px; border:1px solid var(--border); border-radius:8px; }
      .pool-table th { position:sticky; top:0; z-index:1; }
      .note { color:var(--muted); font-size:.85rem; }
      .footer { margin-top:28px; padding-top:18px; border-top:1px solid var(--border); color:var(--muted); font-size:.86rem; }
      @media (max-width:760px) {
        .top { flex-direction:column; align-items:flex-start; }
        .stats { grid-template-columns:repeat(2, minmax(0, 1fr)); }
        .board-table th:nth-child(3), .board-table td:nth-child(3),
        .pool-table th:nth-child(5), .pool-table td:nth-child(5),
        .pool-table th:nth-child(7), .pool-table td:nth-child(7) { display:none; }
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
        CEXScan publishes crypto CEX stable pool APY/APR history for search and research. This is informational data, not financial advice.
      </footer>
    </main>
  </body>
</html>`;
}

function boardJsonLd(posts) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Crypto CEX Stable Pool APY APR History Board",
      url: absoluteUrl("/history"),
      description:
        "A bulletin-board style archive of crypto CEX stable pool APY and APR snapshots across Binance, Coinbase, Bybit, OKX, Bitget, Kraken, KuCoin, Gate.io, HTX, MEXC, Crypto.com, LBank, and BingX.",
      mainEntity: posts.map((post) => ({
        "@type": "Article",
        headline: post.title,
        url: absoluteUrl(`/history/${post.slug}`),
        dateModified: post.fetchedAt,
      })),
    },
  ];
}

export function renderHistoryIndex() {
  const posts = allPostsWithCurrent();
  const latest = posts[0];
  const body = `<section class="hero">
    <p class="kicker">History board</p>
    <h1>Crypto CEX Stable Pool APY/APR History Board</h1>
    <p class="lead">
      This board stores date-based text posts for stablecoin staking pools across ${escapeHtml(EXCHANGE_NAMES.join(", "))}.
      Each post turns the current pool snapshot into crawlable text, for example: Binance USDT 16.80%, MEXC USDT 600.00%, Gate.io USDC, Bybit USD1, and other crypto Earn pools.
    </p>
    <p class="note">Latest post: ${latest ? escapeHtml(latest.title) : "No post yet"}.</p>
  </section>
  <table class="board-table" aria-label="Crypto CEX stable pool history posts">
    <thead>
      <tr>
        <th>No</th>
        <th>Title</th>
        <th>Pools</th>
        <th>Top APY/APR</th>
        <th>Updated</th>
      </tr>
    </thead>
    <tbody>
      ${posts
        .map(
          (post, index) => `<tr>
            <td class="num">${posts.length - index}</td>
            <td>
              <a class="title-link" href="/history/${post.slug}">${escapeHtml(post.title)}</a>
              <p class="summary">${escapeHtml(postExcerpt(post))}</p>
            </td>
            <td>${escapeHtml(post.productCount)}</td>
            <td class="apy">${escapeHtml(formatApy(post.topPool?.apy))}</td>
            <td>${escapeHtml(formatDateTime(post.fetchedAt))}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;

  return pageShell({
    title: "Crypto CEX Stable Pool APY/APR History Board | CEXScan",
    description:
      "Bulletin-board style crypto CEX stable pool APY/APR history posts with full text pool snapshots for Binance, Bybit, OKX, Gate.io, MEXC, KuCoin, LBank, BingX, and more.",
    canonicalPath: "/history",
    jsonLd: boardJsonLd(posts),
    body,
  });
}

function poolRows(post) {
  return post.products
    .map(
      (product, index) => `<tr id="pool-${index + 1}">
        <td class="num">${index + 1}</td>
        <td>${escapeHtml(product.exchange)}</td>
        <td>${escapeHtml(product.asset)}</td>
        <td class="apy">${escapeHtml(formatApy(productApy(product)))}</td>
        <td>${escapeHtml(product.productType || "-")}</td>
        <td>${escapeHtml(product.duration || "-")}</td>
        <td>${escapeHtml(amountLabel(product))}</td>
        <td>${escapeHtml(sourceLabel(product))}</td>
        <td>${escapeHtml(shortText(product.note, 160) || "-")}</td>
      </tr>`,
    )
    .join("");
}

function articleJsonLd(post) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      url: absoluteUrl(`/history/${post.slug}`),
      datePublished: post.fetchedAt,
      dateModified: post.fetchedAt,
      author: { "@type": "Organization", name: "CEXScan" },
      publisher: { "@type": "Organization", name: "CEXScan" },
      keywords: [
        "crypto cex stable pool",
        "stablecoin APY",
        "stablecoin APR",
        "crypto Earn",
        ...EXCHANGE_NAMES,
      ],
      description: postExcerpt(post),
      articleBody: plainTextHistory(post).slice(0, 5000),
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: post.title,
      url: absoluteUrl(`/history/${post.slug}`),
      dateModified: post.fetchedAt,
      variableMeasured: ["exchange", "stablecoin", "APY", "APR", "product type", "duration", "source"],
    },
  ];
}

export function renderHistoryArticle(slug) {
  const post = findPost(slug);
  if (!post) return null;
  const textHistory = plainTextHistory(post);
  const topPool = post.topPool
    ? `${post.topPool.exchange} ${post.topPool.asset} ${formatApy(post.topPool.apy)}`
    : "No top pool";

  const body = `<article class="hero">
    <p class="kicker">Pool history post</p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="lead">
      This bulletin-board post stores the current crypto CEX stable pool snapshot as plain text.
      It includes ${escapeHtml(post.productCount)} pools across ${escapeHtml(post.exchangeCount)} exchanges, including Binance, Bybit, OKX, Gate.io, MEXC, KuCoin, LBank, BingX, and other monitored centralized exchanges.
    </p>
    <div class="stats">
      <div class="stat"><span>Pool count</span><strong>${escapeHtml(post.productCount)}</strong></div>
      <div class="stat"><span>Exchange count</span><strong>${escapeHtml(post.exchangeCount)}</strong></div>
      <div class="stat"><span>Top pool</span><strong>${escapeHtml(topPool)}</strong></div>
      <div class="stat"><span>Fetched</span><strong>${escapeHtml(formatDateTime(post.fetchedAt))}</strong></div>
    </div>
  </article>
  <section class="panel">
    <h2>Plain Text Pool History</h2>
    <p class="note">Search-friendly text version. APY/APR is shown from the normalized CEXScan pool data.</p>
    <pre class="plain-text-history">${escapeHtml(textHistory)}</pre>
  </section>
  <section class="panel">
    <h2>All ${escapeHtml(post.productCount)} Pools</h2>
    <div class="pool-table-wrap">
      <table class="pool-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Exchange</th>
            <th>Coin</th>
            <th>APY/APR</th>
            <th>Type</th>
            <th>Duration</th>
            <th>Limits</th>
            <th>Source</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>${poolRows(post)}</tbody>
      </table>
    </div>
  </section>`;

  return pageShell({
    title: `${post.title} | ${post.productCount} Pools`,
    description: `${post.date} crypto CEX stable pool APY/APR history post with ${post.productCount} text rows across Binance, Bybit, OKX, Gate.io, MEXC, KuCoin, LBank, BingX, and more.`,
    canonicalPath: `/history/${post.slug}`,
    jsonLd: articleJsonLd(post),
    body,
  });
}

export function renderSitemap() {
  const posts = allPostsWithCurrent();
  const urls = [
    { loc: absoluteUrl("/"), lastmod: new Date().toISOString().slice(0, 10), priority: "1.0", changefreq: "hourly" },
    { loc: absoluteUrl("/history"), lastmod: posts[0]?.date ?? new Date().toISOString().slice(0, 10), priority: "0.8", changefreq: "daily" },
    ...posts.map((post) => ({
      loc: absoluteUrl(`/history/${post.slug}`),
      lastmod: post.date,
      priority: "0.8",
      changefreq: "daily",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>
    <lastmod>${escapeHtml(url.lastmod)}</lastmod>
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
  const slug = req.params.postSlug ?? req.params.exchangeId;
  const latest = allPostsWithCurrent()[0];

  if (slug === "latest" && latest) {
    res.redirect(302, `/history/${latest.slug}`);
    return;
  }

  if (exchangeSlugSet().has(slug) && latest) {
    res.redirect(301, `/history/${latest.slug}`);
    return;
  }

  const html = renderHistoryArticle(slug);
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
