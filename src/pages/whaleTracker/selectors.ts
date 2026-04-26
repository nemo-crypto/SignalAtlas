import type { WhaleOrderBookWatch, WhaleTrade, WhaleSymbol } from "../../data/whaleTrackerData";
import type { WhaleMarketContext } from "../../hooks/useBinanceWhaleMarket";
import {
  confidenceRank,
  formatCompactUsd,
  formatMinutesAgo,
  formatPercent,
  sumValues,
  type ConfidenceFilter,
  type SymbolFilter,
  type WhaleAlert,
  type WindowFilter
} from "./shared";

export type WhaleFocusBundle = {
  focusedTrade: WhaleTrade | null;
  focusedOrderBook: WhaleOrderBookWatch | null;
  focusedContext: WhaleMarketContext | null;
  overviewSymbol: WhaleSymbol;
  observationScopeSymbol: WhaleSymbol | undefined;
};

export type WhaleMetricBundle = {
  buyValue: number;
  totalWindowValue: number;
  trackedValue: number;
  aggressiveBuyShare: number;
  strongestWallRatio: number;
  netFlowUsd: number;
  activePairs: Set<WhaleSymbol>;
};

export function buildScopedTrades(
  liveTrades: WhaleTrade[],
  selectedSymbol: SymbolFilter,
  selectedWindow: WindowFilter
): WhaleTrade[] {
  return liveTrades.filter((trade) => {
    if (trade.minutesAgo > selectedWindow) {
      return false;
    }

    if (selectedSymbol !== "ALL" && trade.symbol !== selectedSymbol) {
      return false;
    }

    return true;
  });
}

export function buildFilteredTrades(
  scopedTrades: WhaleTrade[],
  minTradeValue: number,
  aggressiveOnly: boolean,
  confidenceFilter: ConfidenceFilter
): WhaleTrade[] {
  return scopedTrades.filter((trade) => {
    if (trade.usdValue < minTradeValue) {
      return false;
    }

    if (aggressiveOnly && trade.side !== "buy") {
      return false;
    }

    if (confidenceFilter !== "全部" && confidenceRank[trade.confidence] < confidenceRank[confidenceFilter]) {
      return false;
    }

    return true;
  });
}

export function buildScopedOrderBooks(
  liveOrderBooks: WhaleOrderBookWatch[],
  selectedSymbol: SymbolFilter
): WhaleOrderBookWatch[] {
  return liveOrderBooks.filter((book) => {
    return selectedSymbol === "ALL" || book.symbol === selectedSymbol;
  });
}

export function buildScopedContexts(
  liveContexts: WhaleMarketContext[],
  selectedSymbol: SymbolFilter
): WhaleMarketContext[] {
  return liveContexts.filter((context) => {
    return selectedSymbol === "ALL" || context.symbol === selectedSymbol;
  });
}

export function buildWhaleFocusBundle(args: {
  selectedSymbol: SymbolFilter;
  selectedTradeId: string | null;
  filteredTrades: WhaleTrade[];
  scopedTrades: WhaleTrade[];
  scopedOrderBooks: WhaleOrderBookWatch[];
  scopedContexts: WhaleMarketContext[];
  fallbackSymbol: WhaleSymbol;
}): WhaleFocusBundle {
  const focusedTrade =
    args.filteredTrades.find((trade) => trade.id === args.selectedTradeId) ?? args.filteredTrades[0] ?? null;
  const focusedOrderBook =
    args.scopedOrderBooks.find((book) => book.symbol === focusedTrade?.symbol) ?? args.scopedOrderBooks[0] ?? null;
  const focusedContext =
    args.scopedContexts.find((context) => context.symbol === focusedTrade?.symbol) ?? args.scopedContexts[0] ?? null;
  const overviewSymbol =
    args.selectedSymbol !== "ALL"
      ? args.selectedSymbol
      : focusedTrade?.symbol ??
        args.scopedTrades[0]?.symbol ??
        args.scopedOrderBooks[0]?.symbol ??
        args.scopedContexts[0]?.symbol ??
        args.fallbackSymbol;

  return {
    focusedTrade,
    focusedOrderBook,
    focusedContext,
    overviewSymbol,
    observationScopeSymbol: args.selectedSymbol === "ALL" ? undefined : args.selectedSymbol
  };
}

export function buildWhaleMetricBundle(
  scopedTrades: WhaleTrade[],
  filteredTrades: WhaleTrade[],
  scopedOrderBooks: WhaleOrderBookWatch[]
): WhaleMetricBundle {
  const buyTrades = scopedTrades.filter((trade) => trade.side === "buy");
  const buyValue = sumValues(buyTrades.map((trade) => trade.usdValue));
  const totalWindowValue = sumValues(scopedTrades.map((trade) => trade.usdValue));
  const trackedValue = sumValues(filteredTrades.map((trade) => trade.usdValue));
  const aggressiveBuyShare = totalWindowValue > 0 ? buyValue / totalWindowValue : 0;
  const strongestWallRatio = scopedOrderBooks.reduce((current, book) => {
    return Math.max(current, book.wallRatio);
  }, 0);
  const netFlowUsd = sumValues(
    scopedTrades.map((trade) => {
      return trade.side === "buy" ? trade.usdValue : -trade.usdValue;
    })
  );
  const activePairs = new Set((filteredTrades.length > 0 ? filteredTrades : scopedTrades).map((trade) => trade.symbol));

  return {
    buyValue,
    totalWindowValue,
    trackedValue,
    aggressiveBuyShare,
    strongestWallRatio,
    netFlowUsd,
    activePairs
  };
}

export function buildRepeatedTradeClusters(filteredTrades: WhaleTrade[]): Array<[string, number]> {
  const counts = filteredTrades.reduce<Record<string, number>>((accumulator, trade) => {
    if (trade.side !== "buy") {
      return accumulator;
    }

    accumulator[trade.clusterLabel] = (accumulator[trade.clusterLabel] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts).filter(([, count]) => count >= 2);
}

export function buildWhaleAlerts(args: {
  filteredTrades: WhaleTrade[];
  repeatedClusters: Array<[string, number]>;
  scopedOrderBooks: WhaleOrderBookWatch[];
  scopedContexts: WhaleMarketContext[];
}): WhaleAlert[] {
  const next: WhaleAlert[] = [];
  const largestBuy = [...args.filteredTrades]
    .filter((trade) => trade.side === "buy")
    .sort((left, right) => right.usdValue - left.usdValue)[0];
  const sturdyWall = args.scopedOrderBooks.find((book) => book.wallRatio >= 0.3 && book.cancelRisk < 0.35);
  const spoofingRisk = args.scopedOrderBooks.find((book) => book.cancelRisk >= 0.4);
  const bullishContext = args.scopedContexts.find((context) => context.bias === "bullish");
  const bearishContext = args.scopedContexts.find((context) => context.bias === "bearish");

  if (largestBuy) {
    next.push({
      id: "largest-buy",
      title: `${largestBuy.symbol} 出现高价值主动买单`,
      detail: `${largestBuy.clusterLabel} 在 ${formatMinutesAgo(largestBuy.minutesAgo)} 成交 ${formatCompactUsd(largestBuy.usdValue)}，行为特征为“${largestBuy.behavior}”。`,
      severity: largestBuy.usdValue >= 1000000 ? "high" : "medium"
    });
  }

  if (args.repeatedClusters.length > 0) {
    next.push({
      id: "split-orders",
      title: "检测到连续拆单吸筹",
      detail: `${args.repeatedClusters[0][0]} 在当前时间窗内已完成 ${args.repeatedClusters[0][1]} 次主动买入，符合聚合告警条件。`,
      severity: "high"
    });
  }

  if (sturdyWall) {
    next.push({
      id: "buy-wall",
      title: `${sturdyWall.symbol} 买墙通过真实性校验`,
      detail: `墙体占比 ${formatPercent(sturdyWall.wallRatio)}，撤单风险仅 ${formatPercent(sturdyWall.cancelRisk)}，更像可持续承接。`,
      severity: "medium"
    });
  }

  if (spoofingRisk) {
    next.push({
      id: "spoofing",
      title: `${spoofingRisk.symbol} 存在诱骗风险`,
      detail: `撤单风险已升至 ${formatPercent(spoofingRisk.cancelRisk)}，需防止“假买墙”吸引追单。`,
      severity: "high"
    });
  }

  if (bullishContext) {
    next.push({
      id: "derivatives-bullish",
      title: `${bullishContext.symbol} 出现反身性偏多结构`,
      detail: bullishContext.detail,
      severity: "low"
    });
  }

  if (bearishContext) {
    next.push({
      id: "derivatives-bearish",
      title: `${bearishContext.symbol} 杠杆拥挤度升高`,
      detail: bearishContext.detail,
      severity: "medium"
    });
  }

  return next;
}
