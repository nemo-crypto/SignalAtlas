import { type MarketOverview, type SignalHistoryItem } from "../data/mockData";

const DB_NAME = "cryptoquant-live";
const DB_VERSION = 5;
const SNAPSHOT_STORE = "snapshots";
const GRID_SNAPSHOT_STORE = "grid-snapshots";
const WHALE_OBSERVATION_STORE = "whale-observations";
const SIGNAL_HISTORY_STORE = "signal-history";
const ALERT_STORE = "alerts";
const ALERT_RULE_STORE = "alert-rules";
const ALERT_EVENT_STORE = "alert-events";
const MANUAL_CONTEXT_STORE = "manual-context";
const MAX_SIGNAL_HISTORY_PER_SYMBOL = 48;
const MAX_WHALE_OBSERVATIONS_PER_SYMBOL = 18;
const MAX_ALERT_EVENTS_PER_SYMBOL = 24;
const SIGNAL_OUTCOME_DELAY_MS = 60 * 60 * 1000;
const SIGNAL_CONFIDENCE_BUCKET_SIZE = 10;

export type StoredLiveSnapshot = {
  symbol: string;
  overview: MarketOverview;
  connectionState: "connecting" | "live" | "fallback";
  updatedAt: number | null;
  recomputedAt: number | null;
  storedAt: number;
};

export type StoredSignalHistoryEntry = {
  id: string;
  symbol: string;
  recordedAt: number;
  signal: string;
  confidence: number;
  compositeBias: number;
  price: number;
  connectionState: "connecting" | "live" | "fallback";
  after1hPrice?: number | null;
  resolvedAt?: number | null;
};

export type SignalHistoryResolution = {
  id: string;
  after1hPrice: number;
  resolvedAt: number;
};

export type StoredAlertConfig = {
  symbol: string;
  price: string;
  direction: "above" | "below";
  armed: boolean;
  updatedAt: number;
};

export type StoredAlertRule = StoredAlertConfig & {
  id: string;
};

export type StoredAlertEvent = {
  id: string;
  ruleId: string;
  symbol: string;
  price: string;
  direction: "above" | "below";
  triggeredPrice: number;
  triggeredAt: number;
  readAt?: number | null;
};

export type StoredManualContext = {
  symbol: string;
  exchangeReserveChange: string;
  longTermHolderChange: string;
  activeAddressChange: string;
  dxyChange: string;
  equityFuturesChange: string;
  fearGreedIndex: string;
  updatedAt: number;
};

export type StoredGridSnapshot<TConfig = unknown, TRuntime = unknown> = {
  id: string;
  selectedPresetSymbol: string;
  config: TConfig;
  runtime: TRuntime;
  savedAt: number;
};

export type StoredWhaleObservationEntry = {
  id: string;
  symbol: string;
  recordedAt: number;
  signature: string;
  tradeId: string;
  clusterLabel: string;
  side: "buy" | "sell";
  usdValue: number;
  price: number;
  minutesAgo: number;
  selectedWindow: number;
  minTradeValue: number;
  confidenceFilter: string;
  aggressiveOnly: boolean;
  verdictLabel: string;
  verdictTone: "bullish" | "bearish" | "neutral";
  verdictConfidence: number;
  thesis: string;
  wallRatio: number | null;
  cancelRisk: number | null;
  netFlowUsd: number;
  alertCount: number;
};

type LegacyStoredWhaleObservationEntry = Omit<StoredWhaleObservationEntry, "clusterLabel"> & {
  clusterLabel?: string;
  wallet?: string;
};

export type WhaleObservationQuery = {
  symbol?: string;
  limit?: number;
};

export type SignalHistoryQuery = {
  symbol?: string;
  since?: number;
  limit?: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("failed to open indexeddb"));
    };

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "symbol" });
      }

      if (!database.objectStoreNames.contains(GRID_SNAPSHOT_STORE)) {
        database.createObjectStore(GRID_SNAPSHOT_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(WHALE_OBSERVATION_STORE)) {
        const store = database.createObjectStore(WHALE_OBSERVATION_STORE, { keyPath: "id" });
        store.createIndex("by_symbol_recordedAt", ["symbol", "recordedAt"], { unique: false });
      }

      if (!database.objectStoreNames.contains(SIGNAL_HISTORY_STORE)) {
        const store = database.createObjectStore(SIGNAL_HISTORY_STORE, { keyPath: "id" });
        store.createIndex("by_symbol_recordedAt", ["symbol", "recordedAt"], { unique: false });
      }

      if (!database.objectStoreNames.contains(ALERT_STORE)) {
        database.createObjectStore(ALERT_STORE, { keyPath: "symbol" });
      }

      if (!database.objectStoreNames.contains(ALERT_RULE_STORE)) {
        const store = database.createObjectStore(ALERT_RULE_STORE, { keyPath: "id" });
        store.createIndex("by_symbol_updatedAt", ["symbol", "updatedAt"], { unique: false });
      }

      if (!database.objectStoreNames.contains(ALERT_EVENT_STORE)) {
        const store = database.createObjectStore(ALERT_EVENT_STORE, { keyPath: "id" });
        store.createIndex("by_symbol_triggeredAt", ["symbol", "triggeredAt"], { unique: false });
      }

      if (!database.objectStoreNames.contains(MANUAL_CONTEXT_STORE)) {
        database.createObjectStore(MANUAL_CONTEXT_STORE, { keyPath: "symbol" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T> | T
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);

        Promise.resolve(runner(store, transaction))
          .then((result) => {
            transaction.oncomplete = () => {
              database.close();
              resolve(result);
            };
          })
          .catch((error) => {
            database.close();
            reject(error);
          });

        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error(`indexeddb transaction failed for ${storeName}`));
        };

        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error(`indexeddb transaction aborted for ${storeName}`));
        };
      })
  );
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
  });
}

function getConfidenceBucket(confidence: number): number {
  return Math.floor(confidence / SIGNAL_CONFIDENCE_BUCKET_SIZE);
}

function getCompositeBiasZone(compositeBias: number): "bullish" | "bearish" | "neutral" {
  if (compositeBias >= 10) {
    return "bullish";
  }

  if (compositeBias <= -10) {
    return "bearish";
  }

  return "neutral";
}

function shouldAppendSignalHistory(
  previous: StoredSignalHistoryEntry | undefined,
  next: StoredSignalHistoryEntry
): boolean {
  if (!previous) {
    return true;
  }

  return (
    previous.signal !== next.signal ||
    getConfidenceBucket(previous.confidence) !== getConfidenceBucket(next.confidence) ||
    getCompositeBiasZone(previous.compositeBias) !== getCompositeBiasZone(next.compositeBias)
  );
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 10000 ? 0 : 2,
    maximumFractionDigits: value >= 10000 ? 0 : 2
  }).format(value);
}

function formatHistoryTime(recordedAt: number): string {
  const now = new Date();
  const timestamp = new Date(recordedAt);
  const isSameYear = now.getFullYear() === timestamp.getFullYear();
  const isSameDate =
    isSameYear &&
    now.getMonth() === timestamp.getMonth() &&
    now.getDate() === timestamp.getDate();

  return timestamp.toLocaleString("zh-CN", {
    hour12: false,
    month: isSameDate ? undefined : "2-digit",
    day: isSameDate ? undefined : "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    year: isSameYear ? undefined : "numeric"
  });
}

function formatResolvedOutcome(entry: StoredSignalHistoryEntry) {
  if (entry.after1hPrice == null || entry.price <= 0) {
    return {
      after1hPrice: "待跟踪",
      marketPnl: "待结算",
      pnl: "待结算",
      accuracy: entry.connectionState === "live" ? "🟡" : "⚪",
      outcome: "pending" as const,
      resolved: false,
      marketPnlValue: null,
      pnlValue: null
    };
  }

  const marketMovePercent = ((entry.after1hPrice - entry.price) / entry.price) * 100;
  const isBullishSignal = entry.signal.includes("买入");
  const isBearishSignal = entry.signal.includes("卖出");
  const strategyPnlPercent = isBearishSignal ? -marketMovePercent : marketMovePercent;
  let accuracy = "⚠️";

  if (isBullishSignal) {
    accuracy = marketMovePercent >= 0.15 ? "✅" : marketMovePercent <= -0.15 ? "❌" : "⚠️";
  } else if (isBearishSignal) {
    accuracy = marketMovePercent <= -0.15 ? "✅" : marketMovePercent >= 0.15 ? "❌" : "⚠️";
  } else {
    accuracy = Math.abs(marketMovePercent) <= 0.3 ? "✅" : "⚠️";
  }

  return {
    after1hPrice: formatPrice(entry.after1hPrice),
    marketPnl: `${marketMovePercent >= 0 ? "+" : ""}${marketMovePercent.toFixed(2)}%`,
    pnl: `${strategyPnlPercent >= 0 ? "+" : ""}${strategyPnlPercent.toFixed(2)}%`,
    accuracy,
    outcome:
      accuracy === "✅"
        ? ("correct" as const)
        : accuracy === "❌"
          ? ("incorrect" as const)
          : ("warning" as const),
    resolved: true,
    marketPnlValue: marketMovePercent,
    pnlValue: strategyPnlPercent
  };
}

async function querySignalHistoryEntries(
  store: IDBObjectStore,
  query: SignalHistoryQuery = {}
): Promise<StoredSignalHistoryEntry[]> {
  const entries = query.symbol
    ? await promisifyRequest(
        store
          .index("by_symbol_recordedAt")
          .getAll(IDBKeyRange.bound([query.symbol, 0], [query.symbol, Number.MAX_SAFE_INTEGER]))
      )
    : await promisifyRequest(store.getAll());

  const since = typeof query.since === "number" ? query.since : null;
  const filtered = since == null ? entries : entries.filter((entry) => entry.recordedAt >= since);
  const sorted = filtered.sort((left, right) => right.recordedAt - left.recordedAt);

  return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
}

function mapSignalHistoryItem(entry: StoredSignalHistoryEntry): SignalHistoryItem {
  const resolvedOutcome = formatResolvedOutcome(entry);

  return {
    id: entry.id,
    recordedAt: entry.recordedAt,
    confidence: entry.confidence,
    time: formatHistoryTime(entry.recordedAt),
    symbol: entry.symbol.replace("USDT", ""),
    signal: `${entry.signal} (${entry.confidence}%)`,
    triggerPrice: formatPrice(entry.price),
    after1hPrice: resolvedOutcome.after1hPrice,
    marketPnl: resolvedOutcome.marketPnl,
    pnl: resolvedOutcome.pnl,
    accuracy: resolvedOutcome.accuracy,
    signalTone: entry.signal.includes("买入")
      ? "bullish"
      : entry.signal.includes("卖出")
        ? "bearish"
        : "neutral",
    resolved: resolvedOutcome.resolved,
    marketPnlValue: resolvedOutcome.marketPnlValue,
    pnlValue: resolvedOutcome.pnlValue,
    outcome: resolvedOutcome.outcome
  };
}

async function queryWhaleObservationEntries(
  store: IDBObjectStore,
  query: WhaleObservationQuery = {}
): Promise<StoredWhaleObservationEntry[]> {
  const entries = query.symbol
    ? await promisifyRequest(
        store
          .index("by_symbol_recordedAt")
          .getAll(IDBKeyRange.bound([query.symbol, 0], [query.symbol, Number.MAX_SAFE_INTEGER]))
      )
    : await promisifyRequest(store.getAll());

  const normalizedEntries = (entries as LegacyStoredWhaleObservationEntry[]).map((entry) => ({
    ...entry,
    clusterLabel: entry.clusterLabel ?? entry.wallet ?? "AggTrade Cluster"
  }));

  const sorted = normalizedEntries.sort((left, right) => right.recordedAt - left.recordedAt);
  return typeof query.limit === "number" ? sorted.slice(0, query.limit) : sorted;
}

export function saveLiveSnapshot(snapshot: StoredLiveSnapshot): Promise<void> {
  return runTransaction(SNAPSHOT_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.put(snapshot));
  });
}

export function saveGridSnapshot<TConfig, TRuntime>(
  snapshot: StoredGridSnapshot<TConfig, TRuntime>
): Promise<void> {
  return runTransaction(GRID_SNAPSHOT_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.put(snapshot));
  });
}

export function loadGridSnapshot<TConfig = unknown, TRuntime = unknown>(
  id: string
): Promise<StoredGridSnapshot<TConfig, TRuntime> | null> {
  return runTransaction(GRID_SNAPSHOT_STORE, "readonly", async (store) => {
    return (await promisifyRequest(store.get(id))) ?? null;
  });
}

export function appendWhaleObservation(entry: StoredWhaleObservationEntry): Promise<boolean> {
  return runTransaction(WHALE_OBSERVATION_STORE, "readwrite", async (store, transaction) => {
    const index = store.index("by_symbol_recordedAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([entry.symbol, 0], [entry.symbol, Number.MAX_SAFE_INTEGER]))
    );
    const latestEntry = [...entries].sort((left, right) => right.recordedAt - left.recordedAt)[0];

    if (latestEntry?.signature === entry.signature) {
      return false;
    }

    await promisifyRequest(store.put(entry));
    const overflow = entries.length + 1 - MAX_WHALE_OBSERVATIONS_PER_SYMBOL;

    if (overflow > 0) {
      const sorted = [...entries].sort((left, right) => left.recordedAt - right.recordedAt);
      await Promise.all(
        sorted
          .slice(0, overflow)
          .map((item) => promisifyRequest(transaction.objectStore(WHALE_OBSERVATION_STORE).delete(item.id)))
      );
    }

    return true;
  });
}

export function loadWhaleObservations(
  query: WhaleObservationQuery = {}
): Promise<StoredWhaleObservationEntry[]> {
  return runTransaction(WHALE_OBSERVATION_STORE, "readonly", async (store) => {
    return queryWhaleObservationEntries(store, query);
  });
}

export function loadLiveSnapshot(symbol: string): Promise<StoredLiveSnapshot | null> {
  return runTransaction(SNAPSHOT_STORE, "readonly", async (store) => {
    return (await promisifyRequest(store.get(symbol))) ?? null;
  });
}

export function saveAlertConfig(config: StoredAlertConfig): Promise<void> {
  return Promise.all([
    runTransaction(ALERT_STORE, "readwrite", async (store) => {
      await promisifyRequest(store.put(config));
    }),
    saveAlertRule({
      id: `${config.symbol}-primary`,
      ...config
    })
  ]).then(() => undefined);
}

export function loadAlertConfig(symbol: string): Promise<StoredAlertConfig | null> {
  return loadAlertRules(symbol).then((rules) => {
    if (rules.length === 0) {
      return null;
    }

    const [firstRule] = rules;
    return {
      symbol: firstRule.symbol,
      price: firstRule.price,
      direction: firstRule.direction,
      armed: firstRule.armed,
      updatedAt: firstRule.updatedAt
    };
  });
}

export function saveManualContext(context: StoredManualContext): Promise<void> {
  return runTransaction(MANUAL_CONTEXT_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.put(context));
  });
}

export function loadManualContext(symbol: string): Promise<StoredManualContext | null> {
  return runTransaction(MANUAL_CONTEXT_STORE, "readonly", async (store) => {
    return (await promisifyRequest(store.get(symbol))) ?? null;
  });
}

export function clearManualContext(symbol: string): Promise<void> {
  return runTransaction(MANUAL_CONTEXT_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.delete(symbol));
  });
}

export function saveAlertRule(rule: StoredAlertRule): Promise<void> {
  return runTransaction(ALERT_RULE_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.put(rule));
  });
}

export function removeAlertRule(id: string): Promise<void> {
  return runTransaction(ALERT_RULE_STORE, "readwrite", async (store) => {
    await promisifyRequest(store.delete(id));
  });
}

export function loadAlertRules(symbol: string): Promise<StoredAlertRule[]> {
  return runTransaction(ALERT_RULE_STORE, "readonly", async (store) => {
    const index = store.index("by_symbol_updatedAt");
    return await promisifyRequest(
      index.getAll(IDBKeyRange.bound([symbol, 0], [symbol, Number.MAX_SAFE_INTEGER]))
    );
  }).then((rules) => {
    if (rules.length > 0) {
      return rules.sort((left, right) => right.updatedAt - left.updatedAt);
    }

    return loadLegacyAlertConfig(symbol).then((legacyRule) => (legacyRule ? [legacyRule] : []));
  });
}

function loadLegacyAlertConfig(symbol: string): Promise<StoredAlertRule | null> {
  return runTransaction(ALERT_STORE, "readonly", async (store) => {
    const config = (await promisifyRequest(store.get(symbol))) ?? null;
    return config
      ? {
          id: `${symbol}-primary`,
          ...config
        }
      : null;
  });
}

export function appendAlertEvent(event: StoredAlertEvent): Promise<void> {
  return runTransaction(ALERT_EVENT_STORE, "readwrite", async (store, transaction) => {
    await promisifyRequest(store.put(event));

    const index = store.index("by_symbol_triggeredAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([event.symbol, 0], [event.symbol, Number.MAX_SAFE_INTEGER]))
    );
    const overflow = entries.length - MAX_ALERT_EVENTS_PER_SYMBOL;

    if (overflow > 0) {
      const sorted = [...entries].sort((left, right) => left.triggeredAt - right.triggeredAt);
      await Promise.all(
        sorted
          .slice(0, overflow)
          .map((item) => promisifyRequest(transaction.objectStore(ALERT_EVENT_STORE).delete(item.id)))
      );
    }
  });
}

export function loadAlertEvents(symbol: string, limit = 8): Promise<StoredAlertEvent[]> {
  return runTransaction(ALERT_EVENT_STORE, "readonly", async (store) => {
    const index = store.index("by_symbol_triggeredAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([symbol, 0], [symbol, Number.MAX_SAFE_INTEGER]))
    );

    return entries
      .sort((left, right) => right.triggeredAt - left.triggeredAt)
      .slice(0, limit);
  });
}

export function markAlertEventsAsRead(
  symbol: string,
  ids?: string[],
  readAt = Date.now()
): Promise<number> {
  return runTransaction(ALERT_EVENT_STORE, "readwrite", async (store) => {
    const index = store.index("by_symbol_triggeredAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([symbol, 0], [symbol, Number.MAX_SAFE_INTEGER]))
    );
    const targetIds = ids ? new Set(ids) : null;
    let updatedCount = 0;

    for (const entry of entries) {
      if (entry.readAt) {
        continue;
      }

      if (targetIds && !targetIds.has(entry.id)) {
        continue;
      }

      await promisifyRequest(
        store.put({
          ...entry,
          readAt
        })
      );
      updatedCount += 1;
    }

    return updatedCount;
  });
}

export function clearAlertEvents(symbol: string): Promise<number> {
  return runTransaction(ALERT_EVENT_STORE, "readwrite", async (store) => {
    const index = store.index("by_symbol_triggeredAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([symbol, 0], [symbol, Number.MAX_SAFE_INTEGER]))
    );

    await Promise.all(entries.map((entry) => promisifyRequest(store.delete(entry.id))));
    return entries.length;
  });
}

export function clearReadAlertEvents(symbol: string): Promise<number> {
  return runTransaction(ALERT_EVENT_STORE, "readwrite", async (store) => {
    const index = store.index("by_symbol_triggeredAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([symbol, 0], [symbol, Number.MAX_SAFE_INTEGER]))
    );
    const readEntries = entries.filter((entry) => Boolean(entry.readAt));

    await Promise.all(readEntries.map((entry) => promisifyRequest(store.delete(entry.id))));
    return readEntries.length;
  });
}

export function appendSignalHistory(entry: StoredSignalHistoryEntry): Promise<boolean> {
  return runTransaction(SIGNAL_HISTORY_STORE, "readwrite", async (store, transaction) => {
    const index = store.index("by_symbol_recordedAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([entry.symbol, 0], [entry.symbol, Number.MAX_SAFE_INTEGER]))
    );
    const latestEntry = [...entries].sort((left, right) => right.recordedAt - left.recordedAt)[0];

    if (!shouldAppendSignalHistory(latestEntry, entry)) {
      return false;
    }

    await promisifyRequest(store.put(entry));
    const overflow = entries.length + 1 - MAX_SIGNAL_HISTORY_PER_SYMBOL;

    if (overflow > 0) {
      const sorted = [...entries].sort((left, right) => left.recordedAt - right.recordedAt);
      await Promise.all(
        sorted
          .slice(0, overflow)
          .map((item) => promisifyRequest(transaction.objectStore(SIGNAL_HISTORY_STORE).delete(item.id)))
      );
    }

    return true;
  });
}

export function loadPendingSignalHistoryEntries(
  symbol: string,
  now = Date.now()
): Promise<StoredSignalHistoryEntry[]> {
  return runTransaction(SIGNAL_HISTORY_STORE, "readonly", async (store) => {
    const index = store.index("by_symbol_recordedAt");
    const entries = await promisifyRequest(
      index.getAll(IDBKeyRange.bound([symbol, 0], [symbol, Number.MAX_SAFE_INTEGER]))
    );

    return entries
      .filter(
        (entry) =>
          entry.after1hPrice == null &&
          entry.recordedAt + SIGNAL_OUTCOME_DELAY_MS <= now
      )
      .sort((left, right) => left.recordedAt - right.recordedAt);
  });
}

export function resolveSignalHistoryEntries(
  resolutions: SignalHistoryResolution[]
): Promise<number> {
  if (resolutions.length === 0) {
    return Promise.resolve(0);
  }

  return runTransaction(SIGNAL_HISTORY_STORE, "readwrite", async (store) => {
    let updatedCount = 0;

    for (const resolution of resolutions) {
      const currentEntry = await promisifyRequest(store.get(resolution.id));

      if (!currentEntry || currentEntry.after1hPrice != null) {
        continue;
      }

      await promisifyRequest(
        store.put({
          ...currentEntry,
          after1hPrice: resolution.after1hPrice,
          resolvedAt: resolution.resolvedAt
        })
      );
      updatedCount += 1;
    }

    return updatedCount;
  });
}

export function loadSignalHistory(symbol: string, limit = 12): Promise<SignalHistoryItem[]> {
  return runTransaction(SIGNAL_HISTORY_STORE, "readonly", async (store) => {
    const entries = await querySignalHistoryEntries(store, {
      symbol,
      limit
    });
    return entries.map(mapSignalHistoryItem);
  });
}

export function loadScopedSignalHistory(query: SignalHistoryQuery): Promise<SignalHistoryItem[]> {
  return runTransaction(SIGNAL_HISTORY_STORE, "readonly", async (store) => {
    const entries = await querySignalHistoryEntries(store, query);
    return entries.map(mapSignalHistoryItem);
  });
}
