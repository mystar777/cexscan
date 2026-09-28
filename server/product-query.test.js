import test from "node:test";
import assert from "node:assert/strict";
import { parseProductQuery, selectProducts } from "./product-query.js";
import { publicSnapshot } from "./public-snapshot.js";
import { getX402Catalog } from "./x402-commerce.js";
import { renderDataApiPage, renderSitemap } from "./seo-pages.js";

const products = [
  { id: "one", exchange: "Binance", asset: "USDC", productType: "flexible", source: "api", apy: 4, durationDays: 0, sourceRef: "private-1" },
  { id: "two", exchange: "Binance", asset: "USDT", productType: "locked", source: "site", apy: 6, durationDays: 30, sourceRef: "private-2" },
  { id: "three", exchange: "BingX", asset: "USDC", productType: "locked", source: "api", apy: 8, durationDays: 90, sourceRef: "private-3" },
];

test("selects only matching rows and returns total before limit", () => {
  const filters = parseProductQuery({ exchange: "binance", minApy: "3", maxDurationDays: "30", limit: "1" });
  const selected = selectProducts(products, filters);
  assert.equal(selected.total, 2);
  assert.deepEqual(selected.products.map(({ id }) => id), ["two"]);
});

test("rejects invalid filters before payment", () => {
  assert.throws(() => parseProductQuery({ limit: "1001" }), /range/);
  assert.throws(() => parseProductQuery({ minApy: "abc" }), /number/);
  assert.throws(() => parseProductQuery({ minApy: "5", maxApy: "4" }), /exceed/);
  assert.throws(() => parseProductQuery({ unknown: "x" }), /Unknown/);
  assert.throws(() => parseProductQuery({ asset: ["USDC", "USDT"] }), /single/);
});

test("public dashboard payload does not expose the paid raw cache", () => {
  const raw = { meta: { fetchedAt: "2026-09-28T00:00:00Z" }, products, exchangeStatus: [{ name: "Binance" }] };
  const view = publicSnapshot(raw);
  assert.equal(view.products.length, products.length);
  assert.equal(view.products[0].sourceRef, undefined);
  assert.equal(view.exchangeStatus, undefined);
});

test("catalog advertises Base mainnet USDC", () => {
  const catalog = getX402Catalog();
  assert.equal(catalog.network, "eip155:8453");
  assert.equal(catalog.settlementAsset, "USDC");
  assert.ok(catalog.products.find((item) => item.path === "/api/x402/data/products").filters.includes("asset"));
});

test("paid data has a discoverable, canonical page", () => {
  const html = renderDataApiPage();
  assert.match(html, /rel="canonical" href="https:\/\/cexscan\.mystar777\.xyz\/data"/);
  assert.match(html, /eip155:8453|Base mainnet/);
  assert.match(html, /api\/x402\/data\/products/);
  assert.match(renderSitemap(), /https:\/\/cexscan\.mystar777\.xyz\/data/);
});
