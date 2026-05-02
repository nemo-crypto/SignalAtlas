import {
  hkSectorFunds,
  type HkSector,
  type HkFundMarketSnapshot,
  type HkSectorFund,
  type HkFundTrend
} from "../data/hkSectorFunds";

export type HkMarketDataStatus = "idle" | "loading" | "success" | "partial" | "error";
export type HkMarketDataSource = "live" | "cache" | "fallback";

export type HkMarketDataState = {
  sectors: HkSector[];
  status: HkMarketDataStatus;
  loadedFundCount: number;
  liveFundCount: number;
  cachedFundCount: number;
  fallbackFundCount: number;
  totalFundCount: number;
  errorMessage: string | null;
  qualityWarnings: string[];
  updatedAt: string | null;
};

type MarketKline = {
  date: string;
  close: number;
};

type TencentKlineRow = [string, string, string, string, string, string?, ...string[]];

type TencentKlinePayload = {
  code?: number;
  msg?: string;
  data?: Record<
    string,
    {
      day?: TencentKlineRow[];
      qfqday?: TencentKlineRow[];
    }
  >;
};

type CachedKlinePayload = {
  version: 1;
  source: "tencent";
  fetchedAt: string;
  latestDate: string;
  klines: MarketKline[];
};

type KlineResult = {
  klines: MarketKline[];
  source: Exclude<HkMarketDataSource, "fallback">;
  updatedAt: string;
  warning: string | null;
  snapshot: HkFundMarketSnapshot;
};

type HydratedFundResult<TFund extends HkSectorFund> = {
  fund: TFund;
  source: Exclude<HkMarketDataSource, "fallback">;
  updatedAt: string;
  warning: string | null;
};

const tencentKlineEndpoint = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const cacheVersion = 1;
const cacheMaxAgeMs = 1000 * 60 * 60 * 18;

function getTencentSymbol(fund: HkSectorFund): string {
  return `hk${fund.code}`;
}

function getFundCacheKey(fund: HkSectorFund): string {
  return `hk-fund-kline:v${cacheVersion}:${fund.exchange}:${fund.code}`;
}

function getCacheStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isMarketKline(value: unknown): value is MarketKline {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as MarketKline;
  return (
    typeof item.date === "string" &&
    Number.isFinite(item.close) &&
    item.close > 0
  );
}

function readCachedKlines(fund: HkSectorFund): KlineResult | null {
  const storage = getCacheStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawPayload = storage.getItem(getFundCacheKey(fund));

    if (!rawPayload) {
      return null;
    }

    const payload = JSON.parse(rawPayload) as CachedKlinePayload;
    const fetchedAtMs = new Date(payload.fetchedAt).getTime();
    const isFresh =
      payload.version === cacheVersion &&
      payload.source === "tencent" &&
      Number.isFinite(fetchedAtMs) &&
      Date.now() - fetchedAtMs <= cacheMaxAgeMs &&
      Array.isArray(payload.klines) &&
      payload.klines.every(isMarketKline);

    if (!isFresh) {
      return null;
    }

    return {
      klines: payload.klines,
      source: "cache",
      updatedAt: payload.fetchedAt,
      warning: `${fund.code} 使用最近一次港股真实行情缓存，最新交易日 ${payload.latestDate}`,
      snapshot: buildMarketSnapshot(payload.klines, "cache", payload.fetchedAt)
    };
  } catch {
    return null;
  }
}

function writeCachedKlines(fund: HkSectorFund, klines: MarketKline[], fetchedAt: string) {
  const storage = getCacheStorage();
  const latestDate = klines[klines.length - 1]?.date;

  if (!storage || !latestDate) {
    return;
  }

  const payload: CachedKlinePayload = {
    version: cacheVersion,
    source: "tencent",
    fetchedAt,
    latestDate,
    klines
  };

  try {
    storage.setItem(getFundCacheKey(fund), JSON.stringify(payload));
  } catch {
    // 缓存失败不影响当前港股真实行情展示。
  }
}

function buildMarketSnapshot(
  klines: MarketKline[],
  source: Exclude<HkMarketDataSource, "fallback">,
  updatedAt: string
): HkFundMarketSnapshot {
  const latestKline = klines[klines.length - 1];

  return {
    source,
    latestDate: latestKline?.date ?? null,
    latestClose: latestKline?.close ?? null,
    sampleCount: klines.length,
    updatedAt
  };
}

function pickMonthEndKlines(klines: MarketKline[]): MarketKline[] {
  const monthEndMap = new Map<string, MarketKline>();

  klines.forEach((item) => {
    monthEndMap.set(item.date.slice(0, 7), item);
  });

  return Array.from(monthEndMap.values()).slice(-12);
}

function getKlineQualityWarning(fund: HkSectorFund, klines: MarketKline[]): string | null {
  if (klines.length < 22) {
    return `${fund.code} 港股真实 K 线不足 22 个交易日`;
  }

  const latestKline = klines[klines.length - 1];
  const latestTime = new Date(`${latestKline.date}T16:10:00+08:00`).getTime();

  if (!Number.isFinite(latestTime)) {
    return `${fund.code} 最新交易日格式异常`;
  }

  const staleDays = (Date.now() - latestTime) / (1000 * 60 * 60 * 24);

  if (staleDays > 14) {
    return `${fund.code} 最新交易日 ${latestKline.date} 距今超过 14 天`;
  }

  if (pickMonthEndKlines(klines).length < 8) {
    return `${fund.code} 近一年月末 K 线不足 8 个`;
  }

  return null;
}

function buildTencentKlineUrl(fund: HkSectorFund, limit: number): string {
  return `${tencentKlineEndpoint}?param=${getTencentSymbol(fund)},day,,,${limit},qfq`;
}

function parseTencentRows(rows: TencentKlineRow[] | undefined): MarketKline[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const date = row[0] ?? "";
      const close = Number(row[2]);

      if (!date || !Number.isFinite(close) || close <= 0) {
        return null;
      }

      return { date, close };
    })
    .filter((item): item is MarketKline => item !== null);
}

async function fetchLiveKlines(
  fund: HkSectorFund,
  limit: number,
  signal?: AbortSignal
): Promise<MarketKline[]> {
  const symbol = getTencentSymbol(fund);
  const response = await fetch(buildTencentKlineUrl(fund, limit), { signal });

  if (!response.ok) {
    throw new Error(`${fund.code} 港股行情请求失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TencentKlinePayload;

  if (payload.code !== 0) {
    throw new Error(`${fund.code} 港股行情返回异常：${payload.msg ?? "Tencent code not 0"}`);
  }

  const rows = payload.data?.[symbol]?.qfqday ?? payload.data?.[symbol]?.day;
  const klines = parseTencentRows(rows);

  if (klines.length === 0) {
    throw new Error(`${fund.code} 无可用港股 K 线数据`);
  }

  return klines;
}

async function fetchKlines(
  fund: HkSectorFund,
  limit: number,
  signal?: AbortSignal
): Promise<KlineResult> {
  try {
    const klines = await fetchLiveKlines(fund, limit, signal);
    const updatedAt = new Date().toISOString();
    writeCachedKlines(fund, klines, updatedAt);

    return {
      klines,
      source: "live",
      updatedAt,
      warning: getKlineQualityWarning(fund, klines),
      snapshot: buildMarketSnapshot(klines, "live", updatedAt)
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    const cachedResult = readCachedKlines(fund);

    if (cachedResult) {
      return cachedResult;
    }

    throw error;
  }
}

function normalizeSeries(klines: MarketKline[], fallback: number[]): number[] {
  if (klines.length === 0) {
    return fallback;
  }

  const latestClose = klines[klines.length - 1]?.close ?? 0;

  if (latestClose <= 0) {
    return fallback;
  }

  return klines.map((item) => Number(((item.close / latestClose) * 100).toFixed(2)));
}

function getChangePercent(klines: MarketKline[], fallback: number): number {
  if (klines.length < 2) {
    return fallback;
  }

  const firstClose = klines[0]?.close ?? 0;
  const latestClose = klines[klines.length - 1]?.close ?? 0;

  if (firstClose <= 0 || latestClose <= 0) {
    return fallback;
  }

  return Number((((latestClose - firstClose) / firstClose) * 100).toFixed(1));
}

function buildSignal(changePercent: number, periodName: string): string {
  if (changePercent >= 5) {
    return `${periodName}港股真实行情强势上行`;
  }

  if (changePercent >= 1) {
    return `${periodName}港股真实行情温和修复`;
  }

  if (changePercent <= -5) {
    return `${periodName}港股真实行情明显回撤`;
  }

  if (changePercent <= -1) {
    return `${periodName}港股真实行情震荡偏弱`;
  }

  return `${periodName}港股真实行情窄幅震荡`;
}

function buildTrend(
  klines: MarketKline[],
  fallback: HkFundTrend,
  periodName: string
): HkFundTrend {
  const series = normalizeSeries(klines, fallback.series);
  const changePercent = getChangePercent(klines, fallback.changePercent);

  return {
    changePercent,
    signal: buildSignal(changePercent, periodName),
    series
  };
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}

async function hydrateFundWithMarketData<TFund extends HkSectorFund>(
  fund: TFund,
  signal?: AbortSignal
): Promise<HydratedFundResult<TFund>> {
  const klineResult = await fetchKlines(fund, 260, signal);
  const dailyKlines = klineResult.klines;

  if (dailyKlines.length === 0) {
    throw new Error(`${fund.code} 无可用港股 K 线数据`);
  }

  const weekKlines = dailyKlines.slice(-5);
  const monthKlines = dailyKlines.slice(-22);
  const yearKlines = pickMonthEndKlines(dailyKlines);

  return {
    fund: {
      ...fund,
      market: klineResult.snapshot,
      trends: {
        week: buildTrend(weekKlines, fund.trends.week, "周线"),
        month: buildTrend(monthKlines, fund.trends.month, "月线"),
        year: buildTrend(yearKlines, fund.trends.year, "近一年")
      }
    },
    source: klineResult.source,
    updatedAt: klineResult.updatedAt,
    warning: klineResult.warning
  };
}

export async function fetchHkFundWithMarketData<TFund extends HkSectorFund>(
  fund: TFund,
  signal?: AbortSignal
): Promise<TFund> {
  return (await hydrateFundWithMarketData(fund, signal)).fund;
}

export async function fetchHkFundMarketSnapshot<TFund extends HkSectorFund>(
  fund: TFund,
  signal?: AbortSignal
): Promise<HydratedFundResult<TFund>> {
  return hydrateFundWithMarketData(fund, signal);
}

export async function fetchHkSectorFundsWithMarketData(
  signal?: AbortSignal
): Promise<HkMarketDataState> {
  const totalFundCount = hkSectorFunds.reduce(
    (count, sector) => count + sector.funds.length,
    0
  );
  let loadedFundCount = 0;
  let liveFundCount = 0;
  let cachedFundCount = 0;
  let firstError: string | null = null;
  const qualityWarnings: string[] = [];
  const hydratedFunds = new Map<string, HkSectorFund>();
  const fundItems = hkSectorFunds.flatMap((sector) =>
    sector.funds.map((fund) => ({
      fund,
      key: `${fund.exchange}-${fund.code}`
    }))
  );

  await mapWithConcurrency(fundItems, 6, async ({ fund, key }) => {
    try {
      const result = await hydrateFundWithMarketData(fund, signal);
      hydratedFunds.set(key, result.fund);
      loadedFundCount += 1;
      liveFundCount += result.source === "live" ? 1 : 0;
      cachedFundCount += result.source === "cache" ? 1 : 0;

      if (result.warning) {
        qualityWarnings.push(result.warning);
      }
    } catch (error) {
      firstError ??= error instanceof Error ? error.message : `${fund.code} 港股行情加载失败`;
    }
  });

  const sectors = hkSectorFunds.map((sector) => ({
    ...sector,
    funds: sector.funds.map(
      (fund) => hydratedFunds.get(`${fund.exchange}-${fund.code}`) ?? fund
    )
  }));

  return {
    sectors,
    status:
      loadedFundCount === totalFundCount
        ? "success"
        : loadedFundCount > 0
          ? "partial"
          : "error",
    loadedFundCount,
    liveFundCount,
    cachedFundCount,
    fallbackFundCount: totalFundCount - loadedFundCount,
    totalFundCount,
    errorMessage: firstError,
    qualityWarnings,
    updatedAt: loadedFundCount > 0 ? new Date().toISOString() : null
  };
}

export async function fetchHkFundDetailSeries(
  fund: HkSectorFund,
  signal?: AbortSignal
): Promise<{
  day: number[];
  week: number[];
  month: number[];
  year: number[];
  source: Exclude<HkMarketDataSource, "fallback">;
  warning: string | null;
  updatedAt: string;
  snapshot: HkFundMarketSnapshot;
}> {
  const klineResult = await fetchKlines(fund, 260, signal);
  const dailyKlines = klineResult.klines;

  return {
    day: normalizeSeries(dailyKlines.slice(-20), fund.trends.week.series),
    week: normalizeSeries(dailyKlines.slice(-5), fund.trends.week.series),
    month: normalizeSeries(dailyKlines.slice(-22), fund.trends.month.series),
    year: normalizeSeries(pickMonthEndKlines(dailyKlines), fund.trends.year.series),
    source: klineResult.source,
    warning: klineResult.warning,
    updatedAt: klineResult.updatedAt,
    snapshot: klineResult.snapshot
  };
}
