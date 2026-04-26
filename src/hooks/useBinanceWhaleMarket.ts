import { useEffect, useRef, useState } from "react";
import {
  whaleSymbols,
  type WhaleConfidence,
  type WhaleOrderBookWatch,
  type WhaleSymbol,
  type WhaleTrade
} from "../data/whaleTrackerData";
import { type MarketConnectionState } from "../services/binance";
import {
  type AggregateTrade,
  type CombinedStreamMessage,
  type DepthSnapshot,
  type LongShortRatioItem,
  type OpenInterestHistItem,
  type OpenInterestResponse,
  type PremiumIndexResponse,
  toNumber
} from "../services/marketAnalysis";

type RawWhaleTrade = AggregateTrade & {
  symbol: WhaleSymbol;
};

type WallSample = {
  timestamp: number;
  wallRatio: number;
  wallValueUsd: number;
};

type WhaleMarketContextBias = "bullish" | "bearish" | "neutral";

export type WhaleMarketContext = {
  symbol: WhaleSymbol;
  bias: WhaleMarketContextBias;
  headline: string;
  summary: string;
  detail: string;
  fundingRate: number | null;
  longShortRatio: number | null;
  openInterestChange: number | null;
  openInterestValue: number | null;
  updatedAt: number;
};

type WhaleMarketState = {
  trades: WhaleTrade[];
  orderBooks: WhaleOrderBookWatch[];
  contexts: WhaleMarketContext[];
  connectionState: MarketConnectionState;
  statusNote: string;
  lastUpdatedAt: number | null;
};

type TickerDirection = "buy" | "sell";

const SPOT_BASE = "https://api.binance.com";
const FUTURES_BASE = "https://fapi.binance.com";
const SPOT_WS_BASE = "wss://stream.binance.com:9443/stream?streams=";
const SYMBOLS = whaleSymbols.map((item) => item.symbol);
const MIN_WHALE_NOTIONAL = 50000;
const MAX_TRADES_PER_SYMBOL = 40;
const MAX_TOTAL_TRADES = 80;
const TRADE_LOOKBACK_MS = 30 * 60_000;
const CLUSTER_GAP_MS = 90_000;
const ORDER_FLOW_LOOKBACK_MS = 10 * 60_000;
const DEPTH_POLL_MS = 12_000;
const CONTEXT_POLL_MS = 60_000;
const RECONNECT_DELAY_MS = 3_000;
const WALL_HISTORY_WINDOW_MS = 3 * 60_000;

function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return fetch(url, { signal }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSignedPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatCompactValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 2 : 1
  }).format(value);
}

function formatClusterStamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSymbolAsset(symbol: WhaleSymbol): string {
  return symbol.replace("USDT", "");
}

function getTradeId(trade: RawWhaleTrade): string {
  return `binance-${trade.symbol}-${trade.T}-${trade.p}-${trade.q}-${trade.m ? "sell" : "buy"}`;
}

function getTradeSide(trade: AggregateTrade): TickerDirection {
  return trade.m ? "sell" : "buy";
}

function getTradeValue(trade: AggregateTrade): number {
  return toNumber(trade.p) * toNumber(trade.q);
}

function getMinutesAgo(timestamp: number, now: number): number {
  return Math.max(0, Math.round((now - timestamp) / 60_000));
}

function getTradeBehavior(side: TickerDirection, usdValue: number, chunks: number): string {
  if (side === "buy") {
    if (chunks >= 4) {
      return "连续主动买入";
    }
    if (usdValue >= 1_000_000) {
      return "大额主动扫单";
    }
    if (usdValue >= 500_000) {
      return "放量追价买入";
    }
    return "主动买盘抬价";
  }

  if (chunks >= 4) {
    return "连续主动卖出";
  }
  if (usdValue >= 1_000_000) {
    return "大额主动派发";
  }
  if (usdValue >= 500_000) {
    return "高位放量卖出";
  }
  return "主动卖盘压价";
}

function getTradeConfidence(usdValue: number, chunks: number): WhaleConfidence {
  if (usdValue >= 1_000_000 || chunks >= 4) {
    return "高";
  }

  if (usdValue >= 500_000 || chunks >= 2) {
    return "中高";
  }

  return "中";
}

function summarizeClusterNote(chunks: number): string {
  if (chunks >= 4) {
    return "短时内出现多笔连续成交，已按 aggTrade 聚类。标签表示成交簇，不代表真实账户身份或链上地址。";
  }

  if (chunks >= 2) {
    return "检测到近似拆单节奏，标签来自 Binance aggTrade 聚类，不代表真实账户身份或链上地址。";
  }

  return "当前以单笔或零散大额成交为主，标签来自 Binance aggTrade 聚类，不代表真实账户身份或链上地址。";
}

function buildTrades(tradesBySymbol: Partial<Record<WhaleSymbol, RawWhaleTrade[]>>, now: number): WhaleTrade[] {
  const clusterByTradeId = new Map<string, string>();
  const clusterSize = new Map<string, number>();
  const clusterLabel = new Map<string, string>();

  for (const symbol of SYMBOLS) {
    const symbolTrades = [...(tradesBySymbol[symbol] ?? [])]
      .filter((trade) => now - trade.T <= TRADE_LOOKBACK_MS && getTradeValue(trade) >= MIN_WHALE_NOTIONAL)
      .sort((left, right) => left.T - right.T);

    let currentClusterKey: string | null = null;
    let currentClusterStart = 0;
    let currentSide: TickerDirection | null = null;
    let previousTimestamp = 0;

    for (const trade of symbolTrades) {
      const side = getTradeSide(trade);
      const shouldSplitCluster =
        currentClusterKey === null ||
        currentSide !== side ||
        trade.T - previousTimestamp > CLUSTER_GAP_MS;

      if (shouldSplitCluster) {
        currentClusterStart = trade.T;
        currentClusterKey = `${symbol}-${side}-${currentClusterStart}`;
        currentSide = side;
        clusterLabel.set(
          currentClusterKey,
          `AggTrade Cluster · ${formatSymbolAsset(symbol)} ${side === "buy" ? "买盘" : "卖盘"} ${formatClusterStamp(currentClusterStart)}`
        );
      }

      const tradeId = getTradeId(trade);
      const clusterKey = currentClusterKey ?? `${symbol}-${side}-${trade.T}`;
      clusterByTradeId.set(tradeId, clusterKey);
      clusterSize.set(clusterKey, (clusterSize.get(clusterKey) ?? 0) + 1);
      previousTimestamp = trade.T;
    }
  }

  const normalizedTrades = SYMBOLS.flatMap((symbol) => tradesBySymbol[symbol] ?? [])
    .filter((trade) => now - trade.T <= TRADE_LOOKBACK_MS && getTradeValue(trade) >= MIN_WHALE_NOTIONAL)
    .sort((left, right) => right.T - left.T)
    .slice(0, MAX_TOTAL_TRADES)
    .map<WhaleTrade>((trade) => {
      const usdValue = getTradeValue(trade);
      const side = getTradeSide(trade);
      const tradeId = getTradeId(trade);
      const clusterKey = clusterByTradeId.get(tradeId) ?? `${trade.symbol}-${side}-${trade.T}`;
      const chunks = clusterSize.get(clusterKey) ?? 1;

      return {
        id: tradeId,
        minutesAgo: getMinutesAgo(trade.T, now),
        clusterLabel:
          clusterLabel.get(clusterKey) ??
          `AggTrade Cluster · ${formatSymbolAsset(trade.symbol)} ${side === "buy" ? "买盘" : "卖盘"} ${formatClusterStamp(trade.T)}`,
        symbol: trade.symbol,
        quantity: toNumber(trade.q),
        price: toNumber(trade.p),
        usdValue,
        side,
        behavior: getTradeBehavior(side, usdValue, chunks),
        confidence: getTradeConfidence(usdValue, chunks),
        chunks,
        note: summarizeClusterNote(chunks)
      };
    });

  return normalizedTrades;
}

function buildDepthSummary(symbol: WhaleSymbol, depth: DepthSnapshot, trades: RawWhaleTrade[], history: WallSample[], now: number) {
  const bids = depth.bids
    .map(([price, quantity]) => {
      const numericPrice = toNumber(price);
      const numericQuantity = toNumber(quantity);
      return {
        price: numericPrice,
        quantity: numericQuantity,
        value: numericPrice * numericQuantity
      };
    })
    .filter((item) => item.price > 0 && item.quantity > 0);
  const asks = depth.asks
    .map(([price, quantity]) => {
      const numericPrice = toNumber(price);
      const numericQuantity = toNumber(quantity);
      return {
        price: numericPrice,
        quantity: numericQuantity,
        value: numericPrice * numericQuantity
      };
    })
    .filter((item) => item.price > 0 && item.quantity > 0);

  if (bids.length === 0 || asks.length === 0) {
    return null;
  }

  const totalBidDepthUsd = bids.reduce((total, item) => total + item.value, 0);
  const largestBid = bids.reduce((current, item) => {
    return item.value > current.value ? item : current;
  }, bids[0]);
  const largestAsk = asks.reduce((current, item) => {
    return item.value > current.value ? item : current;
  }, asks[0]);
  const wallRatio = totalBidDepthUsd > 0 ? largestBid.value / totalBidDepthUsd : 0;
  const recentTrades = trades.filter((trade) => now - trade.T <= ORDER_FLOW_LOOKBACK_MS);
  const buyNotional = recentTrades.reduce((total, trade) => {
    return getTradeSide(trade) === "buy" ? total + getTradeValue(trade) : total;
  }, 0);
  const recentTradeNotional = recentTrades.reduce((total, trade) => total + getTradeValue(trade), 0);
  const takerBuyRatio = recentTradeNotional > 0 ? buyNotional / recentTradeNotional : 0.5;
  const recentHistory = history.filter((item) => now - item.timestamp <= WALL_HISTORY_WINDOW_MS);
  const maxRecentWallValue = recentHistory.reduce((maxValue, item) => Math.max(maxValue, item.wallValueUsd), largestBid.value);
  const maxRecentWallRatio = recentHistory.reduce((maxValue, item) => Math.max(maxValue, item.wallRatio), wallRatio);
  const valueRetention = maxRecentWallValue > 0 ? largestBid.value / maxRecentWallValue : 1;
  const ratioRetention = maxRecentWallRatio > 0 ? wallRatio / maxRecentWallRatio : 1;
  const cancelRisk = clamp(1 - valueRetention * 0.65 - ratioRetention * 0.35, 0.06, 0.78);
  const topBidPrices = bids.slice(0, Math.min(3, bids.length)).map((item) => item.price);
  const absorptionLow = Math.min(...topBidPrices);
  const absorptionHigh = Math.max(...topBidPrices);

  return {
    symbol,
    wallPrice: largestBid.price,
    wallValueUsd: largestBid.value,
    totalBidDepthUsd,
    wallRatio,
    takerBuyRatio,
    cancelRisk,
    absorptionZone: `${absorptionLow.toFixed(absorptionLow >= 1000 ? 0 : 2)} - ${absorptionHigh.toFixed(absorptionHigh >= 1000 ? 0 : 2)}`,
    confirmationZone: `站上 ${largestAsk.price.toFixed(largestAsk.price >= 1000 ? 0 : 2)}`,
    invalidationZone: `跌破 ${absorptionLow.toFixed(absorptionLow >= 1000 ? 0 : 2)}`,
    status:
      wallRatio >= 0.3
        ? cancelRisk < 0.35
          ? "真实买墙占优，承接稳定"
          : "有买墙但保留度下降，需防止撤单"
        : "盘口更均衡，暂未形成显著买墙",
    spoofingSignal:
      cancelRisk >= 0.45
        ? `近 3 分钟买墙保留度下降到 ${(1 - cancelRisk).toFixed(0)}%，存在快速撤单风险。`
        : `近 3 分钟买墙保留度 ${(1 - cancelRisk).toFixed(0)}%，当前未见明显快速撤离。`
  } satisfies WhaleOrderBookWatch;
}

function buildOrderBooks(
  depthBySymbol: Partial<Record<WhaleSymbol, DepthSnapshot>>,
  tradesBySymbol: Partial<Record<WhaleSymbol, RawWhaleTrade[]>>,
  wallHistoryBySymbol: Partial<Record<WhaleSymbol, WallSample[]>>,
  now: number
): WhaleOrderBookWatch[] {
  return SYMBOLS.map((symbol) => {
    const depth = depthBySymbol[symbol];
    if (!depth) {
      return null;
    }

    return buildDepthSummary(symbol, depth, tradesBySymbol[symbol] ?? [], wallHistoryBySymbol[symbol] ?? [], now);
  }).filter((item): item is WhaleOrderBookWatch => item !== null);
}

function getContextBias(
  fundingRate: number | null,
  longShortRatio: number | null,
  openInterestChange: number | null
): WhaleMarketContextBias {
  if (fundingRate !== null && longShortRatio !== null && fundingRate < -0.01 && longShortRatio < 0.95) {
    return "bullish";
  }

  if (fundingRate !== null && longShortRatio !== null && fundingRate > 0.03 && longShortRatio > 1.15) {
    return "bearish";
  }

  if (openInterestChange !== null && openInterestChange >= 4) {
    return longShortRatio !== null && longShortRatio >= 1 ? "bullish" : "neutral";
  }

  return "neutral";
}

function buildContextHeadline(
  bias: WhaleMarketContextBias,
  openInterestChange: number | null,
  longShortRatio: number | null
): string {
  if (bias === "bullish") {
    return "空头拥挤，留意逼空";
  }

  if (bias === "bearish") {
    return "多头拥挤，警惕回落";
  }

  if (openInterestChange !== null && openInterestChange >= 3) {
    return "杠杆资金回流";
  }

  if (openInterestChange !== null && openInterestChange <= -3) {
    return "杠杆降温";
  }

  if (longShortRatio !== null && longShortRatio < 0.95) {
    return "结构偏空，等待反身性";
  }

  return "衍生品结构中性";
}

function buildContextDetail(
  bias: WhaleMarketContextBias,
  fundingRate: number | null,
  longShortRatio: number | null,
  openInterestChange: number | null
): string {
  if (bias === "bullish") {
    return `资金费率 ${formatSignedPercent(fundingRate, 3)}、多空比 ${longShortRatio?.toFixed(2) ?? "--"}，偏向“空头更拥挤”的反身性结构。`;
  }

  if (bias === "bearish") {
    return `资金费率 ${formatSignedPercent(fundingRate, 3)}、多空比 ${longShortRatio?.toFixed(2) ?? "--"}，多头杠杆偏拥挤，需防止回撤。`;
  }

  if (openInterestChange !== null && openInterestChange >= 3) {
    return `未平仓合约 ${formatSignedPercent(openInterestChange, 1)}，说明杠杆资金正在回流，可作为成交流后的背景确认。`;
  }

  if (openInterestChange !== null && openInterestChange <= -3) {
    return `未平仓合约 ${formatSignedPercent(openInterestChange, 1)}，杠杆正在出清，短线延续性通常会下降。`;
  }

  return "当前以 Binance Futures 公共接口作为资金背景，不再展示伪造链上地址样本。";
}

function buildWhaleContext(args: {
  symbol: WhaleSymbol;
  fundingRate: number | null;
  longShortRatio: number | null;
  openInterestChange: number | null;
  openInterestValue: number | null;
  updatedAt: number;
}): WhaleMarketContext {
  const bias = getContextBias(args.fundingRate, args.longShortRatio, args.openInterestChange);

  return {
    symbol: args.symbol,
    bias,
    headline: buildContextHeadline(bias, args.openInterestChange, args.longShortRatio),
    summary: `资金费率 ${formatSignedPercent(args.fundingRate, 3)} · 多空比 ${
      args.longShortRatio?.toFixed(2) ?? "--"
    } · OI ${formatSignedPercent(args.openInterestChange, 1)} · ${formatCompactValue(args.openInterestValue)} ${formatSymbolAsset(args.symbol)}`,
    detail: buildContextDetail(bias, args.fundingRate, args.longShortRatio, args.openInterestChange),
    fundingRate: args.fundingRate,
    longShortRatio: args.longShortRatio,
    openInterestChange: args.openInterestChange,
    openInterestValue: args.openInterestValue,
    updatedAt: args.updatedAt
  };
}

async function fetchSymbolContext(symbol: WhaleSymbol, signal: AbortSignal): Promise<WhaleMarketContext | null> {
  const requests = await Promise.allSettled([
    fetchJson<PremiumIndexResponse>(`${FUTURES_BASE}/fapi/v1/premiumIndex?symbol=${symbol}`, signal),
    fetchJson<OpenInterestResponse>(`${FUTURES_BASE}/fapi/v1/openInterest?symbol=${symbol}`, signal),
    fetchJson<OpenInterestHistItem[]>(`${FUTURES_BASE}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=2`, signal),
    fetchJson<LongShortRatioItem[]>(
      `${FUTURES_BASE}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,
      signal
    )
  ]);

  const premiumIndex = requests[0].status === "fulfilled" ? requests[0].value : null;
  const openInterest = requests[1].status === "fulfilled" ? requests[1].value : null;
  const openInterestHist = requests[2].status === "fulfilled" ? requests[2].value : null;
  const longShortRatio = requests[3].status === "fulfilled" ? requests[3].value : null;

  if (!premiumIndex && !openInterest && !openInterestHist && !longShortRatio) {
    return null;
  }

  const openInterestCurrent = toNumber(openInterest?.openInterest);
  const historyCurrent = toNumber(openInterestHist?.[0]?.sumOpenInterest);
  const historyPrevious = toNumber(openInterestHist?.[1]?.sumOpenInterest);
  const openInterestValue = historyCurrent || openInterestCurrent || null;
  const openInterestChange =
    historyPrevious > 0 ? ((Math.max(historyCurrent, openInterestCurrent) - historyPrevious) / historyPrevious) * 100 : null;

  return buildWhaleContext({
    symbol,
    fundingRate: premiumIndex ? toNumber(premiumIndex.lastFundingRate) * 100 : null,
    longShortRatio: longShortRatio?.[0] ? toNumber(longShortRatio[0].longShortRatio) : null,
    openInterestChange,
    openInterestValue,
    updatedAt: Date.now()
  });
}

function pruneTrades(trades: RawWhaleTrade[], now: number): RawWhaleTrade[] {
  return trades
    .filter((trade) => now - trade.T <= TRADE_LOOKBACK_MS && getTradeValue(trade) >= MIN_WHALE_NOTIONAL)
    .sort((left, right) => right.T - left.T)
    .slice(0, MAX_TRADES_PER_SYMBOL);
}

function pushWallHistory(
  wallHistoryBySymbol: Partial<Record<WhaleSymbol, WallSample[]>>,
  symbol: WhaleSymbol,
  depth: DepthSnapshot,
  now: number
) {
  const bids = depth.bids
    .map(([price, quantity]) => {
      const numericPrice = toNumber(price);
      const numericQuantity = toNumber(quantity);
      return {
        value: numericPrice * numericQuantity
      };
    })
    .filter((item) => item.value > 0);

  if (bids.length === 0) {
    return;
  }

  const totalBidDepthUsd = bids.reduce((total, item) => total + item.value, 0);
  const largestBid = bids.reduce((current, item) => {
    return item.value > current.value ? item : current;
  }, bids[0]);
  const nextHistory = [...(wallHistoryBySymbol[symbol] ?? []), {
    timestamp: now,
    wallValueUsd: largestBid.value,
    wallRatio: totalBidDepthUsd > 0 ? largestBid.value / totalBidDepthUsd : 0
  }].filter((item) => now - item.timestamp <= WALL_HISTORY_WINDOW_MS);

  wallHistoryBySymbol[symbol] = nextHistory;
}

export function useBinanceWhaleMarket(): WhaleMarketState {
  const [state, setState] = useState<WhaleMarketState>({
    trades: [],
    orderBooks: [],
    contexts: [],
    connectionState: "connecting",
    statusNote: "正在连接 Binance aggTrade、深度快照与 Futures 公共接口...",
    lastUpdatedAt: null
  });

  const tradesBySymbolRef = useRef<Partial<Record<WhaleSymbol, RawWhaleTrade[]>>>({});
  const depthBySymbolRef = useRef<Partial<Record<WhaleSymbol, DepthSnapshot>>>({});
  const wallHistoryBySymbolRef = useRef<Partial<Record<WhaleSymbol, WallSample[]>>>({});
  const contextsBySymbolRef = useRef<Partial<Record<WhaleSymbol, WhaleMarketContext>>>({});

  useEffect(() => {
    let ignore = false;
    let reconnectTimer = 0;
    let depthTimer = 0;
    let contextTimer = 0;
    let heartbeatTimer = 0;
    let socket: WebSocket | null = null;
    const controller = new AbortController();

    const refreshState = (partial?: Partial<WhaleMarketState>) => {
      if (ignore) {
        return;
      }

      const now = Date.now();
      const trades = buildTrades(tradesBySymbolRef.current, now);
      const orderBooks = buildOrderBooks(
        depthBySymbolRef.current,
        tradesBySymbolRef.current,
        wallHistoryBySymbolRef.current,
        now
      );
      const contexts = SYMBOLS.map((symbol) => contextsBySymbolRef.current[symbol]).filter(
        (item): item is WhaleMarketContext => item !== undefined
      );

      setState((current) => ({
        ...current,
        trades,
        orderBooks,
        contexts,
        ...partial,
        lastUpdatedAt: partial?.lastUpdatedAt ?? current.lastUpdatedAt
      }));
    };

    const hydrateTrades = async () => {
      const responses = await Promise.allSettled(
        SYMBOLS.map((symbol) =>
          fetchJson<AggregateTrade[]>(
            `${SPOT_BASE}/api/v3/aggTrades?symbol=${symbol}&limit=120`,
            controller.signal
          ).then((trades) => ({ symbol, trades }))
        )
      );

      const now = Date.now();

      for (const response of responses) {
        if (response.status !== "fulfilled") {
          continue;
        }

        tradesBySymbolRef.current[response.value.symbol] = pruneTrades(
          response.value.trades.map((trade) => ({
            ...trade,
            symbol: response.value.symbol
          })),
          now
        );
      }
    };

    const hydrateDepth = async () => {
      const responses = await Promise.allSettled(
        SYMBOLS.map((symbol) =>
          fetchJson<DepthSnapshot>(`${SPOT_BASE}/api/v3/depth?symbol=${symbol}&limit=20`, controller.signal).then((depth) => ({
            symbol,
            depth
          }))
        )
      );

      const now = Date.now();

      for (const response of responses) {
        if (response.status !== "fulfilled") {
          continue;
        }

        depthBySymbolRef.current[response.value.symbol] = response.value.depth;
        pushWallHistory(wallHistoryBySymbolRef.current, response.value.symbol, response.value.depth, now);
      }
    };

    const hydrateContexts = async () => {
      const responses = await Promise.allSettled(SYMBOLS.map((symbol) => fetchSymbolContext(symbol, controller.signal)));

      for (let index = 0; index < responses.length; index += 1) {
        const response = responses[index];
        const symbol = SYMBOLS[index];

        if (response.status === "fulfilled" && response.value) {
          contextsBySymbolRef.current[symbol] = response.value;
        }
      }
    };

    const connectTrades = () => {
      if (ignore) {
        return;
      }

      socket = new WebSocket(`${SPOT_WS_BASE}${SYMBOLS.map((symbol) => `${symbol.toLowerCase()}@aggTrade`).join("/")}`);

      socket.onopen = () => {
        refreshState({
          connectionState: "connecting",
          statusNote: "Binance aggTrade 实时在线，订单簿与 Futures 背景按固定周期刷新。"
        });
      };

      socket.onmessage = (event) => {
        if (ignore) {
          return;
        }

        const message = JSON.parse(event.data) as CombinedStreamMessage;
        if (message.data.e !== "aggTrade") {
          return;
        }

        const streamSymbol = message.stream.split("@")[0]?.toUpperCase();
        if (!streamSymbol || !SYMBOLS.includes(streamSymbol as WhaleSymbol)) {
          return;
        }

        const symbol = streamSymbol as WhaleSymbol;
        const trade: RawWhaleTrade = {
          ...message.data,
          symbol
        };
        const now = Date.now();

        tradesBySymbolRef.current[symbol] = pruneTrades(
          [trade, ...(tradesBySymbolRef.current[symbol] ?? [])],
          now
        );

        refreshState({
          connectionState: "live",
          statusNote: "Binance aggTrade 实时在线，订单簿与衍生品背景保持定时刷新。",
          lastUpdatedAt: trade.T || now
        });
      };

      socket.onerror = () => {
        if (ignore) {
          return;
        }

        refreshState({
          connectionState: "fallback",
          statusNote: "Binance aggTrade 连接异常，保留最近真实快照并等待自动重连。"
        });
      };

      socket.onclose = () => {
        if (ignore) {
          return;
        }

        refreshState({
          connectionState: "fallback",
          statusNote: "Binance aggTrade 已断开，3 秒后自动重连；当前继续保留最近真实深度与背景快照。"
        });
        reconnectTimer = window.setTimeout(connectTrades, RECONNECT_DELAY_MS);
      };
    };

    setState({
      trades: [],
      orderBooks: [],
      contexts: [],
      connectionState: "connecting",
      statusNote: "正在加载 Binance 成交流、深度快照与 Futures 背景...",
      lastUpdatedAt: null
    });

    Promise.allSettled([hydrateTrades(), hydrateDepth(), hydrateContexts()])
      .then(() => {
        if (ignore) {
          return;
        }

        refreshState({
          connectionState: "connecting",
          statusNote: "Binance 初始快照已加载，正在等待 aggTrade 实时流..."
        });
        connectTrades();
      })
      .catch(() => {
        if (ignore) {
          return;
        }

        refreshState({
          connectionState: "fallback",
          statusNote: "Binance 公共接口初始化失败，当前没有可用的真实鲸鱼快照。"
        });
      });

    depthTimer = window.setInterval(() => {
      void hydrateDepth().then(() => {
        refreshState();
      });
    }, DEPTH_POLL_MS);

    contextTimer = window.setInterval(() => {
      void hydrateContexts().then(() => {
        refreshState();
      });
    }, CONTEXT_POLL_MS);

    heartbeatTimer = window.setInterval(() => {
      refreshState();
    }, 15_000);

    return () => {
      ignore = true;
      controller.abort();
      window.clearTimeout(reconnectTimer);
      window.clearInterval(depthTimer);
      window.clearInterval(contextTimer);
      window.clearInterval(heartbeatTimer);
      socket?.close();
    };
  }, []);

  return state;
}
