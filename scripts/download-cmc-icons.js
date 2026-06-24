#!/usr/bin/env node
/**
 * Download exchange logos from CoinMarketCap (64x64 PNG).
 * IDs resolved via CMC data-api exchange detail slug.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/exchanges");

/** slug -> local filename (without extension) */
const EXCHANGES = {
  binance: "binance",
  "coinbase-exchange": "coinbase",
  bybit: "bybit",
  okx: "okx",
  bitget: "bitget",
  kraken: "kraken",
  kucoin: "kucoin",
  htx: "htx",
  gate: "gate",
  mexc: "mexc",
  "crypto-com-exchange": "cryptocom",
  lbank: "lbank",
};

const UA = "Mozilla/5.0 (compatible; cex-staking-icon-fetch/1.0)";

async function fetchCmcId(slug) {
  const url = `https://api.coinmarketcap.com/data-api/v3/exchange/detail?slug=${slug}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CMC detail ${slug}: HTTP ${res.status}`);
  const json = await res.json();
  const id = json?.data?.id;
  if (!id) throw new Error(`CMC detail ${slug}: missing id`);
  return id;
}

async function downloadPng(cmcId, filename) {
  const url = `https://s2.coinmarketcap.com/static/img/exchanges/64x64/${cmcId}.png`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Logo ${filename}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100 || buf[0] !== 0x89) {
    throw new Error(`Logo ${filename}: invalid PNG`);
  }
  await writeFile(join(OUT_DIR, `${filename}.png`), buf);
  console.log(`✓ ${filename}.png (cmc id ${cmcId})`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [slug, filename] of Object.entries(EXCHANGES)) {
    const id = await fetchCmcId(slug);
    await downloadPng(id, filename);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
