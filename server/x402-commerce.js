import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { readCache } from "./cache.js";
import { recordDataSale } from "./analytics.js";
import { parseProductQuery, selectProducts } from "./product-query.js";

export const X402_PAY_TO = "0xd25f1f178cc0f63a4feb86cfc450ab27e23337a7";
export const X402_NETWORK = "eip155:8453";
export const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || "https://facilitator.xpay.sh";

const MIME_JSON = "application/json";

export const DATA_PRODUCTS = [
  {
    id: "cexscan-products-snapshot",
    title: "Normalized staking products snapshot",
    price: "$0.05",
    priceUsd: 0.05,
    path: "/api/x402/data/products",
    description:
      "Current normalized stablecoin staking products with exchange, APY, duration, limits, tags, eligibility, and source metadata.",
    fields: [
      "id",
      "exchange",
      "asset",
      "productType",
      "typeTags",
      "duration",
      "apy",
      "apyMin",
      "apyMax",
      "minAmount",
      "maxAmount",
      "eligibility",
      "source",
      "sourceUrl",
    ],
    filters: ["exchange", "asset", "productType", "source", "minApy", "maxApy", "maxDurationDays", "sort", "limit"],
  },
  {
    id: "cexscan-full-cache",
    title: "Full CEXScan cache export",
    price: "$0.08",
    priceUsd: 0.08,
    path: "/api/x402/data/full-cache",
    description:
      "Complete cache export including products, meta, exchange status, stablecoin list, fetch timestamps, and source health.",
    fields: ["products", "meta", "exchangeStatus", "stableCoins", "fetchedAt", "nextFetchAt"],
  },
  {
    id: "cexscan-route-inputs",
    title: "AI route optimizer input dataset",
    price: "$0.03",
    priceUsd: 0.03,
    path: "/api/x402/data/route-inputs",
    description:
      "Filtered route-planning input data for external optimizers, including APY, capacity, one-time eligibility, and duration fields.",
    fields: [
      "exchange",
      "asset",
      "apy",
      "durationDays",
      "minAmount",
      "maxAmount",
      "typeTags",
      "eligibilityTags",
      "restricted",
    ],
    filters: ["exchange", "asset", "productType", "source", "minApy", "maxApy", "maxDurationDays", "sort", "limit"],
  },
  {
    id: "cexscan-exchange-status",
    title: "Exchange source status feed",
    price: "$0.02",
    priceUsd: 0.02,
    path: "/api/x402/data/exchange-status",
    description:
      "Per-exchange product counts, source type counts, fetch source health, and crawler errors when available.",
    fields: ["exchange", "count", "apiCount", "siteCount", "announcementCount", "sources", "errors"],
  },
];

const itemByPath = new Map(DATA_PRODUCTS.map((item) => [item.path, item]));

function itemWithPayment(item) {
  return {
    ...item,
    method: "GET",
    protocol: "x402",
    scheme: "exact",
    network: X402_NETWORK,
    payTo: X402_PAY_TO,
    facilitatorUrl: X402_FACILITATOR_URL,
    mimeType: MIME_JSON,
  };
}

export function getX402Catalog() {
  return {
    protocol: "x402",
    version: 2,
    payTo: X402_PAY_TO,
    network: X402_NETWORK,
    facilitatorUrl: X402_FACILITATOR_URL,
    settlementAsset: "USDC",
    products: DATA_PRODUCTS.map(itemWithPayment),
    notes: [
      "Protected endpoints respond with HTTP 402 until the client submits a valid PAYMENT-SIGNATURE header.",
      "Use an x402-compatible client to pay and retry the same GET request.",
      "Payments use real USDC on Base mainnet. Open an endpoint in a wallet-enabled browser or use an x402-compatible client.",
      "Product and route-input endpoints accept the listed query filters. One successful payment returns the selected snapshot; another request requires another payment.",
    ],
  };
}

function createRoutesConfig() {
  return Object.fromEntries(
    DATA_PRODUCTS.map((item) => [
      `GET ${item.path}`,
      {
        accepts: [
          {
            scheme: "exact",
            price: item.price,
            network: X402_NETWORK,
            payTo: X402_PAY_TO,
          },
        ],
        description: item.description,
        mimeType: MIME_JSON,
      },
    ]),
  );
}

function createX402Middleware() {
  const facilitator = new HTTPFacilitatorClient({ url: X402_FACILITATOR_URL });
  const paywall = createPaywall()
    .withNetwork(evmPaywall)
    .withConfig({ appName: "CEXScan", testnet: false })
    .build();
  return paymentMiddlewareFromConfig(
    createRoutesConfig(),
    facilitator,
    [{ network: X402_NETWORK, server: new ExactEvmScheme() }],
    { appName: "CEXScan", testnet: false },
    paywall,
    true,
  );
}

function routeInputs(snapshot) {
  return (snapshot.products ?? []).map((product) => ({
    id: product.id,
    exchange: product.exchange,
    asset: product.asset,
    apy: product.apyMax ?? product.apy ?? 0,
    duration: product.duration,
    durationDays: product.durationDays,
    minAmount: product.minAmount ?? null,
    maxAmount: product.maxAmount ?? null,
    productType: product.productType,
    typeTags: product.typeTags ?? [],
    eligibilityTags: product.eligibilityTags ?? [],
    restricted: Boolean(product.restricted),
    source: product.source,
    sourceUrl: product.sourceUrl ?? product.announcementUrl ?? null,
  }));
}

function dataForItem(item, snapshot, query) {
  if (item.id === "cexscan-products-snapshot") {
    const selected = selectProducts(snapshot.products ?? [], query);
    return {
      meta: snapshot.meta,
      total: selected.total,
      count: selected.products.length,
      products: selected.products,
    };
  }

  if (item.id === "cexscan-route-inputs") {
    const selected = selectProducts(snapshot.products ?? [], query);
    return {
      meta: snapshot.meta,
      total: selected.total,
      count: selected.products.length,
      products: routeInputs({ products: selected.products }),
    };
  }

  if (item.id === "cexscan-exchange-status") {
    return {
      meta: snapshot.meta,
      exchangeStatus: snapshot.exchangeStatus ?? [],
    };
  }

  return snapshot;
}

function sendProtectedData(item) {
  return async (req, res) => {
    const snapshot = readCache();
    const query = item.filters ? parseProductQuery(req.query) : undefined;
    const data = dataForItem(item, snapshot, query);
    try {
      await recordDataSale(req, itemWithPayment(item));
    } catch (err) {
      console.warn(`[x402] sale analytics failed: ${err.message}`);
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      product: itemWithPayment(item),
      soldAt: new Date().toISOString(),
      data,
    });
  };
}

export function handleX402Catalog(_req, res) {
  res.json(getX402Catalog());
}

export function installX402Routes(app) {
  app.get("/api/x402/catalog", handleX402Catalog);

  for (const item of DATA_PRODUCTS) {
    app.get(item.path, (req, res, next) => {
      try {
        if (item.filters) parseProductQuery(req.query);
        else if (Object.keys(req.query).length) throw new Error("This dataset does not accept filters");
        next();
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });
  }

  try {
    app.use(createX402Middleware());
  } catch (err) {
    console.warn(`[x402] middleware disabled: ${err.message}`);
    app.use("/api/x402/data", (_req, res) => {
      res.status(503).json({
        error: "x402 payments are not available",
        reason: err.message,
        catalog: getX402Catalog(),
      });
    });
    return;
  }

  for (const item of DATA_PRODUCTS) {
    app.get(item.path, sendProtectedData(item));
  }
}

export function getX402DataProductByPath(path) {
  return itemByPath.get(path);
}
