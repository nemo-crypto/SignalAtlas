import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { FundTechnicalSignalChart } from "../components/charts/FundTechnicalSignalChart";
import { FundTrendSparkline } from "../components/charts/FundTrendSparkline";
import { SectionHeader } from "../components/SectionHeader";
import { StatCard } from "../components/StatCard";
import {
  ashareFundDataNote,
  ashareSectorFunds,
  fundTrendPeriods,
  type AShareSectorFund,
  type FundTrendPeriod
} from "../data/ashareSectorFunds";
import {
  fetchAshareSectorFundsWithMarketData,
  type AShareMarketDataState
} from "../services/ashareFundMarketData";

type TrendTone = "up" | "down" | "neutral";
type TechnicalSignalAction = "buy" | "sell" | "watch";
type TechnicalSignalFilter = "all" | TechnicalSignalAction;
type FundSortMode = "signal" | "month" | "year" | "name";

type TechnicalSignalConfig = {
  supportLookback: number;
  resistanceLookback: number;
  supportTolerancePercent: number;
  resistanceTolerancePercent: number;
  bollingerPeriod: number;
  bollingerDeviation: number;
  macdFastPeriod: number;
  macdSlowPeriod: number;
  macdSignalPeriod: number;
};

type TechnicalSignalCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

type TechnicalSignal = {
  action: TechnicalSignalAction;
  score: number;
  title: string;
  summary: string;
  detail: string;
  currentValue: number;
  support: number;
  resistance: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  supportDistancePercent: number;
  resistanceDistancePercent: number;
  buyChecks: TechnicalSignalCheck[];
  sellChecks: TechnicalSignalCheck[];
};

type FundWithSector = AShareSectorFund & {
  sectorName: string;
  sectorTone: string;
};

const allSectorId = "all";
const allSubfieldId = "all";
const allSignalFilterId: TechnicalSignalFilter = "all";
const fundSortOptions: Array<{
  id: FundSortMode;
  label: string;
}> = [
  { id: "signal", label: "信号分数" },
  { id: "month", label: "月线强度" },
  { id: "year", label: "近一年强度" },
  { id: "name", label: "名称" }
];
const defaultTechnicalSignalConfig: TechnicalSignalConfig = {
  supportLookback: 6,
  resistanceLookback: 6,
  supportTolerancePercent: 1.8,
  resistanceTolerancePercent: 1.8,
  bollingerPeriod: 6,
  bollingerDeviation: 1.7,
  macdFastPeriod: 3,
  macdSlowPeriod: 6,
  macdSignalPeriod: 3
};

const initialMarketDataState: AShareMarketDataState = {
  sectors: ashareSectorFunds,
  status: "idle",
  loadedFundCount: 0,
  liveFundCount: 0,
  cachedFundCount: 0,
  fallbackFundCount: ashareSectorFunds.reduce((count, sector) => count + sector.funds.length, 0),
  totalFundCount: ashareSectorFunds.reduce((count, sector) => count + sector.funds.length, 0),
  errorMessage: null,
  qualityWarnings: [],
  updatedAt: null
};

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatMarketUpdatedAt(value: string | null): string {
  if (!value) {
    return "等待真实行情";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getTrendTone(value: number): TrendTone {
  if (value > 0.15) {
    return "up";
  }

  if (value < -0.15) {
    return "down";
  }

  return "neutral";
}

function getTrendClassName(value: number): string {
  const tone = getTrendTone(value);

  if (tone === "up") {
    return "trend-text-up trend-text-emphasis";
  }

  if (tone === "down") {
    return "trend-text-down trend-text-emphasis";
  }

  return "trend-text-neutral trend-text-emphasis";
}

function getFundScore(fund: AShareSectorFund): number {
  return (
    fund.trends.week.changePercent * 0.25 +
    fund.trends.month.changePercent * 0.35 +
    fund.trends.year.changePercent * 0.4
  );
}

function getDominantPeriod(fund: AShareSectorFund): FundTrendPeriod {
  return fundTrendPeriods.reduce<FundTrendPeriod>((bestPeriod, period) => {
    const currentValue = Math.abs(fund.trends[period.id].changePercent);
    const bestValue = Math.abs(fund.trends[bestPeriod].changePercent);
    return currentValue > bestValue ? period.id : bestPeriod;
  }, "week");
}

function getMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getStandardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = getMean(values);
  const variance = getMean(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function getEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);

  return values.reduce<number[]>((series, value, index) => {
    if (index === 0) {
      return [value];
    }

    const previous = series[index - 1];
    return [...series, value * multiplier + previous * (1 - multiplier)];
  }, []);
}

function getMacd(values: number[], config: TechnicalSignalConfig) {
  const fastEma = getEmaSeries(values, config.macdFastPeriod);
  const slowEma = getEmaSeries(values, config.macdSlowPeriod);
  const macdSeries = values.map((_, index) => (fastEma[index] ?? 0) - (slowEma[index] ?? 0));
  const signalSeries = getEmaSeries(macdSeries, config.macdSignalPeriod);
  const lastIndex = values.length - 1;
  const macd = macdSeries[lastIndex] ?? 0;
  const signal = signalSeries[lastIndex] ?? 0;

  return {
    macd,
    signal,
    histogram: macd - signal,
    previousHistogram:
      lastIndex > 0
        ? (macdSeries[lastIndex - 1] ?? 0) - (signalSeries[lastIndex - 1] ?? 0)
        : 0
  };
}

function formatTechnicalValue(value: number): string {
  return value.toFixed(1);
}

function getTechnicalSignal(
  fund: FundWithSector,
  config: TechnicalSignalConfig
): TechnicalSignal {
  const values = fund.trends.year.series;
  const currentValue = values[values.length - 1] ?? 100;
  const supportWindow = values.slice(-Math.max(config.supportLookback, 2));
  const resistanceWindow = values.slice(-Math.max(config.resistanceLookback, 2));
  const support = Math.min(...supportWindow);
  const resistance = Math.max(...resistanceWindow);
  const supportDistancePercent =
    ((currentValue - support) / Math.max(support, 1e-6)) * 100;
  const resistanceDistancePercent =
    ((resistance - currentValue) / Math.max(currentValue, 1e-6)) * 100;
  const bollingerWindow = values.slice(-Math.max(config.bollingerPeriod, 2));
  const bollingerMiddle = getMean(bollingerWindow);
  const bollingerDeviation = getStandardDeviation(bollingerWindow);
  const bollingerUpper = bollingerMiddle + bollingerDeviation * config.bollingerDeviation;
  const bollingerLower = bollingerMiddle - bollingerDeviation * config.bollingerDeviation;
  const macd = getMacd(values, config);
  const weekChange = fund.trends.week.changePercent;
  const monthChange = fund.trends.month.changePercent;
  const isFallingToSupport =
    weekChange <= 0.2 &&
    supportDistancePercent <= config.supportTolerancePercent &&
    currentValue <= bollingerLower * 1.018;
  const isMacdRepairing = macd.histogram > macd.previousHistogram || macd.histogram > -0.18;
  const isRisingToResistance =
    weekChange >= -0.2 &&
    monthChange >= 0 &&
    resistanceDistancePercent <= config.resistanceTolerancePercent &&
    currentValue >= bollingerUpper * 0.982;
  const isMacdOverheated = macd.histogram < macd.previousHistogram || macd.macd < macd.signal;
  const buyChecks: TechnicalSignalCheck[] = [
    {
      id: "falling-to-support",
      label: "下跌接近支撑",
      passed: weekChange <= 0.2 && supportDistancePercent <= config.supportTolerancePercent,
      detail: `周线 ${formatSignedPercent(weekChange)}，距支撑 ${supportDistancePercent.toFixed(1)}%`
    },
    {
      id: "near-lower-band",
      label: "贴近布林下轨",
      passed: currentValue <= bollingerLower * 1.018,
      detail: `当前 ${formatTechnicalValue(currentValue)} / 下轨 ${formatTechnicalValue(bollingerLower)}`
    },
    {
      id: "macd-repair",
      label: "MACD 动能修复",
      passed: isMacdRepairing,
      detail: `柱状图 ${macd.histogram.toFixed(2)}，前值 ${macd.previousHistogram.toFixed(2)}`
    }
  ];
  const sellChecks: TechnicalSignalCheck[] = [
    {
      id: "rising-to-resistance",
      label: "上涨接近压力",
      passed:
        weekChange >= -0.2 &&
        monthChange >= 0 &&
        resistanceDistancePercent <= config.resistanceTolerancePercent,
      detail: `月线 ${formatSignedPercent(monthChange)}，距压力 ${resistanceDistancePercent.toFixed(1)}%`
    },
    {
      id: "near-upper-band",
      label: "贴近布林上轨",
      passed: currentValue >= bollingerUpper * 0.982,
      detail: `当前 ${formatTechnicalValue(currentValue)} / 上轨 ${formatTechnicalValue(bollingerUpper)}`
    },
    {
      id: "macd-cooling",
      label: "MACD 动能降温",
      passed: isMacdOverheated,
      detail: `柱状图 ${macd.histogram.toFixed(2)}，信号线 ${macd.signal.toFixed(2)}`
    }
  ];
  const baseSignalMetrics = {
    currentValue,
    support,
    resistance,
    macd: macd.macd,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    bollingerUpper,
    bollingerMiddle,
    bollingerLower,
    supportDistancePercent,
    resistanceDistancePercent,
    buyChecks,
    sellChecks
  };

  if (isFallingToSupport && isMacdRepairing) {
    const score = Math.round(
      68 +
        Math.max(0, config.supportTolerancePercent - supportDistancePercent) * 7 +
        Math.max(0, macd.histogram - macd.previousHistogram) * 6
    );

    return {
      action: "buy",
      score: Math.min(score, 95),
      title: "支撑位买入观察",
      summary: `${fund.name} 下跌接近支撑，MACD 动能有修复迹象。`,
      detail: `当前相对值 ${formatTechnicalValue(currentValue)}，支撑 ${formatTechnicalValue(
        support
      )}，距支撑 ${supportDistancePercent.toFixed(1)}%；布林下轨 ${formatTechnicalValue(
        bollingerLower
      )}。`,
      ...baseSignalMetrics
    };
  }

  if (isRisingToResistance && isMacdOverheated) {
    const score = Math.round(
      66 +
        Math.max(0, config.resistanceTolerancePercent - resistanceDistancePercent) * 7 +
        Math.max(0, macd.previousHistogram - macd.histogram) * 6
    );

    return {
      action: "sell",
      score: Math.min(score, 95),
      title: "压力位卖出观察",
      summary: `${fund.name} 上涨接近压力，MACD 动能开始降温。`,
      detail: `当前相对值 ${formatTechnicalValue(currentValue)}，压力 ${formatTechnicalValue(
        resistance
      )}，距压力 ${resistanceDistancePercent.toFixed(1)}%；布林上轨 ${formatTechnicalValue(
        bollingerUpper
      )}。`,
      ...baseSignalMetrics
    };
  }

  return {
    action: "watch",
    score: Math.round(
      45 +
        Math.min(Math.abs(monthChange), 8) * 2 +
        Math.min(Math.abs(macd.histogram), 3) * 3
    ),
    title: "等待确认",
    summary: `${fund.name} 暂未同时满足支撑/压力与 MACD+布林轨共振。`,
    detail: `支撑 ${formatTechnicalValue(support)}，压力 ${formatTechnicalValue(
      resistance
    )}，布林中轨 ${formatTechnicalValue(bollingerMiddle)}。`,
    ...baseSignalMetrics
  };
}

function getSignalActionClass(action: TechnicalSignalAction): string {
  if (action === "buy") {
    return "ashare-signal-buy";
  }

  if (action === "sell") {
    return "ashare-signal-sell";
  }

  return "ashare-signal-watch";
}

function getSignalActionLabel(action: TechnicalSignalAction): string {
  if (action === "buy") {
    return "买入观察";
  }

  if (action === "sell") {
    return "卖出观察";
  }

  return "等待确认";
}

function compareSignalRows(
  left: { fund: FundWithSector; signal: TechnicalSignal },
  right: { fund: FundWithSector; signal: TechnicalSignal },
  sortMode: FundSortMode
): number {
  if (sortMode === "month") {
    return right.fund.trends.month.changePercent - left.fund.trends.month.changePercent;
  }

  if (sortMode === "year") {
    return right.fund.trends.year.changePercent - left.fund.trends.year.changePercent;
  }

  if (sortMode === "name") {
    return left.fund.name.localeCompare(right.fund.name, "zh-CN");
  }

  const actionWeight: Record<TechnicalSignalAction, number> = {
    buy: 3,
    sell: 2,
    watch: 1
  };

  return (
    actionWeight[right.signal.action] - actionWeight[left.signal.action] ||
    right.signal.score - left.signal.score ||
    getFundScore(right.fund) - getFundScore(left.fund)
  );
}

function getPrimaryChecks(signal: TechnicalSignal): TechnicalSignalCheck[] {
  if (signal.action === "sell") {
    return signal.sellChecks;
  }

  return signal.buyChecks;
}

function getSecondaryChecks(signal: TechnicalSignal): TechnicalSignalCheck[] {
  if (signal.action === "sell") {
    return signal.buyChecks;
  }

  return signal.sellChecks;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getSignalWidthStyle(percent: number): CSSProperties {
  return {
    ["--signal-width" as string]: `${percent}%`
  } as CSSProperties;
}

export function AShareSectorFundsPage() {
  const [marketDataState, setMarketDataState] =
    useState<AShareMarketDataState>(initialMarketDataState);
  const [activeSectorId, setActiveSectorId] = useState(allSectorId);
  const [activeSubfield, setActiveSubfield] = useState(allSubfieldId);
  const [activeSignalFilter, setActiveSignalFilter] =
    useState<TechnicalSignalFilter>(allSignalFilterId);
  const [fundSortMode, setFundSortMode] = useState<FundSortMode>("signal");
  const [technicalSignalConfig, setTechnicalSignalConfig] = useState<TechnicalSignalConfig>(
    defaultTechnicalSignalConfig
  );

  useEffect(() => {
    const controller = new AbortController();

    setMarketDataState((currentState) => ({
      ...currentState,
      status: "loading",
      errorMessage: null
    }));

    fetchAshareSectorFundsWithMarketData(controller.signal)
      .then((nextState) => setMarketDataState(nextState))
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setMarketDataState({
          ...initialMarketDataState,
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "真实行情加载失败，已使用本地降级数据"
        });
      });

    return () => controller.abort();
  }, []);
  const updateTechnicalSignalConfig = (
    key: keyof TechnicalSignalConfig,
    value: number
  ) => {
    setTechnicalSignalConfig((currentConfig) => {
      const nextConfig = {
        ...currentConfig,
        [key]: value
      };

      nextConfig.supportLookback = Math.round(
        clampNumber(nextConfig.supportLookback, 3, 12)
      );
      nextConfig.resistanceLookback = Math.round(
        clampNumber(nextConfig.resistanceLookback, 3, 12)
      );
      nextConfig.supportTolerancePercent = clampNumber(
        nextConfig.supportTolerancePercent,
        0.5,
        5
      );
      nextConfig.resistanceTolerancePercent = clampNumber(
        nextConfig.resistanceTolerancePercent,
        0.5,
        5
      );
      nextConfig.bollingerPeriod = Math.round(
        clampNumber(nextConfig.bollingerPeriod, 3, 12)
      );
      nextConfig.bollingerDeviation = clampNumber(
        nextConfig.bollingerDeviation,
        1.2,
        2.5
      );
      nextConfig.macdFastPeriod = Math.round(
        clampNumber(nextConfig.macdFastPeriod, 2, 8)
      );
      nextConfig.macdSlowPeriod = Math.round(
        clampNumber(
          Math.max(nextConfig.macdSlowPeriod, nextConfig.macdFastPeriod + 1),
          3,
          12
        )
      );
      nextConfig.macdSignalPeriod = Math.round(
        clampNumber(nextConfig.macdSignalPeriod, 2, 8)
      );

      return nextConfig;
    });
  };
  const marketSectors = marketDataState.sectors;
  const marketDataLabel =
    marketDataState.status === "success"
      ? marketDataState.cachedFundCount > 0 && marketDataState.liveFundCount === 0
        ? "缓存真实行情"
        : marketDataState.cachedFundCount > 0
          ? `真实+缓存 ${marketDataState.liveFundCount}/${marketDataState.totalFundCount}`
          : "真实行情"
      : marketDataState.status === "partial"
        ? `部分真实行情 ${marketDataState.loadedFundCount}/${marketDataState.totalFundCount}`
        : marketDataState.status === "loading"
          ? "真实行情加载中"
          : "本地降级数据";
  const marketDataNote =
    marketDataState.status === "success" || marketDataState.status === "partial"
      ? `已接入新浪财经 ETF 日 K，实时 ${marketDataState.liveFundCount} 只，缓存 ${marketDataState.cachedFundCount} 只，降级 ${marketDataState.fallbackFundCount} 只；最近刷新 ${formatMarketUpdatedAt(marketDataState.updatedAt)}。${
          marketDataState.qualityWarnings.length > 0
            ? ` 数据质量提示：${marketDataState.qualityWarnings.slice(0, 2).join("；")}。`
            : ""
        }`
      : marketDataState.status === "loading"
        ? "正在从新浪财经拉取 ETF 真实日 K，完成后会自动刷新周线、月线和近一年走势。"
        : `${ashareFundDataNote}；真实行情暂不可用：${marketDataState.errorMessage ?? "网络或接口异常"}`;
  const selectedSectors = useMemo(() => {
    if (activeSectorId === allSectorId) {
      return marketSectors;
    }

    return marketSectors.filter((sector) => sector.id === activeSectorId);
  }, [activeSectorId, marketSectors]);

  const subfieldOptions = useMemo(() => {
    const subfields = selectedSectors.flatMap((sector) =>
      sector.funds.map((fund) => fund.subfield)
    );

    return Array.from(new Set(subfields)).sort((left, right) =>
      left.localeCompare(right, "zh-CN")
    );
  }, [selectedSectors]);

  const visibleFunds = useMemo(() => {
    return selectedSectors
      .flatMap((sector) =>
        sector.funds.map((fund) => ({
          ...fund,
          sectorName: sector.name,
          sectorTone: sector.tone
        }))
      )
      .filter((fund) => activeSubfield === allSubfieldId || fund.subfield === activeSubfield)
      .sort((left, right) => getFundScore(right) - getFundScore(left));
  }, [activeSubfield, selectedSectors]);
  const technicalSignalRows = useMemo(() => {
    return visibleFunds
      .map((fund) => ({
        fund,
        signal: getTechnicalSignal(fund, technicalSignalConfig)
      }))
      .sort((left, right) => compareSignalRows(left, right, fundSortMode));
  }, [fundSortMode, technicalSignalConfig, visibleFunds]);
  const technicalSignalMap = useMemo(() => {
    return new Map(
      technicalSignalRows.map((item) => [
        `${item.fund.exchange}-${item.fund.code}`,
        item.signal
      ])
    );
  }, [technicalSignalRows]);
  const activeTechnicalSignals = technicalSignalRows.filter(
    (item) => item.signal.action !== "watch"
  );
  const buySignalCount = activeTechnicalSignals.filter(
    (item) => item.signal.action === "buy"
  ).length;
  const sellSignalCount = activeTechnicalSignals.filter(
    (item) => item.signal.action === "sell"
  ).length;
  const watchSignalCount = technicalSignalRows.filter(
    (item) => item.signal.action === "watch"
  ).length;
  const displayedTechnicalSignalRows = technicalSignalRows.filter(
    (item) => activeSignalFilter === allSignalFilterId || item.signal.action === activeSignalFilter
  );
  const displayedFundKeys = new Set(
    displayedTechnicalSignalRows.map((item) => `${item.fund.exchange}-${item.fund.code}`)
  );
  const displayedFunds = visibleFunds.filter((fund) =>
    displayedFundKeys.has(`${fund.exchange}-${fund.code}`)
  );
  const topBuySignal = technicalSignalRows.find((item) => item.signal.action === "buy") ?? null;
  const topSellSignal = technicalSignalRows.find((item) => item.signal.action === "sell") ?? null;
  const topWatchSignal = technicalSignalRows.find((item) => item.signal.action === "watch") ?? null;
  const signalFocus =
    topBuySignal ??
    topSellSignal ??
    topWatchSignal ??
    technicalSignalRows[0] ??
    null;
  const signalTotal = Math.max(technicalSignalRows.length, 1);
  const signalDistribution = [
    {
      id: "buy" as const,
      label: "买入观察",
      count: buySignalCount,
      percent: (buySignalCount / signalTotal) * 100
    },
    {
      id: "sell" as const,
      label: "卖出观察",
      count: sellSignalCount,
      percent: (sellSignalCount / signalTotal) * 100
    },
    {
      id: "watch" as const,
      label: "等待确认",
      count: watchSignalCount,
      percent: (watchSignalCount / signalTotal) * 100
    }
  ];

  const totalFundCount = marketSectors.reduce(
    (count, sector) => count + sector.funds.length,
    0
  );
  const allSubfields = new Set(
    marketSectors.flatMap((sector) => sector.funds.map((fund) => fund.subfield))
  );
  const positiveYearCount = marketSectors
    .flatMap((sector) => sector.funds)
    .filter((fund) => fund.trends.year.changePercent > 0).length;
  const strongestFund = [...visibleFunds].sort(
    (left, right) => right.trends.month.changePercent - left.trends.month.changePercent
  )[0];
  const selectedSectorLabel =
    activeSectorId === allSectorId
      ? "全市场板块"
      : marketSectors.find((sector) => sector.id === activeSectorId)?.name ?? "全市场板块";

  return (
    <div className="page-content ashare-page">
      <div className="topbar">
        <div>
          <p className="eyebrow">A-Share Sector Funds</p>
          <h2>A 股板块指数基金图谱</h2>
          <p className="topbar-copy">
            按板块和细分领域整理 A 股指数类代表基金，消费板块细分到
            <strong>白酒、食品饮料、主要消费、家电</strong>，每只基金都展示周线、月线、近一年走势。
          </p>
        </div>
        <div className="topbar-status-group">
          <span className="status-chip">
            <span className="status-dot" />
            {marketDataLabel}
          </span>
          <div className="topbar-mini-pills">
            <span className="topbar-mini-pill">周线</span>
            <span className="topbar-mini-pill">月线</span>
            <span className="topbar-mini-pill">{formatMarketUpdatedAt(marketDataState.updatedAt)}</span>
          </div>
        </div>
      </div>

      <section className="hero-panel ashare-hero-panel">
        <div>
          <p className="eyebrow">Sector Map</p>
          <h3>从板块到细分赛道，再落到代表 ETF</h3>
          <p className="hero-copy">
            页面采用“板块 → 细分领域 → 指数基金 → 三周期走势”的层级，
            方便快速比较白酒、半导体、创新药、新能源车、券商、红利等方向。
            当前走势优先使用新浪财经 ETF 日 K 真实行情，接口异常时会自动降级到本地样本。
          </p>
          <div className="ashare-sector-switch" aria-label="A 股板块筛选">
            <button
              type="button"
              className={
                activeSectorId === allSectorId
                  ? "symbol-chip symbol-chip-active"
                  : "symbol-chip"
              }
              onClick={() => {
                setActiveSectorId(allSectorId);
                setActiveSubfield(allSubfieldId);
              }}
            >
              <strong>全部板块</strong>
              <span>{totalFundCount} 只代表基金</span>
            </button>
            {marketSectors.map((sector) => (
              <button
                key={sector.id}
                type="button"
                className={
                  activeSectorId === sector.id
                    ? "symbol-chip symbol-chip-active"
                    : "symbol-chip"
                }
                onClick={() => {
                  setActiveSectorId(sector.id);
                  setActiveSubfield(allSubfieldId);
                }}
              >
                <strong>{sector.shortName}</strong>
                <span>{sector.heatLabel}</span>
              </button>
            ))}
          </div>
        </div>
        <aside className="hero-badge ashare-hero-badge">
          <span>当前范围</span>
          <strong>{selectedSectorLabel}</strong>
          <small>{visibleFunds.length} 只代表基金 / {subfieldOptions.length} 个细分领域</small>
        </aside>
      </section>

      <section className="stats-grid">
        <StatCard
          label="覆盖板块"
          value={`${marketSectors.length}`}
          detail="宽基、消费、医药、科技、新能源、金融、周期、制造、公用、农业"
          trend="neutral"
        />
        <StatCard
          label="代表基金"
          value={`${totalFundCount}`}
          detail={`${allSubfields.size} 个细分领域，优先选择行业/主题 ETF`}
          trend="up"
        />
        <StatCard
          label="买入观察"
          value={`${buySignalCount}`}
          detail="下跌接近支撑 + MACD 修复 + 布林下轨共振"
          trend={buySignalCount > 0 ? "up" : "neutral"}
        />
        <StatCard
          label="卖出观察"
          value={`${sellSignalCount}`}
          detail="上涨接近压力 + MACD 降温 + 布林上轨共振"
          trend={sellSignalCount > 0 ? "down" : "neutral"}
        />
      </section>

      <section className="panel ashare-signal-panel">
        <SectionHeader
          eyebrow="Technical Signals"
          title="支撑位买入 / 压力位卖出提示"
          description="用近一年真实月 K 相对走势计算支撑压力、MACD 与布林轨；只有价格位置和技术动能同时满足时才进入买入/卖出观察列表。"
        />
        <div className="ashare-signal-command-center">
          <article className={`ashare-signal-focus-card ${
            signalFocus ? getSignalActionClass(signalFocus.signal.action) : "ashare-signal-watch"
          }`}>
            <div className="ashare-signal-focus-copy">
              <span>当前最该关注</span>
              <h4>{signalFocus ? signalFocus.fund.name : "暂无基金"}</h4>
              <p>
                {signalFocus
                  ? `${getSignalActionLabel(signalFocus.signal.action)} · ${signalFocus.fund.sectorName} / ${signalFocus.fund.subfield}`
                  : "当前筛选范围暂无可展示信号"}
              </p>
            </div>
            <div className="ashare-signal-focus-score">
              <span>Score</span>
              <strong>{signalFocus ? signalFocus.signal.score : "--"}</strong>
            </div>
            {signalFocus ? (
              <div className="ashare-signal-focus-next">
                <span>下一步</span>
                <p>{signalFocus.signal.summary}</p>
              </div>
            ) : null}
          </article>

          <article className="ashare-signal-distribution-card">
            <div className="ashare-signal-distribution-head">
              <span>信号分布</span>
              <strong>{technicalSignalRows.length} 只基金</strong>
            </div>
            <div className="ashare-signal-distribution-bars">
              {signalDistribution.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`ashare-signal-distribution-item ${getSignalActionClass(item.id)}`}
                  onClick={() => setActiveSignalFilter(item.id)}
                >
                  <span>
                    {item.label}
                    <b>{item.count}</b>
                  </span>
                  <i style={getSignalWidthStyle(item.percent)} />
                </button>
              ))}
            </div>
          </article>
        </div>
        <div className="ashare-signal-filter-row" aria-label="技术信号筛选">
          <div className="ashare-signal-filter-group">
            <span>信号筛选</span>
            {[
              { id: "all" as const, label: "全部", count: technicalSignalRows.length },
              { id: "buy" as const, label: "买入观察", count: buySignalCount },
              { id: "sell" as const, label: "卖出观察", count: sellSignalCount },
              { id: "watch" as const, label: "等待确认", count: watchSignalCount }
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={
                  activeSignalFilter === filter.id
                    ? "time-chip time-chip-active"
                    : "time-chip"
                }
                onClick={() => setActiveSignalFilter(filter.id)}
              >
                {filter.label} · {filter.count}
              </button>
            ))}
          </div>
          <div className="ashare-signal-filter-group">
            <span>排序</span>
            {fundSortOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={fundSortMode === option.id ? "time-chip time-chip-active" : "time-chip"}
                onClick={() => setFundSortMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ashare-signal-config-panel">
          <div className="ashare-signal-config-head">
            <div>
              <p className="eyebrow">Rule Tuning</p>
              <h4>信号参数配置</h4>
              <p className="muted">
                参数越宽松，提示数量越多；参数越严格，信号更少但共振质量更高。
              </p>
            </div>
            <button
              type="button"
              className="action-button action-button-ghost"
              onClick={() => setTechnicalSignalConfig(defaultTechnicalSignalConfig)}
            >
              恢复默认
            </button>
          </div>

          <div className="ashare-signal-config-grid">
            <label className="ashare-config-field">
              <span>支撑容忍度</span>
              <strong>{technicalSignalConfig.supportTolerancePercent.toFixed(1)}%</strong>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.1"
                value={technicalSignalConfig.supportTolerancePercent}
                onChange={(event) =>
                  updateTechnicalSignalConfig(
                    "supportTolerancePercent",
                    Number(event.currentTarget.value)
                  )
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>压力容忍度</span>
              <strong>{technicalSignalConfig.resistanceTolerancePercent.toFixed(1)}%</strong>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.1"
                value={technicalSignalConfig.resistanceTolerancePercent}
                onChange={(event) =>
                  updateTechnicalSignalConfig(
                    "resistanceTolerancePercent",
                    Number(event.currentTarget.value)
                  )
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>支撑回看</span>
              <strong>{technicalSignalConfig.supportLookback}M</strong>
              <input
                type="range"
                min="3"
                max="12"
                step="1"
                value={technicalSignalConfig.supportLookback}
                onChange={(event) =>
                  updateTechnicalSignalConfig("supportLookback", Number(event.currentTarget.value))
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>压力回看</span>
              <strong>{technicalSignalConfig.resistanceLookback}M</strong>
              <input
                type="range"
                min="3"
                max="12"
                step="1"
                value={technicalSignalConfig.resistanceLookback}
                onChange={(event) =>
                  updateTechnicalSignalConfig(
                    "resistanceLookback",
                    Number(event.currentTarget.value)
                  )
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>BOLL 周期</span>
              <strong>{technicalSignalConfig.bollingerPeriod}M</strong>
              <input
                type="range"
                min="3"
                max="12"
                step="1"
                value={technicalSignalConfig.bollingerPeriod}
                onChange={(event) =>
                  updateTechnicalSignalConfig("bollingerPeriod", Number(event.currentTarget.value))
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>BOLL 倍数</span>
              <strong>{technicalSignalConfig.bollingerDeviation.toFixed(1)}</strong>
              <input
                type="range"
                min="1.2"
                max="2.5"
                step="0.1"
                value={technicalSignalConfig.bollingerDeviation}
                onChange={(event) =>
                  updateTechnicalSignalConfig(
                    "bollingerDeviation",
                    Number(event.currentTarget.value)
                  )
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>MACD 快线</span>
              <strong>{technicalSignalConfig.macdFastPeriod}M</strong>
              <input
                type="range"
                min="2"
                max="8"
                step="1"
                value={technicalSignalConfig.macdFastPeriod}
                onChange={(event) =>
                  updateTechnicalSignalConfig("macdFastPeriod", Number(event.currentTarget.value))
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>MACD 慢线</span>
              <strong>{technicalSignalConfig.macdSlowPeriod}M</strong>
              <input
                type="range"
                min="3"
                max="12"
                step="1"
                value={technicalSignalConfig.macdSlowPeriod}
                onChange={(event) =>
                  updateTechnicalSignalConfig("macdSlowPeriod", Number(event.currentTarget.value))
                }
              />
            </label>
            <label className="ashare-config-field">
              <span>MACD 信号线</span>
              <strong>{technicalSignalConfig.macdSignalPeriod}M</strong>
              <input
                type="range"
                min="2"
                max="8"
                step="1"
                value={technicalSignalConfig.macdSignalPeriod}
                onChange={(event) =>
                  updateTechnicalSignalConfig("macdSignalPeriod", Number(event.currentTarget.value))
                }
              />
            </label>
          </div>
        </div>
        <div className="ashare-signal-rule-grid">
          <article>
            <span>买入观察规则</span>
            <strong>下跌接近支撑 + 布林下轨 + MACD 修复</strong>
            <p>
              距支撑不超过 {technicalSignalConfig.supportTolerancePercent}%；
              当前值贴近布林下轨；MACD 柱状图改善或衰减收敛。
            </p>
          </article>
          <article>
            <span>卖出观察规则</span>
            <strong>上涨接近压力 + 布林上轨 + MACD 降温</strong>
            <p>
              距压力不超过 {technicalSignalConfig.resistanceTolerancePercent}%；
              当前值贴近布林上轨；MACD 柱状图转弱或快线低于信号线。
            </p>
          </article>
          <article>
            <span>参数配置</span>
            <strong>
              MACD {technicalSignalConfig.macdFastPeriod}/
              {technicalSignalConfig.macdSlowPeriod}/
              {technicalSignalConfig.macdSignalPeriod} · BOLL {technicalSignalConfig.bollingerPeriod}M
            </strong>
            <p>
              支撑/压力回看 {technicalSignalConfig.supportLookback}M；
              布林轨倍数 {technicalSignalConfig.bollingerDeviation.toFixed(1)}。
            </p>
          </article>
        </div>

        {displayedTechnicalSignalRows.length > 0 ? (
          <div className="ashare-signal-grid">
            {displayedTechnicalSignalRows.map(({ fund, signal }) => (
              <Link
                key={`${fund.exchange}-${fund.code}-${signal.action}`}
                to={`/a-share-sector-funds/${fund.code}`}
                className={`ashare-signal-card ${getSignalActionClass(signal.action)}`}
              >
                <div className="ashare-signal-ribbon">{getSignalActionLabel(signal.action)}</div>
                <div className="ashare-signal-card-head">
                  <div>
                    <span>{getSignalActionLabel(signal.action)}</span>
                    <h4>{fund.name}</h4>
                    <p className="muted">
                      {fund.sectorName} · {fund.subfield} · {fund.code}
                    </p>
                  </div>
                  <strong>{signal.score}</strong>
                </div>
                <p className="ashare-signal-summary">{signal.summary}</p>
                <p className="ashare-signal-detail">{signal.detail}</p>
                <FundTechnicalSignalChart
                  values={fund.trends.year.series}
                  action={signal.action}
                  support={signal.support}
                  resistance={signal.resistance}
                  bollingerUpper={signal.bollingerUpper}
                  bollingerMiddle={signal.bollingerMiddle}
                  bollingerLower={signal.bollingerLower}
                />
                <div className="ashare-signal-metrics">
                  <span>支撑 {formatTechnicalValue(signal.support)}</span>
                  <span>压力 {formatTechnicalValue(signal.resistance)}</span>
                  <span>MACD {signal.macdHistogram.toFixed(2)}</span>
                  <span>
                    BOLL {formatTechnicalValue(signal.bollingerLower)} /{" "}
                    {formatTechnicalValue(signal.bollingerUpper)}
                  </span>
                </div>
                <div className="ashare-check-grid">
                  {getPrimaryChecks(signal).map((check) => (
                    <span
                      key={check.id}
                      className={check.passed ? "ashare-check-pass" : "ashare-check-fail"}
                      title={check.detail}
                    >
                    {check.passed ? "✓" : "×"} {check.label}
                  </span>
                  ))}
                </div>
                <span className="action-button ashare-detail-link">
                  查看详情大图
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="ashare-signal-empty">
            <strong>当前筛选范围暂无买卖共振信号</strong>
            <p className="muted">
              说明当前基金没有同时触达支撑/压力、布林轨和 MACD 条件；可以切换板块或等待下一次净值更新。
            </p>
          </div>
        )}
      </section>

      <section className="content-grid two-columns ashare-main-grid">
        <div className="panel accent-panel">
          <SectionHeader
            eyebrow="Subfields"
            title="细分领域筛选"
            description="按选定板块动态收敛细分方向；消费板块可直接切到白酒、食品饮料、主要消费、家电。"
          />
          <div className="ashare-subfield-grid">
            <button
              type="button"
              className={
                activeSubfield === allSubfieldId
                  ? "time-chip time-chip-active"
                  : "time-chip"
              }
              onClick={() => setActiveSubfield(allSubfieldId)}
            >
              全部细分
            </button>
            {subfieldOptions.map((subfield) => (
              <button
                key={subfield}
                type="button"
                className={
                  activeSubfield === subfield
                    ? "time-chip time-chip-active"
                    : "time-chip"
                }
                onClick={() => setActiveSubfield(subfield)}
              >
                {subfield}
              </button>
            ))}
          </div>
        </div>

        <div className="panel ashare-note-panel">
          <SectionHeader
            eyebrow="Read Me"
            title="走势口径说明"
            description="每只基金统一展示周线、月线、近一年三个周期；真实行情使用交易所 ETF K 线并统一换算为相对走势。"
          />
          <div className="ashare-period-legend">
            {fundTrendPeriods.map((period) => (
              <span key={period.id}>
                <b>{period.shortLabel}</b>
                {period.label}
              </span>
            ))}
          </div>
          <p className="ashare-data-note">{marketDataNote}</p>
        </div>
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Representative Funds"
          title="板块指数类代表基金"
          description={`按综合动量排序：近一年权重 40%，月线 35%，周线 25%；当前展示 ${displayedFunds.length} / ${visibleFunds.length} 只基金。`}
        />
        <div className="ashare-fund-grid">
          {displayedFunds.map((fund) => {
            const dominantPeriod = getDominantPeriod(fund);
            const dominantLabel =
              fundTrendPeriods.find((period) => period.id === dominantPeriod)?.label ?? "周线";
            const technicalSignal =
              technicalSignalMap.get(`${fund.exchange}-${fund.code}`) ??
              getTechnicalSignal(fund, technicalSignalConfig);

            return (
              <Link
                key={`${fund.exchange}-${fund.code}`}
                to={`/a-share-sector-funds/${fund.code}`}
                className="ashare-fund-card"
              >
                <div className="ashare-fund-head">
                  <div>
                    <span className="pill">{fund.sectorName}</span>
                    <h4>{fund.name}</h4>
                    <p className="muted">
                      {fund.exchange} · {fund.code} · {fund.provider}
                    </p>
                  </div>
                  <div className="ashare-fund-score">
                    <span>{dominantLabel}</span>
                    <strong className={getTrendClassName(fund.trends[dominantPeriod].changePercent)}>
                      {formatSignedPercent(fund.trends[dominantPeriod].changePercent)}
                    </strong>
                  </div>
                </div>

                <div className="ashare-fund-meta">
                  <div>
                    <span>细分领域</span>
                    <strong>{fund.subfield}</strong>
                  </div>
                  <div>
                    <span>跟踪指数</span>
                    <strong>{fund.indexName}</strong>
                  </div>
                </div>

                <p className="ashare-fund-focus">{fund.focus}</p>

                <div className={`ashare-fund-tech ${getSignalActionClass(technicalSignal.action)}`}>
                  <div>
                    <span>{technicalSignal.title}</span>
                    <strong>{getSignalActionLabel(technicalSignal.action)}</strong>
                  </div>
                  <p>{technicalSignal.detail}</p>
                  <FundTechnicalSignalChart
                    values={fund.trends.year.series}
                    action={technicalSignal.action}
                    support={technicalSignal.support}
                    resistance={technicalSignal.resistance}
                    bollingerUpper={technicalSignal.bollingerUpper}
                    bollingerMiddle={technicalSignal.bollingerMiddle}
                    bollingerLower={technicalSignal.bollingerLower}
                  />
                  <div className="ashare-fund-tech-strip">
                    <span>支撑 {formatTechnicalValue(technicalSignal.support)}</span>
                    <span>压力 {formatTechnicalValue(technicalSignal.resistance)}</span>
                    <span>MACD {technicalSignal.macdHistogram.toFixed(2)}</span>
                    <span>BOLL 中轨 {formatTechnicalValue(technicalSignal.bollingerMiddle)}</span>
                  </div>
                  <div className="ashare-check-grid">
                    {getPrimaryChecks(technicalSignal).map((check) => (
                      <span
                        key={check.id}
                        className={check.passed ? "ashare-check-pass" : "ashare-check-fail"}
                        title={check.detail}
                      >
                        {check.passed ? "✓" : "×"} {check.label}
                      </span>
                    ))}
                  </div>
                  {technicalSignal.action === "watch" ? (
                    <div className="ashare-check-details">
                      <span className="ashare-check-details-title">卖出条件观察</span>
                      <div className="ashare-check-grid">
                        {getSecondaryChecks(technicalSignal).map((check) => (
                          <span
                            key={check.id}
                            className={check.passed ? "ashare-check-pass" : "ashare-check-fail"}
                            title={check.detail}
                          >
                            {check.passed ? "✓" : "×"} {check.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <span className="action-button ashare-detail-link">
                    打开详情页
                  </span>
                </div>

                <div className="ashare-trend-grid">
                  {fundTrendPeriods.map((period) => {
                    const trend = fund.trends[period.id];

                    return (
                      <div key={period.id} className="ashare-trend-card">
                        <div className="ashare-trend-card-head">
                          <span>{period.label}</span>
                          <strong className={getTrendClassName(trend.changePercent)}>
                            {formatSignedPercent(trend.changePercent)}
                          </strong>
                        </div>
                        <FundTrendSparkline
                          values={trend.series}
                          changePercent={trend.changePercent}
                        />
                        <p>{trend.signal}</p>
                      </div>
                    );
                  })}
                </div>

                <p className="ashare-risk-note">
                  <span>Risk</span>
                  {fund.riskNote}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
