import { product } from "../lib/utils.js";

function emptyFetcher(exchange) {
  return async () => ({
    exchange,
    products: [],
    errors: [],
  });
}

export const fetchBinance = emptyFetcher("Binance");
export const fetchCoinbase = emptyFetcher("Coinbase");
export const fetchBitget = emptyFetcher("Bitget");
export const fetchKraken = emptyFetcher("Kraken");
export const fetchKucoin = emptyFetcher("KuCoin");
export const fetchHtx = emptyFetcher("HTX");
export const fetchMexc = emptyFetcher("MEXC");
export const fetchCryptocom = emptyFetcher("Crypto.com");
