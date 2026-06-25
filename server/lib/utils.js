const STABLE_SET = new Set([
  "USDT",
  "USDTB",
  "USDC",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDE",
  "PYUSD",
  "BUSD",
  "USDD",
  "USD1",
  "USD",
  "USDGO",
  "USDG",
  "USDP",
  "APXUSD",
  "QCAD",
]);

export function isStableCoin(symbol) {
  if (!symbol) return false;
  const upper = String(symbol).toUpperCase();
  if (STABLE_SET.has(upper)) return true;
  return /^(USD|USDT|USDC|DAI|FDUSD|TUSD|BUSD)/.test(upper) && upper.length <= 6;
}

export function parseAprString(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value <= 1 ? value * 100 : value;
  const cleaned = String(value).replace(/%/g, "").trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Gate.io uni-lend: max_rate/min_rate are hourly decimals; simple annualized APY (%) */
export function hourlyToApy(hourlyRate) {
  const h = parseFloat(hourlyRate);
  if (!Number.isFinite(h)) return null;
  return h * 24 * 365;
}

export function makeId(exchange, asset, productType, duration, sourceId) {
  return `${exchange}:${asset}:${productType}:${duration}:${sourceId ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:-]+/g, "-");
}

export function product({
  exchange,
  asset,
  productType,
  duration,
  durationDays,
  apy,
  apyMin,
  apyMax,
  tierDetails,
  minAmount,
  maxAmount,
  note,
  source,
  sourceId,
  sourceUrl,
  announcementUrl,
  publishedAt,
  eligibility,
  eligibilityTags,
  restricted,
}) {
  const durationLabel = duration || (durationDays ? `${durationDays} days` : "Flexible");
  const normalizedEligibilityTags = Array.isArray(eligibilityTags)
    ? eligibilityTags.filter(Boolean)
    : [];
  return {
    id: makeId(exchange, asset, productType, durationLabel, sourceId),
    exchange,
    asset: String(asset).toUpperCase(),
    productType,
    duration: durationLabel,
    durationDays: durationDays ?? (productType === "flexible" ? 0 : null),
    apy: apy ?? apyMax ?? apyMin ?? 0,
    apyMin: apyMin ?? null,
    apyMax: apyMax ?? apy ?? null,
    tierDetails: tierDetails ?? null,
    minAmount: minAmount ?? null,
    maxAmount: maxAmount ?? null,
    note: note ?? null,
    source: source ?? "api",
    sourceId: sourceId ?? null,
    sourceUrl: sourceUrl ?? null,
    announcementUrl: announcementUrl ?? null,
    publishedAt: publishedAt ?? null,
    eligibility: eligibility ?? null,
    eligibilityTags: normalizedEligibilityTags,
    restricted: Boolean(restricted || eligibility || normalizedEligibilityTags.length),
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? 15000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "CEX-Staking-Dashboard/1.0",
        Accept: "application/json",
        ...options.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
