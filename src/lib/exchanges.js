/** Referral links and local CMC icon paths (see scripts/download-cmc-icons.js) */
export const EXCHANGE_META = {
  Binance: {
    id: "binance",
    icon: "/exchanges/binance.png",
    referralUrl:
      "https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_VP19C&utm_source=referral_entrance",
  },
  Coinbase: {
    id: "coinbase",
    icon: "/exchanges/coinbase.png",
    referralUrl: "https://www.coinbase.com/",
  },
  Bybit: {
    id: "bybit",
    icon: "/exchanges/bybit.png",
    referralUrl:
      "https://www.bybit.com/invite?ref=NM164&medium=referral&utm_campaign=evergreen",
  },
  OKX: {
    id: "okx",
    icon: "/exchanges/okx.png",
    referralUrl: "https://okx.com/join/2182760",
  },
  Bitget: {
    id: "bitget",
    icon: "/exchanges/bitget.png",
    referralUrl: "https://share.bitget.com/u/FJWVH0HV",
  },
  Kraken: {
    id: "kraken",
    icon: "/exchanges/kraken.png",
    referralUrl: "https://www.kraken.com/",
  },
  KuCoin: {
    id: "kucoin",
    icon: "/exchanges/kucoin.png",
    referralUrl: "https://www.kucoin.com/r/rf/QBSFP9GS",
  },
  HTX: {
    id: "htx",
    icon: "/exchanges/htx.png",
    referralUrl: "https://www.htx.com/",
  },
  "Gate.io": {
    id: "gate",
    icon: "/exchanges/gate.png",
    referralUrl: "https://www.gate.com/share/STARJOIN",
  },
  MEXC: {
    id: "mexc",
    icon: "/exchanges/mexc.png",
    referralUrl: "https://www.mexc.com/acquisition/custom-sign-up?shareCode=mexc-13R8q",
  },
  "Crypto.com": {
    id: "cryptocom",
    icon: "/exchanges/cryptocom.png",
    referralUrl: "https://crypto.com/",
  },
  LBank: {
    id: "lbank",
    icon: "/exchanges/lbank.png",
    referralUrl: "https://www.lbk.pub/signup/a?icode=46I0M",
  },
};

export function getExchangeMeta(name) {
  return (
    EXCHANGE_META[name] ?? {
      id: name?.toLowerCase().replace(/\s+/g, "") ?? "unknown",
      icon: "/exchanges/default.svg",
      referralUrl: null,
    }
  );
}
