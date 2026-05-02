import { hkSectorFunds, type HkSectorFund } from "../data/hkSectorFunds";

export type TechnicalSignalAction = "buy" | "sell" | "watch";

export type FundDetailPeriod = "day" | "week" | "month" | "year";

export type TechnicalSignalConfig = {
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

export type TechnicalSignalCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type TechnicalSignal = {
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

export type FundWithSector = HkSectorFund & {
  sectorName: string;
  sectorTone: string;
};

export const defaultTechnicalSignalConfig: TechnicalSignalConfig = {
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

export function getAllHkFunds(): FundWithSector[] {
  return hkSectorFunds.flatMap((sector) =>
    sector.funds.map((fund) => ({
      ...fund,
      sectorName: sector.name,
      sectorTone: sector.tone
    }))
  );
}

export function findHkFundByCode(code: string | undefined): FundWithSector | null {
  if (!code) {
    return null;
  }

  return getAllHkFunds().find((fund) => fund.code === code) ?? null;
}

export function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatTechnicalValue(value: number): string {
  return value.toFixed(1);
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

function isWaitingForMarketData(fund: { trends: Record<string, { signal: string; changePercent: number; series: number[] }> }): boolean {
  return Object.values(fund.trends).every(
    (trend) =>
      trend.signal.includes("等待真实行情") ||
      (trend.changePercent === 0 && trend.series.every((value) => value === 100))
  );
}

function buildWaitingSignal(fund: { name: string }, values: number[]): TechnicalSignal {
  const currentValue = values[values.length - 1] ?? 100;
  const waitingChecks: TechnicalSignalCheck[] = [
    {
      id: "waiting-market-data",
      label: "等待真实行情",
      passed: false,
      detail: "真实 K 线或缓存真实行情返回后再计算"
    }
  ];

  return {
    action: "watch",
    score: 0,
    title: "等待真实行情",
    summary: `${fund.name} 当前没有真实或缓存 K 线，不生成买入/卖出观察。`,
    detail: "页面仅展示中性基线；接入真实行情后才会计算支撑位、压力位、MACD 与布林轨。",
    currentValue,
    support: currentValue,
    resistance: currentValue,
    macd: 0,
    macdSignal: 0,
    macdHistogram: 0,
    bollingerUpper: currentValue,
    bollingerMiddle: currentValue,
    bollingerLower: currentValue,
    supportDistancePercent: 0,
    resistanceDistancePercent: 0,
    buyChecks: waitingChecks,
    sellChecks: waitingChecks
  };
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

export function buildPeriodSeries(fund: HkSectorFund, period: FundDetailPeriod): number[] {
  const yearSeries = fund.trends.year.series;
  const monthSeries = fund.trends.month.series;
  const weekSeries = fund.trends.week.series;

  if (period === "year") {
    return yearSeries;
  }

  if (period === "month") {
    return monthSeries;
  }

  if (period === "week") {
    return weekSeries;
  }

  if (isWaitingForMarketData(fund)) {
    return Array.from({ length: 20 }, () => 100);
  }

  const latestWeek = weekSeries.slice(-5);
  const start = latestWeek[0] ?? 100;

  return Array.from({ length: 20 }, (_, index) => {
    const anchorIndex = Math.min(
      Math.floor((index / 19) * Math.max(latestWeek.length - 1, 1)),
      latestWeek.length - 1
    );
    const anchorValue = latestWeek[anchorIndex] ?? start;
    const wave = Math.sin(index * 0.9) * 0.28 + Math.cos(index * 0.43) * 0.16;
    return Number((anchorValue + wave).toFixed(2));
  });
}

export function getTechnicalSignalFromValues(
  fund: FundWithSector,
  values: number[],
  config: TechnicalSignalConfig
): TechnicalSignal {
  if (isWaitingForMarketData(fund)) {
    return buildWaitingSignal(fund, values);
  }

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

export function getTechnicalSignal(
  fund: FundWithSector,
  config: TechnicalSignalConfig
): TechnicalSignal {
  return getTechnicalSignalFromValues(fund, fund.trends.year.series, config);
}
