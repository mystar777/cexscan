import { isStableCoin, parseAprString, product, fetchJson } from "../lib/utils.js";

export async function fetchBybit() {
  const results = [];
  const errors = [];

  for (const category of ["FlexibleSaving", "OnChain"]) {
    try {
      const data = await fetchJson(
        `https://api.bybit.com/v5/earn/product?category=${category}`,
      );
      if (data.retCode !== 0) {
        errors.push(`${category}: ${data.retMsg}`);
        continue;
      }

      for (const item of data.result?.list ?? []) {
        if (!isStableCoin(item.coin)) continue;

        const tiers = (item.tierAprDetails ?? []).map((t) => ({
          min: parseFloat(t.min),
          max: t.max === "-1" ? null : parseFloat(t.max),
          apy: parseAprString(t.estimateApr),
        }));

        const tierApys = tiers.map((t) => t.apy).filter((v) => v != null);
        const baseApy = parseAprString(item.estimateApr);
        const apyMax = tierApys.length ? Math.max(...tierApys, baseApy ?? 0) : baseApy;
        const apyMin = tierApys.length ? Math.min(...tierApys, baseApy ?? apyMax) : baseApy;

        const isFlexible =
          !item.term ||
          item.term === 0 ||
          item.duration === "Flexible" ||
          item.duration === "";

        results.push(
          product({
            exchange: "Bybit",
            asset: item.coin,
            productType: category === "OnChain" ? "onchain" : "flexible",
            duration: isFlexible ? "Flexible" : `${item.term} days`,
            durationDays: isFlexible ? 0 : item.term,
            apy: apyMax,
            apyMin,
            apyMax,
            tierDetails: tiers.length ? tiers : null,
            minAmount: item.minStakeAmount,
            maxAmount: item.maxStakeAmount,
            source: `bybit:${category}`,
          }),
        );
      }
    } catch (err) {
      errors.push(`${category}: ${err.message}`);
    }
  }

  return { exchange: "Bybit", products: results, errors };
}
