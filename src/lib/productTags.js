export const TYPE_TAG_LABELS = {
  flexible: "Flexible",
  locked: "Locked",
  fixed: "Fixed",
  promo: "Promo",
  onchain: "On-chain",
  "new-user": "New User",
  "new-user-only": "New User",
  "new-deposit": "New Deposit",
  "new-deposit-only": "New Deposit",
  "new-subscription": "New Subscription",
  "new-subscription-only": "New Subscription",
  "kyc-required": "KYC",
  "region-restricted": "Region",
  "vip": "VIP",
  "vip-only": "VIP",
  restricted: "Restricted",
};

const TYPE_TAG_ORDER = [
  "flexible",
  "locked",
  "fixed",
  "onchain",
  "promo",
  "new-user",
  "new-deposit",
  "new-subscription",
  "kyc-required",
  "region-restricted",
  "vip",
  "restricted",
];

export function normalizeTag(tag) {
  return String(tag ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function tagClassName(tag) {
  return normalizeTag(tag) || "earn";
}

function titleize(value) {
  return String(value ?? "earn")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getTagLabel(tag) {
  const normalized = normalizeTag(tag);
  return TYPE_TAG_LABELS[normalized] ?? titleize(normalized);
}

export function getProductTypeBadges(product) {
  const primaryTag = normalizeTag(product?.productType) || "earn";
  const badges = [
    {
      key: `type:${primaryTag}`,
      tag: primaryTag,
      label: getTagLabel(primaryTag),
      primary: true,
    },
  ];
  const seen = new Set([primaryTag]);

  for (const rawTag of product?.typeTags ?? []) {
    const tag = normalizeTag(rawTag);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    badges.push({
      key: `tag:${tag}`,
      tag,
      label: getTagLabel(tag),
      primary: false,
    });
  }

  return badges;
}

export function productHasAnyTag(product, tags) {
  const wanted = new Set(tags.map(normalizeTag).filter(Boolean));
  const values = [
    product?.productType,
    ...(Array.isArray(product?.typeTags) ? product.typeTags : []),
    ...(Array.isArray(product?.eligibilityTags) ? product.eligibilityTags : []),
  ].map(normalizeTag);

  return values.some((value) => wanted.has(value));
}

export function productMatchesTypeTag(product, tag) {
  const normalized = normalizeTag(tag);
  if (!normalized || normalized === "all") return true;
  if (normalized === "restricted") return Boolean(product?.restricted);
  return productHasAnyTag(product, [normalized]);
}

export function getProductTypeFilterOptions(products) {
  const options = new Map();

  for (const product of products ?? []) {
    for (const badge of getProductTypeBadges(product)) {
      if (!badge.tag) continue;
      options.set(badge.tag, { tag: badge.tag, label: badge.label });
    }

    if (product?.restricted) {
      options.set("restricted", {
        tag: "restricted",
        label: getTagLabel("restricted"),
      });
    }
  }

  return [...options.values()].sort((a, b) => {
    const ai = TYPE_TAG_ORDER.indexOf(a.tag);
    const bi = TYPE_TAG_ORDER.indexOf(b.tag);
    const ar = ai === -1 ? TYPE_TAG_ORDER.length : ai;
    const br = bi === -1 ? TYPE_TAG_ORDER.length : bi;
    if (ar !== br) return ar - br;
    return a.label.localeCompare(b.label);
  });
}
