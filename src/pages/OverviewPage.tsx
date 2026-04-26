import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  OverviewOrderBookDepthChart,
  OverviewPriceSparkline,
  OverviewSignalRadar
} from "../components/charts/OverviewCharts";
import { SectionHeader } from "../components/SectionHeader";
import { StatCard } from "../components/StatCard";
import { useLiveMarketOverview } from "../hooks/useLiveMarketOverview";
import { gridPresets, type GridSymbol } from "../data/gridStrategyData";
import {
  type MarketDimension,
  type SignalHistoryItem,
  type Sentiment,
  signalUniverse
} from "../data/mockData";
import { whaleSymbols, type WhaleSymbol } from "../data/whaleTrackerData";
import { getBaselineOverview } from "../services/binance";
import {
  applyManualContextOverlay,
  type ManualContextMetrics
} from "../services/marketAnalysis";
import {
  appendAlertEvent,
  clearManualContext,
  clearAlertEvents,
  clearReadAlertEvents,
  loadAlertEvents,
  loadManualContext,
  loadAlertRules,
  loadScopedSignalHistory,
  markAlertEventsAsRead,
  removeAlertRule,
  saveAlertRule,
  saveManualContext,
  type StoredAlertEvent,
  type StoredManualContext,
  type StoredAlertRule
} from "../services/persistence";

type DimensionControls = Record<
  string,
  {
    enabled: boolean;
    weight: number;
  }
>;

type AlertDirection = "above" | "below";

type SignalTone = "bullish" | "bearish" | "neutral";
type HistorySignalFilter = "all" | SignalTone;
type HistoryOutcomeFilter = "all" | "resolved" | "pending" | "correct" | "incorrect";
type HistorySymbolScope = "active" | "all";
type HistoryTimeRange = "24h" | "7d" | "all";
type HistoryConfidenceFilter = "all" | "high" | "medium" | "low";
type HistoryPnlFilter = "all" | "gt2" | "0to2" | "neg2to0" | "ltNeg2";
type HistoryMarketPnlFilter = HistoryPnlFilter;
type ManualContextFormState = Omit<StoredManualContext, "symbol" | "updatedAt">;
type ManualContextField = keyof ManualContextFormState;
type OverviewSymbol = keyof typeof signalUniverse;
type OverviewRouteSeed = {
  symbol: OverviewSymbol;
  note: string | null;
  focus: "strategy-router" | null;
};
type StrategyPlaybook = {
  id: "trend" | "whale" | "grid";
  title: string;
  score: number;
  tone: SignalTone;
  tag: string;
  summary: string;
  setup: string;
  caution: string;
  cta: string;
  to: "/" | "/whale-tracker" | "/grid-signals";
  search: string;
};

const symbolKeys = Object.keys(signalUniverse) as OverviewSymbol[];
const MAX_HISTORY_ITEMS = symbolKeys.length * 48;
const HISTORY_RANGE_MS: Record<Exclude<HistoryTimeRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000
};

const sentimentLabelMap: Record<Sentiment, string> = {
  bullish: "看涨",
  bearish: "看跌",
  neutral: "中性"
};
const whaleSymbolValues = new Set<WhaleSymbol>(whaleSymbols.map((item) => item.symbol));
const gridPresetMap = new Map<GridSymbol, (typeof gridPresets)[number]>(
  gridPresets.map((preset) => [preset.symbol, preset])
);
const overviewSymbolSet = new Set<string>(symbolKeys);

function createEmptyManualContextState(): ManualContextFormState {
  return {
    exchangeReserveChange: "",
    longTermHolderChange: "",
    activeAddressChange: "",
    dxyChange: "",
    equityFuturesChange: "",
    fearGreedIndex: ""
  };
}

function createDimensionControls(dimensions: MarketDimension[]): DimensionControls {
  return dimensions.reduce<DimensionControls>((accumulator, dimension) => {
    accumulator[dimension.id] = {
      enabled: dimension.enabled,
      weight: dimension.weight
    };
    return accumulator;
  }, {});
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const digits = value >= 10000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : `${score}`;
}

function formatUpdatedTime(timestamp: number | null): string {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour12: false
  });
}

function formatCompactQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 1 : 2
  }).format(value);
}

function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

async function requestNotificationPermission():
  Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function getHistorySignalTone(item: { signalTone?: SignalTone; signal: string }): SignalTone {
  if (item.signalTone) {
    return item.signalTone;
  }

  if (item.signal.includes("买入")) {
    return "bullish";
  }

  if (item.signal.includes("卖出")) {
    return "bearish";
  }

  return "neutral";
}

function getHistoryOutcome(
  item: { outcome?: "correct" | "incorrect" | "warning" | "pending"; accuracy: string }
): "correct" | "incorrect" | "warning" | "pending" {
  if (item.outcome) {
    return item.outcome;
  }

  if (item.accuracy === "✅") {
    return "correct";
  }

  if (item.accuracy === "❌") {
    return "incorrect";
  }

  if (item.accuracy === "🟡" || item.accuracy === "⚪") {
    return "pending";
  }

  return "warning";
}

function getHistoryResolved(item: { resolved?: boolean; after1hPrice: string }): boolean {
  if (typeof item.resolved === "boolean") {
    return item.resolved;
  }

  return item.after1hPrice !== "待跟踪";
}

function getHistoryPnlValue(item: { pnlValue?: number | null; pnl: string }): number | null {
  if (typeof item.pnlValue === "number") {
    return item.pnlValue;
  }

  const parsed = Number(item.pnl.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getHistoryMarketPnlValue(
  item: {
    marketPnl?: string;
    marketPnlValue?: number | null;
    pnlValue?: number | null;
    pnl: string;
    signalTone?: SignalTone;
    signal: string;
  }
): number | null {
  if (typeof item.marketPnlValue === "number") {
    return item.marketPnlValue;
  }

  if (item.marketPnl) {
    const parsed = Number(item.marketPnl.replace("%", ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const strategyPnlValue = getHistoryPnlValue(item);
  if (strategyPnlValue == null) {
    return null;
  }

  return getHistorySignalTone(item) === "bearish" ? -strategyPnlValue : strategyPnlValue;
}

function getHistoryMarketPnl(
  item: {
    marketPnl?: string;
    marketPnlValue?: number | null;
    pnlValue?: number | null;
    pnl: string;
    signalTone?: SignalTone;
    signal: string;
  }
): string {
  const marketPnlValue = getHistoryMarketPnlValue(item);

  if (marketPnlValue == null) {
    return item.marketPnl ?? "待结算";
  }

  return formatSignedPercent(marketPnlValue);
}

function getSignedTrendTextClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "trend-text-neutral";
  }

  return value >= 0 ? "trend-text-up trend-text-emphasis" : "trend-text-down trend-text-emphasis";
}

function getSignalToneTextClass(tone: SignalTone): string {
  if (tone === "bullish") {
    return "history-signal-bullish";
  }

  if (tone === "bearish") {
    return "history-signal-bearish";
  }

  return "history-signal-neutral";
}

function getHistoryOutcomeTextClass(outcome: "correct" | "incorrect" | "warning" | "pending"): string {
  if (outcome === "correct") {
    return "history-outcome-correct trend-text-emphasis";
  }

  if (outcome === "incorrect") {
    return "history-outcome-incorrect trend-text-emphasis";
  }

  return "history-outcome-pending";
}

function getHistoryConfidence(item: { confidence?: number | null; signal: string }): number | null {
  if (typeof item.confidence === "number") {
    return item.confidence;
  }

  const matchedConfidence = item.signal.match(/\((\d+)%\)/);
  if (matchedConfidence) {
    const parsed = Number(matchedConfidence[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (item.signal.includes("强烈")) {
    return 80;
  }

  if (item.signal.includes("谨慎")) {
    return 60;
  }

  if (item.signal.includes("中性")) {
    return 35;
  }

  return null;
}

function formatAlertTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false
  });
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 99));
}

function isWhaleSymbol(value: string): value is WhaleSymbol {
  return whaleSymbolValues.has(value as WhaleSymbol);
}

function isGridSymbol(value: string): value is GridSymbol {
  return gridPresetMap.has(value as GridSymbol);
}

function parseOverviewRouteSeed(search: string): OverviewRouteSeed | null {
  const params = new URLSearchParams(search);
  if (params.get("source") !== "execution-page") {
    return null;
  }

  const symbolParam = params.get("symbol");
  if (!symbolParam || !overviewSymbolSet.has(symbolParam)) {
    return null;
  }

  return {
    symbol: symbolParam as OverviewSymbol,
    note: params.get("note"),
    focus: params.get("focus") === "strategy-router" ? "strategy-router" : null
  };
}

function getHistorySince(range: HistoryTimeRange): number | undefined {
  if (range === "all") {
    return undefined;
  }

  return Date.now() - HISTORY_RANGE_MS[range];
}

export function OverviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeSeed = useMemo(() => parseOverviewRouteSeed(location.search), [location.search]);
  const strategyRouterRef = useRef<HTMLElement | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<OverviewSymbol>(() => routeSeed?.symbol ?? symbolKeys[0]);
  const [overviewRouteNote, setOverviewRouteNote] = useState<string | null>(() => routeSeed?.note ?? null);
  const [shouldFocusStrategyRouter, setShouldFocusStrategyRouter] = useState(
    () => routeSeed?.focus === "strategy-router"
  );
  const [isStrategyRouterHighlighted, setIsStrategyRouterHighlighted] = useState(false);
  const {
    overview: market,
    connectionState,
    statusNote,
    lastUpdatedAt,
    lastRecomputedAt,
    isRecomputing,
    signalHistory
  } = useLiveMarketOverview(activeSymbol);
  const [dimensionControls, setDimensionControls] = useState<DimensionControls>(() =>
    createDimensionControls(getBaselineOverview(symbolKeys[0]).dimensions)
  );
  const [selectedDimensionId, setSelectedDimensionId] = useState(
    getBaselineOverview(symbolKeys[0]).dimensions[0].id
  );
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDirection, setAlertDirection] = useState<AlertDirection>("above");
  const [actionFeedback, setActionFeedback] = useState(
    "当前为纯前端实现：支持复制信号、浏览器打印为 PDF，并将提醒配置持久化到 IndexedDB。"
  );
  const [manualContextInputs, setManualContextInputs] = useState<ManualContextFormState>(() =>
    createEmptyManualContextState()
  );
  const [manualContextUpdatedAt, setManualContextUpdatedAt] = useState<number | null>(null);
  const [contextFeedback, setContextFeedback] = useState(
    "留空则保持当前实时结果或中性基线；填写后会即时修正链上 / 宏观维度。"
  );
  const [alertRules, setAlertRules] = useState<StoredAlertRule[]>([]);
  const [alertEvents, setAlertEvents] = useState<StoredAlertEvent[]>([]);
  const [isAlertFormDirty, setIsAlertFormDirty] = useState(false);
  const [persistedHistory, setPersistedHistory] = useState<SignalHistoryItem[]>([]);
  const [historySymbolScope, setHistorySymbolScope] = useState<HistorySymbolScope>("active");
  const [historyTimeRange, setHistoryTimeRange] = useState<HistoryTimeRange>("all");
  const [historySignalFilter, setHistorySignalFilter] = useState<HistorySignalFilter>("all");
  const [historyOutcomeFilter, setHistoryOutcomeFilter] = useState<HistoryOutcomeFilter>("all");
  const [historyConfidenceFilter, setHistoryConfidenceFilter] =
    useState<HistoryConfidenceFilter>("all");
  const [historyMarketPnlFilter, setHistoryMarketPnlFilter] =
    useState<HistoryMarketPnlFilter>("all");
  const [historyPnlFilter, setHistoryPnlFilter] = useState<HistoryPnlFilter>("all");
  const triggeredAlertIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!routeSeed) {
      return;
    }

    setActiveSymbol(routeSeed.symbol);
    setOverviewRouteNote(routeSeed.note);
    setShouldFocusStrategyRouter(routeSeed.focus === "strategy-router");
    navigate(
      {
        pathname: location.pathname,
        hash: location.hash
      },
      { replace: true }
    );
  }, [location.hash, location.pathname, navigate, routeSeed]);

  useEffect(() => {
    if (!shouldFocusStrategyRouter) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      const panel = strategyRouterRef.current;
      if (!panel) {
        return;
      }

      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      panel.focus({ preventScroll: true });
      setIsStrategyRouterHighlighted(true);
      setShouldFocusStrategyRouter(false);
    }, 140);
    const highlightTimer = window.setTimeout(() => {
      setIsStrategyRouterHighlighted(false);
    }, 2800);

    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [activeSymbol, shouldFocusStrategyRouter]);

  useEffect(() => {
    const baseOverview = getBaselineOverview(activeSymbol);
    setDimensionControls(createDimensionControls(baseOverview.dimensions));
    setSelectedDimensionId(baseOverview.dimensions[0].id);
    setAlertPrice("");
    setAlertDirection("above");
    setManualContextInputs(createEmptyManualContextState());
    setManualContextUpdatedAt(null);
    setContextFeedback("留空则保持当前实时结果或中性基线；填写后会即时修正链上 / 宏观维度。");
    setAlertRules([]);
    setAlertEvents([]);
    setIsAlertFormDirty(false);
    setPersistedHistory([]);
    setHistorySymbolScope("active");
    setHistoryTimeRange("all");
    setHistorySignalFilter("all");
    setHistoryOutcomeFilter("all");
    setHistoryConfidenceFilter("all");
    setHistoryMarketPnlFilter("all");
    setHistoryPnlFilter("all");
    triggeredAlertIdsRef.current = new Set();
    setActionFeedback("已切换币种，综合信号已按默认权重重新计算。");
  }, [activeSymbol]);

  useEffect(() => {
    let ignore = false;

    const hydrateAlertState = async () => {
      try {
        const [persistedRules, persistedEvents] = await Promise.all([
          loadAlertRules(activeSymbol),
          loadAlertEvents(activeSymbol)
        ]);
        if (ignore) {
          return;
        }

        setAlertRules(persistedRules);
        setAlertEvents(persistedEvents);
        if (persistedRules.length > 0) {
          setActionFeedback(`已加载该币种的 ${persistedRules.length} 条本地提醒规则。`);
        }
      } catch {
        if (ignore) {
          return;
        }
      }
    };

    void hydrateAlertState();

    return () => {
      ignore = true;
    };
  }, [activeSymbol]);

  useEffect(() => {
    let ignore = false;

    const hydrateManualContext = async () => {
      try {
        const storedContext = await loadManualContext(activeSymbol);
        if (ignore || !storedContext) {
          return;
        }

        setManualContextInputs({
          exchangeReserveChange: storedContext.exchangeReserveChange,
          longTermHolderChange: storedContext.longTermHolderChange,
          activeAddressChange: storedContext.activeAddressChange,
          dxyChange: storedContext.dxyChange,
          equityFuturesChange: storedContext.equityFuturesChange,
          fearGreedIndex: storedContext.fearGreedIndex
        });
        setManualContextUpdatedAt(storedContext.updatedAt);
        setContextFeedback("已加载该币种的链上 / 宏观本地填充，可继续调整。");
      } catch {
        if (ignore) {
          return;
        }
      }
    };

    void hydrateManualContext();

    return () => {
      ignore = true;
    };
  }, [activeSymbol]);

  useEffect(() => {
    if (isAlertFormDirty) {
      return;
    }

    const liveAlertPrice = market.defaultAlertPrice > 0 ? String(market.defaultAlertPrice) : "";
    if (liveAlertPrice !== alertPrice) {
      setAlertPrice(liveAlertPrice);
    }
  }, [alertPrice, isAlertFormDirty, market.defaultAlertPrice]);

  const historySince = useMemo(() => getHistorySince(historyTimeRange), [historyTimeRange]);

  useEffect(() => {
    let ignore = false;

    const hydrateHistoryState = async () => {
      try {
        const scopedSymbol = historySymbolScope === "active" ? activeSymbol : undefined;
        const nextHistory = await loadScopedSignalHistory({
          symbol: scopedSymbol,
          since: historySince,
          limit: MAX_HISTORY_ITEMS
        });

        if (ignore) {
          return;
        }

        setPersistedHistory(nextHistory);
      } catch {
        if (ignore) {
          return;
        }

        setPersistedHistory([]);
      }
    };

    void hydrateHistoryState();

    return () => {
      ignore = true;
    };
  }, [activeSymbol, historySince, historySymbolScope, signalHistory]);

  const manualContextMetrics = useMemo<ManualContextMetrics>(
    () => ({
      exchangeReserveChange: parseOptionalNumber(manualContextInputs.exchangeReserveChange),
      longTermHolderChange: parseOptionalNumber(manualContextInputs.longTermHolderChange),
      activeAddressChange: parseOptionalNumber(manualContextInputs.activeAddressChange),
      dxyChange: parseOptionalNumber(manualContextInputs.dxyChange),
      equityFuturesChange: parseOptionalNumber(manualContextInputs.equityFuturesChange),
      fearGreedIndex: parseOptionalNumber(manualContextInputs.fearGreedIndex)
    }),
    [manualContextInputs]
  );

  const displayMarket = useMemo(
    () => applyManualContextOverlay(market, manualContextMetrics),
    [manualContextMetrics, market]
  );

  const filledManualContextCount = useMemo(
    () => Object.values(manualContextInputs).filter((value) => value.trim().length > 0).length,
    [manualContextInputs]
  );

  const dimensions = useMemo(
    () =>
      displayMarket.dimensions.map((dimension) => ({
        ...dimension,
        enabled: dimensionControls[dimension.id]?.enabled ?? dimension.enabled,
        weight: dimensionControls[dimension.id]?.weight ?? dimension.weight
      })),
    [dimensionControls, displayMarket.dimensions]
  );

  const activeDimensions = useMemo(
    () => dimensions.filter((dimension) => dimension.enabled),
    [dimensions]
  );

  const selectedDimension =
    dimensions.find((dimension) => dimension.id === selectedDimensionId) ?? dimensions[0];
  const onChainDimension =
    dimensions.find((dimension) => dimension.id === "on-chain") ?? selectedDimension;
  const macroDimension =
    dimensions.find((dimension) => dimension.id === "macro") ?? selectedDimension;

  const bullishScore = activeDimensions.reduce(
    (sum, dimension) => sum + Math.max(dimension.score, 0) * dimension.weight,
    0
  );
  const bearishScore = activeDimensions.reduce(
    (sum, dimension) => sum + Math.max(-dimension.score, 0) * dimension.weight,
    0
  );
  const scaleBase =
    activeDimensions.reduce((sum, dimension) => sum + dimension.weight * 10, 0) || 1;
  const bullishCount = activeDimensions.filter((dimension) => dimension.score > 1).length;
  const bearishCount = activeDimensions.filter((dimension) => dimension.score < -1).length;
  const neutralCount = Math.max(activeDimensions.length - bullishCount - bearishCount, 0);
  const buyStrength = bullishScore / scaleBase;
  const sellStrength = bearishScore / scaleBase;
  const neutralStrength = activeDimensions.length
    ? neutralCount / activeDimensions.length
    : 0;
  const compositeBias = Math.round(((bullishScore - bearishScore) / scaleBase) * 100);
  const confidence = Math.round(Math.max(buyStrength, sellStrength) * 100);

  const signalState = useMemo(() => {
    let label = "中性观望";
    let tone: SignalTone = "neutral";
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
      position,
      stopLoss
    };
  }, [buyStrength, sellStrength]);

  const reportText = useMemo(() => {
    const timestamp = new Date().toLocaleString("zh-CN", {
      hour12: false
    });
    const hasUsableMarketSnapshot = displayMarket.price > 0;
    const dataSourceLabel =
      connectionState === "live"
        ? "Binance Live"
        : connectionState === "connecting"
          ? "连接中"
          : hasUsableMarketSnapshot
            ? "本地快照"
            : "中性基线";

    return [
      `【CryptoVision 信号报告】${timestamp}`,
      `币种: ${displayMarket.symbol} 当前价: ${formatPrice(displayMarket.price)}`,
      `综合信号: ${signalState.label} | 置信度: ${confidence}%`,
      `数据源: ${dataSourceLabel}`,
      `综合偏向: ${compositeBias >= 0 ? `多头 ${compositeBias}` : `空头 ${Math.abs(compositeBias)}`}`,
      `建议仓位: ${signalState.position} | 止损: ${signalState.stopLoss}`,
      "主要理由:",
      ...displayMarket.reportHighlights.map((item, index) => `${index + 1}. ${item}`),
      `风险提示: ${displayMarket.riskNote}`,
      `提醒条件: 价格${alertDirection === "above" ? "上破" : "跌破"} ${formatPrice(Number(alertPrice) || displayMarket.defaultAlertPrice)}`
    ].join("\n");
  }, [alertDirection, alertPrice, compositeBias, confidence, connectionState, displayMarket, signalState]);
  const hasUsableMarketSnapshot = displayMarket.price > 0;
  const fallbackSourceLabel = hasUsableMarketSnapshot ? "本地快照" : "中性基线";

  const unreadAlertCount = useMemo(
    () => alertEvents.filter((event) => !event.readAt).length,
    [alertEvents]
  );
  const readAlertCount = useMemo(
    () => alertEvents.filter((event) => Boolean(event.readAt)).length,
    [alertEvents]
  );
  const displayedHistory = useMemo(() => {
    return persistedHistory;
  }, [persistedHistory]);
  const filteredHistory = useMemo(
    () =>
      displayedHistory.filter((item) => {
        const matchesSignal =
          historySignalFilter === "all" || getHistorySignalTone(item) === historySignalFilter;
        const outcome = getHistoryOutcome(item);
        const isResolved = getHistoryResolved(item);
        const confidenceValue = getHistoryConfidence(item);
        const marketPnlValue = getHistoryMarketPnlValue(item);
        const pnlValue = getHistoryPnlValue(item);
        const matchesOutcome =
          historyOutcomeFilter === "all" ||
          (historyOutcomeFilter === "resolved" && isResolved) ||
          (historyOutcomeFilter === "pending" && !isResolved) ||
          (historyOutcomeFilter === "correct" && outcome === "correct") ||
          (historyOutcomeFilter === "incorrect" && outcome === "incorrect");
        const matchesConfidence =
          historyConfidenceFilter === "all" ||
          (confidenceValue != null &&
            ((historyConfidenceFilter === "high" && confidenceValue >= 70) ||
              (historyConfidenceFilter === "medium" &&
                confidenceValue >= 40 &&
                confidenceValue < 70) ||
              (historyConfidenceFilter === "low" && confidenceValue < 40)));
        const matchesMarketPnl =
          historyMarketPnlFilter === "all" ||
          (marketPnlValue != null &&
            ((historyMarketPnlFilter === "gt2" && marketPnlValue >= 2) ||
              (historyMarketPnlFilter === "0to2" &&
                marketPnlValue >= 0 &&
                marketPnlValue < 2) ||
              (historyMarketPnlFilter === "neg2to0" &&
                marketPnlValue > -2 &&
                marketPnlValue < 0) ||
              (historyMarketPnlFilter === "ltNeg2" && marketPnlValue <= -2)));
        const matchesPnl =
          historyPnlFilter === "all" ||
          (pnlValue != null &&
            ((historyPnlFilter === "gt2" && pnlValue >= 2) ||
              (historyPnlFilter === "0to2" && pnlValue >= 0 && pnlValue < 2) ||
              (historyPnlFilter === "neg2to0" && pnlValue > -2 && pnlValue < 0) ||
              (historyPnlFilter === "ltNeg2" && pnlValue <= -2)));

        return (
          matchesSignal &&
          matchesOutcome &&
          matchesConfidence &&
          matchesMarketPnl &&
          matchesPnl
        );
      }),
    [
      displayedHistory,
      historyConfidenceFilter,
      historyMarketPnlFilter,
      historyOutcomeFilter,
      historyPnlFilter,
      historySignalFilter
    ]
  );
  const historyStats = useMemo(() => {
    const resolvedItems = filteredHistory.filter((item) => getHistoryResolved(item));
    const correctCount = resolvedItems.filter((item) => getHistoryOutcome(item) === "correct").length;
    const incorrectCount = resolvedItems.filter((item) => getHistoryOutcome(item) === "incorrect").length;
    const avgMarketPnl =
      resolvedItems.reduce((sum, item) => sum + (getHistoryMarketPnlValue(item) ?? 0), 0) /
      Math.max(resolvedItems.length, 1);
    const avgPnl =
      resolvedItems.reduce((sum, item) => sum + (getHistoryPnlValue(item) ?? 0), 0) /
      Math.max(resolvedItems.length, 1);

    return {
      total: filteredHistory.length,
      resolved: resolvedItems.length,
      winRate: resolvedItems.length > 0 ? Math.round((correctCount / resolvedItems.length) * 100) : 0,
      avgMarketPnl,
      avgPnl,
      correctCount,
      incorrectCount
    };
  }, [filteredHistory]);
  const volatilityRangePercent = useMemo(() => {
    const high = Math.max(...displayMarket.sparkline);
    const low = Math.min(...displayMarket.sparkline);
    return ((high - low) / Math.max(displayMarket.price, 1)) * 100;
  }, [displayMarket.price, displayMarket.sparkline]);
  const sparklineRange = useMemo(() => {
    const low = Math.min(...displayMarket.sparkline);
    const high = Math.max(...displayMarket.sparkline);
    return { low, high };
  }, [displayMarket.sparkline]);
  const orderBookImbalance = displayMarket.orderBookDepth?.imbalance ?? 0;
  const radarSummary = useMemo(() => {
    const enabledDimensions = dimensions.filter((dimension) => dimension.enabled);
    const strongestBull =
      enabledDimensions
        .filter((dimension) => dimension.score > 0)
        .sort((left, right) => right.score - left.score)[0] ?? null;
    const strongestBear =
      enabledDimensions
        .filter((dimension) => dimension.score < 0)
        .sort((left, right) => left.score - right.score)[0] ?? null;

    return {
      enabledCount: enabledDimensions.length,
      totalCount: dimensions.length,
      strongestBull,
      strongestBear
    };
  }, [dimensions]);
  const orderBookDimension =
    dimensions.find((dimension) => dimension.id === "order-book") ?? selectedDimension;
  const moneyFlowDimension =
    dimensions.find((dimension) => dimension.id === "money-flow") ?? selectedDimension;
  const volatilityDimension =
    dimensions.find((dimension) => dimension.id === "volatility") ?? selectedDimension;
  const strategyPlaybooks = useMemo<StrategyPlaybook[]>(() => {
    const directionalTone: SignalTone =
      compositeBias >= 18 ? "bullish" : compositeBias <= -18 ? "bearish" : "neutral";
    const whaleTone: SignalTone =
      moneyFlowDimension.sentiment === "bullish" || moneyFlowDimension.sentiment === "bearish"
        ? moneyFlowDimension.sentiment
        : onChainDimension.sentiment;
    const routeSymbol = displayMarket.symbol;
    const whaleRouteSymbol = isWhaleSymbol(routeSymbol) ? routeSymbol : "BTCUSDT";
    const gridRouteSymbol = isGridSymbol(routeSymbol) ? routeSymbol : gridPresets[0].symbol;
    const gridPreset = gridPresetMap.get(gridRouteSymbol) ?? gridPresets[0];
    const gridCenterPrice = (gridPreset.lowerPrice + gridPreset.upperPrice) / 2;
    const lowerGapRatio =
      (gridCenterPrice - gridPreset.lowerPrice) / Math.max(gridCenterPrice, 1);
    const upperGapRatio =
      (gridPreset.upperPrice - gridCenterPrice) / Math.max(gridCenterPrice, 1);
    const rangePaddingRatio = Math.max(volatilityRangePercent / 100 / 3, 0.006);
    const gridLowerPrice = Number(
      (displayMarket.price * (1 - lowerGapRatio - rangePaddingRatio)).toFixed(
        gridRouteSymbol === "BNBUSDT" ? 2 : 2
      )
    );
    const gridUpperPrice = Number(
      (displayMarket.price * (1 + upperGapRatio + rangePaddingRatio)).toFixed(
        gridRouteSymbol === "BNBUSDT" ? 2 : 2
      )
    );
    const trendScore = clampScore(
      Math.abs(compositeBias) * 0.58 +
        confidence * 0.34 +
        Math.abs(displayMarket.change24h) * 6 +
        Math.abs(orderBookImbalance) * 38 +
        Math.max(Math.abs(volatilityDimension.score) - 3, 0) * 4.5
    );
    const whaleScore = clampScore(
      confidence * 0.18 +
        Math.max(
          Math.abs(moneyFlowDimension.score),
          Math.abs(onChainDimension.score),
          Math.abs(orderBookDimension.score)
        ) *
          5.4 +
        Math.abs(orderBookImbalance) * 24 +
        Math.abs(displayMarket.change24h) * 6 +
        (Math.abs(moneyFlowDimension.score) >= 6 && Math.abs(orderBookDimension.score) >= 5 ? 6 : 0) +
        (Math.abs(onChainDimension.score) >= 5 ? 4 : 0)
    );
    const gridScore = clampScore(
      76 -
        Math.abs(compositeBias) * 0.36 -
        Math.abs(displayMarket.change24h) * 9 -
        Math.abs(orderBookImbalance) * 72 +
        neutralStrength * 26 +
        (historyStats.winRate >= 55 ? 8 : 0) -
        Math.max(Math.abs(volatilityDimension.score) - 5, 0) * 3.8
    );
    const whaleWindow: 3 | 10 = whaleScore >= 80 ? 3 : 10;
    const whaleMinTradeValue = whaleScore >= 82 ? 1000000 : 500000;
    const whaleConfidenceFilter = whaleScore >= 88 ? "高" : "中高";
    const whaleAggressiveOnly = whaleTone !== "bearish";
    const whaleSearch = new URLSearchParams({
      source: "strategy-router",
      symbol: whaleRouteSymbol,
      window: String(whaleWindow),
      minTradeValue: String(whaleMinTradeValue),
      confidence: whaleConfidenceFilter,
      aggressiveOnly: whaleAggressiveOnly ? "1" : "0",
      note: `已从综合信号盘带入 ${whaleRouteSymbol} 的大单跟踪参数。`
    }).toString();
    const gridSearch = new URLSearchParams({
      source: "strategy-router",
      symbol: gridRouteSymbol,
      lowerPrice: String(gridLowerPrice),
      upperPrice: String(gridUpperPrice),
      gridCount: String(gridPreset.gridCount),
      investPerGrid: String(gridPreset.investPerGrid),
      currentPrice: displayMarket.price.toFixed(2),
      note: `已从综合信号盘带入 ${gridRouteSymbol} 当前价格附近的推荐网格区间。`
    }).toString();

    const playbooks: StrategyPlaybook[] = [
      {
        id: "trend",
        title: "趋势跟随 / 方向仓",
        score: trendScore,
        tone: directionalTone,
        tag: trendScore >= 70 ? "趋势推进" : trendScore >= 55 ? "可尝试" : "暂不优先",
        summary:
          directionalTone === "bullish"
            ? "综合偏向明显站在多头一侧，适合把主精力放在突破后的顺势推进。"
            : directionalTone === "bearish"
              ? "空头压力与盘口失衡在放大，方向性交易优先级高于区间交易。"
              : "当前方向信号还不够集中，趋势单只适合轻仓试错。",
        setup:
          directionalTone === "bearish"
            ? "等待反弹承压后分批减仓或做对冲"
            : "等待放量突破后顺势跟进，仓位以置信度递增",
        caution: `当日波动 ${volatilityRangePercent.toFixed(2)}% · 假突破时要回到综合信号盘复核`,
        cta: "回到总览看方向",
        to: "/",
        search: ""
      },
      {
        id: "whale",
        title: "鲸鱼跟随 / 事件驱动",
        score: whaleScore,
        tone: whaleTone,
        tag: whaleScore >= 70 ? "大单优先" : whaleScore >= 55 ? "值得盯盘" : "仅做观察",
        summary:
          "当资金流、链上和盘口同时放大时，短时大单驱动的交易优先级会明显高于普通趋势判断。",
        setup: "优先盯主动成交、盘口挂墙和地址转账是否继续共振",
        caution: `资金流分数 ${formatScore(moneyFlowDimension.score)} · 链上分数 ${formatScore(onChainDimension.score)}`,
        cta: "前往 Whale Tracker",
        to: "/whale-tracker",
        search: `?${whaleSearch}`
      },
      {
        id: "grid",
        title: "网格震荡 / 均值回归",
        score: gridScore,
        tone: gridScore >= 62 ? "neutral" : "bearish",
        tag: gridScore >= 70 ? "最适合网格" : gridScore >= 55 ? "可小仓运行" : "谨慎启用",
        summary:
          gridScore >= 60
            ? "当前更像区间震荡，网格策略有条件通过反复吃回撤和反弹获得稳定收益。"
            : "方向性或波动性偏强，网格更容易被单边行情反复穿透。",
        setup: "保持区间边界紧贴支撑/阻力，并控制每格资金暴露",
        caution: `盘口失衡 ${(orderBookImbalance * 100).toFixed(1)}% · 命中率 ${historyStats.winRate}%`,
        cta: "前往 Grid Signals",
        to: "/grid-signals",
        search: `?${gridSearch}`
      }
    ];

    return playbooks.sort((left, right) => right.score - left.score);
  }, [
    compositeBias,
    confidence,
    displayMarket.change24h,
    historyStats.winRate,
    moneyFlowDimension.score,
    moneyFlowDimension.sentiment,
    neutralStrength,
    onChainDimension.score,
    onChainDimension.sentiment,
    orderBookDimension.score,
    orderBookImbalance,
    volatilityDimension.score,
    volatilityRangePercent
  ]);
  const leadStrategy = strategyPlaybooks[0];
  const leadStrategyReady = leadStrategy.score >= 55;
  const activeAlertRules = useMemo(
    () => alertRules.filter((rule) => rule.armed),
    [alertRules]
  );

  function updateWeight(id: string, nextWeight: number) {
    setDimensionControls((current) => ({
      ...current,
      [id]: {
        ...current[id],
        weight: nextWeight
      }
    }));
  }

  function toggleDimension(id: string) {
    setDimensionControls((current) => {
      const enabledCount = Object.values(current).filter((item) => item.enabled).length;
      const target = current[id];

      if (target.enabled && enabledCount === 1) {
        setActionFeedback("至少保留一个启用维度，才能继续计算综合信号。");
        return current;
      }

      return {
        ...current,
        [id]: {
          ...target,
          enabled: !target.enabled
        }
      };
    });
  }

  function handleManualContextInputChange(field: ManualContextField, value: string) {
    setManualContextInputs((current) => ({
      ...current,
      [field]: value
    }));
    setContextFeedback("已按当前输入即时重算链上 / 宏观维度，点击保存后会写入 IndexedDB。");
  }

  async function handleSaveManualContext() {
    const updatedAt = Date.now();

    try {
      if (filledManualContextCount > 0) {
        const payload: StoredManualContext = {
          symbol: activeSymbol,
          ...manualContextInputs,
          updatedAt
        };
        await saveManualContext(payload);
        setManualContextUpdatedAt(updatedAt);
        setContextFeedback(`已保存 ${filledManualContextCount} 个手动填充字段，刷新页面后仍会保留。`);
      } else {
        await clearManualContext(activeSymbol);
        setManualContextUpdatedAt(null);
        setContextFeedback("当前没有填写字段，已同步清空本地上下文。");
      }
    } catch {
      setContextFeedback("链上 / 宏观手动填充保存失败，本轮输入仍保留在当前页面。");
    }
  }

  async function handleResetManualContext() {
    setManualContextInputs(createEmptyManualContextState());
    setManualContextUpdatedAt(null);

    try {
      await clearManualContext(activeSymbol);
      setContextFeedback("已清空该币种的链上 / 宏观手动填充，维度恢复为当前实时结果或中性基线。");
    } catch {
      setContextFeedback("本地手动填充清空失败，但当前页面已先恢复到当前实时结果或中性基线。");
    }
  }

  async function handleCopySignal() {
    try {
      await navigator.clipboard.writeText(reportText);
      setActionFeedback("已复制综合信号报告，可直接发到群或贴到复盘文档。");
    } catch {
      setActionFeedback("复制失败，当前环境可能不支持剪贴板写入。请手动复制右侧报告预览。");
    }
  }

  function handleExportReport() {
    window.print();
    setActionFeedback("已触发浏览器打印面板，可直接另存为 PDF。后续可接专用导出样式。");
  }

  async function handleSetAlert() {
    const nextPrice = Number(alertPrice);

    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setActionFeedback("请输入有效的提醒价格。");
      return;
    }

    if (alertDirection === "above" && market.price >= nextPrice) {
      setActionFeedback("当前价格已经高于提醒阈值，请设置更高的价格上破提醒。");
      return;
    }

    if (alertDirection === "below" && market.price <= nextPrice) {
      setActionFeedback("当前价格已经低于提醒阈值，请设置更低的价格跌破提醒。");
      return;
    }

    const notificationPermission = await requestNotificationPermission();
    const nextRule: StoredAlertRule = {
      id: `${market.symbol}-${Date.now()}`,
      symbol: market.symbol,
      price: alertPrice,
      direction: alertDirection,
      armed: true,
      updatedAt: Date.now()
    };

    triggeredAlertIdsRef.current.delete(nextRule.id);
    void saveAlertRule(nextRule);
    setAlertRules((current) =>
      [nextRule, ...current].sort((left, right) => right.updatedAt - left.updatedAt)
    );
    setIsAlertFormDirty(false);

    const baseMessage = `${market.symbol} 已设置价格提醒：${
      alertDirection === "above" ? "上破" : "跌破"
    } ${formatPrice(nextPrice)}`;

    if (notificationPermission === "granted") {
      setActionFeedback(`${baseMessage}，命中后会弹出浏览器通知。`);
      return;
    }

    if (notificationPermission === "denied") {
      setActionFeedback(`${baseMessage}，但浏览器通知权限未开启，当前只会保存在本地。`);
      return;
    }

    if (notificationPermission === "unsupported") {
      setActionFeedback(`${baseMessage}，当前浏览器环境不支持系统通知，已保存在本地。`);
      return;
    }

    setActionFeedback(`${baseMessage}，如果稍后允许通知权限，将自动弹出浏览器提醒。`);
  }

  function handleRemoveAlertRule(ruleId: string) {
    setAlertRules((current) => current.filter((rule) => rule.id !== ruleId));
    triggeredAlertIdsRef.current.delete(ruleId);
    void removeAlertRule(ruleId);
    setActionFeedback("已删除这条价格提醒规则。");
  }

  async function handleMarkAlertEventRead(eventId: string) {
    const targetEvent = alertEvents.find((event) => event.id === eventId);

    if (!targetEvent || targetEvent.readAt) {
      return;
    }

    const readAt = Date.now();
    const currentSymbol = activeSymbol;
    setAlertEvents((current) =>
      current.map((event) => (event.id === eventId ? { ...event, readAt } : event))
    );

    try {
      await markAlertEventsAsRead(currentSymbol, [eventId], readAt);
      setActionFeedback("已将该条提醒日志标记为已读。");
    } catch {
      const restoredEvents = await loadAlertEvents(currentSymbol);
      setAlertEvents(restoredEvents);
      setActionFeedback("提醒日志已读状态保存失败，已回滚本地显示。");
    }
  }

  async function handleMarkAllAlertEventsRead() {
    if (unreadAlertCount === 0) {
      setActionFeedback("当前没有未读提醒日志。");
      return;
    }

    const readAt = Date.now();
    const currentSymbol = activeSymbol;
    setAlertEvents((current) => current.map((event) => ({ ...event, readAt: event.readAt ?? readAt })));

    try {
      const updatedCount = await markAlertEventsAsRead(currentSymbol, undefined, readAt);
      setActionFeedback(`已将 ${updatedCount} 条提醒日志标记为已读。`);
    } catch {
      const restoredEvents = await loadAlertEvents(currentSymbol);
      setAlertEvents(restoredEvents);
      setActionFeedback("批量更新提醒日志失败，已恢复原始状态。");
    }
  }

  async function handleClearAlertEvents() {
    if (alertEvents.length === 0) {
      setActionFeedback("当前没有可清空的提醒日志。");
      return;
    }

    const previousEvents = alertEvents;
    const currentSymbol = activeSymbol;
    setAlertEvents([]);

    try {
      const clearedCount = await clearAlertEvents(currentSymbol);
      setActionFeedback(`已清空 ${clearedCount} 条提醒触发日志。`);
    } catch {
      setAlertEvents(previousEvents);
      setActionFeedback("提醒日志清空失败，已恢复原始列表。");
    }
  }

  async function handleClearReadAlertEvents() {
    if (readAlertCount === 0) {
      setActionFeedback("当前没有已读提醒日志可清理。");
      return;
    }

    const previousEvents = alertEvents;
    const currentSymbol = activeSymbol;
    setAlertEvents((current) => current.filter((event) => !event.readAt));

    try {
      const clearedCount = await clearReadAlertEvents(currentSymbol);
      setActionFeedback(`已清空 ${clearedCount} 条已读提醒日志，未读记录已保留。`);
    } catch {
      setAlertEvents(previousEvents);
      setActionFeedback("清空已读提醒日志失败，已恢复原始列表。");
    }
  }

  useEffect(() => {
    const triggeredRules = alertRules.filter((rule) => {
      if (!rule.armed || triggeredAlertIdsRef.current.has(rule.id)) {
        return false;
      }

      const targetPrice = Number(rule.price);
      if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
        return false;
      }

      return rule.direction === "above" ? market.price >= targetPrice : market.price <= targetPrice;
    });

    if (triggeredRules.length === 0) {
      return;
    }

    const triggeredRuleIds = new Set(triggeredRules.map((rule) => rule.id));
    const triggeredAt = Date.now();
    triggeredRules.forEach((rule) => triggeredAlertIdsRef.current.add(rule.id));

    const updatedRules = alertRules.map((rule) =>
      triggeredRuleIds.has(rule.id)
        ? {
            ...rule,
            armed: false,
            updatedAt: triggeredAt
          }
        : rule
    );
    const nextEvents = triggeredRules.map<StoredAlertEvent>((rule) => ({
      id: `${rule.id}-${triggeredAt}`,
      ruleId: rule.id,
      symbol: rule.symbol,
      price: rule.price,
      direction: rule.direction,
      triggeredPrice: market.price,
      triggeredAt,
      readAt: null
    }));

    setAlertRules(updatedRules.sort((left, right) => right.updatedAt - left.updatedAt));
    setAlertEvents((current) => [...nextEvents, ...current].slice(0, 8));

    void Promise.all([
      ...updatedRules
        .filter((rule) => triggeredRuleIds.has(rule.id))
        .map((rule) => saveAlertRule(rule)),
      ...nextEvents.map((event) => appendAlertEvent(event))
    ]);

    const latestTriggeredRule = triggeredRules[0];
    const latestTargetPrice = Number(latestTriggeredRule.price);
    const triggerMessage = `${latestTriggeredRule.symbol} ${
      latestTriggeredRule.direction === "above" ? "已上破" : "已跌破"
    } ${formatPrice(latestTargetPrice)}，当前价格 ${formatPrice(market.price)}。`;

    setActionFeedback(
      triggeredRules.length === 1
        ? `价格提醒已触发：${triggerMessage}`
        : `${triggeredRules.length} 条价格提醒已触发，最新一条：${triggerMessage}`
    );

    if (getNotificationPermission() === "granted") {
      triggeredRules.forEach((rule) => {
        new Notification("CryptoVision 价格提醒", {
          body: `${rule.symbol} ${rule.direction === "above" ? "已上破" : "已跌破"} ${formatPrice(
            Number(rule.price)
          )}，当前价格 ${formatPrice(market.price)}。`,
          tag: `cryptoquant-alert-${rule.id}`
        });
      });
    }
  }, [alertRules, market.price]);

  return (
    <section className="page-content overview-page">
      <div className="hero-panel overview-hero-panel">
        <div>
          <p className="eyebrow">CR_1 MVP / Composite Signal Desk</p>
          <h3>CryptoVision 智能信号决策终端</h3>
          <p className="hero-copy">
            当前版本已按 CR_1.MD 落地纯前端 MVP：支持 BTC / ETH 切换、10 维信号矩阵、
            权重调节、雷达图、历史回溯、订单簿实时深度图、链上 / 宏观手动填充与操作栏，
            并接入 Web Worker 全量重算、Binance REST / WebSocket 行情与 IndexedDB 持久化。
          </p>

          <div className="symbol-switch" role="tablist" aria-label="币种切换">
            {symbolKeys.map((symbol) => {
              const item = signalUniverse[symbol];
              return (
                <button
                  key={symbol}
                  type="button"
                  className={symbol === activeSymbol ? "symbol-chip symbol-chip-active" : "symbol-chip"}
                  onClick={() => {
                    setOverviewRouteNote(null);
                    setShouldFocusStrategyRouter(false);
                    setIsStrategyRouterHighlighted(false);
                    setActiveSymbol(symbol);
                  }}
                >
                  <strong>{item.symbol}</strong>
                  <span>{item.displayName}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`hero-badge signal-hero-badge tone-${signalState.tone}`}>
          <span>Composite Signal</span>
          <strong>{signalState.label}</strong>
          <small>
            置信度 {confidence}% · {compositeBias >= 0 ? `多头 ${compositeBias}` : `空头 ${Math.abs(compositeBias)}`}
          </small>
        </div>
      </div>

      <div className="live-status-row">
        <div
          className={
            connectionState === "live"
              ? "live-status-pill live-status-live"
              : connectionState === "connecting"
                ? "live-status-pill live-status-connecting"
                : "live-status-pill live-status-fallback"
          }
        >
          {connectionState === "live"
            ? "Binance Live"
            : connectionState === "connecting"
              ? "连接中"
              : fallbackSourceLabel}
        </div>
        <p className="live-status-copy live-status-copy-grid">
          <span className="live-status-copy-segment">{statusNote}</span>
          <span className="live-status-copy-segment live-status-copy-segment-time">
            流更新时间 <strong>{formatUpdatedTime(lastUpdatedAt)}</strong>
          </span>
          <span className="live-status-copy-segment live-status-copy-segment-time">
            全量重算 <strong>{formatUpdatedTime(lastRecomputedAt)}</strong>
          </span>
        </p>
        {isRecomputing ? <span className="live-refresh-chip">维度重算中</span> : null}
      </div>
      {overviewRouteNote ? (
        <div className="alert-chip-banner strategy-return-banner">{overviewRouteNote}</div>
      ) : null}

      <div className="stats-grid market-stats-grid">
        <StatCard
          label="当前价格"
          value={formatPrice(displayMarket.price)}
          detail={`${displayMarket.displayName} | ${displayMarket.support}`}
          trend={hasUsableMarketSnapshot ? (displayMarket.change24h >= 0 ? "up" : "down") : "neutral"}
        />
        <StatCard
          label="24H 涨跌"
          value={hasUsableMarketSnapshot ? formatSignedPercent(displayMarket.change24h) : "--"}
          detail={`阻力位：${displayMarket.resistance}`}
          trend={hasUsableMarketSnapshot ? (displayMarket.change24h >= 0 ? "up" : "down") : "neutral"}
        />
        <StatCard
          label="资金费率"
          value={hasUsableMarketSnapshot ? displayMarket.fundingRate : "--"}
          detail={`未平仓合约：${displayMarket.openInterest}`}
          trend={
            hasUsableMarketSnapshot
              ? displayMarket.fundingRate.startsWith("-")
                ? "up"
                : "down"
              : "neutral"
          }
        />
        <StatCard
          label="多空比"
          value={hasUsableMarketSnapshot ? displayMarket.longShortRatio : "--"}
          detail={`信号有效期：${displayMarket.validity}`}
          trend={
            hasUsableMarketSnapshot
              ? Number(displayMarket.longShortRatio) < 1
                ? "up"
                : "neutral"
              : "neutral"
          }
        />
      </div>

      <div className="content-grid two-columns overview-primary-grid">
        <section className="panel signal-board-panel">
          <SectionHeader
            eyebrow="Signal Board"
            title="综合信号盘"
            description="根据启用维度与用户权重实时重算，贴近 PRD 中的主信号盘设计。"
          />

          <div className={`signal-board tone-${signalState.tone}`}>
            <div className="signal-board-heading">
              <div>
                <p className="eyebrow">Composite Recommendation</p>
                <h4>{signalState.label}</h4>
              </div>
              <div className="confidence-pill">置信度 {confidence}%</div>
            </div>

            <div className="signal-board-meta">
              <div>
                <span>建议仓位</span>
                <strong>{signalState.position}</strong>
              </div>
              <div>
                <span>止损参考</span>
                <strong>{signalState.stopLoss}</strong>
              </div>
              <div>
                <span>有效期</span>
                <strong>{displayMarket.validity}</strong>
              </div>
            </div>

            <div className="score-bar-list">
              <div className="score-bar-item">
                <div>
                  <span>看涨维度占比</span>
                  <strong>
                    {bullishCount}/{activeDimensions.length || 1}
                  </strong>
                </div>
                <div className="score-bar-track">
                  <div className="score-bar-fill is-bull" style={{ width: `${buyStrength * 100}%` }} />
                </div>
              </div>

              <div className="score-bar-item">
                <div>
                  <span>看跌维度占比</span>
                  <strong>
                    {bearishCount}/{activeDimensions.length || 1}
                  </strong>
                </div>
                <div className="score-bar-track">
                  <div className="score-bar-fill is-bear" style={{ width: `${sellStrength * 100}%` }} />
                </div>
              </div>

              <div className="score-bar-item">
                <div>
                  <span>中性维度占比</span>
                  <strong>
                    {neutralCount}/{activeDimensions.length || 1}
                  </strong>
                </div>
                <div className="score-bar-track">
                  <div
                    className="score-bar-fill is-neutral"
                    style={{ width: `${neutralStrength * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="signal-warning">⚠️ 风险提示：{displayMarket.riskNote}</p>
          </div>
        </section>

        <section className="panel weight-panel">
          <SectionHeader
            eyebrow="Weight Studio"
            title="自定义权重与开关"
            description="支持每个维度 1-10 权重调整，并可手动启用 / 关闭。"
          />

          <div className="weight-list">
            {dimensions.map((dimension) => (
              <article
                key={dimension.id}
                className={dimension.enabled ? "weight-item" : "weight-item weight-item-disabled"}
              >
                <div className="weight-item-header">
                  <button
                    type="button"
                    className={dimension.enabled ? "mini-toggle mini-toggle-on" : "mini-toggle"}
                    onClick={() => toggleDimension(dimension.id)}
                  >
                    {dimension.enabled ? "启用" : "关闭"}
                  </button>
                  <button
                    type="button"
                    className="weight-link"
                    onClick={() => setSelectedDimensionId(dimension.id)}
                  >
                    {dimension.name}
                  </button>
                  <span className="pill">{dimension.weight}</span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="10"
                  value={dimension.weight}
                  disabled={!dimension.enabled}
                  onChange={(event) => updateWeight(dimension.id, Number(event.target.value))}
                />

                <div className="weight-item-footer">
                  <span className="muted">{dimension.signal}</span>
                  <strong className={`score-mark score-${dimension.sentiment}`}>{formatScore(dimension.score)}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="content-grid two-columns overview-secondary-grid">
        <section className="panel chart-preview-panel">
          <SectionHeader
            eyebrow="Realtime Canvas"
            title={`${displayMarket.symbol} 实时价格与关键位`}
            description="用 SVG 同时承接价格预览与订单簿深度图，方便把走势和盘口支撑阻力一起看。"
          />

          <div className="chart-card chart-card-highlight">
            <OverviewPriceSparkline points={displayMarket.sparkline} />
            <div className="chart-summary-strip">
              <article className="chart-summary-tile">
                <span>区间低点</span>
                <strong>{formatPrice(sparklineRange.low)}</strong>
              </article>
              <article className="chart-summary-tile">
                <span>当前价格</span>
                <strong>{formatPrice(displayMarket.price)}</strong>
              </article>
              <article className="chart-summary-tile">
                <span>区间高点</span>
                <strong>{formatPrice(sparklineRange.high)}</strong>
              </article>
              <article className="chart-summary-tile">
                <span>波动区间</span>
                <strong>{volatilityRangePercent.toFixed(2)}%</strong>
              </article>
            </div>
          </div>

          <OverviewOrderBookDepthChart
            depth={displayMarket.orderBookDepth}
            currentPrice={displayMarket.price}
            formatPrice={formatPrice}
            formatCompactQuantity={formatCompactQuantity}
          />

          <div className="execution-map overview-level-grid">
            <article className="execution-step">
              <span>Support</span>
              <strong>{displayMarket.support}</strong>
              <p className="muted">回踩承接观察区，适合配合订单簿与量能判断。</p>
            </article>
            <article className="execution-step">
              <span>Resistance</span>
              <strong>{displayMarket.resistance}</strong>
              <p className="muted">若放量突破，综合信号有机会进一步抬升。</p>
            </article>
            <article className="execution-step">
              <span>Open Interest</span>
              <strong>{displayMarket.openInterest}</strong>
              <p className="muted">用于判断当前趋势是否有新增杠杆资金参与。</p>
            </article>
          </div>
        </section>

        <section className="panel radar-panel-section">
          <SectionHeader
            eyebrow="Radar Map"
            title="做多 / 做空分数雷达图"
            description="绿色代表做多支持，红色代表做空压力，一眼看出维度分布。"
          />

          <OverviewSignalRadar dimensions={dimensions} />

          <div className="radar-summary-strip">
            <article className="radar-summary-card">
              <span>最强做多维度</span>
              <strong>{radarSummary.strongestBull?.shortLabel ?? "暂无集中多头"}</strong>
              <p className="muted">
                {radarSummary.strongestBull
                  ? `${radarSummary.strongestBull.name} · ${formatScore(radarSummary.strongestBull.score)}`
                  : "当前没有显著领先的做多维度。"}
              </p>
            </article>
            <article className="radar-summary-card">
              <span>最强做空维度</span>
              <strong>{radarSummary.strongestBear?.shortLabel ?? "暂无集中空头"}</strong>
              <p className="muted">
                {radarSummary.strongestBear
                  ? `${radarSummary.strongestBear.name} · ${formatScore(radarSummary.strongestBear.score)}`
                  : "当前没有显著领先的做空维度。"}
              </p>
            </article>
            <article className="radar-summary-card">
              <span>启用维度</span>
              <strong>
                {radarSummary.enabledCount} / {radarSummary.totalCount}
              </strong>
              <p className="muted">关闭维度不会计入当前做多 / 做空雷达轮廓。</p>
            </article>
          </div>

          <div className="highlight-list">
            {displayMarket.reportHighlights.map((highlight) => (
              <article key={highlight} className="highlight-item">
                <span>核心观点</span>
                <p>{highlight}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel dimension-matrix-panel">
        <SectionHeader
          eyebrow="Dimension Matrix"
          title="十大分析维度卡片"
          description="点击卡片即可查看当前子指标原始值与解释，模拟 PRD 中的详情弹出逻辑。"
        />

        <div className="dimension-grid">
          {dimensions.map((dimension) => (
            <button
              key={dimension.id}
              type="button"
              className={
                dimension.id === selectedDimension.id
                  ? `dimension-card dimension-card-active sentiment-${dimension.sentiment}`
                  : `dimension-card sentiment-${dimension.sentiment}`
              }
              onClick={() => setSelectedDimensionId(dimension.id)}
            >
              <div className="dimension-card-head">
                <span>{dimension.shortLabel}</span>
                <strong>{dimension.name}</strong>
              </div>
              <div className="dimension-card-meta">
                <b className={`score-mark score-${dimension.sentiment}`}>{formatScore(dimension.score)}</b>
                <span className="pill">{dimension.enabled ? `权重 ${dimension.weight}` : "已关闭"}</span>
              </div>
              <p>{dimension.summary}</p>
              <small>{dimension.signal}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="content-grid two-columns overview-action-grid">
        <section className="panel drilldown-panel">
          <SectionHeader
            eyebrow="Drilldown"
            title={`${selectedDimension.name} 详细计算`}
            description={`${sentimentLabelMap[selectedDimension.sentiment]} · ${selectedDimension.signal}`}
          />

          <div className="metric-grid">
            {selectedDimension.details.map((detail) => (
              <article key={detail.label} className="metric-card">
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
                <p>{detail.insight}</p>
              </article>
            ))}
          </div>

          <div className="detail-note-box">
            <p>{selectedDimension.summary}</p>
            <small>{selectedDimension.note}</small>
          </div>
        </section>

        <section className="panel action-panel">
          <SectionHeader
            eyebrow="Action Bar"
            title="复制报告、导出 PDF、设置提醒"
            description="动作层基于浏览器能力实现，并将提醒配置持久化到 IndexedDB。"
          />

          <div className="action-button-row">
            <button type="button" className="action-button action-button-primary" onClick={handleCopySignal}>
              复制信号到剪贴板
            </button>
            <button type="button" className="action-button" onClick={handleExportReport}>
              导出分析报告 PDF
            </button>
            <button type="button" className="action-button" onClick={handleSetAlert}>
              设置价格提醒
            </button>
          </div>

          <div className="alert-form-grid">
            <label>
              提醒价格
              <input
                type="number"
                min="0"
                value={alertPrice}
                onChange={(event) => {
                  setAlertPrice(event.target.value);
                  setIsAlertFormDirty(true);
                }}
              />
            </label>
            <label>
              触发方向
              <select
                value={alertDirection}
                onChange={(event) => {
                  setAlertDirection(event.target.value as AlertDirection);
                  setIsAlertFormDirty(true);
                }}
              >
                <option value="above">价格上破</option>
                <option value="below">价格跌破</option>
              </select>
            </label>
          </div>

          {activeAlertRules.length > 0 ? (
            <div className="alert-chip-banner">
              当前共有 {activeAlertRules.length} 条监控中的价格提醒
            </div>
          ) : null}

          <div className="alert-rule-list">
            {alertRules.length > 0 ? (
              alertRules.map((rule) => (
                <article key={rule.id} className="alert-rule-item">
                  <div>
                    <strong>
                      {rule.direction === "above" ? "上破" : "跌破"} {formatPrice(Number(rule.price))}
                    </strong>
                    <p className="muted">
                      {rule.armed ? "监控中" : "已触发/已停用"} · 更新时间 {formatAlertTime(rule.updatedAt)}
                    </p>
                  </div>
                  <button type="button" className="action-button action-button-ghost" onClick={() => handleRemoveAlertRule(rule.id)}>
                    删除
                  </button>
                </article>
              ))
            ) : (
              <p className="muted">当前币种还没有本地提醒规则，添加后会持久化到 IndexedDB。</p>
            )}
          </div>

          <div className="alert-log-list">
            <div className="alert-log-header">
              <div>
                <h5>最近触发日志</h5>
                <p className="muted">未读 {unreadAlertCount} 条</p>
              </div>
              <div className="alert-log-actions">
                <button
                  type="button"
                  className="action-button action-button-ghost"
                  onClick={handleMarkAllAlertEventsRead}
                  disabled={unreadAlertCount === 0}
                >
                  全部已读
                </button>
                <button
                  type="button"
                  className="action-button action-button-ghost"
                  onClick={handleClearReadAlertEvents}
                  disabled={readAlertCount === 0}
                >
                  仅清空已读
                </button>
                <button
                  type="button"
                  className="action-button action-button-ghost"
                  onClick={handleClearAlertEvents}
                  disabled={alertEvents.length === 0}
                >
                  清空日志
                </button>
              </div>
            </div>
            {alertEvents.length > 0 ? (
              alertEvents.map((event) => (
                <article
                  key={event.id}
                  className={event.readAt ? "alert-log-item" : "alert-log-item alert-log-item-unread"}
                >
                  <div>
                    <div className="alert-log-title-row">
                      <strong>
                        {event.direction === "above" ? "上破" : "跌破"} {formatPrice(Number(event.price))}
                      </strong>
                      <span
                        className={
                          event.readAt
                            ? "alert-log-badge"
                            : "alert-log-badge alert-log-badge-unread"
                        }
                      >
                        {event.readAt ? "已读" : "未读"}
                      </span>
                    </div>
                    <p className="muted">
                      命中价 {formatPrice(event.triggeredPrice)} · {formatAlertTime(event.triggeredAt)}
                      {event.readAt ? ` · 已读于 ${formatAlertTime(event.readAt)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="action-button action-button-ghost"
                    onClick={() => handleMarkAlertEventRead(event.id)}
                    disabled={Boolean(event.readAt)}
                  >
                    {event.readAt ? "已读" : "标记已读"}
                  </button>
                </article>
              ))
            ) : (
              <p className="muted">提醒触发后会在这里保留最近日志。</p>
            )}
          </div>

          <p className="action-feedback">{actionFeedback}</p>
          <pre className="report-preview">{reportText}</pre>
        </section>
      </div>

      <section className="panel context-panel">
        <SectionHeader
          eyebrow="Context Studio"
          title="链上 / 宏观手动填充"
          description="按 CR_1.MD 的 P2 方案补齐用户填充能力：留空时保留当前结果或中性基线，填写后即时修正链上与宏观维度。"
        />

        <div className="context-grid">
          <article className="context-card">
            <div className="context-card-header">
              <div>
                <h4>链上数据维度</h4>
                <p className="muted">适合手动录入交易所储备、长线持仓与活跃地址变化。</p>
              </div>
              <div className="context-impact">
                <b className={`score-mark score-${onChainDimension.sentiment}`}>
                  {formatScore(onChainDimension.score)}
                </b>
                <span className="pill">{onChainDimension.signal}</span>
              </div>
            </div>

            <div className="context-form-grid">
              <label>
                交易所储备变化 (%)
                <input
                  type="number"
                  step="0.1"
                  placeholder="-1.2"
                  value={manualContextInputs.exchangeReserveChange}
                  onChange={(event) =>
                    handleManualContextInputChange("exchangeReserveChange", event.target.value)
                  }
                />
              </label>
              <label>
                长线持有变化 (%)
                <input
                  type="number"
                  step="0.1"
                  placeholder="+0.8"
                  value={manualContextInputs.longTermHolderChange}
                  onChange={(event) =>
                    handleManualContextInputChange("longTermHolderChange", event.target.value)
                  }
                />
              </label>
              <label>
                活跃地址变化 (%)
                <input
                  type="number"
                  step="0.1"
                  placeholder="+4.6"
                  value={manualContextInputs.activeAddressChange}
                  onChange={(event) =>
                    handleManualContextInputChange("activeAddressChange", event.target.value)
                  }
                />
              </label>
            </div>

            <p className="context-card-note">{onChainDimension.summary}</p>
          </article>

          <article className="context-card">
            <div className="context-card-header">
              <div>
                <h4>宏观关联维度</h4>
                <p className="muted">适合补充 DXY、股指期货和恐惧贪婪指数等外部参考。</p>
              </div>
              <div className="context-impact">
                <b className={`score-mark score-${macroDimension.sentiment}`}>
                  {formatScore(macroDimension.score)}
                </b>
                <span className="pill">{macroDimension.signal}</span>
              </div>
            </div>

            <div className="context-form-grid">
              <label>
                DXY 当日变化 (%)
                <input
                  type="number"
                  step="0.1"
                  placeholder="-0.4"
                  value={manualContextInputs.dxyChange}
                  onChange={(event) => handleManualContextInputChange("dxyChange", event.target.value)}
                />
              </label>
              <label>
                股指期货变化 (%)
                <input
                  type="number"
                  step="0.1"
                  placeholder="+0.5"
                  value={manualContextInputs.equityFuturesChange}
                  onChange={(event) =>
                    handleManualContextInputChange("equityFuturesChange", event.target.value)
                  }
                />
              </label>
              <label>
                恐惧贪婪指数
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="32"
                  value={manualContextInputs.fearGreedIndex}
                  onChange={(event) =>
                    handleManualContextInputChange("fearGreedIndex", event.target.value)
                  }
                />
              </label>
            </div>

            <p className="context-card-note">{macroDimension.summary}</p>
          </article>
        </div>

        <div className="context-toolbar">
          <div className="context-toolbar-meta">
            <span className="pill">已填写 {filledManualContextCount} / 6 项</span>
            <span className="muted">
              {manualContextUpdatedAt
                ? `上次保存：${formatAlertTime(manualContextUpdatedAt)}`
                : "当前尚未保存到本地"}
            </span>
          </div>

          <div className="action-button-row">
            <button
              type="button"
              className="action-button action-button-primary"
              onClick={handleSaveManualContext}
            >
              保存到 IndexedDB
            </button>
            <button
              type="button"
              className="action-button action-button-ghost"
              onClick={handleResetManualContext}
            >
              清空填充
            </button>
          </div>
        </div>

        <p className="action-feedback">{contextFeedback}</p>
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Backtest Log"
          title="信号历史与回溯胜率"
          description="优先展示 IndexedDB 中的信号历史；同时并排展示市场涨跌与策略盈亏，便于识别做空信号表现。"
        />

        <div className="stats-grid history-stats-grid">
          <StatCard
            label="筛选后样本"
            value={`${historyStats.total}`}
            detail={`正确 ${historyStats.correctCount} / 失误 ${historyStats.incorrectCount}`}
            trend="neutral"
          />
          <StatCard
            label="已结算"
            value={`${historyStats.resolved}`}
            detail={`待结算 ${Math.max(historyStats.total - historyStats.resolved, 0)}`}
            trend={historyStats.resolved > 0 ? "up" : "neutral"}
          />
          <StatCard
            label="命中率"
            value={`${historyStats.winRate}%`}
            detail="按已结算记录统计"
            trend={historyStats.winRate >= 50 ? "up" : "down"}
          />
          <StatCard
            label="平均市场涨跌"
            value={`${historyStats.avgMarketPnl >= 0 ? "+" : ""}${historyStats.avgMarketPnl.toFixed(2)}%`}
            detail="按已结算市场涨跌均值"
            trend={historyStats.avgMarketPnl >= 0 ? "up" : "down"}
          />
          <StatCard
            label="平均策略收益"
            value={`${historyStats.avgPnl >= 0 ? "+" : ""}${historyStats.avgPnl.toFixed(2)}%`}
            detail="按已结算策略收益均值"
            trend={historyStats.avgPnl >= 0 ? "up" : "down"}
          />
        </div>

        <div className="history-filter-row">
          <div className="alert-form-grid history-filter-grid">
            <label>
              统计范围
              <select
                value={historySymbolScope}
                onChange={(event) => setHistorySymbolScope(event.target.value as HistorySymbolScope)}
              >
                <option value="active">当前币种</option>
                <option value="all">全部币种</option>
              </select>
            </label>
            <label>
              时间范围
              <select
                value={historyTimeRange}
                onChange={(event) => setHistoryTimeRange(event.target.value as HistoryTimeRange)}
              >
                <option value="24h">最近 24 小时</option>
                <option value="7d">最近 7 天</option>
                <option value="all">全部记录</option>
              </select>
            </label>
            <label>
              信号方向
              <select
                value={historySignalFilter}
                onChange={(event) => setHistorySignalFilter(event.target.value as HistorySignalFilter)}
              >
                <option value="all">全部</option>
                <option value="bullish">买入类</option>
                <option value="bearish">卖出类</option>
                <option value="neutral">中性类</option>
              </select>
            </label>
            <label>
              回溯状态
              <select
                value={historyOutcomeFilter}
                onChange={(event) => setHistoryOutcomeFilter(event.target.value as HistoryOutcomeFilter)}
              >
                <option value="all">全部</option>
                <option value="resolved">仅已结算</option>
                <option value="pending">仅待结算</option>
                <option value="correct">仅命中</option>
                <option value="incorrect">仅失误</option>
              </select>
            </label>
            <label>
              置信度区间
              <select
                value={historyConfidenceFilter}
                onChange={(event) =>
                  setHistoryConfidenceFilter(event.target.value as HistoryConfidenceFilter)
                }
              >
                <option value="all">全部</option>
                <option value="high">高置信度 (≥70%)</option>
                <option value="medium">中置信度 (40-69%)</option>
                <option value="low">低置信度 (&lt;40%)</option>
              </select>
            </label>
            <label>
              市场涨跌区间
              <select
                value={historyMarketPnlFilter}
                onChange={(event) =>
                  setHistoryMarketPnlFilter(event.target.value as HistoryMarketPnlFilter)
                }
              >
                <option value="all">全部</option>
                <option value="gt2">≥ +2%</option>
                <option value="0to2">0% ~ +2%</option>
                <option value="neg2to0">-2% ~ 0%</option>
                <option value="ltNeg2">&lt; -2%</option>
              </select>
            </label>
            <label>
              策略盈亏区间
              <select
                value={historyPnlFilter}
                onChange={(event) => setHistoryPnlFilter(event.target.value as HistoryPnlFilter)}
              >
                <option value="all">全部</option>
                <option value="gt2">≥ +2%</option>
                <option value="0to2">0% ~ +2%</option>
                <option value="neg2to0">-2% ~ 0%</option>
                <option value="ltNeg2">&lt; -2%</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="action-button action-button-ghost"
            onClick={() => {
              setHistorySymbolScope("active");
              setHistoryTimeRange("all");
              setHistorySignalFilter("all");
              setHistoryOutcomeFilter("all");
              setHistoryConfidenceFilter("all");
              setHistoryMarketPnlFilter("all");
              setHistoryPnlFilter("all");
            }}
          >
            重置筛选
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>币种</th>
                <th>综合信号</th>
                <th>触发时价格</th>
                <th>1H 后价格</th>
                <th>市场涨跌</th>
                <th>策略盈亏</th>
                <th>是否正确</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((item) => {
                const signalTone = getHistorySignalTone(item);
                const outcome = getHistoryOutcome(item);
                const marketPnlValue = getHistoryMarketPnlValue(item);
                const strategyPnlValue = getHistoryPnlValue(item);

                return (
                  <tr key={item.id ?? `${item.time}-${item.signal}-${item.triggerPrice}`}>
                    <td>{item.time}</td>
                    <td>{item.symbol}</td>
                    <td className={getSignalToneTextClass(signalTone)}>{item.signal}</td>
                    <td>{item.triggerPrice}</td>
                    <td>{item.after1hPrice}</td>
                    <td className={getSignedTrendTextClass(marketPnlValue)}>{getHistoryMarketPnl(item)}</td>
                    <td className={getSignedTrendTextClass(strategyPnlValue)}>{item.pnl}</td>
                    <td className={getHistoryOutcomeTextClass(outcome)}>{item.accuracy}</td>
                  </tr>
                );
              })}
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="history-empty-cell">
                    当前还没有可用的真实历史记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section
        ref={strategyRouterRef}
        tabIndex={-1}
        className={`panel strategy-router-panel${isStrategyRouterHighlighted ? " strategy-router-panel-highlighted" : ""}`}
      >
        <SectionHeader
          eyebrow="Strategy Router"
          title="底部策略判断区"
          description="把综合偏向、盘口失衡、波动和样本表现压成一个执行结论：此刻更适合用哪种策略。"
        />

        <div className={`strategy-router-hero strategy-router-${leadStrategy.tone}`}>
          <div>
            <p className="eyebrow">Lead Verdict</p>
            <h4>{leadStrategyReady ? leadStrategy.title : "先观望，等待结构更清晰"}</h4>
            <p className="strategy-router-copy">
              {leadStrategyReady
                ? leadStrategy.summary
                : "三类策略当前都没有拉开明显优势，适合先盯信号盘、盘口与大单，再决定是否启动执行页。"}
            </p>
          </div>

          <div className="strategy-router-score-card">
            <span>匹配度</span>
            <strong>{leadStrategy.score}</strong>
            <small>{leadStrategy.tag}</small>
          </div>
        </div>

        <div className="strategy-router-metrics">
          <span className="pill">
            综合偏向 {compositeBias >= 0 ? `多头 ${compositeBias}` : `空头 ${Math.abs(compositeBias)}`}
          </span>
          <span className="pill">置信度 {confidence}%</span>
          <span className="pill">盘口失衡 {(orderBookImbalance * 100).toFixed(1)}%</span>
          <span className="pill">区间波动 {volatilityRangePercent.toFixed(2)}%</span>
          <span className="pill">历史命中率 {historyStats.winRate}%</span>
        </div>

        <div className="strategy-router-grid">
          {strategyPlaybooks.map((item) => (
            <article key={item.id} className={`strategy-playbook-card strategy-playbook-${item.tone}`}>
              <div className="strategy-playbook-head">
                <div>
                  <span>{item.title}</span>
                  <strong>{item.tag}</strong>
                </div>
                <b>{item.score}</b>
              </div>
              <p className="strategy-playbook-summary">{item.summary}</p>
              <div className="strategy-playbook-meta">
                <div>
                  <span>执行动作</span>
                  <strong>{item.setup}</strong>
                </div>
                <div>
                  <span>风险边界</span>
                  <strong>{item.caution}</strong>
                </div>
              </div>
              <Link
                to={item.search ? { pathname: item.to, search: item.search } : item.to}
                className="action-button action-button-ghost strategy-playbook-link"
              >
                {item.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
