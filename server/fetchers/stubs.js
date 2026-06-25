import { createHash, randomUUID } from "node:crypto";
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

function decodeNextFlight(html) {
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
  for (const match of html.matchAll(re)) {
    try {
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch {
      /* Ignore non-data React Flight chunks. */
    }
  }
  return chunks.join("\n");
}

function extractJsonArray(text, propName) {
  const key = `"${propName}":`;
  const idx = text.indexOf(key);
  if (idx < 0) return null;

  const start = text.indexOf("[", idx + key.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }

  return null;
}

function extractFlightArray(html, propName) {
  return extractJsonArray(decodeNextFlight(html), propName) ?? [];
}

function cleanBingxSignObject(value) {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const item = value[i];
      if (item && typeof item === "object") cleanBingxSignObject(item);
      if (
        (item && typeof item === "object" && !Object.keys(item).length) ||
        item == null ||
        (typeof item === "number" && Number.isNaN(item))
      ) {
        value.splice(i, 1);
      }
    }
    return value;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (item && typeof item === "object") cleanBingxSignObject(item);
      if (
        (item && typeof item === "object" && !Object.keys(item).length) ||
        item == null ||
        (typeof item === "number" && Number.isNaN(item))
      ) {
        delete value[key];
      }
    }
  }

  return value;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item) ?? "null").join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const stringified = stableStringify(value[key]);
        return stringified ? `${JSON.stringify(key)}:${stringified}` : null;
      })
      .filter(Boolean)
      .join(",")}}`;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (value !== undefined) return JSON.stringify(value);
  return undefined;
}

function normalizeBingxSignObject(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (typeof value[key] === "object") {
        value[key] = normalizeBingxSignObject(value[key]);
      }
      if (typeof value[key] === "number" || typeof value[key] === "boolean") {
        value[key] =
          typeof value[key] === "number"
            ? value[key].toString().toUpperCase()
            : value[key].toString();
      }
    }
  }
  return value;
}

function bingxApiSign({
  timestamp,
  traceId,
  deviceId,
  platformId,
  appVersion,
  antiDeviceId = "",
  requestPayload = {},
}) {
  const payloadCopy = JSON.parse(JSON.stringify(requestPayload ?? {}));
  const payload =
    payloadCopy && typeof payloadCopy === "object" && JSON.stringify(payloadCopy) !== "{}"
      ? stableStringify(normalizeBingxSignObject(cleanBingxSignObject(payloadCopy)))
      : "{}";
  const content =
    `95d65c73dc5c4370ae9018fb7f2eab69${timestamp}${traceId}` +
    `${deviceId}${platformId}${appVersion}${antiDeviceId}${payload}`;

  return createHash("sha256").update(content).digest("hex").toUpperCase();
}

function bingxApiHeaders(params = {}) {
  const timestamp = Date.now();
  const traceId = randomUUID().replace(/-/g, "").toLowerCase();
  const deviceId = randomUUID().replace(/-/g, "").toLowerCase();
  const platformId = 30;
  const appVersion = "5.3.5";
  const antiDeviceId = "";

  return {
    "X-Requested-With": "XMLHttpRequest",
    Origin: "https://bingx.com",
    Referer: "https://bingx.com/en/wealth/earn",
    platformId: String(platformId),
    appSiteId: "0",
    channel: "official",
    reg_channel: "official",
    app_version: appVersion,
    device_id: deviceId,
    lang: "en-001",
    appId: "30004",
    mainAppId: "10009",
    timeZone: "9",
    device_brand: "Windows_Chrome_124.0",
    antiDeviceId,
    traceId,
    timestamp: String(timestamp),
    sign: bingxApiSign({
      timestamp,
      traceId,
      deviceId,
      platformId,
      appVersion,
      antiDeviceId,
      requestPayload: params,
    }),
  };
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
        if (item.financialState !== 2) continue;
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

function parseLbankTierDetails(item) {
  const directTiers = item.referAprDetail
    ?.flatMap((detail) => detail.tieredRate ?? [])
    .map((tier) => ({
      min: toNumber(tier.minAmount),
      max: toNumber(tier.maxAmount),
      apy: parseAprString(tier.interestRate),
    }))
    .filter((tier) => tier.apy != null);

  if (directTiers?.length) return directTiers;

  try {
    return JSON.parse(item.normalTieredRateCfg ?? "[]")
      .map((tier) => ({
        min: toNumber(tier.minAmount),
        max: toNumber(tier.maxAmount),
        apy: parseAprString(tier.interestRate),
      }))
      .filter((tier) => tier.apy != null);
  } catch {
    return [];
  }
}

export async function fetchLbank() {
  const products = [];
  const errors = [];
  const flexibleUrl = "https://www.lbank.com/flexible-list";
  const lockedUrl = "https://www.lbank.com/locking-list";

  try {
    const html = await fetchSiteText(flexibleUrl);
    const items = extractFlightArray(html, "flexibleListData");

    for (const item of items) {
      const asset = (item.assetCode || item.name || "").toUpperCase();
      if (!isStableCoin(asset)) continue;
      if (item.status && item.status !== "STARTED") continue;
      if (item.isShow === false) continue;

      const tiers = parseLbankTierDetails(item);
      const fallbackMin = parseAprString(item.minApr ?? item.minAprStr);
      const fallbackMax = parseAprString(item.maxApr ?? item.maxAprStr ?? item.predictYearRate);
      const { apyMin, apyMax } = apyRangeFromTiers(tiers, fallbackMin, fallbackMax);
      if (apyMax == null || apyMax <= 0) continue;

      products.push(
        product({
          exchange: "LBank",
          asset,
          productType: "flexible",
          duration: "Flexible",
          durationDays: 0,
          apy: apyMax,
          apyMin,
          apyMax,
          tierDetails: tiers.length ? tiers : null,
          minAmount: item.leastTake ?? tiers[0]?.min ?? null,
          maxAmount: item.limitAmt ?? item.investmentLimit ?? null,
          note: "LBank Spot Earn flexible; tiered APR may apply",
          source: "site:lbank-spot-earn",
          sourceId: `spot-${item.id ?? asset}`,
          sourceUrl: flexibleUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(`flexible: ${err.message}`);
  }

  try {
    const html = await fetchSiteText(lockedUrl);
    const items = extractFlightArray(html, "lockingProductList");

    for (const item of items) {
      const asset = (item.assetCode || "").toUpperCase();
      if (!isStableCoin(asset)) continue;

      for (const group of Object.values(item.products ?? {})) {
        for (const locked of group ?? []) {
          if (locked.status != null && locked.status !== 1) continue;
          const apy = parseAprString(locked.interestRate);
          if (apy == null || apy <= 0) continue;

          const duration = locked.lockDays ?? locked.duration?.[0]?.period ?? null;
          const vipNote = locked.minVipLevel ? `; VIP ${locked.minVipLevel}+` : "";

          products.push(
            product({
              exchange: "LBank",
              asset,
              productType: "locked",
              duration: duration ? `${duration} days` : "Locked",
              durationDays: duration,
              apy,
              apyMin: apy,
              apyMax: apy,
              minAmount: locked.low ?? null,
              maxAmount: locked.remain ?? null,
              note: `LBank Locked Earn${vipNote}`,
              source: "site:lbank-locked-earn",
              sourceId: `locked-${locked.id ?? `${asset}-${duration ?? "term"}`}`,
              sourceUrl: lockedUrl,
            }),
          );
        }
      }
    }
  } catch (err) {
    errors.push(`locked: ${err.message}`);
  }

  return {
    exchange: "LBank",
    products: uniqBy(products, (p) => p.id),
    errors,
  };
}

function bingxTierDetails(item) {
  return (item.tieredApyRule?.rules ?? [])
    .map((tier) => ({
      min: toNumber(tier.low),
      max: toNumber(tier.high),
      apy: parseAprString(tier.apy),
    }))
    .filter((tier) => tier.apy != null);
}

function bingxProductType(item, tagLabels) {
  if (tagLabels.some((tag) => /new user|vip|limited time/i.test(tag))) {
    return "promo";
  }
  if (item.productType === 2 || Number(item.duration) === -1) return "flexible";
  if (item.productType === 1) return "locked";
  return null;
}

export async function fetchBingx() {
  const sourceUrl = "https://bingx.com/en/wealth/earn";
  const endpoint = "https://api-app.qq-os.com/api/wealth-sales-trading/v1/product/list";
  const products = [];
  const errors = [];

  try {
    const data = await fetchSiteJson(endpoint, {
      headers: bingxApiHeaders(),
    });
    if (data.code !== 0 || !Array.isArray(data.data?.result)) {
      throw new Error(`Invalid BingX product response: ${data.msg ?? data.code}`);
    }

    for (const group of data.data.result) {
      const asset = String(group.assetName ?? "").toUpperCase();
      if (!isStableCoin(asset)) continue;

      for (const item of group.products ?? []) {
        if (item.soldOut) continue;

        const tagLabels = (item.tags ?? [])
          .map((tag) => tag.tagDesc)
          .filter(Boolean);
        const normalizedType = bingxProductType(item, tagLabels);
        if (!normalizedType) continue;

        const rawDuration = Number(item.duration);
        const flexible = item.productType === 2 || rawDuration === -1;
        const durationDays = flexible ? 0 : Number.isFinite(rawDuration) ? rawDuration : null;
        const tiers = bingxTierDetails(item);
        const fallbackApy = parseAprString(item.apy);
        const { apyMin, apyMax } = apyRangeFromTiers(tiers, fallbackApy, fallbackApy);
        if (apyMax == null || apyMax <= 0) continue;

        const redeemNote = item.allowRedeem ? "; redeem anytime" : "";
        const tagNote = tagLabels.length ? `; ${tagLabels.join(", ")}` : "";

        products.push(
          product({
            exchange: "BingX",
            asset,
            productType: normalizedType,
            duration: flexible ? "Flexible" : `${durationDays} days`,
            durationDays,
            apy: apyMax,
            apyMin,
            apyMax,
            tierDetails: tiers.length ? tiers : null,
            note: `BingX Earn${tagNote}${redeemNote}`,
            source: "site:bingx-earn",
            sourceId: `earn-${item.productId ?? `${asset}-${item.productType}-${item.duration}`}`,
            sourceUrl,
          }),
        );
      }
    }
  } catch (err) {
    errors.push(err.message);
  }

  return {
    exchange: "BingX",
    products: uniqBy(products, (p) => p.id),
    errors,
  };
}
