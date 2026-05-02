import { type MarketOverview } from "../data/marketOverviewData";
import {
  analyzeMarketSnapshot
} from "./marketAnalysisWorkerClient";
import {
  type AggregateTrade,
  type CombinedStreamMessage,
  type DepthSnapshot,
  type LongShortRatioItem,
  type OpenInterestHistItem,
  type OpenInterestResponse,
  type PremiumIndexResponse,
  type SpotTicker24h,
  applyMoneyFlowDimension,
  buildOrderBookDepth,
  applyOrderBookDimension,
  appendTradeToRuntime,
  buildMoneyFlowHighlight,
  calculateOrderImbalance,
  createBaselineOverview,
  createTradeFlowRuntime,
  formatFundingRate,
  formatCurrency,
  selectWall,
  toNumber,
  type BinanceKline,
  type RawMarketSnapshot
} from "./marketAnalysis";

type LiveStatus = "live" | "fallback";

export type MarketConnectionState = "connecting" | "live" | "fallback";

export type LiveOverviewResponse = {
  overview: MarketOverview | null;
  status: LiveStatus;
  note: string;
  updatedAt: number;
  tradeSeed: AggregateTrade[];
};

const SPOT_BASE = "https://api.binance.com";
const FUTURES_BASE = "https://fapi.binance.com";
const SPOT_WS_BASE = "wss://stream.binance.com:9443/stream?streams=";
const MAX_RECENT_AGG_TRADES = 1000;
const MIN_RECENT_AGG_TRADES = 60;
const ONE_MINUTE_MS = 60_000;

function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return fetch(url, { signal }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  });
}

function buildRawSnapshot(args: {
  symbol: string;
  ticker: SpotTicker24h;
  klines5m: BinanceKline[];
  klines15m: BinanceKline[];
  klines1h: BinanceKline[];
  klines4h: BinanceKline[];
  aggTrades: AggregateTrade[];
  depth: DepthSnapshot | null;
  premiumIndex: PremiumIndexResponse | null;
  longShortRatio: LongShortRatioItem[] | null;
  openInterest: OpenInterestResponse | null;
  openInterestHist: OpenInterestHistItem[] | null;
}): RawMarketSnapshot {
  const openInterestCurrent = toNumber(args.openInterest?.openInterest);
  const previousOpenInterest = toNumber(args.openInterestHist?.[1]?.sumOpenInterest);
  const currentOpenInterest = toNumber(args.openInterestHist?.[0]?.sumOpenInterest) || openInterestCurrent;
  const openInterestChange =
    previousOpenInterest > 0
      ? ((currentOpenInterest - previousOpenInterest) / previousOpenInterest) * 100
      : null;

  return {
    symbol: args.symbol,
    ticker: args.ticker,
    klines5m: args.klines5m,
    klines15m: args.klines15m,
    klines1h: args.klines1h,
    klines4h: args.klines4h,
    aggTrades: args.aggTrades,
    depth: args.depth,
    fundingRate: toNumber(args.premiumIndex?.lastFundingRate) * 100,
    longShortRatio: args.longShortRatio?.[0] ? toNumber(args.longShortRatio[0].longShortRatio) : null,
    openInterestChange,
    openInterestValue: currentOpenInterest || openInterestCurrent || null
  };
}

function buildOrderBookHighlight(orderImbalance: number, support: string): string {
  if (orderImbalance >= 0.18) {
    return `订单簿失衡度 ${orderImbalance.toFixed(2)}，买方墙更强，近端支撑在 ${support}。`;
  }

  if (orderImbalance <= -0.18) {
    return `订单簿失衡度 ${orderImbalance.toFixed(2)}，卖方阻力更重，需等盘口重新平衡。`;
  }

  return `订单簿失衡度 ${orderImbalance.toFixed(2)}，短线深度分布偏均衡。`;
}

export function getBaselineOverview(symbol: string): MarketOverview {
  return createBaselineOverview(symbol);
}

export async function fetchLiveMarketOverview(
  symbol: string,
  signal: AbortSignal
): Promise<LiveOverviewResponse> {
  const requests = await Promise.allSettled([
    fetchJson<SpotTicker24h>(`${SPOT_BASE}/api/v3/ticker/24hr?symbol=${symbol}`, signal),
    fetchJson<BinanceKline[]>(`${SPOT_BASE}/api/v3/klines?symbol=${symbol}&interval=5m&limit=120`, signal),
    fetchJson<BinanceKline[]>(`${SPOT_BASE}/api/v3/klines?symbol=${symbol}&interval=15m&limit=80`, signal),
    fetchJson<BinanceKline[]>(`${SPOT_BASE}/api/v3/klines?symbol=${symbol}&interval=1h&limit=80`, signal),
    fetchJson<BinanceKline[]>(`${SPOT_BASE}/api/v3/klines?symbol=${symbol}&interval=4h&limit=80`, signal),
    fetchJson<AggregateTrade[]>(`${SPOT_BASE}/api/v3/aggTrades?symbol=${symbol}&limit=${MAX_RECENT_AGG_TRADES}`, signal),
    fetchJson<DepthSnapshot>(`${SPOT_BASE}/api/v3/depth?symbol=${symbol}&limit=10`, signal),
    fetchJson<PremiumIndexResponse>(`${FUTURES_BASE}/fapi/v1/premiumIndex?symbol=${symbol}`, signal),
    fetchJson<OpenInterestResponse>(`${FUTURES_BASE}/fapi/v1/openInterest?symbol=${symbol}`, signal),
    fetchJson<OpenInterestHistItem[]>(`${FUTURES_BASE}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=2`, signal),
    fetchJson<LongShortRatioItem[]>(`${FUTURES_BASE}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`, signal)
  ]);

  const ticker = requests[0].status === "fulfilled" ? requests[0].value : null;
  const klines5m = requests[1].status === "fulfilled" ? requests[1].value : null;
  const klines15m = requests[2].status === "fulfilled" ? requests[2].value : null;
  const klines1h = requests[3].status === "fulfilled" ? requests[3].value : null;
  const klines4h = requests[4].status === "fulfilled" ? requests[4].value : null;
  const aggTrades = requests[5].status === "fulfilled" ? requests[5].value : [];
  const depth = requests[6].status === "fulfilled" ? requests[6].value : null;
  const premiumIndex = requests[7].status === "fulfilled" ? requests[7].value : null;
  const openInterest = requests[8].status === "fulfilled" ? requests[8].value : null;
  const openInterestHist = requests[9].status === "fulfilled" ? requests[9].value : null;
  const longShortRatio = requests[10].status === "fulfilled" ? requests[10].value : null;

  if (!ticker || !klines5m || !klines15m || !klines1h || !klines4h) {
    return {
      overview: null,
      status: "fallback",
      note: "Binance 公共行情暂不可用，本轮仅返回中性基线。",
      updatedAt: Date.now(),
      tradeSeed: []
    };
  }

  const snapshot = buildRawSnapshot({
    symbol,
    ticker,
    klines5m,
    klines15m,
    klines1h,
    klines4h,
    aggTrades,
    depth,
    premiumIndex,
    longShortRatio,
    openInterest,
    openInterestHist
  });

  const overview = await analyzeMarketSnapshot(snapshot);

  return {
    overview,
    status: "live",
    note: "已接入 Binance 公共 REST 行情，维度全量重算由 Web Worker 执行。",
    updatedAt: Date.now(),
    tradeSeed: aggTrades
  };
}

export async function fetchHistoricalClosePrice(
  symbol: string,
  targetTimestamp: number,
  signal: AbortSignal
): Promise<number | null> {
  const klines = await fetchJson<BinanceKline[]>(
    `${SPOT_BASE}/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${Math.max(
      targetTimestamp - ONE_MINUTE_MS,
      0
    )}&limit=3`,
    signal
  ).catch(() => null);

  if (!klines || klines.length === 0) {
    return null;
  }

  const matched = klines
    .map((item) => ({
      close: toNumber(item[4]),
      midpoint: (item[0] + item[6]) / 2
    }))
    .sort(
      (left, right) =>
        Math.abs(left.midpoint - targetTimestamp) - Math.abs(right.midpoint - targetTimestamp)
    )[0];

  return matched?.close ?? null;
}

export function connectBinanceMarketStream(
  symbol: string,
  handlers: {
    onOverview: (updater: (current: MarketOverview) => MarketOverview, timestamp: number) => void;
    onStatus?: (message: string) => void;
  },
  options?: {
    seedTrades?: AggregateTrade[];
  }
): () => void {
  let closed = false;
  let reconnectTimer = 0;
  let socket: WebSocket | null = null;
  const tradeRuntime = createTradeFlowRuntime(symbol, options?.seedTrades ?? []);

  const connect = () => {
    if (closed) {
      return;
    }

    handlers.onStatus?.("正在连接 Binance WebSocket，准备接收价格、订单簿与成交流增量更新...");
    socket = new WebSocket(
      `${SPOT_WS_BASE}${symbol.toLowerCase()}@miniTicker/${symbol.toLowerCase()}@depth10/${symbol.toLowerCase()}@aggTrade`
    );

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as CombinedStreamMessage;
      const now = Date.now();

      if (message.data.e === "24hrMiniTicker") {
        const data = message.data;
        handlers.onOverview(
          (current) => ({
            ...current,
            price: toNumber(data.c),
            change24h: ((toNumber(data.c) - toNumber(data.o)) / Math.max(toNumber(data.o), 1)) * 100
          }),
          now
        );
        return;
      }

      if (message.data.e === "depthUpdate") {
        const data = message.data;
        const depth: DepthSnapshot = {
          bids: data.b,
          asks: data.a
        };
        const orderBookDepth = buildOrderBookDepth(depth);
        const orderImbalance = calculateOrderImbalance(depth);
        const support = selectWall(depth.bids, "买方墙");
        const resistance = selectWall(depth.asks, "卖方墙");

        handlers.onOverview(
          (current) => ({
            ...current,
            orderBookDepth: orderBookDepth ?? current.orderBookDepth ?? null,
            support,
            resistance,
            dimensions: applyOrderBookDimension(
              current.dimensions,
              orderImbalance,
              support,
              resistance,
              orderBookDepth?.spreadPercent
            ),
            reportHighlights: current.reportHighlights.map((highlight, index) =>
              index === 3 ? buildOrderBookHighlight(orderImbalance, support) : highlight
            )
          }),
          now
        );
        return;
      }

      if (message.data.e === "aggTrade") {
        const nextTrade: AggregateTrade = {
          p: message.data.p,
          q: message.data.q,
          m: message.data.m,
          T: message.data.T
        };
        const tradeFlow = appendTradeToRuntime(tradeRuntime, nextTrade, MAX_RECENT_AGG_TRADES);

        if (tradeFlow.totalTrades < MIN_RECENT_AGG_TRADES) {
          return;
        }

        handlers.onOverview(
          (current) => ({
            ...current,
            dimensions: applyMoneyFlowDimension(current.dimensions, symbol, tradeFlow),
            reportHighlights: current.reportHighlights.map((highlight, index) =>
              index === 2 ? buildMoneyFlowHighlight(tradeFlow) : highlight
            )
          }),
          now
        );
      }
    };

    socket.onopen = () => {
      handlers.onStatus?.("Binance WebSocket 已连接，价格、订单簿与成交流正在刷新。");
    };

    socket.onerror = () => {
      handlers.onStatus?.("Binance WebSocket 连接异常，准备自动重连。");
    };

    socket.onclose = () => {
      if (closed) {
        return;
      }

      handlers.onStatus?.("Binance WebSocket 已断开，3 秒后尝试重连。");
      reconnectTimer = window.setTimeout(connect, 3000);
    };
  };

  connect();

  return () => {
    closed = true;
    window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}
