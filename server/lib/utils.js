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
  "USDS",
  "USD",
  "USDGO",
  "USDG",
  "USDP",
  "APXUSD",
  "QCAD",
  "U",
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

const PROMO_TAGS = {
  promo: "promo",
  flexible: "flexible",
  locked: "locked",
  fixed: "fixed",
  onchain: "onchain",
};

const TAG_PATTERNS = [
  {
    pattern: /\bnew users?\b|\bnewly registered users?\b|\bfirst[-\s]?time users?\b|\bnewbie\b|\bwelcome\b/i,
    typeTags: ["new-user"],
    eligibilityTags: ["new-user-only"],
  },
  {
    pattern:
      /\bnew deposit\b|\bfirst deposit\b|\bnet deposit\b|\bdeposit\s*&\s*earn\b|\bnever deposited\b|\bnew crypto deposit\b|\bnew p2p buy\b|\bnew fiat deposit\b/i,
    typeTags: ["new-deposit", "new-user"],
    eligibilityTags: ["new-deposit-only"],
  },
  {
    pattern:
      /\bfirst subscription\b|\bnew simple earn\b|\bhad not used simple earn\b|\bnever subscribed\b|\bnot used simple earn\b/i,
    typeTags: ["new-subscription", "new-user"],
    eligibilityTags: ["new-subscription-only"],
  },
  {
    pattern: /\bkyc\b|\bidentity verification\b|\bverified users?\b/i,
    typeTags: ["kyc-required"],
    eligibilityTags: ["kyc-required"],
  },
  {
    pattern: /\bvip\b/i,
    typeTags: ["vip"],
    eligibilityTags: ["vip-only"],
  },
  {
    pattern:
      /\bregion\b|\bcountries\b|\bcis\b|\bee[a]?\b|\beuropean economic area\b|\bukraine excluded\b|\bnot available to users in\b/i,
    typeTags: ["region-restricted"],
    eligibilityTags: ["region-restricted"],
  },
];

function normalizeTags(tags) {
  return Array.from(new Set((tags ?? []).filter(Boolean).map(String)));
}

function inferProductTags({ productType, note, eligibility }) {
  const typeTags = [];
  const eligibilityTags = [];
  const primary = PROMO_TAGS[String(productType ?? "").toLowerCase()];
  if (primary) typeTags.push(primary);

  const text = [
    note,
    eligibility?.label,
    eligibility?.summary,
    ...(Array.isArray(eligibility?.requirements) ? eligibility.requirements : []),
  ]
    .filter(Boolean)
    .join(" ");

  for (const rule of TAG_PATTERNS) {
    if (!rule.pattern.test(text)) continue;
    typeTags.push(...rule.typeTags);
    eligibilityTags.push(...rule.eligibilityTags);
  }

  return {
    typeTags,
    eligibilityTags,
  };
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
  typeTags,
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
  const inferredTags = inferProductTags({ productType, note, eligibility });
  const normalizedEligibilityTags = normalizeTags([
    ...inferredTags.eligibilityTags,
    ...(eligibilityTags ?? []),
  ]);
  const normalizedTypeTags = normalizeTags([...inferredTags.typeTags, ...(typeTags ?? [])]);
  return {
    id: makeId(exchange, asset, productType, durationLabel, sourceId),
    exchange,
    asset: String(asset).toUpperCase(),
    productType,
    typeTags: normalizedTypeTags,
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
