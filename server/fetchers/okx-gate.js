import { isStableCoin, parseAprString, product, fetchJson } from "../lib/utils.js";
import { fetchSiteText, stripHtml } from "../lib/site-utils.js";

export async function fetchOkx() {
  const results = [];
  const errors = [];
  const sourceUrl = "https://www.okx.com/earn/simple-earn";

  try {
    const data = await fetchJson(
      "https://www.okx.com/api/v5/finance/savings/lending-rate-summary",
    );
    if (data.code !== "0") {
      return { exchange: "OKX", products: [], errors: [data.msg] };
    }

    for (const item of data.data ?? []) {
      if (!isStableCoin(item.ccy)) continue;
      const rate = parseFloat(item.estRate ?? item.avgRate);
      if (!Number.isFinite(rate)) continue;

      results.push(
        product({
          exchange: "OKX",
          asset: item.ccy,
          productType: "flexible",
          duration: "Flexible",
          durationDays: 0,
          apy: rate * 100,
          apyMin: rate * 100,
          apyMax: rate * 100,
          source: "okx:flexible-savings",
          sourceUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(err.message);
  }

  try {
    const data = await fetchJson(
      "https://www.okx.com/priapi/v1/earn/simple-earn/all-products",
      {
        headers: {
          Referer: sourceUrl,
        },
      },
    );
    if (data.code !== 0 || !data.data) {
      throw new Error(data.msg || "Invalid OKX Simple Earn response");
    }

    const currencies = [
      ...(data.data.flexibleProducts?.currencies ?? []),
      ...(data.data.fixedProducts?.currencies ?? []),
    ];

    for (const currency of currencies) {
      const asset = String(currency.investCurrency?.currencyName ?? "").toUpperCase();
      if (!isStableCoin(asset)) continue;

      for (const item of currency.products ?? []) {
        if (item.purchaseStatus != null && Number(item.purchaseStatus) !== 1) continue;

        const apys = (item.rate?.rateNum?.value ?? [])
          .map((value) => parseAprString(value))
          .filter((value) => value != null && value > 0);
        if (!apys.length) continue;

        const apyMin = Math.min(...apys);
        const apyMax = Math.max(...apys);
        const productsType = Number(item.productsType);
        const fixed = productsType === 66;
        const promo = /new users?/i.test(item.bonusDescription ?? "");
        const days = fixed ? Number(item.term?.value) : 0;

        results.push(
          product({
            exchange: "OKX",
            asset,
            productType: promo ? "promo" : fixed ? "locked" : "flexible",
            duration: fixed && Number.isFinite(days) ? `${days} days` : "Flexible",
            durationDays: fixed && Number.isFinite(days) ? days : 0,
            apy: apyMax,
            apyMin,
            apyMax,
            note: `OKX Simple Earn${item.bonusDescription ? `; ${item.bonusDescription}` : ""}`,
            source: "site:okx-simple-earn",
            sourceId: `simple-${asset}-${item.productsType}-${item.type}`,
            sourceUrl,
          }),
        );
      }
    }
  } catch (err) {
    errors.push(`simple earn: ${err.message}`);
  }

  try {
    const html = await fetchSiteText(sourceUrl);
    const text = stripHtml(html);
    const rowRe =
      /\b([A-Z0-9]+)\b\s+([0-9]+(?:\.[0-9]+)?)%\s+(Flexible\/Fixed|Flexible|Fixed)/g;

    for (const match of text.matchAll(rowRe)) {
      const asset = match[1].toUpperCase();
      if (!isStableCoin(asset)) continue;
      if (
        results.some(
          (item) =>
            item.source === "site:okx-simple-earn" &&
            item.productType === "promo" &&
            item.asset === asset,
        )
      ) {
        continue;
      }

      const apy = parseAprString(match[2]);
      if (apy == null || apy <= 0) continue;
      const duration = match[3];

      results.push(
        product({
          exchange: "OKX",
          asset,
          productType: "promo",
          duration,
          durationDays: duration === "Flexible" ? 0 : null,
          apy,
          apyMin: apy,
          apyMax: apy,
          note: "OKX Simple Earn public table; bonus APR may apply",
          source: "site:okx-simple-earn",
          sourceId: `simple-table-${asset}-${duration}`,
          sourceUrl,
        }),
      );
    }
  } catch (err) {
    errors.push(`simple earn page: ${err.message}`);
  }

  return { exchange: "OKX", products: results, errors };
}

export async function fetchGate() {
  const results = [];
  const errors = [];

  try {
    const market = await fetchGateSimpleEarnMarket();

    for (const item of market) {
      if (!isStableCoin(item.asset)) continue;
      results.push(...buildGateProducts(item));
    }
  } catch (err) {
    errors.push(err.message);
  }

  return { exchange: "Gate.io", products: results, errors };
}

const GATE_SIMPLE_EARN_URL = "https://www.gate.com/simple-earn";
const GATE_MARKET_URL = "https://www.gate.com/apiw/v2/uni-loan/earn/market/list";
const GATE_PAGE_LIMIT = 200;
const GATE_BUSINESS_FIXED = 1;
const GATE_FIXED_SUBSCRIBE_ABLE = 1;
const GATE_PRODUCT_NORMAL = 1;

async function fetchGateSimpleEarnMarket() {
  const rows = [];

  for (let page = 1; page <= 10; page++) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(GATE_PAGE_LIMIT),
      have_balance: "2",
      have_award: "0",
      is_subscribed: "0",
      sort_business: "1",
      search_type: "0",
    });
    const data = await fetchJson(`${GATE_MARKET_URL}?${params}`, {
      headers: {
        Referer: GATE_SIMPLE_EARN_URL,
      },
    });
    if (data?.code !== 0 || !Array.isArray(data?.data?.list)) {
      throw new Error(data?.message || "Gate Simple Earn market response is invalid");
    }

    rows.push(...data.data.list);
    const total = Number(data.data.total ?? 0);
    if (data.data.list.length < GATE_PAGE_LIMIT || rows.length >= total) break;
  }

  return rows;
}

function buildGateProducts(item) {
  return [
    buildGateFlexibleProduct(item),
    ...buildGateFixedProducts(item),
  ].filter(Boolean);
}

function buildGateFlexibleProduct(item) {
  if (Number(item.business_type) === GATE_BUSINESS_FIXED) return null;

  const baseApy = parseGateAnnualRate(item.next_time_rate_year ?? item.year_rate);
  const apyMax = Math.max(
    parseGateAnnualRate(item.max_year_rate) ?? 0,
    parseGateAnnualRate(item.year_rate) ?? 0,
    baseApy ?? 0,
  );
  if (!Number.isFinite(apyMax) || apyMax <= 0) return null;

  const tierDetails = buildGateFlexibleTiers(item, baseApy, apyMax);
  const noteParts = ["Gate Simple Earn Flexible"];
  if (item.award_asset && parseGateAnnualRate(item.ext_award_rate_year) > 0) {
    noteParts.push(`includes ${item.award_asset} bonus APR`);
  }

  return product({
    exchange: "Gate.io",
    asset: item.asset,
    productType: "flexible",
    duration: "Flexible",
    durationDays: 0,
    apy: apyMax,
    apyMin: parseGateAnnualRate(item.min_lend_rate_year ?? item.next_time_rate_year),
    apyMax,
    tierDetails,
    note: noteParts.join("; "),
    source: "site:gate-simple-earn",
    sourceId: `simple-flex-${item.asset}`,
    sourceUrl: GATE_SIMPLE_EARN_URL,
  });
}

function buildGateFixedProducts(item) {
  if (!Array.isArray(item.fixed_list)) return [];

  return item.fixed_list
    .filter((fixed) => {
      return (
        Number(fixed.sale_status) === GATE_FIXED_SUBSCRIBE_ABLE &&
        String(fixed.show_page ?? "1") === "1"
      );
    })
    .map((fixed) => {
      const apyMax = parseGateAnnualRate(fixed.max_year_rate ?? fixed.year_rate);
      const apyMin = parseGateAnnualRate(fixed.min_lend_rate_year || fixed.year_rate);
      if (!Number.isFinite(apyMax) || apyMax <= 0) return null;

      const days = Number(fixed.lock_up_period);
      const productType = Number(fixed.type) === GATE_PRODUCT_NORMAL ? "locked" : "promo";
      const note = buildGateFixedNote(fixed);
      const eligibility = getGateFixedEligibility(fixed);

      return product({
        exchange: "Gate.io",
        asset: fixed.asset || item.asset,
        productType,
        duration: Number.isFinite(days) && days > 0 ? `${days} days` : "Fixed",
        durationDays: Number.isFinite(days) && days > 0 ? days : null,
        apy: apyMax,
        apyMin,
        apyMax,
        minAmount: fixed.min_lend_amount || null,
        maxAmount: normalizePositiveAmount(fixed.user_max_lend_volume),
        note,
        source: "site:gate-simple-earn",
        sourceId: `simple-fixed-${fixed.id}`,
        sourceUrl: GATE_SIMPLE_EARN_URL,
        eligibility: eligibility?.details ?? null,
        eligibilityTags: eligibility?.tags ?? [],
        restricted: Boolean(eligibility),
      });
    })
    .filter(Boolean);
}

function buildGateFlexibleTiers(item, baseApy, apyMax) {
  if (!Array.isArray(item.ladder_apr) || !item.ladder_apr.length) return null;

  const tiers = item.ladder_apr
    .map((tier) => {
      const min = Number(tier.left ?? 0);
      const max = normalizePositiveAmount(tier.right);
      const bonusApy = parseGateAnnualRate(tier.apr);
      if (!Number.isFinite(bonusApy)) return null;
      return {
        min: Number.isFinite(min) ? min : 0,
        max,
        apy: (baseApy ?? 0) + bonusApy,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.min - b.min);

  if (!tiers.length) return null;

  const highestMax = tiers
    .map((tier) => tier.max)
    .filter((max) => Number.isFinite(max))
    .sort((a, b) => b - a)[0];
  if (Number.isFinite(highestMax) && Number.isFinite(baseApy) && baseApy > 0) {
    tiers.push({ min: highestMax, max: null, apy: baseApy });
  }

  const bestTierApy = Math.max(...tiers.map((tier) => tier.apy));
  if (Number.isFinite(apyMax) && apyMax > bestTierApy) {
    tiers[0].apy = apyMax;
  }

  return tiers;
}

function buildGateFixedNote(fixed) {
  const parts = ["Gate Simple Earn Fixed"];
  if (fixed.title) parts.push(fixed.title);
  if (fixed.subtitle) parts.push(fixed.subtitle);
  if (Number(fixed.min_vip) > 0 || Number(fixed.max_vip) > 0) {
    parts.push(`VIP ${fixed.min_vip}-${fixed.max_vip} only`);
  }
  if (fixed.bonus_type) parts.push("bonus APR may apply");
  return parts.join("; ");
}

function getGateFixedEligibility(fixed) {
  const requirements = [];
  const text = `${fixed.title || ""} ${fixed.subtitle || ""}`;

  if (/net\s+deposit/i.test(text) && fixed.subtitle) {
    requirements.push(fixed.subtitle);
  }
  if (/white\s*list|whitelist/i.test(text)) {
    requirements.push("Whitelist eligibility may be required");
  }

  if (!requirements.length) return null;

  return {
    details: {
      label: "Gate Simple Earn special conditions",
      summary: requirements.join("; "),
      requirements,
    },
    tags: ["special-conditions"],
  };
}

function parseGateAnnualRate(value) {
  if (value == null || value === "") return null;
  const rate = Number(value);
  if (!Number.isFinite(rate)) return null;
  return rate <= 1 ? rate * 100 : rate;
}

function normalizePositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
