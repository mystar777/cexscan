import { STABLE_COINS } from "../config.js";
import { isStableCoin, parseAprString, product } from "./utils.js";

const STABLE_REGEX = new RegExp(`\\b(${STABLE_COINS.join("|")}|USDD)\\b`, "gi");

const EARN_KEYWORDS =
  /\b(earn|saving|savings|staking|simple earn|flexible|hold\s*&\s*earn|yield arena|lend|deposit reward|hodler airdrop|hold and earn|double dip|bonus tiered apr)\b/i;

const APY_REGEX =
  /(?:up\s+to\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:apr|apy)|(?:earn|enjoy|receive)\s+(?:up\s+to\s+)?(\d+(?:\.\d+)?)\s*%|(?:apr|apy)\s*(?:of\s+)?(?:up\s+to\s+)?(\d+(?:\.\d+)?)\s*%/gi;

const PROMO_RE =
  /\b(promo|promotion|campaign|special offer|bonus|reward|double dip|exclusive|deposit\s*&\s*earn|subscribe(?:rs)?\s+to\s+earn|tiered apr)\b/i;
const NEW_DEPOSIT_RE =
  /\b(?:new|first|never|eligible)[^.]{0,120}\b(?:deposit|deposited|buy|purchase|p2p|fiat)\b|\b(?:deposit|deposited|buy|purchase)[^.]{0,120}\b(?:for the first time|first deposit|new users?)\b|\bnever[^.]{0,80}\bdeposited\b|\bfirst deposit\b|\bnew crypto deposit users?\b|\bnew p2p buy users?\b|\bnew fiat deposit\b|\bdeposit\s*&\s*earn\b/i;
const NEW_USER_RE =
  /\bnew(?:ly)?[-\s]?registered users?\b|\bnew users?\b|\bfirst[-\s]?time users?\b|\bnewbie\b|\bwelcome\b|\bnew eligible users?\b/i;
const NEW_SUBSCRIPTION_RE =
  /\bfirst subscription\b|\bnew simple earn\b|\bhad not used simple earn\b|\bnever subscribed\b|\bnot used simple earn\b/i;
const KYC_RE = /\b(identity verification|kyc|verified users?)\b/i;
const REGION_RE =
  /\b(not available to users in|region|countries|cis|eea|european economic area|ukraine excluded)\b/i;
const VIP_RE = /\bvip\b/i;

const BINANCE_CIS_USDT_ELIGIBILITY = {
  label: "CIS-region Binance promo",
  summary:
    "Restricted to CIS users outside Ukraine who completed KYC and had not used Simple Earn Flexible before Jun 18, 2026.",
  requirements: [
    "CIS region users only",
    "Ukraine excluded",
    "KYC completed",
    "No Simple Earn Flexible usage before Jun 18, 2026",
  ],
};

/**
 * @param {string} exchange
 * @param {{ title: string, description?: string, url?: string, publishedAt?: string }[]} announcements
 */
export function parseAnnouncementProducts(exchange, announcements) {
  const results = [];
  const seen = new Set();

  for (const ann of announcements) {
    const title = ann.title || "";
    const body = ann.description || "";
    const text = `${title} ${body}`;

    if (!EARN_KEYWORDS.test(text)) continue;

    const assets = [
      ...new Set(
        [...text.matchAll(STABLE_REGEX)]
          .map((m) => m[1].toUpperCase())
          .filter(isStableCoin),
      ),
    ];
    if (!assets.length) continue;

    const apyValues = extractApyValues(text);
    if (!apyValues.length) continue;

    const duration = parseDuration(text);
    const durationDays = duration.days;
    const durationLabel = duration.label;

    for (const asset of assets) {
      const apy = pickApyForAsset(text, asset, apyValues);
      if (apy == null || apy <= 0) continue;

      const offer = classifyOfferDetails(exchange, ann, asset, apy, duration);
      const productType =
        offer.productType ??
        (offer.typeTags.includes("promo") || offer.eligibilityTags.length
          ? "promo"
          : durationDays === 0
            ? "flexible"
            : "promo");
      const typeTags = productType === "promo" ? ["promo", ...offer.typeTags] : offer.typeTags;
      const key = `${exchange}:${asset}:${productType}:${durationLabel}:${apy}:${[...typeTags]
        .sort()
        .join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const shortTitle = title.length > 80 ? `${title.slice(0, 77)}...` : title;

      results.push(
        product({
          exchange,
          asset,
          productType,
          typeTags,
          duration: durationLabel,
          durationDays,
          apy,
          apyMin: apy,
          apyMax: apy,
          note: shortTitle,
          source: "announcement",
          sourceId: offer.sourceId ?? null,
          announcementUrl: ann.url || null,
          publishedAt: ann.publishedAt || null,
          eligibility: offer.eligibility ?? null,
          eligibilityTags: offer.eligibilityTags,
          restricted: Boolean(offer.eligibility || offer.eligibilityTags.length),
        }),
      );
    }
  }

  return results;
}

function classifyOfferDetails(exchange, ann, asset, apy, duration) {
  const text = `${ann.title || ""} ${ann.description || ""}`;
  const typeTags = new Set();
  const eligibilityTags = new Set();
  const specialOffer = getSpecialOfferDetails(exchange, ann, asset, apy);

  if (PROMO_RE.test(text) || duration.label === "Promo") typeTags.add("promo");
  if (NEW_DEPOSIT_RE.test(text)) {
    typeTags.add("new-deposit");
    typeTags.add("new-user");
    eligibilityTags.add("new-deposit-only");
  }
  if (NEW_USER_RE.test(text)) {
    typeTags.add("new-user");
    eligibilityTags.add("new-user-only");
  }
  if (NEW_SUBSCRIPTION_RE.test(text)) {
    typeTags.add("new-subscription");
    typeTags.add("new-user");
    eligibilityTags.add("new-subscription-only");
  }
  if (KYC_RE.test(text)) {
    typeTags.add("kyc-required");
    eligibilityTags.add("kyc-required");
  }
  if (REGION_RE.test(text)) {
    typeTags.add("region-restricted");
    eligibilityTags.add("region-restricted");
  }
  if (VIP_RE.test(text)) {
    typeTags.add("vip");
    eligibilityTags.add("vip-only");
  }

  if (specialOffer) {
    for (const tag of specialOffer.typeTags ?? []) typeTags.add(tag);
    for (const tag of specialOffer.eligibilityTags ?? []) eligibilityTags.add(tag);
  }

  const eligibility =
    specialOffer?.eligibility ?? buildEligibilitySummary(typeTags, eligibilityTags);

  return {
    productType:
      specialOffer?.productType ??
      (typeTags.has("promo") || eligibilityTags.size ? "promo" : null),
    typeTags: [...typeTags],
    eligibility,
    eligibilityTags: [...eligibilityTags],
    sourceId: specialOffer?.sourceId ?? getAnnouncementCode(ann.url),
  };
}

function buildEligibilitySummary(typeTags, eligibilityTags) {
  if (!eligibilityTags.size) return null;

  const requirements = [];
  if (typeTags.has("new-deposit")) {
    requirements.push("Eligible first deposit or first crypto purchase required");
  }
  if (typeTags.has("new-user")) {
    requirements.push("New or newly registered users only");
  }
  if (typeTags.has("new-subscription")) {
    requirements.push("First Simple Earn or product subscription required");
  }
  if (typeTags.has("kyc-required")) requirements.push("Identity verification required");
  if (typeTags.has("region-restricted")) requirements.push("Regional restrictions apply");
  if (typeTags.has("vip")) requirements.push("VIP eligibility required");

  const label = typeTags.has("new-deposit")
    ? "New deposit promo"
    : typeTags.has("new-user")
      ? "New user promo"
      : typeTags.has("new-subscription")
        ? "New subscription promo"
        : "Restricted promo";

  return {
    label,
    summary: requirements.join("; "),
    requirements,
  };
}

function getSpecialOfferDetails(exchange, ann, asset, apy) {
  const text = `${ann.title || ""} ${ann.description || ""}`;
  const isBinanceCisUsdt =
    exchange === "Binance" &&
    asset === "USDT" &&
    apy >= 34.99 &&
    apy <= 35.01 &&
    /cis\s+exclusive/i.test(text) &&
    /simple\s+earn/i.test(text);

  if (!isBinanceCisUsdt) return null;

  return {
    productType: "promo",
    typeTags: ["promo", "new-user", "new-subscription", "kyc-required", "region-restricted"],
    sourceId: getAnnouncementCode(ann.url) || "binance-cis-usdt-simple-earn",
    eligibility: BINANCE_CIS_USDT_ELIGIBILITY,
    eligibilityTags: [
      "cis-region-only",
      "ukraine-excluded",
      "kyc-required",
      "new-simple-earn-flexible-user",
      "new-user-only",
      "new-subscription-only",
      "region-restricted",
    ],
  };
}

function getAnnouncementCode(url) {
  return url?.split("/").filter(Boolean).pop() ?? null;
}

function extractApyValues(text) {
  const values = [];
  for (const match of text.matchAll(APY_REGEX)) {
    const raw = match[1] || match[2] || match[3];
    const apy = parseAprString(raw);
    if (apy != null && apy > 0 && apy <= 500) values.push(apy);
  }
  return [...new Set(values)];
}

function pickApyForAsset(text, asset, apyValues) {
  const assetPattern = new RegExp(
    `${asset}[^.]{0,100}?(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:apr|apy)|(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:apr|apy)[^.]{0,100}?${asset}`,
    "i",
  );
  const near = text.match(assetPattern);
  if (near) {
    const apy = parseAprString(near[1] || near[2]);
    if (apy != null) return apy;
  }

  const onAsset = new RegExp(
    `(?:on|with|for)\\s+${asset}[^.]{0,80}?(\\d+(?:\\.\\d+)?)\\s*%`,
    "i",
  );
  const onMatch = text.match(onAsset);
  if (onMatch) {
    const apy = parseAprString(onMatch[1]);
    if (apy != null) return apy;
  }

  return Math.max(...apyValues);
}

function parseDuration(text) {
  const lower = text.toLowerCase();
  const dayMatch = lower.match(/(\d+)\s*[- ]?days?/);
  if (dayMatch && PROMO_RE.test(text)) {
    const days = parseInt(dayMatch[1], 10);
    return { label: `${days} days`, days };
  }
  if (/\bflexible\b|simple earn|flexible product/.test(lower)) {
    return { label: "Flexible", days: 0 };
  }
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return { label: `${days} days`, days };
  }
  if (/\blocked\b|fixed\s*term/.test(lower)) {
    return { label: "Locked", days: 30 };
  }
  return { label: "Promo", days: 0 };
}
