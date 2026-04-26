import {
  type MarketDimension,
  type MarketOverview,
  type OrderBookDepth,
  signalUniverse
} from "../data/mockData";

export type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

export type SpotTicker24h = {
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
};

export type PremiumIndexResponse = {
  lastFundingRate: string;
};

export type OpenInterestResponse = {
  openInterest: string;
};

export type OpenInterestHistItem = {
  sumOpenInterest: string;
};

export type LongShortRatioItem = {
  longShortRatio: string;
};

export type AggregateTrade = {
  p: string;
  q: string;
  m: boolean;
  T: number;
};

export type DepthSnapshot = {
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
};

export type MiniTickerEvent = {
  e: "24hrMiniTicker";
  c: string;
  o: string;
};

export type DepthEvent = {
  e: "depthUpdate";
  b: Array<[string, string]>;
  a: Array<[string, string]>;
};

export type AggTradeEvent = {
  e: "aggTrade";
  p: string;
  q: string;
  m: boolean;
  T: number;
};

export type CombinedStreamMessage = {
  stream: string;
  data: MiniTickerEvent | DepthEvent | AggTradeEvent;
};

export type RawMarketSnapshot = {
  symbol: string;
  ticker: SpotTicker24h;
  klines15m: BinanceKline[];
  klines1h: BinanceKline[];
  klines4h: BinanceKline[];
  aggTrades: AggregateTrade[];
  depth: DepthSnapshot | null;
  fundingRate: number;
  longShortRatio: number | null;
  openInterestChange: number | null;
  openInterestValue: number | null;
};

export type TradeFlowMetrics = {
  buySellRatio: number;
  takerBuyVolume: number;
  takerSellVolume: number;
  rollingBaseDelta: number;
  rollingNotionalDelta: number;
  cumulativeBaseDelta: number;
  cumulativeNotionalDelta: number;
  largeBuyCount: number;
  largeSellCount: number;
  largeBuyNotional: number;
  largeSellNotional: number;
  totalTrades: number;
};

export type TradeFlowRuntime = {
  symbol: string;
  recentTrades: AggregateTrade[];
  cumulativeBaseDelta: number;
  cumulativeNotionalDelta: number;
};

export type CompositeSignalSummary = {
  label: string;
  tone: "bullish" | "bearish" | "neutral";
  confidence: number;
  position: string;
  stopLoss: string;
  compositeBias: number;
};

export type ManualContextMetrics = {
  exchangeReserveChange: number | null;
  longTermHolderChange: number | null;
  activeAddressChange: number | null;
  dxyChange: number | null;
  equityFuturesChange: number | null;
  fearGreedIndex: number | null;
};

function getOverviewTemplate(symbol: string): MarketOverview {
  return signalUniverse[symbol] ?? Object.values(signalUniverse)[0];
}

export function cloneOverview(symbol: string): MarketOverview {
  return JSON.parse(JSON.stringify(getOverviewTemplate(symbol))) as MarketOverview;
}

export function createBaselineOverview(symbol: string): MarketOverview {
  const template = getOverviewTemplate(symbol);

  return {
    symbol,
    displayName: template.displayName,
    price: 0,
    change24h: 0,
    fundingRate: "--",
    longShortRatio: "--",
    openInterest: "等待 Binance 衍生品数据",
    validity: "等待实时行情恢复",
    riskNote:
      "当前尚未拿到 Binance 公共行情，页面只保留中性基线与本地手动上下文，不展示伪造价格结论。",
    support: "等待买方深度恢复",
    resistance: "等待卖方深度恢复",
    defaultAlertPrice: 0,
    sparkline: Array.from({ length: 12 }, () => 0),
    orderBookDepth: null,
    reportHighlights: [
      "当前尚未拿到 Binance 公共行情，因此不再回退到本地 mock 价格。",
      "REST 或 WebSocket 恢复后，趋势、动量、量能与订单簿维度会自动重算。",
      "链上 / 宏观维度仍可通过手动填充做辅助修正。"
    ],
    dimensions: template.dimensions.map((dimension) => {
      const supportsManualContext = dimension.id === "on-chain" || dimension.id === "macro";

      return {
        ...dimension,
        score: 0,
        sentiment: "neutral",
        signal: supportsManualContext ? "等待手动填充 / 实时补充" : "等待实时数据",
        summary: supportsManualContext
          ? "当前暂无可靠自动数据源，可先手动填充后参与综合判断。"
          : "当前尚未获取该维度的 Binance 实时结论。",
        note: supportsManualContext
          ? "当前为中性基线；录入手动上下文后会立即重算该维度。"
          : "当前为中性基线；实时行情恢复后会自动重算。",
        details: dimension.details.map((detail) => ({
          label: detail.label,
          value: "--",
          insight: supportsManualContext ? "可通过手动填充修正" : "等待 Binance 公共行情"
        }))
      };
    }),
    history: []
  };
}

export function toNumber(value: string | number | undefined | null): number {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatSignedPercent(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatFundingRate(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}%`;
}

export function formatCurrency(value: number): string {
  const digits = value >= 10000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function hasManualMetric(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatOptionalSignedPercent(value: number | null, digits = 1): string {
  return hasManualMetric(value) ? formatSignedPercent(value, digits) : "未填";
}

function formatOptionalIndex(value: number | null): string {
  return hasManualMetric(value) ? `${Math.round(value)}` : "未填";
}

function hasOnChainManualMetrics(metrics: ManualContextMetrics): boolean {
  return (
    hasManualMetric(metrics.exchangeReserveChange) ||
    hasManualMetric(metrics.longTermHolderChange) ||
    hasManualMetric(metrics.activeAddressChange)
  );
}

function hasMacroManualMetrics(metrics: ManualContextMetrics): boolean {
  return (
    hasManualMetric(metrics.dxyChange) ||
    hasManualMetric(metrics.equityFuturesChange) ||
    hasManualMetric(metrics.fearGreedIndex)
  );
}

function scoreOnChainMetrics(metrics: ManualContextMetrics): number {
  let score = 0;

  if (hasManualMetric(metrics.exchangeReserveChange)) {
    if (metrics.exchangeReserveChange <= -1.5) {
      score += 3;
    } else if (metrics.exchangeReserveChange <= -0.5) {
      score += 1;
    } else if (metrics.exchangeReserveChange >= 1.5) {
      score -= 3;
    } else if (metrics.exchangeReserveChange >= 0.5) {
      score -= 1;
    }
  }

  if (hasManualMetric(metrics.longTermHolderChange)) {
    if (metrics.longTermHolderChange >= 1) {
      score += 2;
    } else if (metrics.longTermHolderChange <= -1) {
      score -= 2;
    }
  }

  if (hasManualMetric(metrics.activeAddressChange)) {
    if (metrics.activeAddressChange >= 4) {
      score += 2;
    } else if (metrics.activeAddressChange >= 1) {
      score += 1;
    } else if (metrics.activeAddressChange <= -4) {
      score -= 2;
    } else if (metrics.activeAddressChange <= -1) {
      score -= 1;
    }
  }

  return clamp(score, -6, 6);
}

function scoreMacroMetrics(metrics: ManualContextMetrics): number {
  let score = 0;

  if (hasManualMetric(metrics.dxyChange)) {
    if (metrics.dxyChange <= -0.3) {
      score += 2;
    } else if (metrics.dxyChange >= 0.3) {
      score -= 2;
    }
  }

  if (hasManualMetric(metrics.equityFuturesChange)) {
    if (metrics.equityFuturesChange >= 0.3) {
      score += 2;
    } else if (metrics.equityFuturesChange <= -0.3) {
      score -= 2;
    }
  }

  if (hasManualMetric(metrics.fearGreedIndex)) {
    if (metrics.fearGreedIndex <= 20) {
      score += 2;
    } else if (metrics.fearGreedIndex <= 40) {
      score += 1;
    } else if (metrics.fearGreedIndex >= 80) {
      score -= 2;
    } else if (metrics.fearGreedIndex >= 70) {
      score -= 1;
    }
  }

  return clamp(score, -4, 4);
}

function buildOnChainManualHighlight(metrics: ManualContextMetrics): string {
  return [
    `链上手动填充：交易所储备 ${formatOptionalSignedPercent(metrics.exchangeReserveChange)}`,
    `长线持有 ${formatOptionalSignedPercent(metrics.longTermHolderChange)}`,
    `活跃地址 ${formatOptionalSignedPercent(metrics.activeAddressChange)}`
  ].join("，");
}

function buildMacroManualHighlight(metrics: ManualContextMetrics): string {
  return [
    `宏观手动填充：DXY ${formatOptionalSignedPercent(metrics.dxyChange)}`,
    `股指期货 ${formatOptionalSignedPercent(metrics.equityFuturesChange)}`,
    `恐惧贪婪 ${formatOptionalIndex(metrics.fearGreedIndex)}`
  ].join("，");
}

export function applyManualContextOverlay(
  overview: MarketOverview,
  metrics: ManualContextMetrics
): MarketOverview {
  const hasOnChain = hasOnChainManualMetrics(metrics);
  const hasMacro = hasMacroManualMetrics(metrics);

  if (!hasOnChain && !hasMacro) {
    return overview;
  }

  let nextOverview: MarketOverview = overview;
  const manualHighlights: string[] = [];

  if (hasOnChain) {
    const onChainScore = scoreOnChainMetrics(metrics);
    manualHighlights.push(buildOnChainManualHighlight(metrics));
    nextOverview = {
      ...nextOverview,
      dimensions: replaceDimension(nextOverview.dimensions, "on-chain", (dimension) => ({
        ...dimension,
        score: onChainScore,
        sentiment: sentimentFromScore(onChainScore),
        signal:
          onChainScore > 1
            ? "链上筹码更偏锁仓"
            : onChainScore < -1
              ? "链上供给回流交易所"
              : "链上数据分化",
        summary:
          onChainScore > 1
            ? "用户填充的链上指标显示供给更偏收紧，筹码稳定性提升。"
            : onChainScore < -1
              ? "用户填充的链上指标显示供给重新回流交易所，卖压风险抬升。"
              : "链上数据没有形成单边共识，更多提供辅助参考。",
        note: "当前链上维度基于用户手动填充的数据实时重算，留空字段仍按中性处理。",
        details: [
          {
            label: "交易所储备",
            value: formatOptionalSignedPercent(metrics.exchangeReserveChange),
            insight: hasManualMetric(metrics.exchangeReserveChange)
              ? metrics.exchangeReserveChange < 0
                ? "储备下降，偏向提币锁仓"
                : "储备上升，潜在卖压增加"
              : "未手动填写，保持中性"
          },
          {
            label: "长线持有变化",
            value: formatOptionalSignedPercent(metrics.longTermHolderChange),
            insight: hasManualMetric(metrics.longTermHolderChange)
              ? metrics.longTermHolderChange >= 0
                ? "长线持有增加，筹码更稳定"
                : "长线持有下降，存在派发迹象"
              : "未手动填写，保持中性"
          },
          {
            label: "活跃地址变化",
            value: formatOptionalSignedPercent(metrics.activeAddressChange),
            insight: hasManualMetric(metrics.activeAddressChange)
              ? metrics.activeAddressChange >= 0
                ? "链上活跃度回升"
                : "链上活跃度走弱"
              : "未手动填写，保持中性"
          }
        ]
      }))
    };
  }

  if (hasMacro) {
    const macroScore = scoreMacroMetrics(metrics);
    manualHighlights.push(buildMacroManualHighlight(metrics));
    nextOverview = {
      ...nextOverview,
      dimensions: replaceDimension(nextOverview.dimensions, "macro", (dimension) => ({
        ...dimension,
        score: macroScore,
        sentiment: sentimentFromScore(macroScore),
        signal:
          macroScore > 1
            ? "宏观风险偏好偏暖"
            : macroScore < -1
              ? "宏观环境偏紧"
              : "宏观变量中性",
        summary:
          macroScore > 1
            ? "用户填充的宏观数据偏向风险资产友好，适合作为顺风参考。"
            : macroScore < -1
              ? "用户填充的宏观数据偏向美元走强或风险偏好回落，需降低追价意愿。"
              : "宏观输入没有形成明显单边共识，更适合辅助判断。",
        note: "当前宏观维度使用手动填充结果，不替代实时行情维度，只做辅助修正。",
        details: [
          {
            label: "DXY 变化",
            value: formatOptionalSignedPercent(metrics.dxyChange),
            insight: hasManualMetric(metrics.dxyChange)
              ? metrics.dxyChange <= 0
                ? "美元走弱，对风险资产更友好"
                : "美元走强，对风险资产偏压制"
              : "未手动填写，保持中性"
          },
          {
            label: "股指期货",
            value: formatOptionalSignedPercent(metrics.equityFuturesChange),
            insight: hasManualMetric(metrics.equityFuturesChange)
              ? metrics.equityFuturesChange >= 0
                ? "外围风险偏好回暖"
                : "外围风险偏好回落"
              : "未手动填写，保持中性"
          },
          {
            label: "恐惧贪婪",
            value: formatOptionalIndex(metrics.fearGreedIndex),
            insight: hasManualMetric(metrics.fearGreedIndex)
              ? metrics.fearGreedIndex <= 20
                ? "极度恐慌，偏反向利多"
                : metrics.fearGreedIndex >= 80
                  ? "极度贪婪，需防情绪透支"
                  : "情绪处于中间区域"
              : "未手动填写，保持中性"
          }
        ]
      }))
    };
  }

  return {
    ...nextOverview,
    reportHighlights: [...manualHighlights, ...overview.reportHighlights]
  };
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  let previous = values[0];

  return values.map((value, index) => {
    if (index === 0) {
      return previous;
    }

    previous = value * multiplier + previous * (1 - multiplier);
    return previous;
  });
}

function getLast(values: number[]): number {
  return values[values.length - 1] ?? 0;
}

function calculateRsi(values: number[], period = 14): number {
  if (values.length <= period) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function calculateMacd(values: number[]) {
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const macdLine = values.map((_, index) => (ema12[index] ?? 0) - (ema26[index] ?? 0));
  const signalLine = emaSeries(macdLine, 9);
  const histogram = getLast(macdLine) - getLast(signalLine);

  return {
    macd: getLast(macdLine),
    signal: getLast(signalLine),
    histogram
  };
}

function calculateVolumeRatio(klines: BinanceKline[]): number {
  if (klines.length < 6) {
    return 1;
  }

  const volumes = klines.map((item) => toNumber(item[5]));
  const lastVolume = volumes[volumes.length - 1] ?? 0;
  const baseline = volumes.slice(Math.max(volumes.length - 21, 0), volumes.length - 1);
  const averageVolume = baseline.reduce((sum, value) => sum + value, 0) / Math.max(baseline.length, 1);

  if (averageVolume === 0) {
    return 1;
  }

  return lastVolume / averageVolume;
}

function calculateRangePercent(high: number, low: number, anchor: number): number {
  if (anchor <= 0) {
    return 0;
  }

  return ((high - low) / anchor) * 100;
}

export function calculateOrderImbalance(depth: DepthSnapshot | null): number {
  if (!depth) {
    return 0;
  }

  const bidQty = depth.bids.reduce((sum, [, quantity]) => sum + toNumber(quantity), 0);
  const askQty = depth.asks.reduce((sum, [, quantity]) => sum + toNumber(quantity), 0);
  const total = bidQty + askQty;

  if (total === 0) {
    return 0;
  }

  return (bidQty - askQty) / total;
}

function buildDepthSide(
  levels: Array<[string, string]>,
  direction: "bid" | "ask"
): OrderBookDepth["bids"] {
  const sorted = levels
    .map(([price, quantity]) => ({
      price: toNumber(price),
      quantity: toNumber(quantity)
    }))
    .filter((level) => level.price > 0 && level.quantity > 0)
    .sort((left, right) =>
      direction === "bid" ? right.price - left.price : left.price - right.price
    );

  let cumulative = 0;

  return sorted.map((level) => {
    cumulative += level.quantity;
    return {
      ...level,
      cumulative
    };
  });
}

export function buildOrderBookDepth(depth: DepthSnapshot | null): OrderBookDepth | null {
  if (!depth) {
    return null;
  }

  const bids = buildDepthSide(depth.bids, "bid");
  const asks = buildDepthSide(depth.asks, "ask");

  if (bids.length === 0 || asks.length === 0) {
    return null;
  }

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const midpoint = (bestBid + bestAsk) / 2;
  const spreadPercent =
    midpoint > 0 ? ((bestAsk - bestBid) / midpoint) * 100 : 0;

  return {
    bids,
    asks,
    spreadPercent,
    imbalance: calculateOrderImbalance(depth)
  };
}

export function selectWall(levels: Array<[string, string]>, label: string): string {
  if (levels.length === 0) {
    return label;
  }

  const wall = levels
    .map(([price, quantity]) => ({
      price: toNumber(price),
      quantity: toNumber(quantity)
    }))
    .sort((left, right) => right.quantity - left.quantity)[0];

  if (!wall) {
    return label;
  }

  return `${formatCurrency(wall.price)} ${label}`;
}

export function getLargeTradeThreshold(symbol: string): number {
  return symbol.startsWith("BTC") ? 400000 : 150000;
}

function getTradeDelta(trade: AggregateTrade) {
  const price = toNumber(trade.p);
  const quantity = toNumber(trade.q);
  const notional = price * quantity;
  const direction = trade.m ? -1 : 1;

  return {
    quantity,
    notional,
    baseDelta: quantity * direction,
    notionalDelta: notional * direction,
    isAggressiveSell: trade.m
  };
}

export function summarizeTradeFlow(trades: AggregateTrade[], symbol: string): TradeFlowMetrics {
  const threshold = getLargeTradeThreshold(symbol);

  const summary = trades.reduce<TradeFlowMetrics>(
    (accumulator, trade) => {
      const delta = getTradeDelta(trade);

      if (delta.isAggressiveSell) {
        accumulator.takerSellVolume += delta.quantity;

        if (delta.notional >= threshold) {
          accumulator.largeSellCount += 1;
          accumulator.largeSellNotional += delta.notional;
        }
      } else {
        accumulator.takerBuyVolume += delta.quantity;

        if (delta.notional >= threshold) {
          accumulator.largeBuyCount += 1;
          accumulator.largeBuyNotional += delta.notional;
        }
      }

      accumulator.rollingBaseDelta += delta.baseDelta;
      accumulator.rollingNotionalDelta += delta.notionalDelta;
      accumulator.totalTrades += 1;
      return accumulator;
    },
    {
      buySellRatio: 1,
      takerBuyVolume: 0,
      takerSellVolume: 0,
      rollingBaseDelta: 0,
      rollingNotionalDelta: 0,
      cumulativeBaseDelta: 0,
      cumulativeNotionalDelta: 0,
      largeBuyCount: 0,
      largeSellCount: 0,
      largeBuyNotional: 0,
      largeSellNotional: 0,
      totalTrades: 0
    }
  );

  return finalizeTradeFlowMetrics(
    summary,
    summary.rollingBaseDelta,
    summary.rollingNotionalDelta
  );
}

export function finalizeTradeFlowMetrics(
  summary: TradeFlowMetrics,
  cumulativeBaseDelta = summary.cumulativeBaseDelta,
  cumulativeNotionalDelta = summary.cumulativeNotionalDelta
): TradeFlowMetrics {
  return {
    ...summary,
    buySellRatio:
      summary.takerSellVolume > 0 ? summary.takerBuyVolume / summary.takerSellVolume : summary.takerBuyVolume > 0 ? 2 : 1,
    cumulativeBaseDelta,
    cumulativeNotionalDelta
  };
}

function scoreTradeFlow(summary: TradeFlowMetrics): number {
  if (summary.buySellRatio >= 1.15 && summary.rollingBaseDelta > 0 && summary.cumulativeBaseDelta > 0) {
    return 8;
  }

  if (summary.buySellRatio >= 1.03 && summary.rollingBaseDelta > 0) {
    return 4;
  }

  if (summary.buySellRatio <= 0.85 && summary.rollingBaseDelta < 0 && summary.cumulativeBaseDelta < 0) {
    return -8;
  }

  if (summary.buySellRatio <= 0.97 && summary.rollingBaseDelta < 0) {
    return -4;
  }

  return 1;
}

function describeLargeTradeBias(summary: TradeFlowMetrics): string {
  if (summary.largeBuyCount > summary.largeSellCount) {
    return `大额买单 ${summary.largeBuyCount} 笔，占优于卖单 ${summary.largeSellCount} 笔`;
  }

  if (summary.largeSellCount > summary.largeBuyCount) {
    return `大额卖单 ${summary.largeSellCount} 笔，占优于买单 ${summary.largeBuyCount} 笔`;
  }

  return `大额成交买卖接近平衡（买 ${summary.largeBuyCount} / 卖 ${summary.largeSellCount}）`;
}

function sentimentFromScore(score: number): MarketDimension["sentiment"] {
  if (score > 1) {
    return "bullish";
  }

  if (score < -1) {
    return "bearish";
  }

  return "neutral";
}

export function replaceDimension(
  dimensions: MarketDimension[],
  id: string,
  transform: (dimension: MarketDimension) => MarketDimension
): MarketDimension[] {
  return dimensions.map((dimension) => (dimension.id === id ? transform(dimension) : dimension));
}

export function buildMoneyFlowHighlight(summary: TradeFlowMetrics): string {
  if (summary.buySellRatio >= 1.1 && summary.cumulativeBaseDelta > 0) {
    return `资金流维度显示 taker 买卖比 ${summary.buySellRatio.toFixed(2)}，CVD 累积仍在抬升。`;
  }

  if (summary.buySellRatio <= 0.9 && summary.cumulativeBaseDelta < 0) {
    return `资金流维度显示 taker 买卖比 ${summary.buySellRatio.toFixed(2)}，CVD 累积继续走弱。`;
  }

  return `资金流维度显示 taker 买卖比 ${summary.buySellRatio.toFixed(2)}，主动性与 CVD 处于拉锯。`;
}

export function applyMoneyFlowDimension(
  dimensions: MarketDimension[],
  symbol: string,
  summary: TradeFlowMetrics
): MarketDimension[] {
  const moneyFlowScore = scoreTradeFlow(summary);

  return replaceDimension(dimensions, "money-flow", (dimension) => ({
    ...dimension,
    score: moneyFlowScore,
    sentiment: sentimentFromScore(moneyFlowScore),
    signal:
      moneyFlowScore > 1
        ? "主动买盘占优 + CVD 抬升"
        : moneyFlowScore < -1
          ? "主动卖盘占优 + CVD 转弱"
          : "资金流暂时均衡",
    summary:
      moneyFlowScore > 1
        ? "近期成交中的 taker 买入更主动，且 CVD 累积保持向上。"
        : moneyFlowScore < -1
          ? "近期成交中的 taker 卖出更主动，且 CVD 累积继续走弱。"
          : "主动买卖量差异有限，CVD 也没有形成决定性趋势。",
    note: `Taker 买卖比 ${summary.buySellRatio.toFixed(2)}，滚动 CVD ${summary.rollingBaseDelta.toFixed(4)}，累计 CVD ${summary.cumulativeBaseDelta.toFixed(4)}。`,
    details: [
      {
        label: "Taker 买卖比",
        value: summary.buySellRatio.toFixed(2),
        insight: summary.buySellRatio >= 1 ? "主动买盘更强" : "主动卖盘更强"
      },
      {
        label: "滚动 CVD",
        value: summary.rollingBaseDelta.toFixed(4),
        insight: "基于 recent aggTrades 的基础币成交量差"
      },
      {
        label: "累计 CVD",
        value: summary.cumulativeBaseDelta.toFixed(4),
        insight: "会话期内主动买卖量累计差"
      },
      {
        label: "大额成交",
        value: describeLargeTradeBias(summary),
        insight: `阈值约 ${formatCompact(getLargeTradeThreshold(symbol))} USDT`
      }
    ]
  }));
}

export function createTradeFlowRuntime(symbol: string, seedTrades: AggregateTrade[]): TradeFlowRuntime {
  const seedMetrics = summarizeTradeFlow(seedTrades, symbol);

  return {
    symbol,
    recentTrades: [...seedTrades],
    cumulativeBaseDelta: seedMetrics.cumulativeBaseDelta,
    cumulativeNotionalDelta: seedMetrics.cumulativeNotionalDelta
  };
}

export function appendTradeToRuntime(runtime: TradeFlowRuntime, trade: AggregateTrade, maxTrades: number) {
  runtime.recentTrades.push(trade);

  if (runtime.recentTrades.length > maxTrades) {
    runtime.recentTrades.splice(0, runtime.recentTrades.length - maxTrades);
  }

  const delta = getTradeDelta(trade);
  runtime.cumulativeBaseDelta += delta.baseDelta;
  runtime.cumulativeNotionalDelta += delta.notionalDelta;

  const rollingSummary = summarizeTradeFlow(runtime.recentTrades, runtime.symbol);

  return finalizeTradeFlowMetrics(
    rollingSummary,
    runtime.cumulativeBaseDelta,
    runtime.cumulativeNotionalDelta
  );
}

function buildRiskNote(args: {
  rsi: number;
  fundingRate: number;
  orderImbalance: number;
  rangePercent: number;
}): string {
  if (args.rsi > 70) {
    return "RSI 已进入高位区，若量价无法继续放大，短线需防止冲高回落。";
  }

  if (args.fundingRate > 0.03) {
    return "资金费率偏高，多头开始拥挤，继续追涨的性价比下降。";
  }

  if (args.orderImbalance < -0.18) {
    return "盘口卖压偏重，若买方无法快速回补，容易先走震荡回撤。";
  }

  if (args.rangePercent > 6) {
    return "24H 波动率已经明显扩张，短线更适合等回踩确认而不是情绪化追单。";
  }

  return "当前波动仍可控，但需要继续观察成交量与订单簿是否同步确认趋势。";
}

function buildHighlights(args: {
  trendMessage: string;
  volumeRatio: number;
  orderImbalance: number;
  fundingRate: number;
  support: string;
  tradeFlow: TradeFlowMetrics;
}): string[] {
  const volumeLine =
    args.volumeRatio >= 1.2
      ? `最近一根 15m K 线量比约 ${args.volumeRatio.toFixed(2)}x，量价共振更有说服力。`
      : `最近一根 15m K 线量比约 ${args.volumeRatio.toFixed(2)}x，量能尚未进入爆发段。`;

  const orderBookLine =
    args.orderImbalance >= 0.18
      ? `订单簿失衡度 ${args.orderImbalance.toFixed(2)}，买方墙更强，近端支撑在 ${args.support}。`
      : args.orderImbalance <= -0.18
        ? `订单簿失衡度 ${args.orderImbalance.toFixed(2)}，卖方阻力更重，需等盘口重新平衡。`
        : `订单簿失衡度 ${args.orderImbalance.toFixed(2)}，短线深度分布偏均衡。`;

  const sentimentLine =
    args.fundingRate < 0
      ? `资金费率 ${formatFundingRate(args.fundingRate)}，空头拥挤，存在逼空弹性。`
      : `资金费率 ${formatFundingRate(args.fundingRate)}，市场偏多但拥挤度也在上升。`;

  return [
    args.trendMessage,
    volumeLine,
    buildMoneyFlowHighlight(args.tradeFlow),
    orderBookLine,
    sentimentLine
  ];
}

function buildSignalValidity(args: {
  rangePercent: number;
  volumeRatio: number;
  orderImbalance: number;
}): string {
  if (args.rangePercent >= 6 || Math.abs(args.orderImbalance) >= 0.22) {
    return "约 15-20 分钟，建议快速复核";
  }

  if (args.volumeRatio >= 1.2) {
    return "约 20-30 分钟";
  }

  return "约 30-60 分钟";
}

export function applyOrderBookDimension(
  dimensions: MarketDimension[],
  orderImbalance: number,
  support: string,
  resistance: string,
  spreadPercent?: number
): MarketDimension[] {
  return replaceDimension(dimensions, "order-book", (dimension) => ({
    ...dimension,
    score: orderImbalance >= 0.18 ? 6 : orderImbalance <= -0.18 ? -6 : 0,
    sentiment: sentimentFromScore(orderImbalance >= 0.18 ? 6 : orderImbalance <= -0.18 ? -6 : 0),
    signal:
      orderImbalance >= 0.18
        ? "买盘失衡"
        : orderImbalance <= -0.18
          ? "卖盘失衡"
          : "深度均衡",
    summary:
      orderImbalance >= 0.18
        ? "盘口买方墙更明显，回踩更容易得到承接。"
        : orderImbalance <= -0.18
          ? "盘口卖压更强，上方阻力短线更清晰。"
          : "盘口深度分布接近平衡，短线方向还需更多确认。",
    note: `失衡度 ${(orderImbalance * 100).toFixed(1)}%，支撑 ${support}，阻力 ${resistance}。`,
    details: [
      { label: "失衡度", value: orderImbalance.toFixed(2), insight: "(买单量 - 卖单量) / 总挂单量" },
      { label: "支撑墙", value: support, insight: "当前盘口中最强买方挂单" },
      { label: "阻力墙", value: resistance, insight: "当前盘口中最强卖方挂单" },
      {
        label: "价差",
        value: `${spreadPercent?.toFixed(3) ?? "0.000"}%`,
        insight: "买一卖一价差，越小通常代表流动性越好"
      }
    ]
  }));
}

export function buildLiveOverview(args: RawMarketSnapshot): MarketOverview {
  const overview = createBaselineOverview(args.symbol);
  const closes15m = args.klines15m.map((item) => toNumber(item[4]));
  const closes1h = args.klines1h.map((item) => toNumber(item[4]));
  const closes4h = args.klines4h.map((item) => toNumber(item[4]));
  const closePrice = toNumber(args.ticker.lastPrice);
  const highPrice = toNumber(args.ticker.highPrice);
  const lowPrice = toNumber(args.ticker.lowPrice);
  const change24h = toNumber(args.ticker.priceChangePercent);
  const volumeRatio = calculateVolumeRatio(args.klines15m);
  const orderImbalance = calculateOrderImbalance(args.depth);
  const orderBookDepth = buildOrderBookDepth(args.depth);
  const tradeFlow = summarizeTradeFlow(args.aggTrades, args.symbol);
  const ema9 = getLast(emaSeries(closes15m, 9));
  const ema21 = getLast(emaSeries(closes15m, 21));
  const ema50 = getLast(emaSeries(closes15m, 50));
  const rsi = calculateRsi(closes15m, 14);
  const macd = calculateMacd(closes15m);
  const shortTrend = closePrice > getLast(emaSeries(closes15m, 9)) ? 1 : -1;
  const midTrend = getLast(emaSeries(closes1h, 12)) > getLast(emaSeries(closes1h, 26)) ? 2 : -2;
  const longTrend = closePrice > getLast(emaSeries(closes4h, 21)) ? 3 : -3;
  const multiTimeframeScore = shortTrend + midTrend + longTrend;
  const support = args.depth ? selectWall(args.depth.bids, "买方墙") : `${formatCurrency(lowPrice)} 日内低点`;
  const resistance = args.depth ? selectWall(args.depth.asks, "卖方墙") : `${formatCurrency(highPrice)} 日内高点`;
  const rangePercent = calculateRangePercent(highPrice, lowPrice, closePrice);
  const openInterestText =
    args.openInterestChange === null
      ? overview.openInterest
      : `${formatSignedPercent(args.openInterestChange)}${
          args.openInterestValue ? ` · ${formatCompact(args.openInterestValue)} ${args.symbol.replace("USDT", "")}` : ""
        }`;

  overview.price = closePrice;
  overview.change24h = change24h;
  overview.fundingRate = formatFundingRate(args.fundingRate);
  overview.longShortRatio = args.longShortRatio === null ? overview.longShortRatio : args.longShortRatio.toFixed(2);
  overview.openInterest = openInterestText;
  overview.support = support;
  overview.resistance = resistance;
  overview.validity = buildSignalValidity({
    rangePercent,
    volumeRatio,
    orderImbalance
  });
  overview.sparkline = closes15m.slice(-12);
  overview.orderBookDepth = orderBookDepth ?? overview.orderBookDepth ?? null;
  overview.defaultAlertPrice = Math.round(closePrice);

  const trendScore =
    closePrice > ema9 && ema9 > ema21 && ema21 > ema50
      ? 8
      : closePrice < ema9 && ema9 < ema21 && ema21 < ema50
        ? -8
        : 1;
  const momentumScore = rsi > 68 ? -2 : macd.histogram > 0 && rsi > 52 ? 5 : rsi < 35 ? 4 : 0;
  const volumeScore = volumeRatio >= 1.2 ? (change24h >= 0 ? 6 : -5) : 1;
  const volatilityScore = rangePercent > 6 ? -3 : rangePercent < 3 ? 2 : 0;
  const sentimentScore =
    args.fundingRate < -0.01 && (args.longShortRatio ?? 1) < 0.9
      ? 6
      : args.fundingRate > 0.03 && (args.longShortRatio ?? 1) > 1.3
        ? -4
        : 1;

  overview.riskNote = buildRiskNote({
    rsi,
    fundingRate: args.fundingRate,
    orderImbalance,
    rangePercent
  });
  overview.reportHighlights = buildHighlights({
    trendMessage:
      trendScore > 1
        ? `15m 趋势维度维持多头排列，EMA9 ${formatCurrency(ema9)} / EMA21 ${formatCurrency(ema21)} / EMA50 ${formatCurrency(ema50)}。`
        : trendScore < -1
          ? `15m 趋势维度转弱，价格已经跌回 EMA 组下方，需降低追多预期。`
          : `15m 趋势还在整理区，价格围绕 EMA9 与 EMA21 反复拉扯。`,
    volumeRatio,
    orderImbalance,
    fundingRate: args.fundingRate,
    support,
    tradeFlow
  });

  overview.dimensions = replaceDimension(overview.dimensions, "trend", (dimension) => ({
    ...dimension,
    score: trendScore,
    sentiment: sentimentFromScore(trendScore),
    signal:
      trendScore > 1 ? "实时 EMA 多头排列" : trendScore < -1 ? "实时 EMA 空头排列" : "实时 EMA 进入拉锯",
    summary:
      trendScore > 1
        ? "价格站在 15m EMA9 / EMA21 / EMA50 上方，短线趋势仍偏多。"
        : trendScore < -1
          ? "价格滑落到 15m EMA 组下方，短线结构转弱。"
          : "EMA 组正在收敛，当前更像整理而不是单边。",
    note: `实时收盘价 ${formatCurrency(closePrice)}，EMA9 ${formatCurrency(ema9)}，EMA21 ${formatCurrency(ema21)}，EMA50 ${formatCurrency(ema50)}。`,
    details: [
      { label: "EMA9", value: formatCurrency(ema9), insight: "用于观察最短线的节奏变化" },
      { label: "EMA21", value: formatCurrency(ema21), insight: "代表波段参与者的中短期成本" },
      { label: "EMA50", value: formatCurrency(ema50), insight: "衡量更稳定的趋势边界" }
    ]
  }));

  overview.dimensions = replaceDimension(overview.dimensions, "momentum", (dimension) => ({
    ...dimension,
    score: momentumScore,
    sentiment: sentimentFromScore(momentumScore),
    signal:
      momentumScore > 1 ? "MACD 动量延续" : momentumScore < -1 ? "高位动量钝化" : "动量中性",
    summary:
      momentumScore > 1
        ? "MACD 维持正柱，RSI 落在强势区，动量尚可。"
        : momentumScore < -1
          ? "RSI 接近或进入高位区，短线动量开始透支。"
          : "MACD 与 RSI 还没有给出明确单边方向。",
    note: `RSI ${rsi.toFixed(1)}，MACD ${macd.macd.toFixed(2)}，Signal ${macd.signal.toFixed(2)}。`,
    details: [
      { label: "RSI(14)", value: rsi.toFixed(1), insight: rsi > 70 ? "接近超买区域" : rsi < 30 ? "接近超卖区域" : "仍在可交易区间" },
      { label: "MACD", value: macd.macd.toFixed(2), insight: macd.macd >= macd.signal ? "快线位于慢线上方" : "快线位于慢线下方" },
      { label: "Histogram", value: macd.histogram.toFixed(2), insight: macd.histogram >= 0 ? "动量柱为正" : "动量柱为负" }
    ]
  }));

  overview.dimensions = replaceDimension(overview.dimensions, "volume", (dimension) => ({
    ...dimension,
    score: volumeScore,
    sentiment: sentimentFromScore(volumeScore),
    signal: volumeScore > 1 ? "量价共振" : volumeScore < -1 ? "放量下压" : "量能一般",
    summary:
      volumeScore > 1
        ? "最新 15m K 线在放量基础上继续推高价格。"
        : volumeScore < -1
          ? "最新 15m K 线放量但价格走弱，卖压更主动。"
          : "量能暂时没有放出决定性差异。",
    note: `量比约 ${volumeRatio.toFixed(2)}x，24H 涨跌 ${formatSignedPercent(change24h)}。`,
    details: [
      { label: "量比", value: `${volumeRatio.toFixed(2)}x`, insight: "对比最近 20 根 15m K 线均量" },
      { label: "24H 成交量", value: formatCompact(toNumber(args.ticker.volume)), insight: "基础币成交量" },
      { label: "24H 成交额", value: formatCompact(toNumber(args.ticker.quoteVolume)), insight: "USDT 计价成交额" }
    ]
  }));

  overview.dimensions = applyMoneyFlowDimension(overview.dimensions, args.symbol, tradeFlow);

  overview.dimensions = replaceDimension(overview.dimensions, "volatility", (dimension) => ({
    ...dimension,
    score: volatilityScore,
    sentiment: sentimentFromScore(volatilityScore),
    signal: volatilityScore < -1 ? "高波动风险抬升" : "波动率仍可控",
    summary:
      volatilityScore < -1
        ? "24H 振幅处在偏高区，追价需要更严格的风控。"
        : "24H 振幅尚未进入极端区，波动风险相对可控。",
    note: `24H 高点 ${formatCurrency(highPrice)} / 低点 ${formatCurrency(lowPrice)} / 振幅 ${rangePercent.toFixed(2)}%。`,
    details: [
      { label: "24H 高点", value: formatCurrency(highPrice), insight: "日内上沿压力位参考" },
      { label: "24H 低点", value: formatCurrency(lowPrice), insight: "日内下沿支撑位参考" },
      { label: "振幅", value: `${rangePercent.toFixed(2)}%`, insight: "越大说明波动越剧烈" }
    ]
  }));

  overview.dimensions = replaceDimension(overview.dimensions, "sentiment", (dimension) => ({
    ...dimension,
    score: sentimentScore,
    sentiment: sentimentFromScore(sentimentScore),
    signal: sentimentScore > 1 ? "情绪反向利多" : sentimentScore < -1 ? "多头开始拥挤" : "情绪中性",
    summary:
      sentimentScore > 1
        ? "资金费率与多空比组合显示市场偏空，反而有利于反身性上冲。"
        : sentimentScore < -1
          ? "资金费率转高且多空比偏多，追涨需要更谨慎。"
          : "当前情绪对价格的边际影响有限。",
    note: `资金费率 ${formatFundingRate(args.fundingRate)}，多空比 ${overview.longShortRatio}。`,
    details: [
      { label: "资金费率", value: formatFundingRate(args.fundingRate), insight: args.fundingRate < 0 ? "空头拥挤" : "多头更积极" },
      { label: "多空比", value: overview.longShortRatio, insight: (args.longShortRatio ?? 1) < 1 ? "偏空结构" : "偏多结构" },
      { label: "未平仓变化", value: openInterestText, insight: "用于判断杠杆资金是否继续入场" }
    ]
  }));

  overview.dimensions = replaceDimension(overview.dimensions, "multi-timeframe", (dimension) => ({
    ...dimension,
    score: multiTimeframeScore,
    sentiment: sentimentFromScore(multiTimeframeScore),
    signal:
      multiTimeframeScore >= 4
        ? "15m / 1H / 4H 共振偏多"
        : multiTimeframeScore <= -4
          ? "15m / 1H / 4H 共振偏空"
          : "多周期分化",
    summary:
      multiTimeframeScore >= 4
        ? "短中长周期在当前价位形成一致偏多结构。"
        : multiTimeframeScore <= -4
          ? "短中长周期同步转弱，逆势抄底风险较高。"
          : "当前更像结构分化，适合等待更清晰的共振。",
    note: `短周期 ${shortTrend > 0 ? "+1" : "-1"} / 中周期 ${midTrend > 0 ? "+2" : "-2"} / 长周期 ${longTrend > 0 ? "+3" : "-3"}。`,
    details: [
      { label: "15m", value: shortTrend > 0 ? "+1" : "-1", insight: shortTrend > 0 ? "价格站在 15m EMA9 上方" : "价格跌回 15m EMA9 下方" },
      { label: "1H", value: midTrend > 0 ? "+2" : "-2", insight: midTrend > 0 ? "1H EMA12 > EMA26" : "1H EMA12 < EMA26" },
      { label: "4H", value: longTrend > 0 ? "+3" : "-3", insight: longTrend > 0 ? "价格站在 4H 趋势均线上方" : "价格跌回 4H 趋势均线下方" }
    ]
  }));

  overview.dimensions = applyOrderBookDimension(
    overview.dimensions,
    orderImbalance,
    support,
    resistance,
    orderBookDepth?.spreadPercent
  );

  return overview;
}

export function deriveCompositeSignal(dimensions: MarketDimension[]): CompositeSignalSummary {
  const bullishScore = dimensions.reduce(
    (sum, dimension) => sum + Math.max(dimension.score, 0) * dimension.weight,
    0
  );
  const bearishScore = dimensions.reduce(
    (sum, dimension) => sum + Math.max(-dimension.score, 0) * dimension.weight,
    0
  );
  const scaleBase = dimensions.reduce((sum, dimension) => sum + dimension.weight * 10, 0) || 1;
  const buyStrength = bullishScore / scaleBase;
  const sellStrength = bearishScore / scaleBase;
  const compositeBias = Math.round(((bullishScore - bearishScore) / scaleBase) * 100);
  const confidence = Math.round(Math.max(buyStrength, sellStrength) * 100);

  let label = "中性观望";
  let tone: CompositeSignalSummary["tone"] = "neutral";
  let position = "10% 试探仓";
  let stopLoss = "-1.8%";

  if (buyStrength >= 0.7) {
    label = "强烈买入";
    tone = "bullish";
    position = "40% 仓位";
    stopLoss = "-3.0%";
  } else if (buyStrength >= 0.5) {
    label = "谨慎买入";
    tone = "bullish";
    position = "25% 仓位";
    stopLoss = "-2.2%";
  } else if (sellStrength >= 0.7) {
    label = "强烈卖出";
    tone = "bearish";
    position = "0% 现货，保留对冲";
    stopLoss = "+3.0%";
  } else if (sellStrength >= 0.5) {
    label = "谨慎卖出";
    tone = "bearish";
    position = "降低至 15% 观察仓";
    stopLoss = "+2.2%";
  }

  return {
    label,
    tone,
    confidence,
    position,
    stopLoss,
    compositeBias
  };
}
