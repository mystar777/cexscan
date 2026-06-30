import { productHasAnyTag } from "./productTags.js";

const NEW_USER_RE = /new user|new users|newbie|signup|sign[-\s]?up|welcome|first|one[-\s]?time/i;
const NEW_DEPOSIT_RE =
  /new deposit|first deposit|never deposited|deposit\s*&\s*earn|new crypto deposit|new p2p buy|new fiat deposit/i;
const NEW_SUBSCRIPTION_RE =
  /new subscription|first subscription|new simple earn|never subscribed|not used simple earn/i;
const VIP_RE = /\bvip\b/i;

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getApy(product) {
  const apy = Number(product.apyMax ?? product.apy ?? 0);
  return Number.isFinite(apy) ? apy : 0;
}

function getDurationDays(product) {
  const days = Number(product.durationDays);
  if (Number.isFinite(days) && days > 0) return days;
  const match = String(product.duration ?? "").match(/(\d+)\s*(day|days|d)\b/i);
  if (!match) return 0;
  return Number(match[1]);
}

function getNote(product) {
  return String(product.note ?? "");
}

function isRestrictedProduct(product) {
  return Boolean(
    product.restricted ||
      product.eligibility ||
      (Array.isArray(product.eligibilityTags) && product.eligibilityTags.length),
  );
}

function isNewUserOnly(product) {
  return (
    productHasAnyTag(product, [
      "new-user",
      "new-user-only",
      "new-deposit",
      "new-deposit-only",
      "new-subscription",
      "new-subscription-only",
    ]) ||
    NEW_USER_RE.test(getNote(product)) ||
    NEW_DEPOSIT_RE.test(getNote(product)) ||
    NEW_SUBSCRIPTION_RE.test(getNote(product))
  );
}

function isNewDepositOnly(product) {
  return (
    productHasAnyTag(product, ["new-deposit", "new-deposit-only"]) ||
    NEW_DEPOSIT_RE.test(getNote(product))
  );
}

function isVipOnly(product) {
  return productHasAnyTag(product, ["vip", "vip-only"]) || VIP_RE.test(getNote(product));
}

function isPromoProduct(product) {
  return product.productType === "promo" || productHasAnyTag(product, ["promo"]);
}

function isOneTime(product) {
  return isPromoProduct(product) || isNewUserOnly(product) || isNewDepositOnly(product);
}

function getProductMin(product) {
  const fromMin = toNumber(product.minAmount);
  if (fromMin != null) return fromMin;
  const firstTierMin = product.tierDetails?.[0]?.min;
  return Number.isFinite(firstTierMin) ? firstTierMin : 0;
}

function getProductMax(product) {
  const fromMax = toNumber(product.maxAmount);
  if (fromMax != null && fromMax > 0) return fromMax;

  const tierMax = product.tierDetails?.find((tier) => Number.isFinite(tier.max))?.max;
  if (Number.isFinite(tierMax) && tierMax > 0) return tierMax;

  return Infinity;
}

function getHighApyCapacity(product) {
  if (product.tierDetails?.length) {
    const sorted = [...product.tierDetails].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
    const firstMax = sorted[0]?.max;
    if (Number.isFinite(firstMax) && firstMax > 0) return firstMax;
  }
  return getProductMax(product);
}

function normalizeProduct(product) {
  const apy = getApy(product);
  if (!product?.exchange || !product?.asset || apy <= 0) return null;

  return {
    ...product,
    apy,
    durationDays: getDurationDays(product),
    minAmountNumber: getProductMin(product),
    maxAmountNumber: getProductMax(product),
    highApyCapacity: getHighApyCapacity(product),
    promoOnly: isPromoProduct(product),
    newUserOnly: isNewUserOnly(product),
    newDepositOnly: isNewDepositOnly(product),
    vipOnly: isVipOnly(product),
    restrictedOnly: isRestrictedProduct(product),
    oneTime: isOneTime(product),
  };
}

function getTieredProfit(product, amount, days) {
  const tiers = product.tierDetails;
  if (!tiers?.length) return amount * (product.apy / 100) * (days / 365);

  const sorted = [...tiers].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  let profit = 0;

  for (const tier of sorted) {
    const min = Number.isFinite(tier.min) ? tier.min : 0;
    const max = Number.isFinite(tier.max) ? tier.max : Infinity;
    const tierApy = Number(tier.apy ?? product.apy);
    if (!Number.isFinite(tierApy) || amount <= min) continue;

    const tierAmount = Math.max(0, Math.min(amount, max) - min);
    profit += tierAmount * (tierApy / 100) * (days / 365);
  }

  return profit > 0 ? profit : amount * (product.apy / 100) * (days / 365);
}

function getStepDays(product, remainingDays) {
  if (product.durationDays > 0) {
    return product.durationDays <= remainingDays ? product.durationDays : 0;
  }
  return remainingDays;
}

function isEligibleProduct(product, options) {
  if (options.asset !== "all" && product.asset !== options.asset) return false;
  if (!options.includePromos && product.promoOnly) return false;
  if ((options.excludeNewUser || !options.isNewUser) && product.newUserOnly) return false;
  if (options.excludeNewDeposit && product.newDepositOnly) return false;
  if (!options.includeVip && product.vipOnly) return false;
  if (!options.includeRestricted && product.restrictedOnly) return false;
  return true;
}

function getCandidateScore(product, amount, remainingDays) {
  const stepDays = getStepDays(product, remainingDays);
  if (stepDays <= 0) return null;
  const profit = getTieredProfit(product, amount, stepDays);
  const annualized = amount > 0 ? (profit / amount) * (365 / stepDays) * 100 : 0;

  return {
    product,
    stepDays,
    profit,
    annualized,
    dailyProfit: profit / stepDays,
  };
}

function pickBestCandidate(products, amount, remainingDays, usedOneTimeIds, options) {
  return products
    .filter((product) => !product.oneTime || !usedOneTimeIds.has(product.id))
    .map((product) => getCandidateScore(product, amount, remainingDays))
    .filter(Boolean)
    .sort((a, b) => {
      if (b.dailyProfit !== a.dailyProfit) return b.dailyProfit - a.dailyProfit;
      if (b.annualized !== a.annualized) return b.annualized - a.annualized;
      return a.stepDays - b.stepDays;
    })[0];
}

function buildStep(product, amount, day, remainingDays, previousExchange) {
  const stepDays = getStepDays(product, remainingDays);
  if (stepDays <= 0) return null;

  const profit = getTieredProfit(product, amount, stepDays);
  const annualized = amount > 0 ? (profit / amount) * (365 / stepDays) * 100 : 0;
  const transferFrom =
    previousExchange && previousExchange !== product.exchange ? previousExchange : null;

  return {
    id: `${product.id}:${day}`,
    dayStart: day,
    dayEnd: day + stepDays,
    days: stepDays,
    amount: Math.round(amount * 100) / 100,
    expectedProfit: Math.round(profit * 100) / 100,
    finalAmount: Math.round((amount + profit) * 100) / 100,
    annualizedApy: annualized,
    transferFrom,
    product,
  };
}

function buildRouteForAllocation(initialAmount, initialProduct, products, options, reservedOneTimeIds) {
  const steps = [];
  const usedOneTimeIds = new Set();
  let amount = initialAmount;
  let day = 0;
  let remainingDays = options.horizonDays;
  let previousExchange = null;

  const firstStep = buildStep(initialProduct, amount, day, remainingDays, previousExchange);
  if (firstStep) {
    steps.push(firstStep);
    if (initialProduct.oneTime) usedOneTimeIds.add(initialProduct.id);
    amount += firstStep.expectedProfit;
    day = firstStep.dayEnd;
    remainingDays -= firstStep.days;
    previousExchange = initialProduct.exchange;
  }

  while (remainingDays > 0 && steps.length < 12) {
    const unavailableOneTimeIds = new Set([...usedOneTimeIds, ...reservedOneTimeIds]);
    const best = pickBestCandidate(
      products,
      amount,
      remainingDays,
      unavailableOneTimeIds,
      options,
    );
    if (!best) break;

    const { product } = best;
    const step = buildStep(product, amount, day, remainingDays, previousExchange);
    if (!step) break;

    steps.push(step);

    if (product.oneTime) {
      usedOneTimeIds.add(product.id);
    }

    amount += step.expectedProfit;
    day = step.dayEnd;
    remainingDays -= step.days;
    previousExchange = product.exchange;

    if (step.days <= 0) break;
  }

  const totalProfit = amount - initialAmount;
  return {
    initialAmount,
    finalAmount: Math.round(amount * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    steps,
  };
}

function buildInitialAllocations(products, capital, options) {
  const remainingProducts = [...products].sort((a, b) => {
    if (b.apy !== a.apy) return b.apy - a.apy;
    return getStepDays(a, options.horizonDays) - getStepDays(b, options.horizonDays);
  });

  const allocations = [];
  let remaining = capital;

  for (const product of remainingProducts) {
    if (remaining <= 0) break;
    const stepDays = getStepDays(product, options.horizonDays);
    if (stepDays <= 0) continue;

    const min = Math.max(0, product.minAmountNumber ?? 0);
    const capacity = product.highApyCapacity;
    const available = Number.isFinite(capacity) ? Math.max(0, capacity) : remaining;
    const amount = Math.min(remaining, available);

    if (amount <= 0 || amount < min) continue;

    allocations.push({
      product,
      amount: Math.round(amount * 100) / 100,
    });
    remaining -= amount;

    if (!Number.isFinite(capacity)) break;
  }

  if (remaining > 0.01 && allocations.length) {
    allocations[allocations.length - 1].amount += Math.round(remaining * 100) / 100;
  }

  if (!allocations.length) {
    return [{ product: products[0], amount: capital }];
  }

  return allocations;
}

function getAlternatives(products, capital, options, usedIds) {
  return products
    .filter((product) => !usedIds.has(product.id))
    .map((product) => {
      const stepDays = getStepDays(product, options.horizonDays);
      if (stepDays <= 0) return null;
      const amount = Math.min(
        capital,
        Number.isFinite(product.highApyCapacity) ? product.highApyCapacity : capital,
      );
      if (amount <= 0 || amount < product.minAmountNumber) return null;
      const profit = getTieredProfit(product, amount, stepDays);
      return {
        product,
        amount,
        days: stepDays,
        expectedProfit: profit,
        annualizedApy: amount > 0 ? (profit / amount) * (365 / stepDays) * 100 : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.expectedProfit - a.expectedProfit)
    .slice(0, 4);
}

function buildTimeline(routes) {
  return routes
    .flatMap((route, routeIndex) =>
      route.steps.map((step, stepIndex) => ({
        routeIndex,
        stepIndex,
        step,
      })),
    )
    .sort((a, b) => {
      if (a.step.dayStart !== b.step.dayStart) return a.step.dayStart - b.step.dayStart;
      if (a.step.dayEnd !== b.step.dayEnd) return a.step.dayEnd - b.step.dayEnd;
      return a.routeIndex - b.routeIndex;
    })
    .map((item, index) => ({
      ...item,
      sequenceNumber: index + 1,
    }));
}

export function buildOptimalRoute(products, rawOptions) {
  const capital = Number(rawOptions.capital);
  const options = {
    asset: "all",
    horizonDays: 30,
    includePromos: true,
    excludeNewUser: false,
    excludeNewDeposit: false,
    includeVip: false,
    includeRestricted: false,
    isNewUser: true,
    ...rawOptions,
  };

  if (!Number.isFinite(capital) || capital <= 0) {
    return {
      routes: [],
      alternatives: [],
      summary: null,
      eligibleCount: 0,
      warnings: ["Enter capital to calculate a recommended route."],
    };
  }

  const eligibleProducts = products
    .map(normalizeProduct)
    .filter(Boolean)
    .filter((product) => isEligibleProduct(product, options));

  if (!eligibleProducts.length) {
    return {
      routes: [],
      alternatives: [],
      summary: null,
      eligibleCount: 0,
      warnings: ["No products match the selected conditions."],
    };
  }

  const allocations = buildInitialAllocations(eligibleProducts, capital, options);
  const reservedOneTimeIds = new Set(
    allocations
      .map((allocation) => allocation.product)
      .filter((product) => product?.oneTime)
      .map((product) => product.id),
  );
  const routes = allocations.map((allocation) =>
    buildRouteForAllocation(
      allocation.amount,
      allocation.product,
      eligibleProducts,
      options,
      reservedOneTimeIds,
    ),
  );

  const totalProfit = routes.reduce((sum, route) => sum + route.totalProfit, 0);
  const finalAmount = routes.reduce((sum, route) => sum + route.finalAmount, 0);
  const usedIds = new Set(routes.flatMap((route) => route.steps.map((step) => step.product.id)));
  const timeline = buildTimeline(routes);

  return {
    routes,
    timeline,
    alternatives: getAlternatives(eligibleProducts, capital, options, usedIds),
    summary: {
      capital,
      finalAmount: Math.round(finalAmount * 100) / 100,
      expectedProfit: Math.round(totalProfit * 100) / 100,
      effectiveApy:
        capital > 0 && options.horizonDays > 0
          ? (totalProfit / capital) * (365 / options.horizonDays) * 100
          : 0,
      horizonDays: options.horizonDays,
      routeCount: routes.length,
      stepCount: timeline.length,
    },
    eligibleCount: eligibleProducts.length,
    warnings: [
      !options.includePromos && "Promotional offers are excluded.",
      options.excludeNewUser && "New-user-only offers are excluded.",
      !options.excludeNewUser &&
        !options.isNewUser &&
        "New-user-only offers are excluded for existing user status.",
      options.excludeNewDeposit && "New-deposit-only offers are excluded.",
      !options.includeRestricted &&
        "Region- or eligibility-restricted offers are excluded unless enabled.",
      "Fees, withdrawal delays, KYC, country restrictions, and product limit changes are not included.",
      "APY and promotion terms can change each time the data refreshes.",
    ].filter(Boolean),
  };
}

export function formatCurrency(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(Number(value) || 0);
}

export function formatPercent(value) {
  return `${(Number(value) || 0).toFixed(2)}%`;
}
