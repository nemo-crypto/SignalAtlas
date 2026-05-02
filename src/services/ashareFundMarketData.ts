import {
  ashareSectorFunds,
  type AShareSector,
  type AShareSectorFund,
  type FundTrend
} from "../data/ashareSectorFunds";

export type AShareMarketDataStatus = "idle" | "loading" | "success" | "partial" | "error";
export type AShareMarketDataSource = "live" | "cache" | "fallback";

export type AShareMarketDataState = {
  sectors: AShareSector[];
  status: AShareMarketDataStatus;
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

type SinaKlineRow = {
  day?: string;
  close?: string;
};

type CachedKlinePayload = {
  version: 1;
  source: "sina";
  fetchedAt: string;
  latestDate: string;
  klines: MarketKline[];
};

type KlineResult = {
  klines: MarketKline[];
  source: Exclude<AShareMarketDataSource, "fallback">;
  updatedAt: string;
  warning: string | null;
};

type HydratedFundResult<TFund extends AShareSectorFund> = {
  fund: TFund;
  source: Exclude<AShareMarketDataSource, "fallback">;
  updatedAt: string;
  warning: string | null;
};

const sinaKlineEndpoint = "https://quotes.sina.cn/cn/api/jsonp.php";
const cacheVersion = 1;
const cacheMaxAgeMs = 1000 * 60 * 60 * 18;

function getSinaSymbol(fund: AShareSectorFund): string {
  const marketPrefix = fund.exchange === "SSE" ? "sh" : "sz";
  return `${marketPrefix}${fund.code}`;
}

function getFundCacheKey(fund: AShareSectorFund): string {
  return `ashare-fund-kline:v${cacheVersion}:${fund.exchange}:${fund.code}`;
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

function readCachedKlines(fund: AShareSectorFund): KlineResult | null {
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
      payload.source === "sina" &&
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
      warning: `${fund.code} 使用最近一次真实行情缓存，最新交易日 ${payload.latestDate}`
    };
  } catch {
    return null;
  }
}

function writeCachedKlines(fund: AShareSectorFund, klines: MarketKline[], fetchedAt: string) {
  const storage = getCacheStorage();
  const latestDate = klines[klines.length - 1]?.date;

  if (!storage || !latestDate) {
    return;
  }

  const payload: CachedKlinePayload = {
    version: cacheVersion,
    source: "sina",
    fetchedAt,
    latestDate,
    klines
  };

  try {
    storage.setItem(getFundCacheKey(fund), JSON.stringify(payload));
  } catch {
    // 缓存写入失败不影响真实行情展示。
  }
}

function getKlineQualityWarning(fund: AShareSectorFund, klines: MarketKline[]): string | null {
  if (klines.length < 22) {
    return `${fund.code} 真实 K 线不足 22 个交易日`;
  }

  const latestKline = klines[klines.length - 1];
  const latestTime = new Date(`${latestKline.date}T15:00:00+08:00`).getTime();

  if (!Number.isFinite(latestTime)) {
    return `${fund.code} 最新交易日格式异常`;
  }

  const staleDays = (Date.now() - latestTime) / (1000 * 60 * 60 * 24);

  if (staleDays > 14) {
    return `${fund.code} 最新交易日 ${latestKline.date} 距今超过 14 天`;
  }

  if (pickMonthEndKlines(klines).length < 8) {
    return `${fund.code} 近一年月末样本不足 8 个`;
  }

  return null;
}

function buildSinaKlineUrl(fund: AShareSectorFund, callbackName: string, limit: number): string {
  const params = new URLSearchParams({
    symbol: getSinaSymbol(fund),
    scale: "240",
    ma: "no",
    datalen: `${limit}`
  });

  return `${sinaKlineEndpoint}/${encodeURIComponent(
    callbackName
  )}/CN_MarketDataService.getKLineData?${params.toString()}`;
}

function parseSinaRows(rows: SinaKlineRow[]): MarketKline[] {
  return rows
    .map((row) => {
      const date = row.day ?? "";
      const close = Number(row.close);

      if (!date || !Number.isFinite(close) || close <= 0) {
        return null;
      }

      return { date, close };
    })
    .filter((item): item is MarketKline => item !== null);
}

function parseSinaTextPayload(text: string): SinaKlineRow[] {
  const match = text.match(/=\s*\((\[[\s\S]*\])\)\s*;?\s*$/);

  if (!match) {
    throw new Error("新浪财经 K 线返回格式异常");
  }

  return JSON.parse(match[1]) as SinaKlineRow[];
}

function fetchSinaJsonpRows(
  fund: AShareSectorFund,
  limit: number,
  signal?: AbortSignal
): Promise<SinaKlineRow[]> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("当前环境不支持 JSONP 行情加载"));
  }

  return new Promise((resolve, reject) => {
    const variableName = `__ashareFundKline_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const script = document.createElement("script");
    const globalWindow = window as unknown as Record<string, unknown>;
    let cleanup = () => {};
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("行情请求已取消", "AbortError"));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("新浪财经 JSONP 行情请求超时"));
    }, 9000);

    cleanup = () => {
      window.clearTimeout(timeoutId);
      script.remove();
      globalWindow[variableName] = undefined;
      signal?.removeEventListener("abort", handleAbort);
    };

    script.onload = () => {
      const payload = globalWindow[variableName];
      cleanup();

      if (Array.isArray(payload)) {
        resolve(payload as SinaKlineRow[]);
        return;
      }

      reject(new Error("新浪财经 JSONP 行情返回为空"));
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("新浪财经 JSONP 行情请求失败"));
    };
    script.src = buildSinaKlineUrl(fund, `var ${variableName}=`, limit);
    script.async = true;
    signal?.addEventListener("abort", handleAbort, { once: true });
    document.head.appendChild(script);
  });
}

async function fetchLiveKlines(
  fund: AShareSectorFund,
  limit: number,
  signal?: AbortSignal
): Promise<MarketKline[]> {
  if (typeof document !== "undefined") {
    return parseSinaRows(await fetchSinaJsonpRows(fund, limit, signal));
  }

  const variableName = "var __ashareFundKlinePayload=";
  const url = buildSinaKlineUrl(fund, variableName, limit);

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`${fund.code} 行情请求失败：HTTP ${response.status}`);
  }

  return parseSinaRows(parseSinaTextPayload(await response.text()));
}

async function fetchKlines(
  fund: AShareSectorFund,
  limit: number,
  signal?: AbortSignal
): Promise<KlineResult> {
  try {
    const klines = await fetchLiveKlines(fund, limit, signal);

    if (klines.length === 0) {
      throw new Error(`${fund.code} 无可用 K 线数据`);
    }

    const updatedAt = new Date().toISOString();
    writeCachedKlines(fund, klines, updatedAt);

    return {
      klines,
      source: "live",
      updatedAt,
      warning: getKlineQualityWarning(fund, klines)
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

function pickMonthEndKlines(klines: MarketKline[]): MarketKline[] {
  const monthEndMap = new Map<string, MarketKline>();

  klines.forEach((item) => {
    monthEndMap.set(item.date.slice(0, 7), item);
  });

  return Array.from(monthEndMap.values()).slice(-12);
}

function buildSignal(changePercent: number, periodName: string): string {
  if (changePercent >= 5) {
    return `${periodName}真实行情强势上行`;
  }

  if (changePercent >= 1) {
    return `${periodName}真实行情温和修复`;
  }

  if (changePercent <= -5) {
    return `${periodName}真实行情明显回撤`;
  }

  if (changePercent <= -1) {
    return `${periodName}真实行情震荡偏弱`;
  }

  return `${periodName}真实行情窄幅震荡`;
}

function buildTrend(
  klines: MarketKline[],
  fallback: FundTrend,
  periodName: string
): FundTrend {
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

async function hydrateFundWithMarketData<TFund extends AShareSectorFund>(
  fund: TFund,
  signal?: AbortSignal
): Promise<HydratedFundResult<TFund>> {
  const klineResult = await fetchKlines(fund, 260, signal);
  const dailyKlines = klineResult.klines;

  if (dailyKlines.length === 0) {
    throw new Error(`${fund.code} 无可用 K 线数据`);
  }

  const weekKlines = dailyKlines.slice(-5);
  const monthKlines = dailyKlines.slice(-22);
  const yearKlines = pickMonthEndKlines(dailyKlines);

  return {
    fund: {
      ...fund,
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

export async function fetchAshareFundWithMarketData<TFund extends AShareSectorFund>(
  fund: TFund,
  signal?: AbortSignal
): Promise<TFund> {
  return (await hydrateFundWithMarketData(fund, signal)).fund;
}

export async function fetchAshareFundMarketSnapshot<TFund extends AShareSectorFund>(
  fund: TFund,
  signal?: AbortSignal
): Promise<HydratedFundResult<TFund>> {
  return hydrateFundWithMarketData(fund, signal);
}

export async function fetchAshareSectorFundsWithMarketData(
  signal?: AbortSignal
): Promise<AShareMarketDataState> {
  const totalFundCount = ashareSectorFunds.reduce(
    (count, sector) => count + sector.funds.length,
    0
  );
  let loadedFundCount = 0;
  let liveFundCount = 0;
  let cachedFundCount = 0;
  let firstError: string | null = null;
  const qualityWarnings: string[] = [];
  const hydratedFunds = new Map<string, AShareSectorFund>();
  const fundItems = ashareSectorFunds.flatMap((sector) =>
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
      firstError ??= error instanceof Error ? error.message : `${fund.code} 行情加载失败`;
    }
  });

  const sectors = ashareSectorFunds.map((sector) => ({
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

export async function fetchAshareFundDetailSeries(
  fund: AShareSectorFund,
  signal?: AbortSignal
): Promise<{
  day: number[];
  week: number[];
  month: number[];
  year: number[];
  source: Exclude<AShareMarketDataSource, "fallback">;
  warning: string | null;
  updatedAt: string;
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
    updatedAt: klineResult.updatedAt
  };
}
