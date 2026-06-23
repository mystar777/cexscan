import { isStableCoin, parseAprString, product } from "../lib/utils.js";
import {
  extractNextData,
  fetchSiteJson,
  fetchSiteText,
  stripHtml,
  uniqBy,
} from "../lib/site-utils.js";

function emptyFetcher(exchange, reason) {
  return async () => ({
    exchange,
    products: [],
    errors: reason ? [reason] : [],
  });
}

function toNumber(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function apyRangeFromTiers(tiers, fallbackMin, fallbackMax) {
  const values = tiers.map((t) => t.apy).filter((v) => v != null);
  if (!values.length) {
    return { apyMin: fallbackMin, apyMax: fallbackMax ?? fallbackMin };
  }
  return {
    apyMin: Math.min(...values),
    apyMax: Math.max(...values),
  };
}

function readableMirrorUrl(url) {
  return `https://r.jina.ai/http://r.jina.ai/http://${url}`;
}

function parseCoinbaseUsdcApy(text) {
  const patterns = [
    /Earn\s+unlimited\s+([0-9]+(?:\.[0-9]+)?)%\s+rewards\s+with\s+a\s+Coinbase\s+One\s+membership/i,
    /Earn\s+up\s+to\s+([0-9]+(?:\.[0-9]+)?)%\s+APY\s+through\s+USDC/i,
    /Earn\s+([0-9]+(?:\.[0-9]+)?)%\s+rewards\s+by\s+simply\s+holding\s+USDC/i,
  ];
  for (const pattern of patterns) {
    const apy = parseAprString(text.match(pattern)?.[1]);
    if (apy != null) return apy;
  }
  return null;
}

export async function fetchBinance() {
  const sourceUrl = "https://www.binance.com/en/earn/simple-earn";
  const products = [];
  const errors = [];

  try {
    const markdown = await fetchSiteText(readableMirrorUrl(sourceUrl));
    const rowRe =
      /!\[[^\]]*]\([^)]+\)\s+([A-Z0-9]+)\s+([0-9]+(?:\.[0-9]+)?)%\s*(?:~\s*([0-9]+(?:\.[0-9]+)?)%)?\s+(Flexible\/Locked|Flexible|Locked)/g;

    for (const match of markdown.matchAll(rowRe)) {
      const asset = match[1].toUpperCase();
      if (!isStableCoin(asset)) continue;
      const apyMin = parseAprString(match[2]);
      const apyMax = parseAprString(match[3] ?? match[2]);
      if (apyMax == null || apyMax <= 0) continue;

      const duration = match[4];
      products.push(
        product({
          exchange: "Binance",
          asset,
          productType: duration === "Locked" ? "locked" : "flexible",
          duration,
          durationDays: duration === "Flexible" ? 0 : null,
          apy: apyMax,
          apyMin,
          apyMax,
          note: "Binance Simple Earn public table",
          source: "site:binance-simple-earn",
          sourceId: `simple-earn-${asset}-${duration}`,
          sourceUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(`readable page: ${err.message}`);
  }

  if (!products.length && !errors.length) {
    errors.push(
      "Binance Simple Earn page loaded but no stablecoin rows were found; official product APIs require USER_DATA credentials",
    );
  }

  return {
    exchange: "Binance",
    products,
    errors,
  };
}

export async function fetchCoinbase() {
  const sourceUrl = "https://www.coinbase.com/earn";
  const errors = [];

  try {
    const html = await fetchSiteText(sourceUrl);
    const text = stripHtml(html);
    const apy = parseCoinbaseUsdcApy(text);
    if (apy != null) return coinbaseResult(apy, sourceUrl, errors);
  } catch (err) {
    errors.push(`direct page: ${err.message}`);
  }

  try {
    const text = await fetchSiteText(readableMirrorUrl(sourceUrl));
    const apy = parseCoinbaseUsdcApy(text);
    if (apy != null) return coinbaseResult(apy, sourceUrl, errors);
    errors.push("readable page loaded but no public USDC rewards rate was found");
  } catch (err) {
    errors.push(`readable page: ${err.message}`);
  }

  return { exchange: "Coinbase", products: [], errors };
}

function coinbaseResult(apy, sourceUrl, errors) {
  return {
    exchange: "Coinbase",
    products: [
      product({
        exchange: "Coinbase",
        asset: "USDC",
        productType: "flexible",
        duration: "Flexible",
        durationDays: 0,
        apy,
        apyMin: apy,
        apyMax: apy,
        minAmount: "1 USDC",
        note: "USDC rewards; availability varies by location and membership",
        source: "site:coinbase-earn",
        sourceId: "usdc-rewards",
        sourceUrl,
      }),
    ],
    errors,
  };
}

export async function fetchBitget() {
  const sourceUrl = "https://www.bitget.com/earning";
  const products = [];
  const errors = [];

  try {
    const html = await fetchSiteText(sourceUrl);
    const nextData = extractNextData(html);
    const pageProps = nextData?.props?.pageProps;
    if (!pageProps) throw new Error("Missing Next.js page props");

    const rawItems = [
      ...(pageProps.hotData ?? []),
      ...(pageProps.listData ?? []).flatMap((group) => group.bizLineProductList ?? []),
    ];

    for (const item of rawItems) {
      const asset = item.settleCoinName || item.coinName;
      if (!isStableCoin(asset)) continue;
      if ((item.secondBizLine || item.realSecondBizLine) !== "Savings") continue;

      const period = Number(item.period ?? 0);
      const flexible = item.periodType === 1 || period === 0;
      const tiers = (item.apyList ?? [])
        .map((tier) => ({
          min: toNumber(tier.minStepValue),
          max: toNumber(tier.maxStepValue),
          apy: parseAprString(tier.apy),
        }))
        .filter((tier) => tier.apy != null);
      const fallbackMin = parseAprString(item.minApy);
      const fallbackMax = parseAprString(item.maxApy);
      const { apyMin, apyMax } = apyRangeFromTiers(tiers, fallbackMin, fallbackMax);
      if (apyMax == null || apyMax <= 0) continue;

      products.push(
        product({
          exchange: "Bitget",
          asset,
          productType: flexible ? "flexible" : "locked",
          duration: flexible ? "Flexible" : `${period} days`,
          durationDays: flexible ? 0 : period,
          apy: apyMax,
          apyMin,
          apyMax,
          tierDetails: tiers.length ? tiers : null,
          minAmount: tiers[0]?.min ?? null,
          maxAmount: tiers.at(-1)?.max ?? null,
          note: "Bitget Earn Savings",
          source: "site:bitget-earning",
          sourceId: item.productId,
          sourceUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(err.message);
  }

  return {
    exchange: "Bitget",
    products: uniqBy(products, (p) => p.id),
    errors,
  };
}

export async function fetchKraken() {
  const sourceUrl = "https://support.kraken.com/articles/stablecoin-rewards";
  const products = [];
  const errors = [];

  try {
    const html = await fetchSiteText(sourceUrl);
    const titleMatches = [
      ...html.matchAll(/data-testid="title">([^<]*\(([A-Za-z][A-Za-z0-9]+)\))<\/div>/g),
    ];

    for (let i = 0; i < titleMatches.length; i++) {
      const match = titleMatches[i];
      const title = match[1];
      const asset = match[2].toUpperCase();
      if (!isStableCoin(asset)) continue;

      const nextIndex = titleMatches[i + 1]?.index ?? html.length;
      const block = stripHtml(html.slice(match.index, nextIndex));
      const rateBlock =
        block.match(/How much can I earn on .*?\?\s*([\s\S]*?)Rates are variable/i)?.[1] ??
        block;
      const apys = [...rateBlock.matchAll(/Earn up to\s+([0-9]+(?:\.[0-9]+)?)%\s+APY/gi)]
        .map((m) => parseAprString(m[1]))
        .filter((v) => v != null);
      if (!apys.length) continue;

      products.push(
        product({
          exchange: "Kraken",
          asset,
          productType: "flexible",
          duration: "Flexible",
          durationDays: 0,
          apy: Math.max(...apys),
          apyMin: Math.min(...apys),
          apyMax: Math.max(...apys),
          note: `${title} Stablecoin Rewards; subscriber tiers may apply`,
          source: "site:kraken-support",
          sourceId: `stablecoin-rewards-${asset}`,
          sourceUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(err.message);
  }

  return {
    exchange: "Kraken",
    products,
    errors,
  };
}

export async function fetchKucoin() {
  const sourceUrl = "https://www.kucoin.com/earn/hold-to-earn";
  const products = [];
  const errors = [];

  try {
    const markdown = await fetchSiteText(readableMirrorUrl(sourceUrl));
    const rowRe =
      /\|\s*(?:!\[[^\]]*]\([^)]+\)\s*)?([A-Z0-9]+)\s*\|\s*([0-9]+(?:\.[0-9]+)?)%\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;

    for (const match of markdown.matchAll(rowRe)) {
      const asset = match[1].toUpperCase();
      if (!isStableCoin(asset)) continue;
      const apy = parseAprString(match[2]);
      if (apy == null || apy <= 0) continue;

      products.push(
        product({
          exchange: "KuCoin",
          asset,
          productType: "flexible",
          duration: "Flexible",
          durationDays: 0,
          apy,
          apyMin: apy,
          apyMax: apy,
          minAmount: match[3].trim(),
          maxAmount: match[4].trim(),
          note: "KuCoin Hold to Earn reference APR",
          source: "site:kucoin-hold-to-earn",
          sourceId: `hold-${asset}`,
          sourceUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(err.message);
  }

  if (!products.length && !errors.length) {
    errors.push("KuCoin Hold to Earn page loaded but no stablecoin APR rows were found");
  }

  return {
    exchange: "KuCoin",
    products,
    errors,
  };
}

export async function fetchHtx() {
  const products = [];
  const errors = [];
  const sourceUrl = "https://www.htx.com/en-us/financial/earn/h5";
  const headers = {
    Referer: sourceUrl,
    "client-source": "web",
    "HB-API-VERSION": "1.6",
    "DATA-SOURCE": "3",
  };
  const endpoints = [
    ["queryAllList", "all"],
    ["queryFixedList", "fixed"],
    ["queryActivityList", "activity"],
    ["queryPrimeList", "prime"],
  ];

  for (const [endpoint, label] of endpoints) {
    try {
      const data = await fetchSiteJson(
        `https://www.htx.com/-/x/hbg/v3/saving/mining/project/${endpoint}`,
        { headers },
      );
      if (data.code !== 200 || !Array.isArray(data.data)) {
        errors.push(`${endpoint}: invalid response`);
        continue;
      }

      for (const item of data.data) {
        if (!isStableCoin(item.currency)) continue;
        if (item.projectStatus != null && item.projectStatus !== 1) continue;

        const apyMin = toNumber(item.viewYearRate);
        const apyMax = toNumber(item.maxViewYearRate ?? item.viewYearRate);
        if (apyMax == null || apyMax <= 0) continue;

        const term = Number(item.term ?? item.productTerm ?? 0);
        const flexible = term === 0 || item.shelfType === 0;
        products.push(
          product({
            exchange: "HTX",
            asset: item.currency,
            productType: flexible ? "flexible" : "locked",
            duration: flexible ? "Flexible" : `${term} days`,
            durationDays: flexible ? 0 : term,
            apy: apyMax,
            apyMin,
            apyMax,
            minAmount: item.minimum ?? null,
            maxAmount: item.totalAmount ?? null,
            note: `HTX Earn ${label}`,
            source: "site:htx-earn",
            sourceId: item.projectId ?? item.productId ?? `${label}-${item.currency}`,
            sourceUrl,
          }),
        );
      }
    } catch (err) {
      errors.push(`${endpoint}: ${err.message}`);
    }
  }

  return {
    exchange: "HTX",
    products: uniqBy(products, (p) => p.id),
    errors,
  };
}

export async function fetchMexc() {
  const sourceUrl = "https://www.mexc.com/earn";
  const products = [];
  const errors = [];

  try {
    const data = await fetchSiteJson(
      "https://www.mexc.com/api/financialactivity/financial/products/list/V2",
      {
        headers: {
          Referer: sourceUrl,
          language: "en-US",
        },
      },
    );
    if (!Array.isArray(data.data)) throw new Error("Invalid MEXC products response");

    for (const group of data.data) {
      if (!isStableCoin(group.currency)) continue;
      for (const item of group.financialProductList ?? []) {
        if (item.soldOut) continue;
        if (item.endTime && item.endTime < Date.now()) continue;

        const flexible = item.investPeriodType === "FLEXIBLE";
        const term = flexible ? 0 : Number(item.fixedInvestPeriodCount ?? 0);
        const baseApr = parseAprString(item.baseApr) ?? 0;
        const tiers = (item.tieredSubsidyApr ?? [])
          .map((tier) => ({
            min: toNumber(tier.startQuantity),
            max: toNumber(tier.endQuantity),
            apy: baseApr + (parseAprString(tier.apr) ?? 0),
          }))
          .filter((tier) => tier.apy > 0);
        const fallbackApy = parseAprString(item.showApr ?? item.baseApr);
        const { apyMin, apyMax } = apyRangeFromTiers(tiers, fallbackApy, fallbackApy);
        if (apyMax == null || apyMax <= 0) continue;

        const rewardCurrency =
          item.profitCurrency && item.profitCurrency !== item.currency
            ? `; rewards paid in ${item.profitCurrency}`
            : "";
        const memberNote =
          item.memberType && item.memberType !== "NORMAL" ? `; ${item.memberType}` : "";
        const promotional = item.memberType && item.memberType !== "NORMAL";

        products.push(
          product({
            exchange: "MEXC",
            asset: item.currency,
            productType: promotional ? "promo" : flexible ? "flexible" : "locked",
            duration: flexible ? "Flexible" : `${term} days`,
            durationDays: term,
            apy: apyMax,
            apyMin,
            apyMax,
            tierDetails: tiers.length ? tiers : null,
            minAmount: item.minPledgeQuantity,
            maxAmount: item.perPledgeMaxQuantity,
            note: `MEXC Earn${memberNote}${rewardCurrency}`,
            source: "site:mexc-earn",
            sourceId: item.financialId,
            sourceUrl,
          }),
        );
      }
    }
  } catch (err) {
    errors.push(err.message);
  }

  return {
    exchange: "MEXC",
    products: uniqBy(products, (p) => p.id),
    errors,
  };
}

export async function fetchCryptocom() {
  const sourceUrl = "https://crypto.com/earn";
  const products = [];
  const errors = [];

  try {
    const html = await fetchSiteText(sourceUrl);
    const re =
      /reward-list\/([A-Z0-9]+)\.webp[\s\S]{0,600}?<p class="[^"]+">([^<]+)<\/p>[\s\S]{0,300}?up to ([0-9]+(?:\.[0-9]+)?)%/g;
    for (const match of html.matchAll(re)) {
      const asset = match[1].toUpperCase();
      if (!isStableCoin(asset)) continue;
      const apy = parseAprString(match[3]);
      if (apy == null || apy <= 0) continue;

      products.push(
        product({
          exchange: "Crypto.com",
          asset,
          productType: "flexible",
          duration: "Variable",
          durationDays: null,
          apy,
          apyMin: apy,
          apyMax: apy,
          note: `${match[2]} Crypto Earn; rates vary by jurisdiction and app tier`,
          source: "site:cryptocom-earn",
          sourceId: `earn-${asset}`,
          sourceUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(err.message);
  }

  return {
    exchange: "Crypto.com",
    products,
    errors,
  };
}
