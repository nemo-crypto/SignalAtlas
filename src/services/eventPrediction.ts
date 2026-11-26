import { type BinanceKline, toNumber, summarizeOpenInterestHistory } from "./marketAnalysis";
import { type StoredEventCandle, type StoredEventPrediction } from "./persistence";

export type EventPredictionSymbol = "BTCUSDT" | "ETHUSDT";
export type EventHorizonMinutes = 30 | 1440;
export type EventDirection = "UP" | "DOWN" | "WAIT";
export type EventPredictionMode = "high-probability" | "every-minute";
export type EventPredictionTone = "bullish" | "bearish" | "neutral";

export type EventCandle = {
  id: string;
  symbol: EventPredictionSymbol;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyBaseVolume?: number;
  takerBuyQuoteVolume?: number;
  tradeCount?: number;
  storedAt: number;
};

export type EventHorizonConfig = {
  id: string;
  minutes: EventHorizonMinutes;
  label: string;
  contractLabel: string;
  shortLabel: string;
  minHistory: number;
  trendWindow: number;
  momentumWindows: [number, number, number];
  volumeWindow: number;
  atrWindow: number;
  movementUnitPercent: number;
  defaultThreshold: number;
  maxAtrPercent: number;
  minExpectedMovePercent: number;
  minConsensusRatio: number;
  cooldownMinutes: number;
};

export type EventPredictionSignal = {
  symbol: EventPredictionSymbol;
  horizonMinutes: EventHorizonMinutes;
  horizonLabel: string;
  contractLabel: string;
  recordedAt: number;
  expiryAt: number;
  basePrice: number;
  direction: EventDirection;
  tone: EventPredictionTone;
  probability: number;
  threshold: number;
  edge: number;
  score: number;
  actionable: boolean;
  confidenceLabel: string;
  reasons: string[];
  warnings: string[];
  dataPoints: number;
  strategyVersion: string;
};

export type EventMarketContext = {
  symbol: EventPredictionSymbol;
  fundingRatePercent: number | null;
  longShortRatio: number | null;
  openInterestChangePercent: number | null;
  quoteVolume24h: number | null;
  priceChange24h: number | null;
  updatedAt: number;
  source: "live" | "partial" | "unavailable";
};

export type EventBacktestTrade = {
  id: string;
  symbol: EventPredictionSymbol;
  horizonMinutes: EventHorizonMinutes;
  direction: Exclude<EventDirection, "WAIT">;
  probability: number;
  openedAt: number;
  expiryAt: number;
  basePrice: number;
  settledPrice: number;
  correct: boolean;
  pnl: number;
  balance: number;
};

export type EventBacktestBucket = {
  key: string;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
};

export type EventBacktestSummary = {
  initialBalance: number;
  finalBalance: number;
  totalPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  profitFactor: number | null;
  expectancy: number;
  averageProbability: number;
  skippedSignals: number;
  dataStartAt: number | null;
  dataEndAt: number | null;
  buckets: EventBacktestBucket[];
  recentTrades: EventBacktestTrade[];
};

export type EventBacktestArgs = {
  candlesBySymbol: Partial<Record<EventPredictionSymbol, EventCandle[]>>;
  symbols: EventPredictionSymbol[];
  horizons: EventHorizonMinutes[];
  mode: EventPredictionMode;
  minProbability: number;
  initialBalance: number;
  stake: number;
  payoutRatio: number;
  sampleStepMinutes?: number;
};

const SPOT_BASE = "https://api.binance.com";
const ONE_MINUTE_MS = 60_000;
const KLINE_LIMIT = 1000;
const MAX_STRATEGY_LOOKBACK = 2_880;
const FUTURES_BASE = "https://fapi.binance.com";

type BinancePremiumIndexResponse = {
  lastFundingRate: string;
};

type BinanceLongShortRatioResponse = {
  longShortRatio: string;
};

type BinanceOpenInterestHistResponse = {
  sumOpenInterest: string;
  timestamp: number;
};

type BinanceTicker24hResponse = {
  priceChangePercent: string;
  quoteVolume: string;
};

export const EVENT_STRATEGY_VERSION = "event-multifactor-v2.0";

export const EVENT_SYMBOLS: EventPredictionSymbol[] = ["BTCUSDT", "ETHUSDT"];

export const EVENT_HORIZONS: EventHorizonConfig[] = [
  {
    id: "30m",
    minutes: 30,
    label: "30 分钟",
    contractLabel: "Binance 30m 事件合约",
    shortLabel: "30m",
    minHistory: 240,
    trendWindow: 120,
    momentumWindows: [10, 20, 30],
    volumeWindow: 45,
    atrWindow: 45,
    movementUnitPercent: 0.34,
    defaultThreshold: 74,
    maxAtrPercent: 0.46,
    minExpectedMovePercent: 0.12,
    minConsensusRatio: 0.62,
    cooldownMinutes: 10
  },
  {
    id: "1d",
    minutes: 1440,
    label: "1 日",
    contractLabel: "Binance 1d 事件合约",
    shortLabel: "1d",
    minHistory: 2400,
    trendWindow: 960,
    momentumWindows: [120, 360, 960],
    volumeWindow: 240,
    atrWindow: 240,
    movementUnitPercent: 2.4,
    defaultThreshold: 78,
    maxAtrPercent: 1.35,
    minExpectedMovePercent: 0.75,
    minConsensusRatio: 0.58,
    cooldownMinutes: 240
  }
];

export function getEventHorizonConfig(minutes: EventHorizonMinutes): EventHorizonConfig {
  return EVENT_HORIZONS.find((item) => item.minutes === minutes) ?? EVENT_HORIZONS[0];
}

export function formatEventPrice(value: number, symbol?: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const digits = symbol?.startsWith("BTC") ? 0 : value >= 1000 ? 2 : 3;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatEventUsd(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatSignedEventUsd(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatEventUsd(Math.abs(value))}`;
}

export function formatEventPercent(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatEventTime(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function normalizeEventCandles(candles: Array<EventCandle | StoredEventCandle>): EventCandle[] {
  const seen = new Set<string>();

  return candles
    .filter((item): item is EventCandle => {
      return (
        EVENT_SYMBOLS.includes(item.symbol as EventPredictionSymbol) &&
        Number.isFinite(item.openTime) &&
        Number.isFinite(item.closeTime) &&
        item.open > 0 &&
        item.high > 0 &&
        item.low > 0 &&
        item.close > 0
      );
    })
    .sort((left, right) => left.openTime - right.openTime)
    .filter((item) => {
      const key = `${item.symbol}-${item.openTime}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function mapBinanceKlineToEventCandle(
  symbol: EventPredictionSymbol,
  item: BinanceKline,
  storedAt = Date.now()
): EventCandle | null {
  const candle = {
    id: `${symbol}-${item[0]}`,
    symbol,
    openTime: item[0],
    closeTime: item[6],
    open: toNumber(item[1]),
    high: toNumber(item[2]),
    low: toNumber(item[3]),
    close: toNumber(item[4]),
    volume: toNumber(item[5]),
    takerBuyBaseVolume: toNumber(item[9]),
    takerBuyQuoteVolume: toNumber(item[10]),
    tradeCount: item[8],
    storedAt
  };

  if (
    candle.openTime <= 0 ||
    candle.closeTime <= 0 ||
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0
  ) {
    return null;
  }

  return candle;
}

export async function fetchEventCandlesFromBinance(
  symbol: EventPredictionSymbol,
  startTime: number,
  endTime: number,
  signal: AbortSignal,
  onProgress?: (loaded: number) => void
): Promise<EventCandle[]> {
  const candles: EventCandle[] = [];
  let cursor = Math.max(0, Math.floor(startTime / ONE_MINUTE_MS) * ONE_MINUTE_MS);
  const safeEndTime = Math.max(cursor + ONE_MINUTE_MS, endTime);

  while (cursor < safeEndTime && !signal.aborted) {
    const url = new URL(`${SPOT_BASE}/api/v3/klines`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1m");
    url.searchParams.set("startTime", `${cursor}`);
    url.searchParams.set("endTime", `${safeEndTime}`);
    url.searchParams.set("limit", `${KLINE_LIMIT}`);

    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as BinanceKline[];
    if (payload.length === 0) {
      break;
    }

    const storedAt = Date.now();
    const batch = payload
      .map((item) => mapBinanceKlineToEventCandle(symbol, item, storedAt))
      .filter((item): item is EventCandle => item !== null);

    candles.push(...batch);
    onProgress?.(candles.length);

    const lastOpenTime = payload[payload.length - 1]?.[0] ?? cursor;
    const nextCursor = lastOpenTime + ONE_MINUTE_MS;
    if (nextCursor <= cursor) {
      break;
    }

    cursor = nextCursor;

    if (payload.length < KLINE_LIMIT) {
      break;
    }
  }

  return normalizeEventCandles(candles);
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function fetchEventMarketContext(
  symbol: EventPredictionSymbol,
  signal: AbortSignal
): Promise<EventMarketContext> {
  const [premiumResult, longShortResult, openInterestResult, tickerResult] = await Promise.allSettled([
    fetchJson<BinancePremiumIndexResponse>(`${FUTURES_BASE}/fapi/v1/premiumIndex?symbol=${symbol}`, signal),
    fetchJson<BinanceLongShortRatioResponse[]>(
      `${FUTURES_BASE}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
      signal
    ),
    fetchJson<BinanceOpenInterestHistResponse[]>(
      `${FUTURES_BASE}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=2`,
      signal
    ),
    fetchJson<BinanceTicker24hResponse>(`${SPOT_BASE}/api/v3/ticker/24hr?symbol=${symbol}`, signal)
  ]);

  const fundingRatePercent =
    premiumResult.status === "fulfilled" ? toNumber(premiumResult.value.lastFundingRate) * 100 : null;
  const longShortRatio =
    longShortResult.status === "fulfilled" ? toNumber(longShortResult.value[0]?.longShortRatio) : null;
  const openInterestChangePercent = summarizeOpenInterestHistory(
    openInterestResult.status === "fulfilled" ? openInterestResult.value : null
  ).changePercent;
  const quoteVolume24h =
    tickerResult.status === "fulfilled" ? toNumber(tickerResult.value.quoteVolume) : null;
  const priceChange24h =
    tickerResult.status === "fulfilled" ? toNumber(tickerResult.value.priceChangePercent) : null;
  const fulfilledCount = [premiumResult, longShortResult, openInterestResult, tickerResult].filter(
    (item) => item.status === "fulfilled"
  ).length;

  return {
    symbol,
    fundingRatePercent: Number.isFinite(fundingRatePercent) ? fundingRatePercent : null,
    longShortRatio: Number.isFinite(longShortRatio) ? longShortRatio : null,
    openInterestChangePercent: Number.isFinite(openInterestChangePercent) ? openInterestChangePercent : null,
    quoteVolume24h: Number.isFinite(quoteVolume24h) ? quoteVolume24h : null,
    priceChange24h: Number.isFinite(priceChange24h) ? priceChange24h : null,
    updatedAt: Date.now(),
    source: fulfilledCount === 4 ? "live" : fulfilledCount > 0 ? "partial" : "unavailable"
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return 0;
  }

  return ((current - previous) / previous) * 100;
}

function getReturnPercent(closes: number[], minutes: number): number {
  if (closes.length <= minutes) {
    return 0;
  }

  return percentChange(closes[closes.length - 1] ?? 0, closes[closes.length - 1 - minutes] ?? 0);
}

function emaLast(values: number[], period: number): number {
  if (values.length === 0) {
    return 0;
  }

  const window = values.slice(Math.max(0, values.length - period * 6));
  const multiplier = 2 / (period + 1);
  let ema = average(window.slice(0, Math.min(period, window.length)));

  for (let index = Math.min(period, window.length); index < window.length; index += 1) {
    ema = (window[index] ?? ema) * multiplier + ema * (1 - multiplier);
  }

  return ema || window[window.length - 1] || 0;
}

function calculateRsiLast(values: number[], period = 14): number {
  if (values.length <= period) {
    return 50;
  }

  const window = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < window.length; index += 1) {
    const delta = (window[index] ?? 0) - (window[index - 1] ?? 0);
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function calculateMacdHistogram(values: number[]): number {
  if (values.length < 35) {
    return 0;
  }

  const window = values.slice(-80);
  const macdValues: number[] = [];

  for (let index = 0; index < window.length; index += 1) {
    const partial = window.slice(0, index + 1);
    macdValues.push(emaLast(partial, 12) - emaLast(partial, 26));
  }

  const macd = macdValues[macdValues.length - 1] ?? 0;
  const signal = emaLast(macdValues, 9);
  return macd - signal;
}

function calculateAtrPercent(candles: EventCandle[], period: number): number {
  if (candles.length < 2) {
    return 0;
  }

  const window = candles.slice(-Math.min(period, candles.length - 1));
  const ranges = window.map((candle, index) => {
    const previous = candles[candles.length - window.length + index - 1];
    const previousClose = previous?.close ?? candle.open;

    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  const lastClose = candles[candles.length - 1]?.close ?? 0;

  return lastClose > 0 ? (average(ranges) / lastClose) * 100 : 0;
}

function calculateVolumeRatio(candles: EventCandle[], period: number): number {
  if (candles.length <= period + 1) {
    return 1;
  }

  const lastVolume = candles[candles.length - 1]?.volume ?? 0;
  const baseline = candles.slice(-(period + 1), -1).map((item) => item.volume);
  const baselineAverage = average(baseline);

  return baselineAverage > 0 ? lastVolume / baselineAverage : 1;
}

function calculateTakerBuyRatio(candles: EventCandle[], period: number): number | null {
  const window = candles.slice(-period);
  const takerBuyVolume = window.reduce((sum, item) => sum + (item.takerBuyBaseVolume ?? 0), 0);
  const totalVolume = window.reduce((sum, item) => sum + item.volume, 0);

  if (totalVolume <= 0 || takerBuyVolume <= 0) {
    return null;
  }

  return takerBuyVolume / totalVolume;
}

function calculateTradeActivityRatio(candles: EventCandle[], period: number): number {
  if (candles.length <= period + 1) {
    return 1;
  }

  const lastTradeCount = candles[candles.length - 1]?.tradeCount ?? 0;
  const baseline = candles.slice(-(period + 1), -1).map((item) => item.tradeCount ?? 0);
  const baselineAverage = average(baseline.filter((value) => value > 0));

  return baselineAverage > 0 && lastTradeCount > 0 ? lastTradeCount / baselineAverage : 1;
}

function calculateCandleCloseLocation(candles: EventCandle[], period: number): number {
  const window = candles.slice(-period);
  const high = Math.max(...window.map((item) => item.high));
  const low = Math.min(...window.map((item) => item.low));
  const close = window[window.length - 1]?.close ?? 0;

  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low || close <= 0) {
    return 0.5;
  }

  return clamp((close - low) / (high - low), 0, 1);
}

function getMarketContextScore(context: EventMarketContext | null | undefined, directionSeed: number): {
  score: number;
  reasons: string[];
  warnings: string[];
} {
  if (!context || context.source === "unavailable") {
    return {
      score: 0,
      reasons: ["市场情绪数据暂不可用，本轮不对情绪维度加分。"],
      warnings: ["未拿到 Futures 资金费率/多空比/OI，概率会更保守。"]
    };
  }

  const direction = Math.sign(directionSeed || context.priceChange24h || 0);
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (typeof context.fundingRatePercent === "number") {
    if (Math.abs(context.fundingRatePercent) > 0.06) {
      const crowdedDirection = context.fundingRatePercent > 0 ? 1 : -1;
      score += direction === crowdedDirection ? -6 : 4;
      warnings.push(`资金费率 ${context.fundingRatePercent.toFixed(4)}% 偏拥挤，顺拥挤方向降权。`);
    } else if (Math.abs(context.fundingRatePercent) > 0.015) {
      score += Math.sign(context.fundingRatePercent) === direction ? 2 : -1;
    }
    reasons.push(`资金费率 ${context.fundingRatePercent.toFixed(4)}%`);
  }

  if (typeof context.longShortRatio === "number") {
    if (context.longShortRatio >= 1.35) {
      score += direction > 0 ? -5 : 4;
      warnings.push(`多空比 ${context.longShortRatio.toFixed(2)} 偏多，防多头拥挤回落。`);
    } else if (context.longShortRatio <= 0.75) {
      score += direction < 0 ? -5 : 4;
      warnings.push(`多空比 ${context.longShortRatio.toFixed(2)} 偏空，防空头拥挤反弹。`);
    } else {
      score += direction > 0 && context.longShortRatio > 1 ? 2 : direction < 0 && context.longShortRatio < 1 ? 2 : 0;
    }
    reasons.push(`多空比 ${context.longShortRatio.toFixed(2)}`);
  }

  if (typeof context.openInterestChangePercent === "number") {
    if (Math.abs(context.openInterestChangePercent) >= 0.25) {
      score += Math.sign(context.openInterestChangePercent) === direction ? 4 : -3;
    }
    reasons.push(`OI 5m ${formatEventPercent(context.openInterestChangePercent, 2)}`);
  }

  if (typeof context.priceChange24h === "number") {
    const aligned = Math.sign(context.priceChange24h) === direction;
    score += aligned ? 3 : -2;
    reasons.push(`24H ${formatEventPercent(context.priceChange24h, 2)}`);
  }

  return {
    score: clamp(score, -12, 12),
    reasons,
    warnings
  };
}

function getConfidenceLabel(probability: number): string {
  if (probability >= 82) {
    return "极高";
  }

  if (probability >= 74) {
    return "高";
  }

  if (probability >= 66) {
    return "中高";
  }

  if (probability >= 58) {
    return "观察";
  }

  return "低";
}

function buildInsufficientSignal(
  symbol: EventPredictionSymbol,
  config: EventHorizonConfig,
  candles: EventCandle[],
  minProbability: number
): EventPredictionSignal {
  const lastCandle = candles[candles.length - 1];
  const recordedAt = lastCandle?.closeTime ?? Date.now();
  const basePrice = lastCandle?.close ?? 0;

  return {
    symbol,
    horizonMinutes: config.minutes,
    horizonLabel: config.label,
    contractLabel: config.contractLabel,
    recordedAt,
    expiryAt: recordedAt + config.minutes * ONE_MINUTE_MS,
    basePrice,
    direction: "WAIT",
    tone: "neutral",
    probability: 50,
    threshold: Math.max(config.defaultThreshold, minProbability),
    edge: 0,
    score: 0,
    actionable: false,
    confidenceLabel: "数据不足",
    reasons: ["等待更多本地 1m K 线后再计算。"],
    warnings: [`需要至少 ${config.minHistory} 根 1m K 线，当前 ${candles.length} 根。`],
    dataPoints: candles.length,
    strategyVersion: EVENT_STRATEGY_VERSION
  };
}

export function buildEventPredictionSignal(args: {
  symbol: EventPredictionSymbol;
  candles: Array<EventCandle | StoredEventCandle>;
  horizonMinutes: EventHorizonMinutes;
  minProbability: number;
  livePrice?: number | null;
  marketContext?: EventMarketContext | null;
}): EventPredictionSignal {
  const config = getEventHorizonConfig(args.horizonMinutes);
  const normalizedCandles = normalizeEventCandles(args.candles).slice(-MAX_STRATEGY_LOOKBACK);

  if (normalizedCandles.length < config.minHistory) {
    return buildInsufficientSignal(args.symbol, config, normalizedCandles, args.minProbability);
  }

  const closes = normalizedCandles.map((item) => item.close);
  const lastCandle = normalizedCandles[normalizedCandles.length - 1];
  const lastClose = lastCandle?.close ?? 0;
  const basePrice = args.livePrice && args.livePrice > 0 ? args.livePrice : lastClose;
  const [fastWindow, mediumWindow, anchorWindow] = config.momentumWindows;
  const fastReturn = getReturnPercent(closes, fastWindow);
  const mediumReturn = getReturnPercent(closes, mediumWindow);
  const anchorReturn = getReturnPercent(closes, anchorWindow);
  const trendReturn = getReturnPercent(closes, config.trendWindow);
  const emaFast = emaLast(closes, Math.max(8, Math.round(config.trendWindow / 5)));
  const emaSlow = emaLast(closes, Math.max(21, Math.round(config.trendWindow / 2)));
  const emaSpread = basePrice > 0 ? ((emaFast - emaSlow) / basePrice) * 100 : 0;
  const rsi = calculateRsiLast(closes, 14);
  const macdHistogramPercent = basePrice > 0 ? (calculateMacdHistogram(closes) / basePrice) * 100 : 0;
  const atrPercent = calculateAtrPercent(normalizedCandles, config.atrWindow);
  const volumeRatio = calculateVolumeRatio(normalizedCandles, config.volumeWindow);
  const takerBuyRatio = calculateTakerBuyRatio(normalizedCandles, config.volumeWindow);
  const tradeActivityRatio = calculateTradeActivityRatio(normalizedCandles, config.volumeWindow);
  const closeLocation = calculateCandleCloseLocation(normalizedCandles, config.momentumWindows[2]);
  const momentumBlend = fastReturn * 0.36 + mediumReturn * 0.34 + anchorReturn * 0.3;
  const directionSeed = momentumBlend + trendReturn * 0.42 + emaSpread * 1.3 + macdHistogramPercent * 10;
  const directionSign = Math.sign(directionSeed);
  const momentumScore = clamp((momentumBlend / config.movementUnitPercent) * 24, -26, 26);
  const trendScore = clamp(
    (emaSpread / config.movementUnitPercent) * 14 +
      (trendReturn / Math.max(config.movementUnitPercent * 3, 0.01)) * 22,
    -28,
    28
  );
  const macdScore = clamp((macdHistogramPercent / Math.max(config.movementUnitPercent * 0.24, 0.01)) * 10, -12, 12);
  const rsiScore =
    rsi >= 76
      ? -10
      : rsi >= 68
        ? -4
        : rsi <= 24
          ? 10
          : rsi <= 32
            ? 4
            : rsi >= 55
              ? 2
              : rsi <= 45
                ? -2
                : 0;
  const takerBias = takerBuyRatio === null ? 0 : (takerBuyRatio - 0.5) * 2;
  const volumeImpulse = clamp((volumeRatio - 1) * 7, -5, 9) + clamp((tradeActivityRatio - 1) * 4, -3, 5);
  const flowScore = directionSign * volumeImpulse + clamp(takerBias * 18, -10, 10);
  const locationScore = closeLocation >= 0.68 ? 5 : closeLocation <= 0.32 ? -5 : (closeLocation - 0.5) * 8;
  const marketContextScore = getMarketContextScore(args.marketContext, directionSeed);
  const factorVotes = [
    momentumBlend,
    trendReturn,
    emaSpread,
    macdHistogramPercent,
    takerBias,
    args.marketContext?.priceChange24h ?? 0,
    args.marketContext?.openInterestChangePercent ?? 0
  ].filter((value) => Math.abs(value) > 0.0001);
  const alignedVotes = factorVotes.filter((value) => Math.sign(value) === directionSign).length;
  const consensusRatio = factorVotes.length > 0 ? alignedVotes / factorVotes.length : 0;
  const expectedMovePercent = Math.abs(momentumBlend * 0.45 + trendReturn * 0.35 + emaSpread * 0.7);
  const volatilityMultiplier =
    atrPercent > config.maxAtrPercent * 1.5
      ? 0.52
      : atrPercent > config.maxAtrPercent
        ? 0.68
        : atrPercent < config.maxAtrPercent * 0.18
          ? 0.82
          : 1;
  const rawScore =
    (momentumScore + trendScore + macdScore + rsiScore + flowScore + locationScore + marketContextScore.score) *
    volatilityMultiplier;
  const score = Math.round(clamp(rawScore, -100, 100));
  const scoreAbs = Math.abs(score);
  const baseProbability = 50 + 44 * (1 - Math.exp(-scoreAbs / 42));
  const consensusPenalty = consensusRatio < config.minConsensusRatio ? 8 : 0;
  const movePenalty = expectedMovePercent < config.minExpectedMovePercent ? 10 : 0;
  const contextPenalty = args.marketContext?.source === "unavailable" ? 5 : args.marketContext?.source === "partial" ? 2 : 0;
  const probability = Math.round(clamp(baseProbability - consensusPenalty - movePenalty - contextPenalty, 50, 93));
  const threshold = Math.max(config.defaultThreshold, args.minProbability);
  const direction: EventDirection = scoreAbs < 14 || directionSign === 0 ? "WAIT" : score > 0 ? "UP" : "DOWN";
  const tone: EventPredictionTone = direction === "UP" ? "bullish" : direction === "DOWN" ? "bearish" : "neutral";
  const edge = probability - 50;
  const warnings: string[] = [...marketContextScore.warnings];

  if (atrPercent > config.maxAtrPercent) {
    warnings.push(`ATR ${atrPercent.toFixed(2)}% 高于本档阈值，信号已降权。`);
  }

  if (volumeRatio < 0.82) {
    warnings.push(`量比 ${volumeRatio.toFixed(2)} 偏低，突破确认度不足。`);
  }

  if (consensusRatio < config.minConsensusRatio) {
    warnings.push(`多因子一致率 ${(consensusRatio * 100).toFixed(0)}% 偏低，本轮不建议下注。`);
  }

  if (expectedMovePercent < config.minExpectedMovePercent) {
    warnings.push(`预期波动 ${expectedMovePercent.toFixed(2)}% 小于本档噪音阈值。`);
  }

  if (direction === "UP" && rsi >= 74) {
    warnings.push(`RSI ${rsi.toFixed(1)} 偏热，上涨预测需要防冲高回落。`);
  }

  if (direction === "DOWN" && rsi <= 26) {
    warnings.push(`RSI ${rsi.toFixed(1)} 偏冷，下跌预测需要防超跌反弹。`);
  }

  const actionable =
    direction !== "WAIT" &&
    probability >= threshold &&
    consensusRatio >= config.minConsensusRatio &&
    expectedMovePercent >= config.minExpectedMovePercent &&
    atrPercent <= config.maxAtrPercent * 1.5;
  const directionText = direction === "UP" ? "看涨" : direction === "DOWN" ? "看跌" : "观望";
  const reasons = [
    `${config.shortLabel} 方向：${directionText}，综合分 ${score}，概率 ${probability}%，多因子一致率 ${(consensusRatio * 100).toFixed(0)}%。`,
    `动量 ${formatEventPercent(momentumBlend, 2)} / 趋势 ${formatEventPercent(trendReturn, 2)} / EMA 差 ${formatEventPercent(emaSpread, 2)} / 预期波动 ${expectedMovePercent.toFixed(2)}%。`,
    `量比 ${volumeRatio.toFixed(2)}，主动买入占比 ${takerBuyRatio === null ? "--" : `${(takerBuyRatio * 100).toFixed(1)}%`}，交易活跃度 ${tradeActivityRatio.toFixed(2)}。`,
    marketContextScore.reasons.length > 0
      ? `情绪：${marketContextScore.reasons.join(" / ")}。`
      : "情绪：暂无 Futures 资金费率/多空比/OI 数据。"
  ];

  return {
    symbol: args.symbol,
    horizonMinutes: config.minutes,
    horizonLabel: config.label,
    contractLabel: config.contractLabel,
    recordedAt: lastCandle?.closeTime ?? Date.now(),
    expiryAt: (lastCandle?.closeTime ?? Date.now()) + config.minutes * ONE_MINUTE_MS,
    basePrice,
    direction,
    tone,
    probability,
    threshold,
    edge,
    score,
    actionable,
    confidenceLabel: getConfidenceLabel(probability),
    reasons,
    warnings,
    dataPoints: normalizedCandles.length,
    strategyVersion: EVENT_STRATEGY_VERSION
  };
}

export function buildEventPredictionSignals(args: {
  symbol: EventPredictionSymbol;
  candles: Array<EventCandle | StoredEventCandle>;
  minProbability: number;
  livePrice?: number | null;
  marketContext?: EventMarketContext | null;
}): EventPredictionSignal[] {
  return EVENT_HORIZONS.map((config) =>
    buildEventPredictionSignal({
      symbol: args.symbol,
      candles: args.candles,
      horizonMinutes: config.minutes,
      minProbability: args.minProbability,
      livePrice: args.livePrice,
      marketContext: args.marketContext
    })
  );
}

function findFutureCandle(candles: EventCandle[], fromIndex: number, horizonMinutes: number): EventCandle | null {
  const current = candles[fromIndex];
  if (!current) {
    return null;
  }

  const targetTime = current.closeTime + horizonMinutes * ONE_MINUTE_MS;
  const directIndex = fromIndex + horizonMinutes;
  const direct = candles[directIndex];

  if (direct && Math.abs(direct.closeTime - targetTime) <= ONE_MINUTE_MS * 2) {
    return direct;
  }

  for (let index = fromIndex + 1; index < candles.length; index += 1) {
    if ((candles[index]?.closeTime ?? 0) >= targetTime) {
      return candles[index] ?? null;
    }
  }

  return null;
}

function createBucketMap(horizons: EventHorizonMinutes[]): Map<string, EventBacktestBucket> {
  return new Map(
    horizons.map((minutes) => {
      const config = getEventHorizonConfig(minutes);
      return [
        `${minutes}`,
        {
          key: `${minutes}`,
          label: config.label,
          trades: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          pnl: 0
        }
      ];
    })
  );
}

export function runEventBacktest(args: EventBacktestArgs): EventBacktestSummary {
  const sampleStepMinutes = Math.max(1, args.sampleStepMinutes ?? 1);
  const bucketMap = createBucketMap(args.horizons);
  const recentTrades: EventBacktestTrade[] = [];
  let balance = args.initialBalance;
  let peakBalance = args.initialBalance;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let probabilitySum = 0;
  let totalTrades = 0;
  let skippedSignals = 0;
  let dataStartAt: number | null = null;
  let dataEndAt: number | null = null;

  args.symbols.forEach((symbol) => {
    const candles = normalizeEventCandles(args.candlesBySymbol[symbol] ?? []);
    if (candles.length === 0) {
      return;
    }

    dataStartAt = dataStartAt === null ? candles[0]?.openTime ?? null : Math.min(dataStartAt, candles[0]?.openTime ?? dataStartAt);
    dataEndAt = dataEndAt === null ? candles[candles.length - 1]?.closeTime ?? null : Math.max(dataEndAt, candles[candles.length - 1]?.closeTime ?? dataEndAt);

    args.horizons.forEach((horizonMinutes) => {
      const config = getEventHorizonConfig(horizonMinutes);
      const lastUsableIndex = candles.length - horizonMinutes - 1;

      let nextAllowedOpenTime = 0;

      for (let index = config.minHistory; index <= lastUsableIndex; index += sampleStepMinutes) {
        const currentCandle = candles[index];
        if (!currentCandle || currentCandle.closeTime < nextAllowedOpenTime) {
          skippedSignals += 1;
          continue;
        }

        const history = candles.slice(Math.max(0, index - MAX_STRATEGY_LOOKBACK + 1), index + 1);
        const signal = buildEventPredictionSignal({
          symbol,
          candles: history,
          horizonMinutes,
          minProbability: args.minProbability
        });
        const shouldTrade =
          args.mode === "every-minute"
            ? signal.direction !== "WAIT" && signal.probability >= 54
            : signal.actionable;

        if (!shouldTrade) {
          skippedSignals += 1;
          continue;
        }

        nextAllowedOpenTime = (currentCandle?.closeTime ?? signal.recordedAt) +
          config.cooldownMinutes * ONE_MINUTE_MS;

        if (balance < args.stake || signal.direction === "WAIT") {
          skippedSignals += 1;
          continue;
        }

        const futureCandle = findFutureCandle(candles, index, horizonMinutes);
        if (!futureCandle) {
          skippedSignals += 1;
          continue;
        }

        const isUp = futureCandle.close > signal.basePrice;
        const isDown = futureCandle.close < signal.basePrice;
        const correct =
          signal.direction === "UP" ? isUp : signal.direction === "DOWN" ? isDown : false;
        const pnl = futureCandle.close === signal.basePrice ? 0 : correct ? args.stake * args.payoutRatio : -args.stake;
        balance += pnl;
        peakBalance = Math.max(peakBalance, balance);
        maxDrawdown = Math.max(maxDrawdown, peakBalance - balance);
        probabilitySum += signal.probability;
        totalTrades += 1;

        if (pnl > 0) {
          wins += 1;
          grossWin += pnl;
        } else if (pnl < 0) {
          losses += 1;
          grossLoss += Math.abs(pnl);
        }

        const bucket = bucketMap.get(`${horizonMinutes}`);
        if (bucket) {
          bucket.trades += 1;
          bucket.pnl += pnl;
          if (pnl > 0) {
            bucket.wins += 1;
          } else if (pnl < 0) {
            bucket.losses += 1;
          }
        }

        recentTrades.unshift({
          id: `${symbol}-${horizonMinutes}-${signal.recordedAt}`,
          symbol,
          horizonMinutes,
          direction: signal.direction,
          probability: signal.probability,
          openedAt: signal.recordedAt,
          expiryAt: signal.expiryAt,
          basePrice: signal.basePrice,
          settledPrice: futureCandle.close,
          correct,
          pnl,
          balance
        });

        if (recentTrades.length > 24) {
          recentTrades.pop();
        }
      }
    });
  });

  const buckets = Array.from(bucketMap.values()).map((bucket) => ({
    ...bucket,
    winRate: bucket.trades > 0 ? Math.round((bucket.wins / bucket.trades) * 1000) / 10 : 0
  }));
  const totalPnl = balance - args.initialBalance;

  return {
    initialBalance: args.initialBalance,
    finalBalance: balance,
    totalPnl,
    totalTrades,
    wins,
    losses,
    winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 1000) / 10 : 0,
    maxDrawdown,
    maxDrawdownPercent: args.initialBalance > 0 ? (maxDrawdown / args.initialBalance) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0,
    expectancy: totalTrades > 0 ? totalPnl / totalTrades : 0,
    averageProbability: totalTrades > 0 ? probabilitySum / totalTrades : 0,
    skippedSignals,
    dataStartAt,
    dataEndAt,
    buckets,
    recentTrades
  };
}

export function toStoredEventPrediction(args: {
  signal: EventPredictionSignal;
  mode: EventPredictionMode;
  stake: number;
  payoutRatio: number;
}): StoredEventPrediction {
  const recordedMinute = Math.floor(args.signal.recordedAt / ONE_MINUTE_MS) * ONE_MINUTE_MS;

  return {
    id: `${args.signal.symbol}-${args.signal.horizonMinutes}-${recordedMinute}`,
    symbol: args.signal.symbol,
    horizonMinutes: args.signal.horizonMinutes,
    recordedAt: recordedMinute,
    expiryAt: args.signal.expiryAt,
    basePrice: args.signal.basePrice,
    direction: args.signal.direction,
    probability: args.signal.probability,
    threshold: args.signal.threshold,
    score: args.signal.score,
    edge: args.signal.edge,
    actionable: args.signal.actionable,
    mode: args.mode,
    stake: args.stake,
    payoutRatio: args.payoutRatio,
    status: "pending",
    reasons: args.signal.reasons,
    warnings: args.signal.warnings,
    strategyVersion: args.signal.strategyVersion
  };
}

export function settleEventPredictionRecords(args: {
  predictions: StoredEventPrediction[];
  candlesBySymbol: Partial<Record<EventPredictionSymbol, Array<EventCandle | StoredEventCandle>>>;
  now?: number;
}): Array<Pick<StoredEventPrediction, "id" | "status" | "settledPrice" | "resolvedAt" | "pnl" | "correct">> {
  const now = args.now ?? Date.now();

  return args.predictions.flatMap((prediction) => {
    if (prediction.status !== "pending" || prediction.expiryAt > now) {
      return [];
    }

    const candles = normalizeEventCandles(
      args.candlesBySymbol[prediction.symbol as EventPredictionSymbol] ?? []
    );
    const settledCandle = candles.find((item) => item.closeTime >= prediction.expiryAt);

    if (!settledCandle) {
      return [];
    }

    const correct =
      prediction.direction === "UP"
        ? settledCandle.close > prediction.basePrice
        : prediction.direction === "DOWN"
          ? settledCandle.close < prediction.basePrice
          : false;
    const pnl =
      settledCandle.close === prediction.basePrice
        ? 0
        : correct
          ? prediction.stake * prediction.payoutRatio
          : -prediction.stake;

    return [
      {
        id: prediction.id,
        status: correct ? "won" : settledCandle.close === prediction.basePrice ? "flat" : "lost",
        settledPrice: settledCandle.close,
        resolvedAt: now,
        pnl,
        correct
      }
    ];
  });
}
