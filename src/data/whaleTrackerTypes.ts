export type WhaleSymbol = "BTCUSDT" | "ETHUSDT" | "BNBUSDT" | "SOLUSDT";
export type WhaleConfidence = "高" | "中高" | "中";
export type WhaleTradeSide = "buy" | "sell";

export type WhaleSymbolMeta = {
  symbol: WhaleSymbol;
  name: string;
  note: string;
};

export type WhaleTrade = {
  id: string;
  minutesAgo: number;
  clusterLabel: string;
  symbol: WhaleSymbol;
  quantity: number;
  price: number;
  usdValue: number;
  side: WhaleTradeSide;
  behavior: string;
  confidence: WhaleConfidence;
  chunks: number;
  note: string;
};

export type WhaleOrderBookWatch = {
  symbol: WhaleSymbol;
  wallPrice: number;
  wallValueUsd: number;
  totalBidDepthUsd: number;
  wallRatio: number;
  takerBuyRatio: number;
  cancelRisk: number;
  absorptionZone: string;
  confirmationZone: string;
  invalidationZone: string;
  status: string;
  spoofingSignal: string;
};

export type WhaleRulePreset = {
  id: string;
  title: string;
  detail: string;
  threshold: string;
};

export type WhaleMethodCard = {
  id: string;
  title: string;
  description: string;
  emphasis: string;
  tone: "active" | "warm" | "cool";
};
