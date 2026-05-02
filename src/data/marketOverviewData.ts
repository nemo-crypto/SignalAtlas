export type Sentiment = "bullish" | "bearish" | "neutral";

export type DimensionMetric = {
  label: string;
  value: string;
  insight: string;
};

export type MarketDimension = {
  id: string;
  name: string;
  shortLabel: string;
  weight: number;
  enabled: boolean;
  score: number;
  sentiment: Sentiment;
  signal: string;
  summary: string;
  note: string;
  details: DimensionMetric[];
};

export type SignalHistoryItem = {
  id?: string;
  recordedAt?: number;
  confidence?: number | null;
  time: string;
  symbol: string;
  signal: string;
  triggerPrice: string;
  after1hPrice: string;
  marketPnl?: string;
  pnl: string;
  accuracy: string;
  signalTone?: Sentiment;
  resolved?: boolean;
  marketPnlValue?: number | null;
  pnlValue?: number | null;
  outcome?: "correct" | "incorrect" | "warning" | "pending";
};

export type OrderBookDepthLevel = {
  price: number;
  quantity: number;
  cumulative: number;
};

export type OrderBookDepth = {
  bids: OrderBookDepthLevel[];
  asks: OrderBookDepthLevel[];
  spreadPercent: number;
  imbalance: number;
};

export type RealtimeCanvasInterval = "5m" | "10m" | "15m";

export type RealtimeCanvasCandle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
};

export type RealtimeCanvasMacdPoint = {
  openTime: number;
  macd: number;
  signal: number;
  histogram: number;
};

export type RealtimeCanvasTrend = {
  tone: Sentiment;
  label: string;
  detail: string;
};

export type RealtimeCanvasSnapshot = {
  interval: RealtimeCanvasInterval;
  candles: RealtimeCanvasCandle[];
  macd: RealtimeCanvasMacdPoint[];
  low: number;
  high: number;
  changePercent: number;
  volatilityPercent: number;
  supportPrice: number | null;
  resistancePrice: number | null;
  trend: RealtimeCanvasTrend;
};

export type RealtimeCanvasData = {
  defaultInterval: RealtimeCanvasInterval;
  intervals: Record<RealtimeCanvasInterval, RealtimeCanvasSnapshot>;
};

export type MarketOverview = {
  symbol: string;
  displayName: string;
  price: number;
  change24h: number;
  fundingRate: string;
  longShortRatio: string;
  openInterest: string;
  validity: string;
  riskNote: string;
  support: string;
  resistance: string;
  defaultAlertPrice: number;
  sparkline: number[];
  realtimeCanvas?: RealtimeCanvasData | null;
  orderBookDepth?: OrderBookDepth | null;
  reportHighlights: string[];
  dimensions: MarketDimension[];
  history: SignalHistoryItem[];
};

export type MarketSymbolConfig = {
  symbol: string;
  displayName: string;
};

export const marketSymbolConfigs = {
  BTCUSDT: { symbol: "BTCUSDT", displayName: "Bitcoin" },
  ETHUSDT: { symbol: "ETHUSDT", displayName: "Ethereum" },
  BNBUSDT: { symbol: "BNBUSDT", displayName: "BNB" },
  SOLUSDT: { symbol: "SOLUSDT", displayName: "Solana" }
} as const satisfies Record<string, MarketSymbolConfig>;

export const marketSymbolKeys = Object.keys(marketSymbolConfigs) as Array<keyof typeof marketSymbolConfigs>;

export const baselineDimensionTemplates: MarketDimension[] = [
  {
    id: "trend",
    name: "趋势维度",
    shortLabel: "趋势",
    weight: 8,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待 Binance 趋势数据",
    summary: "等待实时 K 线返回后自动计算 EMA、ADX 与多周期结构。",
    note: "该维度只使用 Binance 实时/历史 K 线，不再使用本地假行情。",
    details: [
      { label: "EMA 排列", value: "--", insight: "等待 Binance K 线" },
      { label: "ADX/趋势强度", value: "--", insight: "等待实时计算" },
      { label: "价格 / 长期均线", value: "--", insight: "等待实时计算" }
    ]
  },
  {
    id: "momentum",
    name: "动量维度",
    shortLabel: "动量",
    weight: 9,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待 Binance 动量数据",
    summary: "等待 RSI、MACD 和短周期动量完成实时计算。",
    note: "该维度由真实 K 线派生，不展示预置结论。",
    details: [
      { label: "RSI(14)", value: "--", insight: "等待实时计算" },
      { label: "MACD", value: "--", insight: "等待实时计算" },
      { label: "动量变化", value: "--", insight: "等待实时计算" }
    ]
  },
  {
    id: "volume",
    name: "成交量维度",
    shortLabel: "量能",
    weight: 7,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待 Binance 成交量数据",
    summary: "等待成交量、量比和主动成交流完成实时计算。",
    note: "该维度只在真实成交量返回后生成方向性结论。",
    details: [
      { label: "量比", value: "--", insight: "等待 Binance K 线" },
      { label: "成交额", value: "--", insight: "等待 Binance ticker" },
      { label: "主动成交", value: "--", insight: "等待 aggTrade" }
    ]
  },
  {
    id: "volatility",
    name: "波动率维度",
    shortLabel: "波动",
    weight: 6,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待 Binance 波动率数据",
    summary: "等待布林带、ATR 和区间波动完成实时计算。",
    note: "实时行情恢复前保持中性。",
    details: [
      { label: "布林带宽度", value: "--", insight: "等待实时计算" },
      { label: "ATR", value: "--", insight: "等待实时计算" },
      { label: "波动分位", value: "--", insight: "等待实时计算" }
    ]
  },
  {
    id: "money-flow",
    name: "资金流维度",
    shortLabel: "资金",
    weight: 8,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待 Binance 成交流",
    summary: "等待 aggTrade 形成足够成交记录后计算主动买卖与大单流向。",
    note: "该维度来自真实成交流，不使用预置钱包或地址列表。",
    details: [
      { label: "Taker 买卖比", value: "--", insight: "等待 aggTrade" },
      { label: "成交净额", value: "--", insight: "等待 aggTrade" },
      { label: "大额成交", value: "--", insight: "等待聚类" }
    ]
  },
  {
    id: "sentiment",
    name: "市场情绪维度",
    shortLabel: "情绪",
    weight: 7,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待 Binance Futures 情绪数据",
    summary: "等待资金费率、多空比和未平仓合约数据返回。",
    note: "衍生品数据不可用时保持中性，不用假费率补位。",
    details: [
      { label: "资金费率", value: "--", insight: "等待 Futures premiumIndex" },
      { label: "多空比", value: "--", insight: "等待 Futures long/short ratio" },
      { label: "未平仓合约", value: "--", insight: "等待 Futures OI" }
    ]
  },
  {
    id: "on-chain",
    name: "链上数据维度",
    shortLabel: "链上",
    weight: 6,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待手动填充 / 真实数据接入",
    summary: "当前没有可靠自动链上源，留空时不参与方向性判断。",
    note: "用户手动填充后会即时重算；否则保持中性。",
    details: [
      { label: "交易所储备", value: "未填", insight: "可手动填充" },
      { label: "长线持有变化", value: "未填", insight: "可手动填充" },
      { label: "活跃地址变化", value: "未填", insight: "可手动填充" }
    ]
  },
  {
    id: "multi-timeframe",
    name: "多周期共振",
    shortLabel: "共振",
    weight: 9,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待多周期 K 线",
    summary: "等待 15m / 1H / 4H 实时 K 线共同返回后计算共振。",
    note: "没有实时数据时不展示预设共振结论。",
    details: [
      { label: "15m", value: "--", insight: "等待 Binance K 线" },
      { label: "1H", value: "--", insight: "等待 Binance K 线" },
      { label: "4H", value: "--", insight: "等待 Binance K 线" }
    ]
  },
  {
    id: "order-book",
    name: "订单簿维度",
    shortLabel: "订单簿",
    weight: 7,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待 Binance 深度数据",
    summary: "等待真实订单簿返回后计算买卖墙和失衡度。",
    note: "订单簿不可用时不生成假支撑/阻力。",
    details: [
      { label: "失衡度", value: "--", insight: "等待 depth" },
      { label: "买/卖墙", value: "--", insight: "等待 depth" },
      { label: "价差", value: "--", insight: "等待 depth" }
    ]
  },
  {
    id: "macro",
    name: "宏观关联维度",
    shortLabel: "宏观",
    weight: 4,
    enabled: true,
    score: 0,
    sentiment: "neutral",
    signal: "等待手动填充 / 真实数据接入",
    summary: "当前没有自动宏观源，留空时保持中性。",
    note: "用户手动填充 DXY、股指期货、恐惧贪婪后会参与重算。",
    details: [
      { label: "DXY 变化", value: "未填", insight: "可手动填充" },
      { label: "股指期货", value: "未填", insight: "可手动填充" },
      { label: "恐惧贪婪", value: "未填", insight: "可手动填充" }
    ]
  }
];
