import { fetchJson } from "../lib/utils.js";
import { parseAnnouncementProducts } from "../lib/announcement-parser.js";

const BROWSER_HEADERS = {
  clienttype: "web",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? 15000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { ...BROWSER_HEADERS, ...options.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBinanceAnnouncements() {
  const articles = [];
  const seen = new Set();
  for (let page = 1; page <= 3; page++) {
    const data = await fetchJson(
      `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageSize=20&pageNo=${page}`,
      { headers: BROWSER_HEADERS },
    );
    for (const cat of data?.data?.catalogs ?? []) {
      for (const a of cat.articles ?? []) {
        if (seen.has(a.code)) continue;
        seen.add(a.code);
        articles.push({
          title: a.title,
          url: `https://www.binance.com/en/support/announcement/${a.code}`,
          publishedAt: a.releaseDate ? new Date(a.releaseDate).toISOString() : null,
        });
      }
    }
  }
  return articles;
}

async function fetchBybitAnnouncements() {
  const data = await fetchJson(
    "https://api.bybit.com/v5/announcements/index?locale=en-US&limit=80",
  );
  return (data?.result?.list ?? []).map((a) => ({
    title: a.title,
    description: a.description,
    url: a.url,
    publishedAt: a.publishTime ? new Date(a.publishTime).toISOString() : null,
  }));
}

async function fetchOkxAnnouncements() {
  const res = await fetchText("https://www.okx.com/v2/support/home/web?limit=60");
  const data = await res.json();
  return (data?.data?.notices ?? []).map((n) => ({
    title: n.shareTitle || n.shareText || "",
    url: n.link ? `https://www.okx.com${n.link}` : n.shareLink,
    publishedAt: n.publishDate ? new Date(n.publishDate).toISOString() : null,
  }));
}

async function fetchBitgetAnnouncements() {
  const data = await fetchJson(
    "https://api.bitget.com/api/v2/public/annoucements?language=en_US",
  );
  return (data?.data ?? []).slice(0, 80).map((a) => ({
    title: a.annTitle,
    url: a.annUrl,
    publishedAt: a.cTime ? new Date(Number(a.cTime)).toISOString() : null,
  }));
}

async function fetchKucoinAnnouncements() {
  const res = await fetchText(
    "https://www.kucoin.com/_api/cms/articles?category=announcements&lang=en_US&page=1&pageSize=50",
  );
  const data = await res.json();
  return (data?.items ?? []).map((a) => ({
    title: a.title,
    description: a.summary,
    url: `https://www.kucoin.com/news${a.path}`,
    publishedAt: null,
  }));
}

async function fetchRssAnnouncements(feedUrl) {
  const res = await fetchText(feedUrl);
  const xml = await res.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const link = block.match(/<link>(.*?)<\/link>/i);
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/i);
    items.push({
      title: (title?.[1] || title?.[2] || "").trim(),
      url: link?.[1]?.trim(),
      description: desc?.[1]?.trim(),
    });
  }
  return items.slice(0, 40);
}

async function fetchCoinbaseAnnouncements() {
  try {
    return await fetchRssAnnouncements("https://www.coinbase.com/blog/rss.xml");
  } catch {
    return [];
  }
}

async function fetchKrakenAnnouncements() {
  try {
    return await fetchRssAnnouncements("https://blog.kraken.com/feed");
  } catch {
    return [];
  }
}
async function fetchHtxAnnouncements() {
  try {
    const data = await fetchJson(
      "https://api.huobi.pro/v2/notice/online?lang=en-us&page=1&limit=50",
    );
    return (data?.data ?? []).map((a) => ({
      title: a.title,
      url: a.article_url || a.jump_url,
      publishedAt: a.show_time ? new Date(a.show_time).toISOString() : null,
    }));
  } catch {
    return [];
  }
}

async function fetchMexcAnnouncements() {
  try {
    const data = await fetchJson(
      "https://www.mexc.com/api/operate/content/list?lang=en-US&pageNum=1&pageSize=50&contentType=ANNOUNCEMENT",
      { headers: BROWSER_HEADERS },
    );
    const list = data?.data?.list ?? data?.data ?? [];
    return list.map((a) => ({
      title: a.title || a.name,
      url: a.link || a.url,
      publishedAt: null,
    }));
  } catch {
    return [];
  }
}

async function fetchCryptocomAnnouncements() {
  try {
    const data = await fetchJson(
      "https://api.crypto.com/exchange/v1/public/get-announcements?category=general",
    );
    return (data?.result?.data ?? []).map((a) => ({
      title: a.title,
      description: a.content,
      url: a.link,
      publishedAt: a.published_at,
    }));
  } catch {
    return [];
  }
}

const ANNOUNCEMENT_SOURCES = {
  Binance: fetchBinanceAnnouncements,
  Coinbase: fetchCoinbaseAnnouncements,
  Kraken: fetchKrakenAnnouncements,
  Bybit: fetchBybitAnnouncements,
  OKX: fetchOkxAnnouncements,
  Bitget: fetchBitgetAnnouncements,
  KuCoin: fetchKucoinAnnouncements,
  HTX: fetchHtxAnnouncements,
  MEXC: fetchMexcAnnouncements,
  "Crypto.com": fetchCryptocomAnnouncements,
};

export async function fetchFromAnnouncements(exchange) {
  const fetcher = ANNOUNCEMENT_SOURCES[exchange];
  if (!fetcher) {
    return { products: [], errors: ["No announcement source configured"] };
  }

  try {
    const announcements = await fetcher();
    const products = parseAnnouncementProducts(exchange, announcements);
    return {
      products,
      errors: products.length ? [] : ["No staking-related announcements found"],
      announcementCount: announcements.length,
    };
  } catch (err) {
    return { products: [], errors: [`Announcement fetch failed: ${err.message}`] };
  }
}

export function createAnnouncementFetcher(exchange) {
  return async () => {
    const result = await fetchFromAnnouncements(exchange);
    return {
      exchange,
      products: result.products,
      errors: result.errors,
      source: "announcement",
    };
  };
}
