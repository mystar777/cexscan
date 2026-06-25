import { STABLE_COINS } from "../config.js";
import { isStableCoin, parseAprString, product } from "./utils.js";

const STABLE_REGEX = new RegExp(
  `\\b(${STABLE_COINS.join("|")}|USDD)\\b`,
  "gi",
);

const EARN_KEYWORDS =
  /\b(earn|saving|savings|staking|simple earn|flexible|hold\s*&\s*earn|yield arena|lend|deposit reward|hodler airdrop|hold and earn)\b/i;

const APY_REGEX =
  /(?:up\s+to\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:apr|apy)|(?:earn|enjoy|receive)\s+(?:up\s+to\s+)?(\d+(?:\.\d+)?)\s*%|(?:apr|apy)\s*(?:of\s+)?(?:up\s+to\s+)?(\d+(?:\.\d+)?)\s*%/gi;

const DURATION_REGEX =
  /\b(\d+)\s*[- ]?days?\b|flexible|locked|fixed\s*term/i;

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

      const specialOffer = getSpecialOfferDetails(exchange, ann, asset, apy);

      const key = `${exchange}:${asset}:${durationLabel}:${apy}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const shortTitle =
        title.length > 80 ? `${title.slice(0, 77)}…` : title;

      results.push(
        product({
          exchange,
          asset,
          productType: specialOffer?.productType ?? (durationDays === 0 ? "flexible" : "promo"),
          duration: durationLabel,
          durationDays,
          apy,
          apyMin: apy,
          apyMax: apy,
          note: shortTitle,
          source: "announcement",
          sourceId: specialOffer?.sourceId ?? null,
          announcementUrl: ann.url || null,
          publishedAt: ann.publishedAt || null,
          eligibility: specialOffer?.eligibility ?? null,
          eligibilityTags: specialOffer?.eligibilityTags ?? [],
          restricted: Boolean(specialOffer),
        }),
      );
    }
  }

  return results;
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

  const urlCode = ann.url?.split("/").filter(Boolean).pop();
  return {
    productType: "promo",
    sourceId: urlCode || "binance-cis-usdt-simple-earn",
    eligibility: BINANCE_CIS_USDT_ELIGIBILITY,
    eligibilityTags: [
      "cis-region-only",
      "ukraine-excluded",
      "kyc-required",
      "new-simple-earn-flexible-user",
    ],
  };
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
    `${asset}[^.]{0,80}?(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:apr|apy)|(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:apr|apy)[^.]{0,80}?${asset}`,
    "i",
  );
  const near = text.match(assetPattern);
  if (near) {
    const apy = parseAprString(near[1] || near[2]);
    if (apy != null) return apy;
  }

  const onAsset = new RegExp(
    `(?:on|with|for)\\s+${asset}[^.]{0,60}?(\\d+(?:\\.\\d+)?)\\s*%`,
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
  if (/\bflexible\b|simple earn|flexible product/.test(lower)) {
    return { label: "Flexible", days: 0 };
  }
  const dayMatch = lower.match(/(\d+)\s*[- ]?days?/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return { label: `${days} days`, days };
  }
  if (/\blocked\b|fixed\s*term/.test(lower)) {
    return { label: "Locked", days: 30 };
  }
  return { label: "Promo", days: 0 };
}
