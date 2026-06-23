import { isStableCoin, hourlyToApy, product, fetchJson } from "../lib/utils.js";

export async function fetchOkx() {
  const results = [];
  const errors = [];

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
        }),
      );
    }
  } catch (err) {
    errors.push(err.message);
  }

  return { exchange: "OKX", products: results, errors };
}

export async function fetchGate() {
  const results = [];
  const errors = [];

  try {
    const data = await fetchJson("https://api.gateio.ws/api/v4/earn/uni/currencies");
    if (!Array.isArray(data)) {
      return { exchange: "Gate.io", products: [], errors: ["Invalid response"] };
    }

    for (const item of data) {
      if (!isStableCoin(item.currency)) continue;
      const maxApy = hourlyToApy(item.max_rate);
      const minApy = hourlyToApy(item.min_rate);

      results.push(
        product({
          exchange: "Gate.io",
          asset: item.currency,
          productType: "flexible",
          duration: "Flexible",
          durationDays: 0,
          apy: maxApy,
          apyMin: minApy,
          apyMax: maxApy,
          minAmount: item.min_lend_amount,
          maxAmount: item.max_lend_amount,
          note: "Simple Earn — rate varies by pool utilization",
          source: "gate:uni-lend",
        }),
      );
    }
  } catch (err) {
    errors.push(err.message);
  }

  return { exchange: "Gate.io", products: results, errors };
}
