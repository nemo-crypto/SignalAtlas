import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GridRangeChart } from "../components/charts/GridRangeChart";
import { SectionHeader } from "../components/SectionHeader";
import { StatCard } from "../components/StatCard";
import { useBinanceGridMarket } from "../hooks/useBinanceGridMarket";
import {
  gridBestPractices,
  gridChecklist,
  gridMethodCards,
  gridPresets,
  type GridPreset,
  type GridSymbol
} from "../data/gridStrategyData";
import { loadGridSnapshot, saveGridSnapshot } from "../services/persistence";

type GridTone = "bullish" | "bearish" | "neutral";
type RangeState = "inside" | "below" | "above";

type GridConfig = {
  symbol: GridSymbol;
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  investPerGrid: number;
  feeRateBps: number;
  slippageBps: number;
  autoStopEnabled: boolean;
  breakoutBufferSteps: number;
};

type GridExecution = {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  timestamp: number;
  grossPnl?: number;
  netPnl?: number;
  fees: number;
  slippage: number;
  turnover: number;
  source: "live" | "simulated";
  summary: string;
};

type GridRuntime = {
  currentPrice: number;
  previousPrice: number;
  priceTrail: number[];
  openSlots: number[];
  buyCount: number;
  sellCount: number;
  completedCycles: number;
  winCount: number;
  lossCount: number;
  grossRealizedPnl: number;
  realizedPnl: number;
  floatingPnl: number;
  totalFees: number;
  totalSlippage: number;
  turnover: number;
  history: GridExecution[];
  lastSignal: string;
  lastSignalTone: GridTone;
  lastTickAt: number;
  rangeState: RangeState;
  stopReason: string | null;
  stoppedAt: number | null;
};

type PersistedSnapshot = {
  config: GridConfig;
  runtime: GridRuntime;
  selectedPresetSymbol: GridSymbol;
  savedAt: number;
};

type GridRouteSeed = {
  signature: string;
  presetSymbol: GridSymbol;
  config: Partial<GridConfig>;
  runtimePrice: number | null;
  note: string | null;
};

const LEGACY_STORAGE_KEY = "cryptoquant:grid-strategy:v1";
const GRID_SNAPSHOT_ID = "primary";
const PRICE_PRECISION: Record<GridSymbol, number> = {
  BTCUSDT: 2,
  ETHUSDT: 2,
  BNBUSDT: 3
};
const DEFAULT_FEE_RATE_BPS = 8;
const DEFAULT_SLIPPAGE_BPS = 3;
const DEFAULT_BREAKOUT_BUFFER_STEPS = 1;
const gridSymbolSet = new Set<GridSymbol>(gridPresets.map((preset) => preset.symbol));

function getPreset(symbol: GridSymbol): GridPreset {
  return gridPresets.find((preset) => preset.symbol === symbol) ?? gridPresets[0];
}

function createConfigFromPreset(preset: GridPreset): GridConfig {
  return {
    symbol: preset.symbol,
    lowerPrice: preset.lowerPrice,
    upperPrice: preset.upperPrice,
    gridCount: preset.gridCount,
    investPerGrid: preset.investPerGrid,
    feeRateBps: DEFAULT_FEE_RATE_BPS,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
    autoStopEnabled: true,
    breakoutBufferSteps: DEFAULT_BREAKOUT_BUFFER_STEPS
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function fixPrecision(value: number, symbol: GridSymbol): number {
  return Number(value.toFixed(PRICE_PRECISION[symbol]));
}

function calculateGridSpacing(config: GridConfig): number {
  const rawSpacing = (config.upperPrice - config.lowerPrice) / config.gridCount;
  return fixPrecision(rawSpacing, config.symbol);
}

function buildGridLevels(config: GridConfig): number[] {
  const spacing = calculateGridSpacing(config);
  return Array.from({ length: config.gridCount + 1 }, (_, index) => {
    if (index === config.gridCount) {
      return fixPrecision(config.upperPrice, config.symbol);
    }

    return fixPrecision(config.lowerPrice + spacing * index, config.symbol);
  });
}

function formatPrice(value: number, symbol: GridSymbol): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }

  const digits = symbol === "BTCUSDT" ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatUsd(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatCompactUsd(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }

  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }

  return `$${value.toFixed(0)}`;
}

function formatSignedExactUsd(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatUsd(Math.abs(value))}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getSignedTrendTextClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "trend-text-neutral";
  }

  return value >= 0 ? "trend-text-up trend-text-emphasis" : "trend-text-down trend-text-emphasis";
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour12: false
  });
}

function hasUsableGridPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function createInitialRuntime(_preset: GridPreset): GridRuntime {
  return {
    currentPrice: 0,
    previousPrice: 0,
    priceTrail: [],
    openSlots: [],
    buyCount: 0,
    sellCount: 0,
    completedCycles: 0,
    winCount: 0,
    lossCount: 0,
    grossRealizedPnl: 0,
    realizedPnl: 0,
    floatingPnl: 0,
    totalFees: 0,
    totalSlippage: 0,
    turnover: 0,
    history: [],
    lastSignal: "等待 Binance 真实价格接入后再启动纸交易引擎",
    lastSignalTone: "neutral",
    lastTickAt: Date.now(),
    rangeState: "inside",
    stopReason: null,
    stoppedAt: null
  };
}

function loadLegacySnapshot(): PersistedSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedSnapshot;
  } catch {
    return null;
  }
}

function isGridSymbolValue(value: string | null): value is GridSymbol {
  return value !== null && gridSymbolSet.has(value as GridSymbol);
}

function parseGridRouteSeed(search: string): GridRouteSeed | null {
  const params = new URLSearchParams(search);
  if (params.get("source") !== "strategy-router") {
    return null;
  }

  const symbolParam = params.get("symbol");
  if (!isGridSymbolValue(symbolParam)) {
    return null;
  }

  const lowerPriceParam = Number(params.get("lowerPrice"));
  const upperPriceParam = Number(params.get("upperPrice"));
  const gridCountParam = Number(params.get("gridCount"));
  const investPerGridParam = Number(params.get("investPerGrid"));
  const currentPriceParam = Number(params.get("currentPrice"));

  return {
    signature: search,
    presetSymbol: symbolParam,
    config: {
      symbol: symbolParam,
      lowerPrice: Number.isFinite(lowerPriceParam) && lowerPriceParam > 0 ? lowerPriceParam : undefined,
      upperPrice: Number.isFinite(upperPriceParam) && upperPriceParam > 0 ? upperPriceParam : undefined,
      gridCount: Number.isFinite(gridCountParam) && gridCountParam >= 5 ? gridCountParam : undefined,
      investPerGrid:
        Number.isFinite(investPerGridParam) && investPerGridParam > 0 ? investPerGridParam : undefined
    },
    runtimePrice: Number.isFinite(currentPriceParam) && currentPriceParam > 0 ? currentPriceParam : null,
    note: params.get("note")
  };
}

function normalizeConfig(snapshotConfig: Partial<GridConfig> | undefined, preset: GridPreset): GridConfig {
  const baseConfig = createConfigFromPreset(preset);
  if (!snapshotConfig) {
    return baseConfig;
  }

  return {
    symbol: snapshotConfig.symbol ?? baseConfig.symbol,
    lowerPrice: isFiniteNumber(snapshotConfig.lowerPrice) ? snapshotConfig.lowerPrice : baseConfig.lowerPrice,
    upperPrice: isFiniteNumber(snapshotConfig.upperPrice) ? snapshotConfig.upperPrice : baseConfig.upperPrice,
    gridCount: isFiniteNumber(snapshotConfig.gridCount) ? snapshotConfig.gridCount : baseConfig.gridCount,
    investPerGrid: isFiniteNumber(snapshotConfig.investPerGrid)
      ? snapshotConfig.investPerGrid
      : baseConfig.investPerGrid,
    feeRateBps: isFiniteNumber(snapshotConfig.feeRateBps)
      ? snapshotConfig.feeRateBps
      : baseConfig.feeRateBps,
    slippageBps: isFiniteNumber(snapshotConfig.slippageBps)
      ? snapshotConfig.slippageBps
      : baseConfig.slippageBps,
    autoStopEnabled:
      typeof snapshotConfig.autoStopEnabled === "boolean"
        ? snapshotConfig.autoStopEnabled
        : baseConfig.autoStopEnabled,
    breakoutBufferSteps: isFiniteNumber(snapshotConfig.breakoutBufferSteps)
      ? snapshotConfig.breakoutBufferSteps
      : baseConfig.breakoutBufferSteps
  };
}

function isStoredLiveExecution(value: unknown): value is GridExecution {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GridExecution>;

  return (
    (candidate.side === "BUY" || candidate.side === "SELL") &&
    candidate.source === "live" &&
    isFiniteNumber(candidate.price) &&
    candidate.price > 0 &&
    isFiniteNumber(candidate.quantity) &&
    candidate.quantity > 0 &&
    isFiniteNumber(candidate.timestamp) &&
    typeof candidate.id === "string" &&
    typeof candidate.summary === "string" &&
    isFiniteNumber(candidate.fees) &&
    isFiniteNumber(candidate.slippage) &&
    isFiniteNumber(candidate.turnover)
  );
}

function normalizeLiveExecutionHistory(history: unknown): GridExecution[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history.filter(isStoredLiveExecution).sort((left, right) => right.timestamp - left.timestamp);
}

function findClosestSlotIndex(levels: number[], price: number, side: GridExecution["side"]): number | null {
  let bestSlotIndex = -1;
  let bestDiff = Number.POSITIVE_INFINITY;

  if (side === "BUY") {
    for (let index = 0; index < levels.length - 1; index += 1) {
      const diff = Math.abs(levels[index] - price);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSlotIndex = index;
      }
    }
  } else {
    for (let index = 1; index < levels.length; index += 1) {
      const diff = Math.abs(levels[index] - price);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSlotIndex = index - 1;
      }
    }
  }

  return bestSlotIndex >= 0 ? bestSlotIndex : null;
}

function rebuildTradeStateFromHistory(config: GridConfig, history: GridExecution[]) {
  const levels = buildGridLevels(config);
  const openSlots = new Set<number>();
  let buyCount = 0;
  let sellCount = 0;
  let completedCycles = 0;
  let winCount = 0;
  let lossCount = 0;
  let grossRealizedPnl = 0;
  let realizedPnl = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  let turnover = 0;

  [...history]
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((item) => {
      totalFees = Number((totalFees + item.fees).toFixed(2));
      totalSlippage = Number((totalSlippage + item.slippage).toFixed(2));
      turnover = Number((turnover + item.turnover).toFixed(2));

      if (item.side === "BUY") {
        buyCount += 1;
        const slotIndex = findClosestSlotIndex(levels, item.price, "BUY");
        if (slotIndex != null) {
          openSlots.add(slotIndex);
        }
        return;
      }

      sellCount += 1;
      completedCycles += 1;
      grossRealizedPnl = Number((grossRealizedPnl + (item.grossPnl ?? 0)).toFixed(2));
      realizedPnl = Number((realizedPnl + (item.netPnl ?? 0)).toFixed(2));

      if ((item.netPnl ?? 0) >= 0) {
        winCount += 1;
      } else {
        lossCount += 1;
      }

      const slotIndex = findClosestSlotIndex(levels, item.price, "SELL");
      if (slotIndex != null) {
        openSlots.delete(slotIndex);
      } else if (openSlots.size > 0) {
        const [firstOpenSlot] = [...openSlots].sort((left, right) => left - right);
        if (typeof firstOpenSlot === "number") {
          openSlots.delete(firstOpenSlot);
        }
      }
    });

  return {
    openSlots: [...openSlots].sort((left, right) => left - right),
    buyCount,
    sellCount,
    completedCycles,
    winCount,
    lossCount,
    grossRealizedPnl,
    realizedPnl,
    floatingPnl: 0,
    totalFees,
    totalSlippage,
    turnover
  };
}

function normalizeRuntime(
  snapshotRuntime: Partial<GridRuntime> | undefined,
  config: GridConfig,
  preset: GridPreset
): GridRuntime {
  const baseRuntime = createInitialRuntime(preset);
  if (!snapshotRuntime) {
    return baseRuntime;
  }

  const liveHistory = normalizeLiveExecutionHistory(snapshotRuntime.history);
  const originalHistoryLength = Array.isArray(snapshotRuntime.history) ? snapshotRuntime.history.length : 0;
  const lastSignal = typeof snapshotRuntime.lastSignal === "string" ? snapshotRuntime.lastSignal : "";
  const hadSimulatedHistory = originalHistoryLength > liveHistory.length;
  const hasLegacySimulationMarker =
    lastSignal.includes("模拟") || lastSignal.includes("降级") || lastSignal.includes("本地");
  const hasLegacyIdlePlaceholder =
    liveHistory.length === 0 &&
    hasUsableGridPrice(snapshotRuntime.currentPrice ?? 0) &&
    (lastSignal === "等待启动纸交易引擎" || lastSignal.includes("点击启动后开始模拟纸交易"));
  const shouldMigrateLegacyRuntime =
    hadSimulatedHistory || hasLegacySimulationMarker || hasLegacyIdlePlaceholder;

  if (shouldMigrateLegacyRuntime) {
    const rebuiltState = rebuildTradeStateFromHistory(config, liveHistory);
    const migrationNote =
      liveHistory.length > 0
        ? "检测到旧版模拟快照，已清空伪造价格轨迹，仅保留真实成交记录。"
        : "检测到旧版占位价格/模拟快照，已清空伪造成交与价格轨迹，请等待 Binance 实时价格恢复。";

    return {
      ...baseRuntime,
      ...rebuiltState,
      history: liveHistory.slice(0, 12),
      lastSignal: migrationNote,
      lastSignalTone: "neutral",
      lastTickAt: Date.now(),
      rangeState: "inside"
    };
  }

  return {
    ...baseRuntime,
    ...snapshotRuntime,
    currentPrice: isFiniteNumber(snapshotRuntime.currentPrice) && snapshotRuntime.currentPrice > 0
      ? snapshotRuntime.currentPrice
      : baseRuntime.currentPrice,
    previousPrice: isFiniteNumber(snapshotRuntime.previousPrice) && snapshotRuntime.previousPrice > 0
      ? snapshotRuntime.previousPrice
      : baseRuntime.previousPrice,
    priceTrail:
      Array.isArray(snapshotRuntime.priceTrail) && snapshotRuntime.priceTrail.length > 0
        ? snapshotRuntime.priceTrail.filter((value) => isFiniteNumber(value) && value > 0)
        : baseRuntime.priceTrail,
    openSlots:
      Array.isArray(snapshotRuntime.openSlots) && snapshotRuntime.openSlots.length > 0
        ? snapshotRuntime.openSlots.filter(isFiniteNumber)
        : [],
    buyCount: isFiniteNumber(snapshotRuntime.buyCount) ? snapshotRuntime.buyCount : 0,
    sellCount: isFiniteNumber(snapshotRuntime.sellCount) ? snapshotRuntime.sellCount : 0,
    completedCycles: isFiniteNumber(snapshotRuntime.completedCycles) ? snapshotRuntime.completedCycles : 0,
    winCount: isFiniteNumber(snapshotRuntime.winCount) ? snapshotRuntime.winCount : 0,
    lossCount: isFiniteNumber(snapshotRuntime.lossCount) ? snapshotRuntime.lossCount : 0,
    grossRealizedPnl: isFiniteNumber(snapshotRuntime.grossRealizedPnl)
      ? snapshotRuntime.grossRealizedPnl
      : 0,
    realizedPnl: isFiniteNumber(snapshotRuntime.realizedPnl) ? snapshotRuntime.realizedPnl : 0,
    floatingPnl: isFiniteNumber(snapshotRuntime.floatingPnl) ? snapshotRuntime.floatingPnl : 0,
    totalFees: isFiniteNumber(snapshotRuntime.totalFees) ? snapshotRuntime.totalFees : 0,
    totalSlippage: isFiniteNumber(snapshotRuntime.totalSlippage) ? snapshotRuntime.totalSlippage : 0,
    turnover: isFiniteNumber(snapshotRuntime.turnover) ? snapshotRuntime.turnover : 0,
    history: liveHistory.slice(0, 12),
    lastSignal: typeof snapshotRuntime.lastSignal === "string" ? snapshotRuntime.lastSignal : baseRuntime.lastSignal,
    lastSignalTone:
      snapshotRuntime.lastSignalTone === "bullish" ||
      snapshotRuntime.lastSignalTone === "bearish" ||
      snapshotRuntime.lastSignalTone === "neutral"
        ? snapshotRuntime.lastSignalTone
        : baseRuntime.lastSignalTone,
    lastTickAt: isFiniteNumber(snapshotRuntime.lastTickAt) ? snapshotRuntime.lastTickAt : Date.now(),
    rangeState:
      snapshotRuntime.rangeState === "inside" ||
      snapshotRuntime.rangeState === "below" ||
      snapshotRuntime.rangeState === "above"
        ? snapshotRuntime.rangeState
        : baseRuntime.rangeState,
    stopReason: typeof snapshotRuntime.stopReason === "string" ? snapshotRuntime.stopReason : null,
    stoppedAt: isFiniteNumber(snapshotRuntime.stoppedAt) ? snapshotRuntime.stoppedAt : null
  };
}

function buildRuntimeFromRouteSeed(routeSeed: GridRouteSeed, preset: GridPreset): GridRuntime {
  const routeConfig = normalizeConfig(routeSeed.config, preset);
  const runtimePrice = fixPrecision(
    routeSeed.runtimePrice ?? 0,
    routeSeed.presetSymbol
  );
  const priceTrail = runtimePrice > 0 ? [runtimePrice] : [];
  const rangeState: RangeState =
    runtimePrice > 0 && runtimePrice < routeConfig.lowerPrice
      ? "below"
      : runtimePrice > routeConfig.upperPrice
        ? "above"
        : "inside";

  return normalizeRuntime(
    {
      currentPrice: runtimePrice,
      previousPrice: runtimePrice,
      priceTrail,
      openSlots: [],
      history: [],
      buyCount: 0,
      sellCount: 0,
      completedCycles: 0,
      winCount: 0,
      lossCount: 0,
      grossRealizedPnl: 0,
      realizedPnl: 0,
      floatingPnl: 0,
      totalFees: 0,
      totalSlippage: 0,
      turnover: 0,
      lastSignal: routeSeed.note ?? "已从综合信号盘带入推荐网格区间。",
      lastSignalTone: "neutral",
      lastTickAt: Date.now(),
      rangeState,
      stopReason: null,
      stoppedAt: null
    },
    routeConfig,
    preset
  );
}

function createRuntimeFromKnownPrice(preset: GridPreset, currentPrice: number): GridRuntime {
  const baseRuntime = createInitialRuntime(preset);

  if (!hasUsableGridPrice(currentPrice)) {
    return baseRuntime;
  }

  const nextPrice = fixPrecision(currentPrice, preset.symbol);

  return {
    ...baseRuntime,
    currentPrice: nextPrice,
    previousPrice: nextPrice,
    priceTrail: [nextPrice],
    lastSignal: "已加载最近一次真实价格，可在实时流保持在线时启动纸交易。",
    rangeState:
      nextPrice < preset.lowerPrice
        ? "below"
        : nextPrice > preset.upperPrice
          ? "above"
          : "inside"
  };
}

function createExecutionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function calculateQuantity(investPerGrid: number, buyPrice: number): number {
  return Number((investPerGrid / buyPrice).toFixed(6));
}

function calculateCostComponents(notional: number, config: GridConfig) {
  return {
    fees: Number(((notional * config.feeRateBps) / 10000).toFixed(2)),
    slippage: Number(((notional * config.slippageBps) / 10000).toFixed(2))
  };
}

function calculateAutoStopBounds(config: GridConfig) {
  const spacing = calculateGridSpacing(config);
  return {
    lowerStop: fixPrecision(
      config.lowerPrice - spacing * Math.max(config.breakoutBufferSteps, 1),
      config.symbol
    ),
    upperStop: fixPrecision(
      config.upperPrice + spacing * Math.max(config.breakoutBufferSteps, 1),
      config.symbol
    )
  };
}

function processGridPrice(
  runtime: GridRuntime,
  config: GridConfig,
  levels: number[],
  nextPriceInput: number,
  tickAt: number,
  source: "live" | "simulated"
): GridRuntime {
  const nextPrice = fixPrecision(nextPriceInput, config.symbol);
  const previousPrice = runtime.currentPrice;
  const openSlots = new Set(runtime.openSlots);
  const executions: GridExecution[] = [];
  let buyCount = runtime.buyCount;
  let sellCount = runtime.sellCount;
  let completedCycles = runtime.completedCycles;
  let winCount = runtime.winCount;
  let lossCount = runtime.lossCount;
  let grossRealizedPnl = runtime.grossRealizedPnl;
  let realizedPnl = runtime.realizedPnl;
  let totalFees = runtime.totalFees;
  let totalSlippage = runtime.totalSlippage;
  let turnover = runtime.turnover;

  if (nextPrice < previousPrice) {
    for (let index = levels.length - 2; index >= 0; index -= 1) {
      const buyLevel = levels[index];
      if (previousPrice > buyLevel && nextPrice <= buyLevel && !openSlots.has(index)) {
        const quantity = calculateQuantity(config.investPerGrid, buyLevel);
        const entryCosts = calculateCostComponents(config.investPerGrid, config);
        openSlots.add(index);
        buyCount += 1;
        totalFees = Number((totalFees + entryCosts.fees).toFixed(2));
        totalSlippage = Number((totalSlippage + entryCosts.slippage).toFixed(2));
        turnover = Number((turnover + config.investPerGrid).toFixed(2));
        executions.push({
          id: createExecutionId(),
          side: "BUY",
          price: buyLevel,
          quantity,
          timestamp: tickAt,
          fees: entryCosts.fees,
          slippage: entryCosts.slippage,
          turnover: config.investPerGrid,
          source,
          summary: `价格回踩 ${formatPrice(buyLevel, config.symbol)}，第 ${index + 1} 格买单成交。`
        });
      }
    }
  }

  if (nextPrice > previousPrice) {
    for (let index = 0; index < levels.length - 1; index += 1) {
      const sellLevel = levels[index + 1];
      if (previousPrice < sellLevel && nextPrice >= sellLevel && openSlots.has(index)) {
        const buyLevel = levels[index];
        const quantity = calculateQuantity(config.investPerGrid, buyLevel);
        const grossPnl = Number((quantity * (sellLevel - buyLevel)).toFixed(2));
        const entryCosts = calculateCostComponents(config.investPerGrid, config);
        const exitNotional = Number((sellLevel * quantity).toFixed(2));
        const exitCosts = calculateCostComponents(exitNotional, config);
        const totalCycleFees = Number((entryCosts.fees + exitCosts.fees).toFixed(2));
        const totalCycleSlippage = Number((entryCosts.slippage + exitCosts.slippage).toFixed(2));
        const netPnl = Number((grossPnl - totalCycleFees - totalCycleSlippage).toFixed(2));
        openSlots.delete(index);
        sellCount += 1;
        completedCycles += 1;
        grossRealizedPnl = Number((grossRealizedPnl + grossPnl).toFixed(2));
        realizedPnl = Number((realizedPnl + netPnl).toFixed(2));
        totalFees = Number((totalFees + exitCosts.fees).toFixed(2));
        totalSlippage = Number((totalSlippage + exitCosts.slippage).toFixed(2));
        turnover = Number((turnover + exitNotional).toFixed(2));
        if (netPnl >= 0) {
          winCount += 1;
        } else {
          lossCount += 1;
        }
        executions.push({
          id: createExecutionId(),
          side: "SELL",
          price: sellLevel,
          quantity,
          grossPnl,
          netPnl,
          timestamp: tickAt,
          fees: exitCosts.fees,
          slippage: exitCosts.slippage,
          turnover: exitNotional,
          source,
          summary: `反弹到 ${formatPrice(sellLevel, config.symbol)}，完成一格止盈，净收益 ${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)}。`
        });
      }
    }
  }

  const floatingPnl = Number(
    Array.from(openSlots).reduce((total, slotIndex) => {
      const buyLevel = levels[slotIndex];
      const quantity = calculateQuantity(config.investPerGrid, buyLevel);
      const grossFloatingPnl = quantity * (nextPrice - buyLevel);
      const entryCosts = calculateCostComponents(config.investPerGrid, config);
      const exitNotional = Number((nextPrice * quantity).toFixed(2));
      const exitCosts = calculateCostComponents(exitNotional, config);
      return total + grossFloatingPnl - entryCosts.fees - entryCosts.slippage - exitCosts.fees - exitCosts.slippage;
    }, 0).toFixed(2)
  );

  const rangeState: RangeState =
    nextPrice < config.lowerPrice ? "below" : nextPrice > config.upperPrice ? "above" : "inside";
  const stopBounds = calculateAutoStopBounds(config);
  const autoStopReason =
    config.autoStopEnabled && (nextPrice <= stopBounds.lowerStop || nextPrice >= stopBounds.upperStop)
      ? `价格触及自动停机边界 ${nextPrice <= stopBounds.lowerStop ? formatPrice(stopBounds.lowerStop, config.symbol) : formatPrice(stopBounds.upperStop, config.symbol)}，策略已停止等待重新校准区间。`
      : null;

  let lastSignal = runtime.lastSignal;
  let lastSignalTone = runtime.lastSignalTone;

  if (autoStopReason) {
    lastSignal = autoStopReason;
    lastSignalTone = "bearish";
  } else if (executions.length > 0) {
    const latest = executions[executions.length - 1];
    lastSignal = latest.summary;
    lastSignalTone = latest.side === "BUY" ? "bullish" : "neutral";
  } else if (rangeState === "below") {
    lastSignal = "价格跌破网格下沿，当前应考虑停机或重新下移区间。";
    lastSignalTone = "bearish";
  } else if (rangeState === "above") {
    lastSignal = "价格突破网格上沿，当前更像趋势延续而非区间震荡。";
    lastSignalTone = "bearish";
  } else {
    lastSignal =
      source === "live"
        ? "Binance 实时成交正在推进网格，等待命中下一条价格线。"
        : "当前执行记录来自历史模拟，不代表新的实时推进。";
    lastSignalTone = runtime.openSlots.length > 0 ? "bullish" : "neutral";
  }

  return {
    currentPrice: nextPrice,
    previousPrice,
    priceTrail: [...runtime.priceTrail, nextPrice].slice(-24),
    openSlots: Array.from(openSlots).sort((left, right) => left - right),
    buyCount,
    sellCount,
    completedCycles,
    winCount,
    lossCount,
    grossRealizedPnl,
    realizedPnl,
    floatingPnl,
    totalFees,
    totalSlippage,
    turnover,
    history: [...executions.reverse(), ...runtime.history].slice(0, 12),
    lastSignal,
    lastSignalTone,
    lastTickAt: tickAt,
    rangeState,
    stopReason: autoStopReason,
    stoppedAt: autoStopReason ? tickAt : runtime.stoppedAt
  };
}

function syncRuntimePrice(
  runtime: GridRuntime,
  config: GridConfig,
  nextPriceInput: number,
  tickAt: number,
  source: "live" | "fallback"
): GridRuntime {
  const nextPrice = fixPrecision(nextPriceInput, config.symbol);
  const rangeState: RangeState =
    nextPrice < config.lowerPrice ? "below" : nextPrice > config.upperPrice ? "above" : "inside";

  let lastSignal = runtime.lastSignal;
  let lastSignalTone: GridTone = runtime.lastSignalTone;

  if (source === "live") {
    lastSignal =
      rangeState === "inside"
        ? "Binance 实时价格已接入，当前可直接用真实行情预览网格区间。"
        : "Binance 实时价格已脱离预设区间，启动前建议先重新校准边界。";
    lastSignalTone = rangeState === "inside" ? "neutral" : "bearish";
  } else {
    lastSignal =
      rangeState === "inside"
        ? "Binance 实时流暂未就绪，页面当前保留最近一次真实价格并等待重连。"
        : "实时流暂不可用且价格已越过区间，建议手动确认边界后再启动。";
    lastSignalTone = rangeState === "inside" ? "neutral" : "bearish";
  }

  return {
    ...runtime,
    previousPrice: runtime.currentPrice,
    currentPrice: nextPrice,
    priceTrail: [...runtime.priceTrail, nextPrice].slice(-24),
    lastTickAt: tickAt,
    rangeState,
    lastSignal,
    lastSignalTone
  };
}

export function GridSignalPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeSeed = useMemo(() => parseGridRouteSeed(location.search), [location.search]);
  const initialPreset = getPreset(routeSeed?.presetSymbol ?? gridPresets[0].symbol);
  const initialConfig = routeSeed
    ? normalizeConfig(routeSeed.config, initialPreset)
    : createConfigFromPreset(initialPreset);
  const initialRuntime = routeSeed
    ? buildRuntimeFromRouteSeed(routeSeed, initialPreset)
    : createInitialRuntime(initialPreset);

  const [config, setConfig] = useState<GridConfig>(() => initialConfig);
  const [runtime, setRuntime] = useState<GridRuntime>(() => initialRuntime);
  const [selectedPresetSymbol, setSelectedPresetSymbol] = useState<GridSymbol>(() => routeSeed?.presetSymbol ?? initialPreset.symbol);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [routeNote, setRouteNote] = useState<string | null>(() => routeSeed?.note ?? null);
  const [isSnapshotReady, setIsSnapshotReady] = useState(() => Boolean(routeSeed));
  const [shouldLoadStoredSnapshot] = useState(() => !routeSeed);

  const activePreset = useMemo(() => getPreset(config.symbol), [config.symbol]);
  const marketState = useBinanceGridMarket(config.symbol);
  const gridLevels = useMemo(() => buildGridLevels(config), [config]);
  const gridSpacing = useMemo(() => calculateGridSpacing(config), [config]);
  const totalCapital = config.gridCount * config.investPerGrid;
  const deployedCapital = runtime.openSlots.length * config.investPerGrid;
  const totalCosts = runtime.totalFees + runtime.totalSlippage;
  const totalExecutions = runtime.buyCount + runtime.sellCount;
  const winRate = runtime.completedCycles > 0 ? (runtime.winCount / runtime.completedCycles) * 100 : 0;
  const averageCycleNetPnl = runtime.completedCycles > 0 ? runtime.realizedPnl / runtime.completedCycles : 0;
  const hasRuntimePrice = hasUsableGridPrice(runtime.currentPrice);
  const autoStopBounds = calculateAutoStopBounds(config);
  const invalidationPrice = autoStopBounds.lowerStop;
  const upperBreakoutPrice = autoStopBounds.upperStop;
  const isOutsideAutoStopBounds =
    hasRuntimePrice &&
    (runtime.currentPrice <= invalidationPrice || runtime.currentPrice >= upperBreakoutPrice);
  const configError =
    config.lowerPrice >= config.upperPrice
      ? "最低价必须小于最高价。"
      : config.gridCount < 5
        ? "网格数量至少需要 5 格。"
        : config.investPerGrid <= 0
          ? "每格投资额必须大于 0。"
          : config.feeRateBps < 0 || config.slippageBps < 0
            ? "手续费和滑点不能小于 0。"
            : config.breakoutBufferSteps < 1
              ? "突破缓冲格数至少为 1。"
              : null;
  const marketStartGuardError =
    marketState.connectionState !== "live"
      ? "Binance 实时行情未就绪，暂时不能启动网格。"
      : !hasRuntimePrice
        ? "当前还没有可用的真实价格，暂时不能启动网格。"
        : null;
  const startGuardError =
    configError ??
    marketStartGuardError ??
    (config.autoStopEnabled && isOutsideAutoStopBounds
      ? "当前价格已处于自动停机边界之外，请先调整区间后再启动。"
      : null);

  useEffect(() => {
    if (!routeSeed) {
      return;
    }

    const nextPreset = getPreset(routeSeed.presetSymbol);
    setIsRunning(false);
    setSelectedPresetSymbol(routeSeed.presetSymbol);
    setConfig(normalizeConfig(routeSeed.config, nextPreset));
    setRuntime(buildRuntimeFromRouteSeed(routeSeed, nextPreset));
    setSavedAt(null);
    setRouteNote(routeSeed.note);
    setIsSnapshotReady(true);
    navigate(
      {
        pathname: location.pathname,
        hash: location.hash
      },
      { replace: true }
    );
  }, [location.hash, location.pathname, navigate, routeSeed]);

  useEffect(() => {
    if (!shouldLoadStoredSnapshot || routeSeed || typeof window === "undefined") {
      return;
    }

    let ignore = false;

    const hydrateSnapshot = async () => {
      const legacySnapshot = loadLegacySnapshot();

      try {
        const persistedSnapshot = await loadGridSnapshot<PersistedSnapshot["config"], PersistedSnapshot["runtime"]>(
          GRID_SNAPSHOT_ID
        );
        if (ignore) {
          return;
        }

        const nextSnapshot =
          persistedSnapshot == null
            ? legacySnapshot
            : {
                config: persistedSnapshot.config,
                runtime: persistedSnapshot.runtime,
                selectedPresetSymbol: isGridSymbolValue(persistedSnapshot.selectedPresetSymbol)
                  ? persistedSnapshot.selectedPresetSymbol
                  : gridPresets[0].symbol,
                savedAt: persistedSnapshot.savedAt
              };

        if (!nextSnapshot) {
          setIsSnapshotReady(true);
          return;
        }

        const nextPreset = getPreset(nextSnapshot.selectedPresetSymbol);
        const nextConfig = normalizeConfig(nextSnapshot.config, nextPreset);
        setIsRunning(false);
        setSelectedPresetSymbol(nextPreset.symbol);
        setConfig(nextConfig);
        setRuntime(normalizeRuntime(nextSnapshot.runtime, nextConfig, nextPreset));
        setSavedAt(nextSnapshot.savedAt);

        if (persistedSnapshot == null && legacySnapshot) {
          void saveGridSnapshot({
            id: GRID_SNAPSHOT_ID,
            ...legacySnapshot
          });
        }
      } catch {
        if (!ignore && legacySnapshot) {
          const nextPreset = getPreset(legacySnapshot.selectedPresetSymbol);
          const nextConfig = normalizeConfig(legacySnapshot.config, nextPreset);
          setIsRunning(false);
          setSelectedPresetSymbol(nextPreset.symbol);
          setConfig(nextConfig);
          setRuntime(normalizeRuntime(legacySnapshot.runtime, nextConfig, nextPreset));
          setSavedAt(legacySnapshot.savedAt);
        }
      } finally {
        if (!ignore) {
          setIsSnapshotReady(true);
        }
      }
    };

    void hydrateSnapshot();

    return () => {
      ignore = true;
    };
  }, [routeSeed, shouldLoadStoredSnapshot]);

  useEffect(() => {
    if (isRunning) {
      return;
    }

    setRuntime((previous) => ({
      ...previous,
      openSlots: [],
      floatingPnl: 0,
      rangeState:
        hasUsableGridPrice(previous.currentPrice) && previous.currentPrice < config.lowerPrice
          ? "below"
          : hasUsableGridPrice(previous.currentPrice) && previous.currentPrice > config.upperPrice
            ? "above"
            : "inside",
      lastSignal: "参数已更新，等待 Binance 实时价格就绪后可启动纸交易。",
      lastSignalTone: "neutral",
      stopReason: null,
      stoppedAt: null
    }));
  }, [config, isRunning]);

  useEffect(() => {
    if (isRunning || !Number.isFinite(marketState.currentPrice) || marketState.currentPrice <= 0) {
      return;
    }

    setRuntime((previous) =>
      syncRuntimePrice(
        previous,
        config,
        marketState.currentPrice,
        marketState.lastUpdatedAt ?? Date.now(),
        marketState.connectionState === "live" ? "live" : "fallback"
      )
    );
  }, [
    config,
    isRunning,
    marketState.connectionState,
    marketState.currentPrice,
    marketState.lastUpdatedAt
  ]);

  useEffect(() => {
    if (
      !isRunning ||
      marketState.connectionState !== "live" ||
      !marketState.latestTrade ||
      !Number.isFinite(marketState.latestTrade.price) ||
      marketState.latestTrade.price <= 0
    ) {
      return;
    }

    setRuntime((previous) =>
      processGridPrice(
        previous,
        config,
        gridLevels,
        marketState.latestTrade!.price,
        marketState.latestTrade!.timestamp,
        "live"
      )
    );
  }, [config, gridLevels, isRunning, marketState.connectionState, marketState.latestTrade]);

  useEffect(() => {
    if (!isRunning || marketState.connectionState === "live") {
      return;
    }

    setRuntime((previous) => ({
      ...previous,
      lastSignal: "Binance 实时流已断开，策略已暂停推进；恢复实时行情后可重新启动。",
      lastSignalTone: "bearish"
    }));
    setIsRunning(false);
  }, [isRunning, marketState.connectionState]);

  useEffect(() => {
    if (!isRunning || !runtime.stopReason) {
      return;
    }

    setIsRunning(false);
  }, [isRunning, runtime.stopReason]);

  useEffect(() => {
    if (typeof window === "undefined" || !isSnapshotReady) {
      return;
    }

    const payload: PersistedSnapshot = {
      config,
      runtime,
      selectedPresetSymbol,
      savedAt: Date.now()
    };

    setSavedAt(payload.savedAt);
    void saveGridSnapshot({
      id: GRID_SNAPSHOT_ID,
      ...payload
    }).catch(() => {
      window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(payload));
    });
  }, [config, isSnapshotReady, runtime, selectedPresetSymbol]);

  const readinessTone: GridTone =
    !hasRuntimePrice
      ? "neutral"
      : runtime.stopReason
      ? "bearish"
      : runtime.rangeState !== "inside"
      ? "bearish"
      : activePreset.readiness >= 80
        ? "bullish"
        : activePreset.readiness >= 70
          ? "neutral"
          : "bearish";

  const readinessLabel =
    !hasRuntimePrice
      ? "等待实价"
      : runtime.stopReason
      ? "自动停机"
      : runtime.rangeState === "below"
      ? "跌破区间"
      : runtime.rangeState === "above"
        ? "突破区间"
        : isRunning
          ? runtime.openSlots.length > 0
            ? "运行中"
            : "等待命中"
          : activePreset.readiness >= 80
            ? "准备就绪"
            : "谨慎启动";

  const levelStates = useMemo(() => {
    return [...gridLevels]
      .map((level, index) => {
        const sellTarget = runtime.openSlots.includes(index - 1);
        const buyFilled = runtime.openSlots.includes(index);
        let state = "待命";
        let tone: GridTone = "neutral";

        if (buyFilled) {
          state = "已买待卖";
          tone = "bullish";
        } else if (sellTarget) {
          state = "卖出目标";
          tone = "neutral";
        } else if (!hasRuntimePrice) {
          state = "等待实价";
          tone = "neutral";
        } else if (level < runtime.currentPrice) {
          state = "买单待命";
          tone = "bullish";
        } else if (level > runtime.currentPrice) {
          state = "卖单待命";
          tone = "bearish";
        }

        return {
          index,
          level,
          state,
          tone
        };
      })
      .reverse();
  }, [gridLevels, hasRuntimePrice, runtime.currentPrice, runtime.openSlots]);

  const marketStatusClass =
    marketState.connectionState === "live"
      ? "live-status-pill live-status-live"
      : marketState.connectionState === "connecting"
        ? "live-status-pill live-status-connecting"
        : "live-status-pill live-status-fallback";
  const marketStatusLabel =
    marketState.connectionState === "live"
      ? isRunning
        ? "● Binance Live 驱动中"
        : "● Binance Live 已就绪"
      : marketState.connectionState === "connecting"
        ? "◌ 正在连接 Binance"
        : isRunning
          ? "○ 实时流断开，策略已暂停"
          : hasUsableGridPrice(marketState.currentPrice)
            ? "○ 保留最近一次真实价格"
            : "○ 等待真实价格";
  const marketSourceChip =
    marketState.connectionState === "live"
      ? "行情源：aggTrade + miniTicker"
      : marketState.connectionState === "connecting"
        ? "正在等待实时增量流"
        : hasUsableGridPrice(marketState.currentPrice)
          ? "行情源：最近一次真实价格"
          : "行情源：等待 Binance 恢复";
  const dismissRouteNote = () => {
    setRouteNote(null);
  };
  const updateConfig = (updater: (previous: GridConfig) => GridConfig) => {
    dismissRouteNote();
    setConfig(updater);
  };

  const resetToPresetDefaults = () => {
    const preset = getPreset(config.symbol);
    setIsRunning(false);
    setSelectedPresetSymbol(preset.symbol);
    setConfig(createConfigFromPreset(preset));
    setRuntime(createRuntimeFromKnownPrice(preset, marketState.currentPrice));
    setSavedAt(null);
    setRouteNote(null);
  };

  const handleReturnToOverview = () => {
    const search = new URLSearchParams({
      source: "execution-page",
      symbol: config.symbol,
      focus: "strategy-router",
      note: `已从 Grid Signals 返回总览，保留 ${config.symbol} 的网格区间观察上下文。`
    }).toString();

    navigate({ pathname: "/", search: `?${search}` });
  };

  const handlePresetApply = (preset: GridPreset) => {
    if (isRunning) {
      return;
    }

    dismissRouteNote();
    setSelectedPresetSymbol(preset.symbol);
    setConfig(createConfigFromPreset(preset));
    setRuntime(
      preset.symbol === config.symbol
        ? createRuntimeFromKnownPrice(preset, marketState.currentPrice)
        : createInitialRuntime(preset)
    );
  };

  const handleSymbolChange = (symbol: GridSymbol) => {
    const preset = getPreset(symbol);
    dismissRouteNote();
    setSelectedPresetSymbol(symbol);
    setConfig(createConfigFromPreset(preset));
    setRuntime(createInitialRuntime(preset));
  };

  const resetStrategy = () => {
    setIsRunning(false);
    setRuntime(createRuntimeFromKnownPrice(activePreset, marketState.currentPrice));
  };

  const toggleStrategy = () => {
    if (isRunning) {
      setIsRunning(false);
      return;
    }

    if (startGuardError) {
      return;
    }

    setRuntime((previous) => ({
      ...previous,
      stopReason: null,
      stoppedAt: null,
      lastSignal: "策略已启动，当前使用 Binance 实时成交驱动网格。",
      lastSignalTone: "neutral"
    }));
    setIsRunning(true);
  };

  return (
    <section className="page-content">
      <div className="hero-panel grid-panel">
        <div>
          <p className="eyebrow">Grid Strategy / CR_3</p>
          <h3>震荡市网格策略工作台</h3>
          <p className="hero-copy">
            这一版按 CR_3.MD 把网格页升级为可交互策略台：支持参数配置、纸交易模拟、
            网格命中、订单历史、本地快照和区间失效提醒，不再只是静态推荐列表。
          </p>
        </div>
        <div className={`hero-badge signal-hero-badge tone-${readinessTone}`}>
          <span>Grid Readiness</span>
          <strong>{readinessLabel}</strong>
          <small>
            推荐度 {activePreset.readiness}% · {activePreset.symbol} · {activePreset.mode}
          </small>
        </div>
      </div>

      <div className="live-status-row">
        <div className={marketStatusClass}>{marketStatusLabel}</div>
        <p className="live-status-copy live-status-copy-grid">
          <span className="live-status-copy-segment live-status-copy-segment-price">
            当前价 <strong className="trend-text-emphasis">{formatPrice(runtime.currentPrice, config.symbol)}</strong>
          </span>
          {marketState.change24h !== null ? (
            <span className="live-status-copy-segment">
              24H <strong className={getSignedTrendTextClass(marketState.change24h)}>{formatPercent(marketState.change24h)}</strong>
            </span>
          ) : null}
          <span className="live-status-copy-segment live-status-copy-segment-time">
            上次价格 <strong>{formatTime(marketState.lastUpdatedAt ?? runtime.lastTickAt)}</strong>
          </span>
          <span className="live-status-copy-segment live-status-copy-segment-snapshot">
            策略快照 <strong>{savedAt ? formatTime(savedAt) : "尚未保存"}</strong>
          </span>
        </p>
        <span className="live-refresh-chip">{marketSourceChip}</span>
      </div>
      <p className="muted grid-market-note">{marketState.statusNote}</p>
      {routeNote ? <p className="grid-runtime-note grid-runtime-neutral">{routeNote}</p> : null}
      <div className="strategy-context-bar">
        <div className="strategy-context-meta">
          <span className="pill">当前焦点 {config.symbol}</span>
          <p className="strategy-context-copy">
            {routeNote ?? "可回到总览继续查看综合信号，或一键恢复当前币种的默认网格预设。"}
          </p>
        </div>
        <div className="action-button-row strategy-context-actions">
          <button type="button" className="action-button action-button-ghost" onClick={handleReturnToOverview}>
            返回总览保留上下文
          </button>
          <button type="button" className="action-button action-button-primary" onClick={resetToPresetDefaults}>
            恢复默认网格预设
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="当前价格"
          value={formatPrice(runtime.currentPrice, config.symbol)}
          detail={
            marketState.change24h !== null
              ? `24H ${formatPercent(marketState.change24h)} · ${marketState.connectionState === "live" ? "实时" : "最近价格"}`
              : `${marketState.connectionState === "live" ? "实时" : hasRuntimePrice ? "最近价格" : "等待实价"}价格源`
          }
          trend={marketState.change24h !== null ? (marketState.change24h >= 0 ? "up" : "down") : "neutral"}
        />
        <StatCard
          label="已用资金"
          value={formatCompactUsd(deployedCapital)}
          detail={`总资金 ${formatCompactUsd(totalCapital)} · 触发 ${totalExecutions} 笔`}
          trend={runtime.openSlots.length > 0 ? "up" : "neutral"}
        />
        <StatCard
          label="净已实现收益"
          value={formatSignedExactUsd(runtime.realizedPnl)}
          detail={`毛收益 ${formatSignedExactUsd(runtime.grossRealizedPnl)} · 单轮均值 ${formatSignedExactUsd(averageCycleNetPnl)}`}
          trend={runtime.realizedPnl >= 0 ? "up" : "down"}
        />
        <StatCard
          label="浮动盈亏"
          value={formatSignedExactUsd(runtime.floatingPnl)}
          detail={`持仓 ${runtime.openSlots.length} 格 · ${config.autoStopEnabled ? `停机下沿 ${formatPrice(invalidationPrice, config.symbol)}` : "自动停机已关闭"}`}
          trend={runtime.floatingPnl >= 0 ? "up" : "down"}
        />
        <StatCard
          label="成交额 / 成本"
          value={formatCompactUsd(runtime.turnover)}
          detail={`手续费 ${formatUsd(runtime.totalFees)} · 滑点 ${formatUsd(runtime.totalSlippage)}`}
          trend="neutral"
        />
        <StatCard
          label="完成轮次"
          value={`${runtime.completedCycles}`}
          detail={`胜率 ${formatPercent(winRate)} · 胜 ${runtime.winCount} / 负 ${runtime.lossCount}`}
          trend={runtime.completedCycles === 0 ? "neutral" : winRate >= 50 ? "up" : "down"}
        />
        <StatCard
          label="成本占毛收益"
          value={runtime.grossRealizedPnl > 0 ? formatPercent((totalCosts / runtime.grossRealizedPnl) * 100) : "--"}
          detail={`总成本 ${formatUsd(totalCosts)} · 网格间距 ${formatPrice(gridSpacing, config.symbol)}`}
          trend={
            runtime.grossRealizedPnl <= 0
              ? "neutral"
              : totalCosts / runtime.grossRealizedPnl <= 0.5
                ? "up"
                : "down"
          }
        />
      </div>

      <div className="content-grid two-columns">
        <section className="panel grid-control-panel">
          <SectionHeader
            eyebrow="Config Panel"
            title="网格参数配置"
            description="先定边界、格数和每格资金，确认 Binance 实时价格就绪后再启动纸交易模式。"
          />

          <div className="alert-form-grid grid-config-grid">
            <label>
              交易对
              <select
                value={config.symbol}
                disabled={isRunning}
                onChange={(event) => {
                  handleSymbolChange(event.target.value as GridSymbol);
                }}
              >
                {gridPresets.map((preset) => (
                  <option key={preset.symbol} value={preset.symbol}>
                    {preset.symbol}
                  </option>
                ))}
              </select>
            </label>

            <label>
              推荐模式
              <div className="grid-static-field">{activePreset.mode}</div>
            </label>

            <label>
              最低价
              <input
                type="number"
                value={config.lowerPrice}
                disabled={isRunning}
                onChange={(event) => {
                  updateConfig((previous) => ({
                    ...previous,
                    lowerPrice: Number(event.target.value)
                  }));
                }}
              />
            </label>

            <label>
              最高价
              <input
                type="number"
                value={config.upperPrice}
                disabled={isRunning}
                onChange={(event) => {
                  updateConfig((previous) => ({
                    ...previous,
                    upperPrice: Number(event.target.value)
                  }));
                }}
              />
            </label>

            <label>
              网格数量
              <div className="grid-slider-field">
                <input
                  type="range"
                  min="5"
                  max="20"
                  value={config.gridCount}
                  disabled={isRunning}
                  onChange={(event) => {
                    updateConfig((previous) => ({
                      ...previous,
                      gridCount: Number(event.target.value)
                    }));
                  }}
                />
                <span>{config.gridCount} 格</span>
              </div>
            </label>

            <label>
              每格投资额 (USDT)
              <input
                type="number"
                min="10"
                step="10"
                value={config.investPerGrid}
                disabled={isRunning}
                onChange={(event) => {
                  updateConfig((previous) => ({
                    ...previous,
                    investPerGrid: Number(event.target.value)
                  }));
                }}
              />
            </label>

            <label>
              单边手续费 (bps)
              <input
                type="number"
                min="0"
                step="0.1"
                value={config.feeRateBps}
                disabled={isRunning}
                onChange={(event) => {
                  updateConfig((previous) => ({
                    ...previous,
                    feeRateBps: Number(event.target.value)
                  }));
                }}
              />
            </label>

            <label>
              预估滑点 (bps)
              <input
                type="number"
                min="0"
                step="0.1"
                value={config.slippageBps}
                disabled={isRunning}
                onChange={(event) => {
                  updateConfig((previous) => ({
                    ...previous,
                    slippageBps: Number(event.target.value)
                  }));
                }}
              />
            </label>

            <label>
              自动停机
              <button
                type="button"
                className={`mini-toggle ${config.autoStopEnabled ? "mini-toggle-on" : ""}`}
                disabled={isRunning}
                onClick={() => {
                  updateConfig((previous) => ({
                    ...previous,
                    autoStopEnabled: !previous.autoStopEnabled
                  }));
                }}
              >
                {config.autoStopEnabled ? "已开启" : "已关闭"}
              </button>
            </label>

            <label>
              突破缓冲格数
              <input
                type="number"
                min="1"
                max="6"
                step="1"
                value={config.breakoutBufferSteps}
                disabled={isRunning || !config.autoStopEnabled}
                onChange={(event) => {
                  updateConfig((previous) => ({
                    ...previous,
                    breakoutBufferSteps: Number(event.target.value)
                  }));
                }}
              />
            </label>
          </div>

          <div className="metric-grid grid-metric-grid">
            <article className="metric-card">
              <span>推荐买入区</span>
              <strong>{activePreset.buyZone}</strong>
              <p>{activePreset.trigger}</p>
            </article>
            <article className="metric-card">
              <span>支撑 / 阻力</span>
              <strong>{activePreset.support}</strong>
              <p>{activePreset.resistance}</p>
            </article>
            <article className="metric-card">
              <span>波动提示</span>
              <strong>{activePreset.volatilityHint}</strong>
              <p>资金费率 {activePreset.fundingRate}</p>
            </article>
          </div>

          <div className="action-button-row grid-action-row">
            <button
              type="button"
              className={isRunning ? "action-button action-button-ghost" : "action-button action-button-primary"}
              disabled={!isRunning && !!startGuardError}
              onClick={toggleStrategy}
            >
              {isRunning ? "⏸ 停止网格" : "🚀 启动网格"}
            </button>
            <button type="button" className="action-button action-button-ghost" onClick={resetStrategy}>
              重置策略
            </button>
          </div>

          <div className="alert-chip-banner grid-risk-banner">
            当前区间 {formatPrice(config.lowerPrice, config.symbol)} - {formatPrice(config.upperPrice, config.symbol)} ·
            {config.autoStopEnabled
              ? ` 自动停机上沿 ${formatPrice(upperBreakoutPrice, config.symbol)} · 自动停机下沿 ${formatPrice(invalidationPrice, config.symbol)} · 缓冲 ${config.breakoutBufferSteps} 格`
              : " 自动停机已关闭，突破区间后仅保留提醒不自动停机"}
          </div>
          {startGuardError ? <p className="grid-runtime-note grid-runtime-bearish">{startGuardError}</p> : null}
        </section>

        <section className="panel grid-chart-panel">
          <SectionHeader
            eyebrow="Grid Visualization"
            title="网格可视化与策略状态"
            description="用简化 SVG 表示真实价格轨迹与网格线，同时列出每条价格线当前处于什么状态。"
          />

          <GridRangeChart
            symbol={config.symbol}
            lowerPrice={config.lowerPrice}
            upperPrice={config.upperPrice}
            gridCount={config.gridCount}
            currentPrice={runtime.currentPrice}
            levels={gridLevels}
            openSlots={runtime.openSlots}
            priceTrail={runtime.priceTrail}
            formatPrice={formatPrice}
          />

          <div className="grid-ladder-list">
            {levelStates.map((item) => (
              <article key={`${item.level}-${item.index}`} className={`grid-ladder-item grid-ladder-${item.tone}`}>
                <div>
                  <strong>{formatPrice(item.level, config.symbol)}</strong>
                  <p className="muted">第 {item.index + 1} 条网格线</p>
                </div>
                <span className="pill">{item.state}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="content-grid two-columns">
        <section className="panel">
          <SectionHeader
            eyebrow="Pair Ranking"
            title="候选交易对与推荐参数"
            description="保留 PRD 的候选排序视图，并允许一键应用推荐配置。"
          />

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>交易对</th>
                  <th>市场状态</th>
                  <th>推荐模式</th>
                  <th>买入区间</th>
                  <th>优先级</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {gridPresets.map((preset) => (
                  <tr key={preset.symbol}>
                    <td>{preset.symbol}</td>
                    <td>{preset.regime}</td>
                    <td>{preset.mode}</td>
                    <td>{preset.buyZone}</td>
                    <td>{preset.priority}</td>
                    <td>
                      <button
                        type="button"
                        className="action-button action-button-ghost grid-inline-button"
                        disabled={isRunning}
                        onClick={() => {
                          handlePresetApply(preset);
                        }}
                      >
                        应用参数
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel accent-panel">
          <SectionHeader
            eyebrow="Execution Map"
            title="当前部署结构"
            description="把首仓、加仓和失效退出映射到你当前设定的真实价格区间。"
          />

          <div className="execution-map">
            <article className="execution-step">
              <span>Step 01</span>
              <strong>首仓启动区</strong>
              <p>
                价格回踩到 {formatPrice(config.lowerPrice + gridSpacing * 2, config.symbol)} 上方时，可先让上层两格参与纸交易。
              </p>
            </article>
            <article className="execution-step">
              <span>Step 02</span>
              <strong>中段加仓区</strong>
              <p>
                若继续回落到 {formatPrice((config.lowerPrice + config.upperPrice) / 2, config.symbol)} 一带，网格会自然逐格补单。
              </p>
            </article>
            <article className="execution-step">
              <span>Step 03</span>
              <strong>失效退出区</strong>
              <p>
                {config.autoStopEnabled
                  ? `一旦跌破 ${formatPrice(invalidationPrice, config.symbol)} 或突破 ${formatPrice(upperBreakoutPrice, config.symbol)}，系统会自动停机并提示重新校准区间。`
                  : `当前自动停机已关闭，即使跌破 ${formatPrice(invalidationPrice, config.symbol)} 或突破 ${formatPrice(upperBreakoutPrice, config.symbol)} 也只会提示风险，不会自动停机。`}
              </p>
            </article>
          </div>
        </section>
      </div>

      <div className="content-grid two-columns">
        <section className="panel">
          <SectionHeader
            eyebrow="Order History"
            title="最近执行记录"
            description="纸交易模式下会记录每次由真实行情触发的网格命中，方便观察是否真的在低买高卖。"
          />

          <div className="grid-history-list">
            {runtime.history.length > 0 ? (
              runtime.history.map((item) => (
                <article key={item.id} className={item.side === "BUY" ? "grid-history-item grid-history-buy" : "grid-history-item grid-history-sell"}>
                  <div>
                    <div className="grid-history-title-row">
                      <strong>{item.side === "BUY" ? "买单成交" : "卖单止盈"}</strong>
                      <span className="pill">
                        {formatTime(item.timestamp)} · {item.source === "live" ? "Live" : "Sim"}
                      </span>
                    </div>
                    <p className="muted">{item.summary}</p>
                  </div>
                  <div className="grid-history-value-block">
                    <strong>{formatPrice(item.price, config.symbol)}</strong>
                    <small>
                      <span>
                        数量 {item.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                        {` · 成交额 ${formatUsd(item.turnover)}`}
                        {` · 手续费 ${formatUsd(item.fees)}`}
                        {` · 滑点 ${formatUsd(item.slippage)}`}
                      </span>
                      {item.netPnl !== undefined ? (
                        <span className={getSignedTrendTextClass(item.grossPnl ?? 0)}>
                          {` · 毛收益 ${formatSignedExactUsd(item.grossPnl ?? 0)}`}
                        </span>
                      ) : null}
                      {item.netPnl !== undefined ? (
                        <span className={getSignedTrendTextClass(item.netPnl)}>
                          {` · 净收益 ${formatSignedExactUsd(item.netPnl)}`}
                        </span>
                      ) : null}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <div className="grid-empty-state">
                <strong>还没有成交记录</strong>
                <p className="muted">启动纸交易后，真实价格命中网格线就会在这里生成买入或卖出日志。</p>
              </div>
            )}
          </div>

          <p className={`grid-runtime-note grid-runtime-${runtime.lastSignalTone}`}>策略引擎：{runtime.lastSignal}</p>
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow="Methods & Guardrails"
            title="实施方法与风控提示"
            description="把 PRD 中的实现思路、使用前提和实操边界一起展示出来。"
          />

          <div className="heat-grid grid-method-grid">
            {gridMethodCards.map((item) => (
              <article key={item.id} className={`heat-cell ${item.tone}`}>
                <div>
                  <span>{item.title}</span>
                  <strong>{item.emphasis}</strong>
                </div>
                <p className="muted">{item.description}</p>
              </article>
            ))}
          </div>

          <div className="rule-list grid-checklist-list">
            {gridChecklist.map((item) => (
              <article key={item} className="rule-item">
                <span className="rule-index" />
                <p>{item}</p>
              </article>
            ))}
          </div>

          <div className="rule-list grid-checklist-list">
            {gridBestPractices.map((item) => (
              <article key={item} className="rule-item">
                <span className="rule-index" />
                <p>{item}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
