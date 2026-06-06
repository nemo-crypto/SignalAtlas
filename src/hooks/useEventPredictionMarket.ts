import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildEventPredictionSignals,
  EVENT_HORIZONS,
  fetchEventCandlesFromBinance,
  fetchEventMarketContext,
  normalizeEventCandles,
  runEventBacktest,
  settleEventPredictionRecords,
  toStoredEventPrediction,
  type EventBacktestSummary,
  type EventCandle,
  type EventHorizonMinutes,
  type EventMarketContext,
  type EventPredictionMode,
  type EventPredictionSignal,
  type EventPredictionSymbol
} from "../services/eventPrediction";
import {
  appendEventPrediction,
  loadEventPredictions,
  loadLatestEventCandles,
  loadPendingEventPredictions,
  resolveEventPredictions,
  saveEventCandles,
  type StoredEventPrediction
} from "../services/persistence";
import { type CombinedStreamMessage, type SpotTicker24h, toNumber } from "../services/marketAnalysis";

export type EventAlert = {
  id: string;
  symbol: EventPredictionSymbol;
  horizonMinutes: EventHorizonMinutes;
  direction: "UP" | "DOWN";
  probability: number;
  price: number;
  triggeredAt: number;
  message: string;
};

export type EventPredictionSettings = {
  mode: EventPredictionMode;
  minProbability: number;
  stake: number;
  initialBalance: number;
  payoutRatio: number;
  backtestDays: number;
  alertSound: boolean;
  alertPopup: boolean;
};

type EventPredictionMarketState = {
  symbol: EventPredictionSymbol;
  currentPrice: number;
  change24h: number | null;
  candles: EventCandle[];
  signals: EventPredictionSignal[];
  predictions: StoredEventPrediction[];
  alerts: EventAlert[];
  backtest: EventBacktestSummary | null;
  statusNote: string;
  dataNote: string;
  lastUpdatedAt: number | null;
  lastPredictedAt: number | null;
  isSyncing: boolean;
  isBacktesting: boolean;
};

type EventPredictionMarketControls = {
  syncHistory: (days?: number) => Promise<void>;
  runPredictionNow: () => Promise<void>;
  refreshBacktest: () => Promise<void>;
  dismissAlert: (id: string) => void;
};

const SPOT_BASE = "https://api.binance.com";
const SPOT_WS_BASE = "wss://stream.binance.com:9443/stream?streams=";
const ONE_MINUTE_MS = 60_000;
const MAX_CANDLES_IN_MEMORY = 10_000;

function calculateChange24h(lastPrice: number, openPrice: number): number | null {
  if (!Number.isFinite(lastPrice) || !Number.isFinite(openPrice) || openPrice <= 0) {
    return null;
  }

  return ((lastPrice - openPrice) / openPrice) * 100;
}

function getRequiredHistoryMinutes(backtestDays: number): number {
  const maxHorizon = Math.max(...EVENT_HORIZONS.map((item) => item.minutes));
  const maxMinHistory = Math.max(...EVENT_HORIZONS.map((item) => item.minHistory));

  return Math.max(backtestDays * 24 * 60 + maxHorizon + maxMinHistory, maxMinHistory + maxHorizon);
}

function shouldAlert(signal: EventPredictionSignal, mode: EventPredictionMode): boolean {
  if (signal.direction === "WAIT") {
    return false;
  }

  return mode === "every-minute" ? signal.probability >= 54 : signal.actionable;
}

function buildAlert(signal: EventPredictionSignal): EventAlert | null {
  if (signal.direction === "WAIT") {
    return null;
  }

  const directionText = signal.direction === "UP" ? "看涨" : "看跌";
  return {
    id: `${signal.symbol}-${signal.horizonMinutes}-${signal.recordedAt}`,
    symbol: signal.symbol,
    horizonMinutes: signal.horizonMinutes,
    direction: signal.direction,
    probability: signal.probability,
    price: signal.basePrice,
    triggeredAt: Date.now(),
    message: `${signal.symbol.replace("USDT", "")} ${signal.horizonLabel} ${directionText} ${signal.probability}% · 当前价 ${signal.basePrice.toFixed(signal.symbol === "BTCUSDT" ? 0 : 2)}`
  };
}

function playAlertSound() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(740, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.22);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.34);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.36);
  window.setTimeout(() => {
    void context.close();
  }, 600);
}

function mergeCandles(current: EventCandle[], incoming: EventCandle[]): EventCandle[] {
  return normalizeEventCandles([...current, ...incoming]).slice(-MAX_CANDLES_IN_MEMORY);
}

function getLatestClosedMinute(now = Date.now()): number {
  return Math.floor(now / ONE_MINUTE_MS) * ONE_MINUTE_MS - ONE_MINUTE_MS;
}

export function useEventPredictionMarket(
  symbol: EventPredictionSymbol,
  settings: EventPredictionSettings
): EventPredictionMarketState & EventPredictionMarketControls {
  const [currentPrice, setCurrentPrice] = useState(0);
  const [change24h, setChange24h] = useState<number | null>(null);
  const [candles, setCandles] = useState<EventCandle[]>([]);
  const [signals, setSignals] = useState<EventPredictionSignal[]>([]);
  const [predictions, setPredictions] = useState<StoredEventPrediction[]>([]);
  const [alerts, setAlerts] = useState<EventAlert[]>([]);
  const [statusNote, setStatusNote] = useState("正在准备事件合约预测引擎...");
  const [dataNote, setDataNote] = useState("等待本地 K 线缓存加载。");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [lastPredictedAt, setLastPredictedAt] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const latestCandlesRef = useRef<EventCandle[]>([]);
  const latestPriceRef = useRef(0);
  const latestSignalsRef = useRef<EventPredictionSignal[]>([]);
  const marketContextRef = useRef<EventMarketContext | null>(null);
  const lastPredictionMinuteRef = useRef(0);
  const lastAlertIdsRef = useRef(new Set<string>());
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    latestCandlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    latestPriceRef.current = currentPrice;
  }, [currentPrice]);

  useEffect(() => {
    latestSignalsRef.current = signals;
  }, [signals]);

  const refreshMarketContext = async () => {
    const controller = new AbortController();
    try {
      const context = await fetchEventMarketContext(symbol, controller.signal);
      marketContextRef.current = context;
      return context;
    } catch {
      marketContextRef.current = {
        symbol,
        fundingRatePercent: null,
        longShortRatio: null,
        openInterestChangePercent: null,
        quoteVolume24h: null,
        priceChange24h: null,
        updatedAt: Date.now(),
        source: "unavailable"
      };
      return marketContextRef.current;
    }
  };

  const refreshBacktest = async () => {
    setIsBacktesting(true);
    try {
      const requiredMinutes = getRequiredHistoryMinutes(settingsRef.current.backtestDays);
      const loaded = await loadLatestEventCandles(symbol, requiredMinutes + 120);
      const normalized = normalizeEventCandles(loaded);
      const summary = runEventBacktest({
        candlesBySymbol: {
          [symbol]: normalized
        },
        symbols: [symbol],
        horizons: EVENT_HORIZONS.map((item) => item.minutes),
        mode: settingsRef.current.mode,
        minProbability: settingsRef.current.minProbability,
        initialBalance: settingsRef.current.initialBalance,
        stake: settingsRef.current.stake,
        payoutRatio: settingsRef.current.payoutRatio,
        sampleStepMinutes: settingsRef.current.backtestDays >= 21 ? 3 : 1
      });
      const mergedCandles = mergeCandles(latestCandlesRef.current, normalized);
      latestCandlesRef.current = mergedCandles;
      setCandles(mergedCandles);
      setDataNote(
        normalized.length > 0
          ? `本地缓存 ${normalized.length} 根 1m K 线，可覆盖 ${settingsRef.current.backtestDays} 天回测。`
          : "本地暂无事件合约 K 线缓存，请先同步历史数据。"
      );
      setIsBacktesting(false);
      return summary;
    } catch {
      setDataNote("读取本地 K 线回测失败，请重新同步历史数据。");
      setIsBacktesting(false);
      return null;
    }
  };

  const [backtest, setBacktest] = useState<EventBacktestSummary | null>(null);

  const refreshBacktestAndCommit = async () => {
    const summary = await refreshBacktest();
    setBacktest(summary);
  };

  const syncHistory = async (days = settingsRef.current.backtestDays) => {
    setIsSyncing(true);
    const controller = new AbortController();
    const requiredMinutes = getRequiredHistoryMinutes(days);
    const endTime = getLatestClosedMinute();
    const startTime = endTime - requiredMinutes * ONE_MINUTE_MS;

    try {
      setDataNote(`正在从 Binance 同步 ${symbol} 最近 ${days} 天 1m K 线...`);
      const downloaded = await fetchEventCandlesFromBinance(
        symbol,
        startTime,
        endTime,
        controller.signal,
        (loaded) => {
          setDataNote(`正在同步 ${symbol} 1m K 线：已拉取 ${loaded} 根。`);
        }
      );
      const savedCount = await saveEventCandles(downloaded);
      const loaded = normalizeEventCandles(await loadLatestEventCandles(symbol, requiredMinutes + 120));
      latestCandlesRef.current = loaded;
      setCandles(loaded);
      setDataNote(`已写入 ${savedCount} 根 K 线，本地当前载入 ${loaded.length} 根。`);
      await refreshBacktestAndCommit();
      await runPredictionNow();
    } catch {
      setDataNote("同步 Binance 历史 K 线失败，当前仅使用已有本地缓存。网络恢复后可重试。");
    } finally {
      setIsSyncing(false);
    }
  };

  const runPredictionNow = async () => {
    const activeSettings = settingsRef.current;
    if (!marketContextRef.current || Date.now() - marketContextRef.current.updatedAt > 60_000) {
      await refreshMarketContext();
    }
    const nextSignals = buildEventPredictionSignals({
      symbol,
      candles: latestCandlesRef.current,
      minProbability: activeSettings.minProbability,
      livePrice: latestPriceRef.current,
      marketContext: marketContextRef.current
    });
    const recordedMinute = Math.floor(Date.now() / ONE_MINUTE_MS) * ONE_MINUTE_MS;
    const candidates = nextSignals.filter((signal) => shouldAlert(signal, activeSettings.mode));

    setSignals(nextSignals);
    setLastPredictedAt(Date.now());
    latestSignalsRef.current = nextSignals;

    for (const signal of candidates) {
      const prediction = toStoredEventPrediction({
        signal,
        mode: activeSettings.mode,
        stake: activeSettings.stake,
        payoutRatio: activeSettings.payoutRatio
      });
      const didAppend = await appendEventPrediction(prediction);
      if (!didAppend) {
        continue;
      }

      const alert = buildAlert(signal);
      if (alert && !lastAlertIdsRef.current.has(alert.id)) {
        lastAlertIdsRef.current.add(alert.id);
        setAlerts((current) => [alert, ...current].slice(0, 8));
        if (activeSettings.alertSound) {
          playAlertSound();
        }
        if (activeSettings.alertPopup && typeof window !== "undefined") {
          window.setTimeout(() => {
            window.alert(alert.message);
          }, 50);
        }
      }
    }

    const history = await loadEventPredictions({ symbol, limit: 24 });
    setPredictions(history);
    setStatusNote(
      candidates.length > 0
        ? `本轮 ${new Date(recordedMinute).toLocaleTimeString("zh-CN", { hour12: false })} 生成 ${candidates.length} 条可下注预测。`
        : "本轮已完成预测，但没有达到下注概率阈值。"
    );
  };

  useEffect(() => {
    let ignore = false;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;

    setStatusNote("正在连接 Binance 实时价格...");
    setCurrentPrice(0);
    setChange24h(null);
    setCandles([]);
    setSignals([]);
    setPredictions([]);
    setBacktest(null);
    latestCandlesRef.current = [];
    marketContextRef.current = null;
    lastPredictionMinuteRef.current = 0;

    const hydrate = async () => {
      try {
        const [loadedCandles, loadedPredictions] = await Promise.all([
          loadLatestEventCandles(symbol, getRequiredHistoryMinutes(settingsRef.current.backtestDays) + 120),
          loadEventPredictions({ symbol, limit: 24 })
        ]);
        if (ignore) {
          return;
        }

        const normalized = normalizeEventCandles(loadedCandles);
        latestCandlesRef.current = normalized;
        setCandles(normalized);
        setPredictions(loadedPredictions);
        setDataNote(
          normalized.length > 0
            ? `已加载本地 ${normalized.length} 根 1m K 线。`
            : "本地暂无 1m K 线缓存，建议先同步历史数据。"
        );

        if (normalized.length > 0) {
          const nextSignals = buildEventPredictionSignals({
            symbol,
            candles: normalized,
            minProbability: settingsRef.current.minProbability,
            livePrice: latestPriceRef.current,
            marketContext: marketContextRef.current
          });
          latestSignalsRef.current = nextSignals;
          setSignals(nextSignals);
        }
      } catch {
        if (!ignore) {
          setDataNote("读取本地缓存失败，请尝试重新同步。 ");
        }
      }

      await refreshMarketContext();

      try {
        const response = await fetch(`${SPOT_BASE}/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!response.ok) {
          throw new Error(`${response.status}`);
        }

        const ticker = (await response.json()) as SpotTicker24h;
        if (ignore) {
          return;
        }
        const lastPrice = toNumber(ticker.lastPrice);
        const change = toNumber(ticker.priceChangePercent);
        setCurrentPrice(lastPrice);
        setChange24h(Number.isFinite(change) ? change : null);
        setLastUpdatedAt(Date.now());
        setStatusNote("已加载 Binance 24H 行情，等待 WebSocket 增量价格。");
      } catch {
        if (!ignore) {
          setStatusNote("Binance REST 初始化失败，继续使用本地 K 线和后续 WebSocket 重连。");
        }
      }
    };

    const connect = () => {
      if (ignore) {
        return;
      }

      socket = new WebSocket(
        `${SPOT_WS_BASE}${symbol.toLowerCase()}@miniTicker/${symbol.toLowerCase()}@kline_1m`
      );

      socket.onopen = () => {
        if (!ignore) {
          setStatusNote("Binance WebSocket 已连接，价格与 1m K 线在线更新。");
        }
      };

      socket.onmessage = (event) => {
        if (ignore) {
          return;
        }

        const message = JSON.parse(event.data) as CombinedStreamMessage | {
          data: {
            e: "kline";
            E: number;
            s: string;
            k: {
              t: number;
              T: number;
              o: string;
              h: string;
              l: string;
              c: string;
              v: string;
              x: boolean;
            };
          };
        };
        const now = Date.now();

        if (message.data.e === "24hrMiniTicker") {
          const price = toNumber(message.data.c);
          const openPrice = toNumber(message.data.o);
          setCurrentPrice(price || latestPriceRef.current);
          setChange24h(calculateChange24h(price, openPrice));
          setLastUpdatedAt(now);
          return;
        }

        if (message.data.e === "kline") {
          const item = message.data.k;
          const price = toNumber(item.c);
          setCurrentPrice(price || latestPriceRef.current);
          setLastUpdatedAt(message.data.E || now);

          if (!item.x) {
            return;
          }

          const closedCandle: EventCandle = {
            id: `${symbol}-${item.t}`,
            symbol,
            openTime: item.t,
            closeTime: item.T,
            open: toNumber(item.o),
            high: toNumber(item.h),
            low: toNumber(item.l),
            close: price,
            volume: toNumber(item.v),
            storedAt: now
          };
          const merged = mergeCandles(latestCandlesRef.current, [closedCandle]);
          latestCandlesRef.current = merged;
          setCandles(merged);
          void saveEventCandles([closedCandle]);
        }
      };

      socket.onerror = () => {
        if (!ignore) {
          setStatusNote("Binance WebSocket 异常，稍后自动重连；预测继续使用本地缓存。 ");
        }
      };

      socket.onclose = () => {
        if (ignore) {
          return;
        }
        setStatusNote("Binance WebSocket 已断开，3 秒后自动重连。 ");
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    void hydrate().then(() => {
      void refreshBacktestAndCommit();
      if (latestCandlesRef.current.length === 0) {
        void syncHistory(settingsRef.current.backtestDays);
      }
      void runPredictionNow();
    });
    connect();

    return () => {
      ignore = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [symbol]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const minute = Math.floor(Date.now() / ONE_MINUTE_MS) * ONE_MINUTE_MS;
      if (minute === lastPredictionMinuteRef.current) {
        return;
      }
      lastPredictionMinuteRef.current = minute;
      void runPredictionNow();
    }, 5_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [symbol]);

  useEffect(() => {
    void refreshMarketContext();
    const timer = window.setInterval(() => {
      void refreshMarketContext();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [symbol]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        const pending = await loadPendingEventPredictions();
        if (pending.length === 0) {
          return;
        }

        const loaded = await loadLatestEventCandles(symbol, getRequiredHistoryMinutes(settingsRef.current.backtestDays) + 120);
        const resolutions = settleEventPredictionRecords({
          predictions: pending,
          candlesBySymbol: {
            [symbol]: loaded
          }
        });
        const updatedCount = await resolveEventPredictions(resolutions);
        if (updatedCount > 0) {
          const history = await loadEventPredictions({ symbol, limit: 24 });
          setPredictions(history);
        }
      })().catch(() => undefined);
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [symbol]);

  useEffect(() => {
    void runPredictionNow();
    void refreshBacktestAndCommit();
  }, [settings.mode, settings.minProbability, settings.stake, settings.initialBalance, settings.payoutRatio, settings.backtestDays]);

  const sortedSignals = useMemo(
    () => [...signals].sort((left, right) => left.horizonMinutes - right.horizonMinutes),
    [signals]
  );

  return {
    symbol,
    currentPrice,
    change24h,
    candles,
    signals: sortedSignals,
    predictions,
    alerts,
    backtest,
    statusNote,
    dataNote,
    lastUpdatedAt,
    lastPredictedAt,
    isSyncing,
    isBacktesting,
    syncHistory,
    runPredictionNow,
    refreshBacktest: refreshBacktestAndCommit,
    dismissAlert: (id: string) => {
      setAlerts((current) => current.filter((item) => item.id !== id));
    }
  };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
