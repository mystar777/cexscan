# CEX Stable Staking Dashboard

Compare stablecoin staking APY across CMC top 10 centralized exchanges in one place.

## URL

**https://cexscan.mystarbot.xyz**

## Features

- Auto-sync every 30 minutes from public APIs and exchange announcements
- Filters by coin, exchange, duration, and product type
- Sortable columns (APY, Exchange, Asset, etc.)
- DeFiLlama-style dark table UI (Project → **Exchange**)

## Exchange coverage

| Exchange | Status |
|----------|--------|
| Bybit | Flexible + On-chain API |
| OKX | Flexible Savings API |
| Gate.io | Simple Earn API (bonus) |
| Binance, Coinbase, Bitget, Kraken, KuCoin, HTX, MEXC, Crypto.com | Notice parsing |

## Commands

```bash
cd /root/Web/cex-staking
npm run fetch          # manual data fetch
npm run build          # build frontend
systemctl restart cex-staking
```

## Development

```bash
npm run dev   # API :3344 + Vite :5174
```
