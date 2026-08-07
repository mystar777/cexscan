import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cexscan-cache-test-"));
process.env.CEXSCAN_DATA_DIR = dataDir;

const cacheModule = await import("./cache.js");
const { FETCH_INTERVAL_MINUTES } = await import("./config.js");
const { computeNextFetchAt } = await import("./lib/schedule.js");
const seoModule = await import("./seo-pages.js");

function snapshot(fetchedAt, asset) {
  return {
    products: [{
      id: asset.toLowerCase(),
      exchange: "Binance",
      asset,
      productType: "Flexible",
      duration: "Flexible",
      apy: 5,
      apyMin: 5,
      apyMax: 5,
      source: "test",
    }],
    exchangeStatus: [],
    meta: { fetchedAt, productCount: 1, exchangeCount: 1 },
  };
}

test("published morning post remains visible after the evening cache refresh", () => {
  const morning = snapshot("2026-08-07T00:05:00.000Z", "MORNING");
  const evening = snapshot("2026-08-07T12:05:00.000Z", "EVENING");

  cacheModule.publishPoolHistoryPost(morning);
  fs.writeFileSync(cacheModule.CACHE_PATH, JSON.stringify(evening, null, 2));

  const slug = cacheModule.buildPoolHistoryPost(morning).slug;
  const html = seoModule.renderHistoryArticle(slug);
  assert.match(html, /MORNING/);
  assert.doesNotMatch(html, /EVENING/);
});

test("next refresh follows the 09:00 and 21:00 Korea schedule", () => {
  assert.equal(FETCH_INTERVAL_MINUTES, 720);
  assert.equal(
    computeNextFetchAt(new Date("2026-08-07T00:13:00.000Z"), FETCH_INTERVAL_MINUTES).toISOString(),
    "2026-08-07T12:00:00.000Z",
  );
  assert.equal(
    computeNextFetchAt(new Date("2026-08-07T12:13:00.000Z"), FETCH_INTERVAL_MINUTES).toISOString(),
    "2026-08-08T00:00:00.000Z",
  );
});

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
