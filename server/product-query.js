const FILTER_KEYS = new Set([
  "exchange", "asset", "productType", "source", "minApy", "maxApy",
  "maxDurationDays", "sort", "limit",
]);
const SORTS = new Set(["apy_desc", "apy_asc", "exchange", "asset"]);

function singleValue(value, name) {
  if (Array.isArray(value) || (value !== undefined && typeof value !== "string")) {
    throw new Error(`${name} must be a single value`);
  }
  return value?.trim();
}

function numberValue(value, name, max) {
  if (value === undefined) return undefined;
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error(`${name} must be a non-negative number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed > max) throw new Error(`${name} exceeds the allowed range`);
  return parsed;
}

export function parseProductQuery(query) {
  for (const key of Object.keys(query)) {
    if (!FILTER_KEYS.has(key)) throw new Error(`Unknown filter: ${key}`);
  }
  const values = Object.fromEntries(
    [...FILTER_KEYS].map((key) => [key, singleValue(query[key], key)]),
  );
  const filters = {
    exchange: values.exchange?.toLowerCase(),
    asset: values.asset?.toUpperCase(),
    productType: values.productType?.toLowerCase(),
    source: values.source?.toLowerCase(),
    minApy: numberValue(values.minApy, "minApy", 1000),
    maxApy: numberValue(values.maxApy, "maxApy", 1000),
    maxDurationDays: numberValue(values.maxDurationDays, "maxDurationDays", 36500),
    sort: values.sort || "apy_desc",
    limit: values.limit === undefined ? 1000 : numberValue(values.limit, "limit", 1000),
  };
  if (!SORTS.has(filters.sort)) throw new Error("Invalid sort value");
  if (!Number.isInteger(filters.limit) || filters.limit < 1) {
    throw new Error("limit must be an integer between 1 and 1000");
  }
  if (filters.minApy !== undefined && filters.maxApy !== undefined && filters.minApy > filters.maxApy) {
    throw new Error("minApy cannot exceed maxApy");
  }
  return filters;
}

function apy(product) {
  return Number(product.apyMax ?? product.apy ?? 0);
}

export function selectProducts(products, filters) {
  const selected = products.filter((product) =>
    (!filters.exchange || product.exchange?.toLowerCase() === filters.exchange) &&
    (!filters.asset || product.asset?.toUpperCase() === filters.asset) &&
    (!filters.productType || product.productType?.toLowerCase() === filters.productType) &&
    (!filters.source || product.source?.toLowerCase() === filters.source) &&
    (filters.minApy === undefined || apy(product) >= filters.minApy) &&
    (filters.maxApy === undefined || apy(product) <= filters.maxApy) &&
    (filters.maxDurationDays === undefined || Number(product.durationDays) <= filters.maxDurationDays)
  );
  selected.sort((a, b) => {
    if (filters.sort === "apy_asc") return apy(a) - apy(b) || a.id.localeCompare(b.id);
    if (filters.sort === "exchange") return a.exchange.localeCompare(b.exchange) || a.id.localeCompare(b.id);
    if (filters.sort === "asset") return a.asset.localeCompare(b.asset) || a.id.localeCompare(b.id);
    return apy(b) - apy(a) || a.id.localeCompare(b.id);
  });
  return { total: selected.length, products: selected.slice(0, filters.limit) };
}
