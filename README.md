# CEX Stable Staking Dashboard

Compare stablecoin staking APY across major centralized exchanges in one place.

## URL

**https://cexscan.mystarbot.xyz**

## Features

- Codex automation syncs every 1 hour from public APIs, exchange Earn pages, and exchange announcements
- AI recommended route planner calculates capital allocation and exchange-by-exchange staking paths from the latest refreshed data
- Filters by coin, exchange, duration, and product type
- Sortable columns (APY, Exchange, Asset, etc.)
- DeFiLlama-style dark table UI (Project → **Exchange**)

## Exchange coverage

| Exchange | Status |
|----------|--------|
| Bybit | Flexible + On-chain API |
| OKX | Flexible Savings API |
| Gate.io | Simple Earn API (bonus) |
| Bitget | Earn page Next.js data |
| MEXC | Public Earn products endpoint discovered from the Earn page prefetch script; filters inactive/ended product states |
| HTX | Public Earn endpoint discovered from web bundle routes |
| Kraken | Stablecoin Rewards support article |
| Crypto.com | Crypto Earn page reward list |
| LBank | Spot Earn and Locked Earn public page hydration data |
| BingX | Wealth Earn signed public product endpoint discovered from the Earn page bundle |
| Coinbase | Public Earn page text; falls back to a read-only rendered page mirror when Cloudflare blocks direct fetch |
| KuCoin | Hold to Earn public page text; falls back to a read-only rendered page mirror for client-rendered rows |
| Binance | Simple Earn public table via rendered-page fallback, plus announcement parsing for promotions |

## Automation notes

- Prefer official public JSON APIs when available: Bybit, OKX, Gate.io.
- When APIs are private or undocumented, parse stablecoin rows from public Earn pages, embedded hydration data, or page-discovered signed endpoints: Bitget, MEXC, HTX, Crypto.com, LBank, BingX.
- For pages blocked by WAF or rendered after hydration, use a read-only rendered-page fallback only for public page text: Binance, Coinbase, KuCoin.
- Keep announcement parsing as a safety net for promotions and exchanges whose complete Earn data is not exposed publicly.
- The production Node server does not run an internal hourly cron. A Codex automation triggers the full refresh process and the app reads the refreshed cache on demand.
- To expand coverage further, add one exchange adapter at a time in `server/fetchers/stubs.js`, normalize through `product()`, and preserve a source URL so every row remains auditable.

## Commands

```bash
cd /opt/cexscan/current
npm run fetch          # manual data fetch
npm run build          # build frontend
systemctl restart cex-staking
```

## Development

```bash
npm run dev   # API :3344 + Vite :5174
```
