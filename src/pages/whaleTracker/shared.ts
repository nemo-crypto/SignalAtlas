import {
  whaleSymbols,
  type WhaleConfidence,
  type WhaleOrderBookWatch,
  type WhaleSymbol,
  type WhaleTrade
} from "../../data/whaleTrackerData";
import type { WhaleMarketContext } from "../../hooks/useBinanceWhaleMarket";

export type SymbolFilter = "ALL" | WhaleSymbol;
export type WindowFilter = 3 | 10 | 30;
export type ConfidenceFilter = "全部" | WhaleConfidence;
export type SignalTone = "bullish" | "bearish" | "neutral";
export type AlertSeverity = "high" | "medium" | "low";

export type WhaleAlert = {
  id: string;
  title: string;
  detail: string;
  severity: AlertSeverity;
};

export type WhaleDeskVerdict = {
  tone: SignalTone;
  label: string;
  confidence: number;
  thesis: string;
  action: string;
  stopLoss: string;
  validity: string;
};

export const windowOptions: Array<{ value: WindowFilter; label: string }> = [
  { value: 3, label: "最近 3 分钟" },
  { value: 10, label: "最近 10 分钟" },
  { value: 30, label: "最近 30 分钟" }
];

export const thresholdOptions = [
  { value: 100000, label: "$100K+" },
  { value: 500000, label: "$500K+" },
  { value: 1000000, label: "$1M+" }
];

export const confidenceOptions: ConfidenceFilter[] = ["全部", "高", "中高", "中"];

export const confidenceRank: Record<WhaleConfidence, number> = {
  高: 3,
  中高: 2,
  中: 1
};

const whaleSymbolSet = new Set<WhaleSymbol>(whaleSymbols.map((item) => item.symbol));

export const symbolNameMap = whaleSymbols.reduce<Record<WhaleSymbol, string>>((accumulator, item) => {
  accumulator[item.symbol] = item.name;
  return accumulator;
}, {} as Record<WhaleSymbol, string>);

function isWhaleSymbolFilter(value: string | null): value is WhaleSymbol {
  return value !== null && whaleSymbolSet.has(value as WhaleSymbol);
}

export function parseWhaleRouteSeed(search: string): {
  selectedSymbol: SymbolFilter;
  selectedWindow: WindowFilter;
  minTradeValue: number;
  confidenceFilter: ConfidenceFilter;
  aggressiveOnly: boolean;
  note: string | null;
} | null {
  const params = new URLSearchParams(search);
  if (params.get("source") !== "strategy-router") {
    return null;
  }

  const symbolParam = params.get("symbol");
  const windowParam = Number(params.get("window"));
  const minTradeValueParam = Number(params.get("minTradeValue"));
  const confidenceParam = params.get("confidence");

  return {
    selectedSymbol: isWhaleSymbolFilter(symbolParam) ? symbolParam : "ALL",
    selectedWindow:
      windowParam === 3 || windowParam === 10 || windowParam === 30 ? windowParam : 10,
    minTradeValue:
      Number.isFinite(minTradeValueParam) && minTradeValueParam > 0 ? minTradeValueParam : 500000,
    confidenceFilter:
      confidenceParam === "全部" || confidenceParam === "高" || confidenceParam === "中高" || confidenceParam === "中"
        ? confidenceParam
        : "中高",
    aggressiveOnly: params.get("aggressiveOnly") !== "0",
    note: params.get("note")
  };
}

export function formatCompactUsd(value: number): string {
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(2)}B`;
  }

  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }

  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }

  return `$${value.toFixed(0)}`;
}

export function formatSignedUsd(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCompactUsd(Math.abs(value))}`;
}

export function formatPrice(value: number): string {
  const digits = value >= 1000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatMinutesAgo(value: number): string {
  if (value <= 1) {
    return "刚刚";
  }

  return `${value} 分钟前`;
}

export function formatObservationTime(value: number): string {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function formatOptionalSignedPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function sumValues(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function getTradeSideLabel(side: WhaleTrade["side"]): string {
  return side === "buy" ? "主动买入" : "主动卖出";
}

export function getLiveStatusVariant(connectionState: "connecting" | "live" | "fallback"): string {
  if (connectionState === "live") {
    return "live-status-live";
  }

  if (connectionState === "fallback") {
    return "live-status-fallback";
  }

  return "live-status-connecting";
}

export function getLiveStatusLabel(connectionState: "connecting" | "live" | "fallback"): string {
  if (connectionState === "live") {
    return "Binance 实时数据在线";
  }

  if (connectionState === "fallback") {
    return "实时流断开，保留最近真实快照";
  }

  return "正在连接 Binance 公共接口";
}

export function buildDeskVerdict(
  trade: WhaleTrade | null,
  orderBook: WhaleOrderBookWatch | null,
  context: WhaleMarketContext | null,
  windowFilter: WindowFilter
): WhaleDeskVerdict {
  if (!trade) {
    return {
      tone: "neutral",
      label: "等待信号",
      confidence: 32,
      thesis: "当前筛选条件下没有满足阈值的大额成交，建议放宽时间窗或降低金额阈值。",
      action: "先观察盘口是否重新出现主动成交",
      stopLoss: "暂无",
      validity: `最近 ${windowFilter} 分钟数据不足`
    };
  }

  let bullScore = 0;
  let bearScore = 0;

  if (trade.side === "buy") {
    bullScore += 2;
    bullScore += trade.usdValue >= 1000000 ? 2 : 1;
  } else {
    bearScore += 2;
    bearScore += trade.usdValue >= 1000000 ? 2 : 1;
  }

  if (trade.chunks >= 3) {
    if (trade.side === "buy") {
      bullScore += 1;
    } else {
      bearScore += 1;
    }
  }

  if (orderBook) {
    if (orderBook.wallRatio >= 0.3) {
      bullScore += 1;
    }
    if (orderBook.takerBuyRatio >= 0.65) {
      bullScore += 1;
    }
    if (orderBook.cancelRisk >= 0.4) {
      bearScore += 2;
    }
  }

  if (context) {
    if (context.bias === "bullish") {
      bullScore += 1;
    } else if (context.bias === "bearish") {
      bearScore += 1;
    }
  }

  const confidence = Math.max(38, Math.min(91, 46 + bullScore * 8 - bearScore * 6));

  if (bearScore >= bullScore + 1) {
    return {
      tone: "bearish",
      label: trade.side === "sell" ? "卖压增强" : "谨防诱多",
      confidence,
      thesis: `${trade.symbol} 当前虽然出现大额成交，但买墙保留度下降或衍生品结构偏拥挤，让信号更像短线试盘，而不是稳定吸筹。`,
      action: orderBook ? `等待 ${orderBook.confirmationZone} 重新站稳再评估。` : "等待下一轮盘口确认。",
      stopLoss: orderBook?.invalidationZone ?? "观察下一根成交簇",
      validity: `结论以最近 ${windowFilter} 分钟的成交与深度为准`
    };
  }

  if (bullScore >= bearScore + 3) {
    return {
      tone: "bullish",
      label: trade.chunks >= 3 ? "连续吸筹" : "突破买入",
      confidence,
      thesis: `${trade.symbol} 的主动买盘、买墙承接和衍生品背景形成了同向共振，更像可跟踪的进攻性买入。`,
      action: orderBook ? `重点观察 ${orderBook.confirmationZone} 上方是否继续放量。` : "保留原判断，等待再次放量确认。",
      stopLoss: orderBook?.invalidationZone ?? "跌破最近吸筹区时降低权重",
      validity: `适用于接下来 ${windowFilter} 分钟的短线跟踪`
    };
  }

  return {
    tone: "neutral",
    label: "观察等待",
    confidence,
    thesis: `${trade.symbol} 有大额行为，但买盘与风险信号仍在拉扯，暂时更适合做观察而不是立即跟随。`,
    action: orderBook ? `优先等待 ${orderBook.confirmationZone} 或 ${orderBook.absorptionZone} 再做判断。` : "等待新的成交簇打破平衡。",
    stopLoss: orderBook?.invalidationZone ?? "暂无",
    validity: `建议按 ${windowFilter} 分钟滚动刷新判断`
  };
}
