import { useEffect, useRef, useState } from "react";
import { type MarketOverview, type SignalHistoryItem } from "../data/marketOverviewData";
import {
  connectBinanceMarketStream,
  fetchHistoricalClosePrice,
  fetchLiveMarketOverview,
  getBaselineOverview,
  type MarketConnectionState
} from "../services/binance";
import { deriveCompositeSignal } from "../services/marketAnalysis";
import {
  appendSignalHistory,
  loadLiveSnapshot,
  loadPendingSignalHistoryEntries,
  loadSignalHistory,
  resolveSignalHistoryEntries,
  saveLiveSnapshot,
  type StoredLiveSnapshot
} from "../services/persistence";

const FULL_RECOMPUTE_INTERVAL_MS = 60_000;
const SNAPSHOT_PERSIST_INTERVAL_MS = 2_000;
const SIGNAL_HISTORY_SETTLE_INTERVAL_MS = 60_000;
const SIGNAL_HISTORY_TARGET_DELAY_MS = 60 * 60 * 1000;

type MarketLiveState = {
  overview: MarketOverview;
  connectionState: MarketConnectionState;
  statusNote: string;
  lastUpdatedAt: number | null;
  lastRecomputedAt: number | null;
  isRecomputing: boolean;
  signalHistory: SignalHistoryItem[];
};

export function useLiveMarketOverview(symbol: string): MarketLiveState {
  const latestSnapshotRef = useRef<Omit<StoredLiveSnapshot, "storedAt"> | null>(null);
  const lastPersistedUpdatedAtRef = useRef<number | null>(null);
  const latestPriceRef = useRef<number | null>(null);
  const [state, setState] = useState<MarketLiveState>(() => ({
    overview: getBaselineOverview(symbol),
    connectionState: "connecting",
    statusNote: "正在准备中性基线...",
    lastUpdatedAt: null,
    lastRecomputedAt: null,
    isRecomputing: false,
    signalHistory: []
  }));

  useEffect(() => {
    let ignore = false;
    let isRefreshing = false;
    let cleanupStream: () => void = () => {};
    let refreshTimer = 0;
    const activeControllers = new Set<AbortController>();
    latestSnapshotRef.current = null;
    lastPersistedUpdatedAtRef.current = null;
    latestPriceRef.current = null;

    setState({
      overview: getBaselineOverview(symbol),
      connectionState: "connecting",
      statusNote: "正在连接 Binance 公共 REST 行情...",
      lastUpdatedAt: null,
      lastRecomputedAt: null,
      isRecomputing: true,
      signalHistory: []
    });

    const hydrateFromIndexedDb = async () => {
      try {
        const [snapshot, history] = await Promise.all([
          loadLiveSnapshot(symbol),
          loadSignalHistory(symbol)
        ]);

        if (ignore) {
          return;
        }

        lastPersistedUpdatedAtRef.current = snapshot?.updatedAt ?? null;
        setState((current) => ({
          ...current,
          overview: snapshot?.overview ?? current.overview,
          statusNote: snapshot
            ? "已加载本地最近一次有效快照，正在连接 Binance 实时行情..."
            : current.statusNote,
          lastUpdatedAt: snapshot?.updatedAt ?? current.lastUpdatedAt,
          lastRecomputedAt: snapshot?.recomputedAt ?? current.lastRecomputedAt,
          signalHistory: history.length > 0 ? history : current.signalHistory
        }));
      } catch {
        if (ignore) {
          return;
        }

        setState((current) => ({
          ...current,
          statusNote: current.statusNote
        }));
      }
    };

    const buildFallbackNote = (current: MarketLiveState) => {
      if (current.lastUpdatedAt && current.overview.price > 0) {
        return "Binance 公共行情暂不可用，当前继续展示本地最近一次有效快照。";
      }

      return "Binance 公共行情暂不可用，当前仅展示中性基线，不再回退本地假数据。";
    };

    const persistSignalHistory = async (
      overview: MarketOverview,
      connectionState: MarketConnectionState,
      recordedAt: number
    ) => {
      const summary = deriveCompositeSignal(overview.dimensions);

      const didAppend = await appendSignalHistory({
        id: `${symbol}-${recordedAt}`,
        symbol,
        recordedAt,
        signal: summary.label,
        confidence: summary.confidence,
        compositeBias: summary.compositeBias,
        price: overview.price,
        connectionState
      });

      if (!didAppend) {
        return;
      }

      const history = await loadSignalHistory(symbol);
      if (ignore) {
        return;
      }

      setState((current) => ({
        ...current,
        signalHistory: history
      }));
    };

    const runFullRefresh = async (mode: "initial" | "scheduled") => {
      if (ignore || isRefreshing) {
        return;
      }

      isRefreshing = true;
      const controller = new AbortController();
      activeControllers.add(controller);

      if (mode === "scheduled") {
        setState((current) => ({
          ...current,
          isRecomputing: true,
          statusNote: "正在执行 Binance 全量重算，更新趋势 / 动量 / 量能等维度..."
        }));
      }

      try {
        const response = await fetchLiveMarketOverview(symbol, controller.signal);
        const liveOverview = response.overview;
        if (ignore) {
          return;
        }

        if (mode === "initial" && response.status === "live" && liveOverview) {
          setState((current) => ({
            ...current,
            overview: liveOverview,
            connectionState: "live",
            statusNote: response.note,
            lastUpdatedAt: response.updatedAt,
            lastRecomputedAt: response.updatedAt,
            isRecomputing: false
          }));
        } else if (mode === "initial") {
          setState((current) => ({
            ...current,
            connectionState: "fallback",
            statusNote: buildFallbackNote(current),
            isRecomputing: false
          }));
        } else if (response.status === "live" && liveOverview) {
          setState((current) => ({
            ...current,
            overview: liveOverview,
            connectionState: "live",
            statusNote: "已完成 Binance 全量重算，趋势 / 动量 / 量能等维度已刷新。",
            lastUpdatedAt: response.updatedAt,
            lastRecomputedAt: response.updatedAt,
            isRecomputing: false
          }));
        } else {
          setState((current) => ({
            ...current,
            connectionState: current.connectionState === "live" ? "live" : "fallback",
            statusNote:
              current.connectionState === "live"
                ? "Binance 增量流仍在线，但本轮全量重算未拿到完整行情，继续保留最近一次有效结果。"
                : buildFallbackNote(current),
            isRecomputing: false
          }));
        }

        if (response.status === "live" && liveOverview) {
          void persistSignalHistory(liveOverview, "live", response.updatedAt);
        }

        cleanupStream();
        cleanupStream = connectBinanceMarketStream(
          symbol,
          {
            onOverview: (updater, timestamp) => {
              if (ignore) {
                return;
              }

              setState((current) => ({
                ...current,
                overview: updater(current.overview),
                connectionState: "live",
                lastUpdatedAt: timestamp
              }));
            },
            onStatus: (message) => {
              if (ignore) {
                return;
              }

              const nextConnectionState =
                message.includes("断开") || message.includes("异常") || message.includes("正在连接")
                  ? "connecting"
                  : message.includes("已连接")
                    ? "live"
                    : undefined;

              setState((current) => ({
                ...current,
                connectionState:
                  current.connectionState === "fallback"
                    ? current.connectionState
                    : nextConnectionState ?? current.connectionState,
                statusNote:
                  current.connectionState === "fallback" && message.includes("已连接")
                    ? "Binance WebSocket 已连接，价格与盘口增量正在恢复；全量维度仍等待 REST 重算。"
                    : message,
                lastUpdatedAt: current.lastUpdatedAt
              }));
            }
          },
          {
            seedTrades: response.tradeSeed
          }
        );
      } catch {
        if (ignore) {
          return;
        }

        if (mode === "initial") {
          setState((current) => ({
            ...current,
            connectionState: "fallback",
            statusNote: buildFallbackNote(current),
            isRecomputing: false
          }));
          return;
        }

        setState((current) => ({
          ...current,
          connectionState: current.connectionState === "live" ? "live" : "fallback",
          statusNote:
            current.connectionState === "live"
              ? "Binance 增量流仍在线，但本轮全量重算失败，暂时保留最近一次有效指标结果。"
              : buildFallbackNote(current),
          isRecomputing: false
        }));
      } finally {
        activeControllers.delete(controller);
        isRefreshing = false;
      }
    };

    void hydrateFromIndexedDb();

    const setup = async () => {
      await runFullRefresh("initial");
      refreshTimer = window.setInterval(() => {
        void runFullRefresh("scheduled");
      }, FULL_RECOMPUTE_INTERVAL_MS);
    };

    void setup();

    return () => {
      ignore = true;
      window.clearInterval(refreshTimer);
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
      cleanupStream();
    };
  }, [symbol]);

  useEffect(() => {
    if (!state.lastUpdatedAt) {
      latestSnapshotRef.current = null;
      return;
    }

    latestSnapshotRef.current = {
      symbol,
      overview: state.overview,
      connectionState: state.connectionState,
      updatedAt: state.lastUpdatedAt,
      recomputedAt: state.lastRecomputedAt
    };
  }, [symbol, state.connectionState, state.lastRecomputedAt, state.lastUpdatedAt, state.overview]);

  useEffect(() => {
    latestPriceRef.current = state.overview.price;
  }, [state.overview.price]);

  useEffect(() => {
    const persistLatestSnapshot = () => {
      const snapshot = latestSnapshotRef.current;

      if (!snapshot?.updatedAt || lastPersistedUpdatedAtRef.current === snapshot.updatedAt) {
        return;
      }

      lastPersistedUpdatedAtRef.current = snapshot.updatedAt;

      void saveLiveSnapshot({
        ...snapshot,
        storedAt: Date.now()
      }).catch(() => {
        if (lastPersistedUpdatedAtRef.current === snapshot.updatedAt) {
          lastPersistedUpdatedAtRef.current = null;
        }
      });
    };

    const timer = window.setInterval(persistLatestSnapshot, SNAPSHOT_PERSIST_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [symbol]);

  useEffect(() => {
    let ignore = false;
    let settleTimer = 0;
    const activeControllers = new Set<AbortController>();

    const settleSignalHistory = async () => {
      const latestPrice = latestPriceRef.current;

      if (!latestPrice || ignore) {
        return;
      }

      const pendingEntries = await loadPendingSignalHistoryEntries(symbol);
      if (ignore || pendingEntries.length === 0) {
        return;
      }

      const resolutions = await Promise.all(
        pendingEntries.map(async (entry) => {
          const controller = new AbortController();
          activeControllers.add(controller);

          try {
            const after1hPrice =
              (await fetchHistoricalClosePrice(
                entry.symbol,
                entry.recordedAt + SIGNAL_HISTORY_TARGET_DELAY_MS,
                controller.signal
              )) ?? latestPrice;

            return {
              id: entry.id,
              after1hPrice,
              resolvedAt: Date.now()
            };
          } finally {
            activeControllers.delete(controller);
          }
        })
      );

      if (ignore) {
        return;
      }

      const updatedCount = await resolveSignalHistoryEntries(resolutions);
      if (ignore || updatedCount === 0) {
        return;
      }

      const history = await loadSignalHistory(symbol);
      if (ignore) {
        return;
      }

      setState((current) => ({
        ...current,
        signalHistory: history
      }));
    };

    void settleSignalHistory();
    settleTimer = window.setInterval(() => {
      void settleSignalHistory();
    }, SIGNAL_HISTORY_SETTLE_INTERVAL_MS);

    return () => {
      ignore = true;
      window.clearInterval(settleTimer);
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
  }, [symbol]);

  return state;
}
