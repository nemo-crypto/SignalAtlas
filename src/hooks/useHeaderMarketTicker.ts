import { useEffect, useState } from "react";
import { type SpotTicker24h } from "../services/marketAnalysis";

type HeaderTickerDirection = "up" | "down" | "neutral";

export type HeaderTickerItem = {
  id: string;
  flashToken: number;
  symbol: string;
  priceLabel: string;
  changeLabel: string;
  badge: string;
  direction: HeaderTickerDirection;
};

type SpotTicker24hListItem = SpotTicker24h & {
  symbol: string;
};

const SPOT_BASE = "https://api.binance.com";
const SPOT_WS_BASE = "wss://stream.binance.com:9443/ws/!miniTicker@arr";
const RECONNECT_DELAY_MS = 1_500;
const MIN_QUOTE_VOLUME = 5_000_000;
const LEVERAGED_TOKEN_SUFFIXES = ["UPUSDT", "DOWNUSDT", "BULLUSDT", "BEARUSDT"];

type MiniTickerStreamItem = {
  e: "24hrMiniTicker";
  E: number;
  s: string;
  c: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
};

const FALLBACK_ITEMS: HeaderTickerItem[] = [
  {
    id: "ticker-loading",
    flashToken: 0,
    symbol: "BINANCE",
    priceLabel: "24H Movers",
    changeLabel: "连接中",
    badge: "LIVE",
    direction: "neutral"
  }
];

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isEligibleSpotMover(item: SpotTicker24hListItem): boolean {
  if (!item.symbol.endsWith("USDT")) {
    return false;
  }

  if (LEVERAGED_TOKEN_SUFFIXES.some((suffix) => item.symbol.endsWith(suffix))) {
    return false;
  }

  const lastPrice = toNumber(item.lastPrice);
  const change24h = toNumber(item.priceChangePercent);
  const quoteVolume = toNumber(item.quoteVolume);

  return (
    Number.isFinite(lastPrice) &&
    lastPrice > 0 &&
    Number.isFinite(change24h) &&
    Number.isFinite(quoteVolume) &&
    quoteVolume >= MIN_QUOTE_VOLUME
  );
}

function formatTickerPrice(value: number): string {
  const maximumFractionDigits =
    value >= 1000 ? 2 : value >= 1 ? 3 : value >= 0.1 ? 4 : value >= 0.01 ? 5 : 6;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPriceChangePercent(lastPrice: string, openPrice: string): string {
  const closeValue = toNumber(lastPrice);
  const openValue = toNumber(openPrice);

  if (!Number.isFinite(closeValue) || !Number.isFinite(openValue) || openValue <= 0) {
    return "0";
  }

  return (((closeValue - openValue) / openValue) * 100).toString();
}

function toHeaderTickerItem(
  item: SpotTicker24hListItem,
  direction: HeaderTickerDirection,
  rank: number,
  flashToken: number
): HeaderTickerItem {
  const lastPrice = toNumber(item.lastPrice);
  const change24h = toNumber(item.priceChangePercent);
  const symbol = item.symbol.replace(/USDT$/, "");

  return {
    id: `${direction}-${rank}-${item.symbol}`,
    flashToken,
    symbol,
    priceLabel: formatTickerPrice(lastPrice),
    changeLabel: formatSignedPercent(change24h),
    badge: `${direction === "up" ? "UP" : "DOWN"} ${rank}`,
    direction
  };
}

function buildTickerItems(
  items: SpotTicker24hListItem[],
  flashCounters: Map<string, number>
): HeaderTickerItem[] {
  const eligibleItems = items.filter(isEligibleSpotMover);

  const gainers = eligibleItems
    .filter((item) => toNumber(item.priceChangePercent) > 0)
    .sort((left, right) => toNumber(right.priceChangePercent) - toNumber(left.priceChangePercent))
    .slice(0, 5)
    .map((item, index) => toHeaderTickerItem(item, "up", index + 1, flashCounters.get(item.symbol) ?? 0));

  const losers = eligibleItems
    .filter((item) => toNumber(item.priceChangePercent) < 0)
    .sort((left, right) => toNumber(left.priceChangePercent) - toNumber(right.priceChangePercent))
    .slice(0, 5)
    .map((item, index) => toHeaderTickerItem(item, "down", index + 1, flashCounters.get(item.symbol) ?? 0));

  const merged: HeaderTickerItem[] = [];
  const maxLength = Math.max(gainers.length, losers.length);

  for (let index = 0; index < maxLength; index += 1) {
    const gainer = gainers[index];
    const loser = losers[index];

    if (gainer) {
      merged.push(gainer);
    }

    if (loser) {
      merged.push(loser);
    }
  }

  if (merged.length > 0) {
    return merged;
  }

  return [
    {
      id: "ticker-unavailable",
      flashToken: 0,
      symbol: "BINANCE",
      priceLabel: "24H Movers",
      changeLabel: "暂无有效榜单",
      badge: "LIVE",
      direction: "neutral"
    }
  ];
}

export function useHeaderMarketTicker(): HeaderTickerItem[] {
  const [items, setItems] = useState<HeaderTickerItem[]>(FALLBACK_ITEMS);

  useEffect(() => {
    let ignore = false;
    let reconnectTimer = 0;
    let socket: WebSocket | null = null;
    let hasSnapshot = false;
    const activeControllers = new Set<AbortController>();
    const tickerMap = new Map<string, SpotTicker24hListItem>();
    const flashCounters = new Map<string, number>();

    const commitItems = () => {
      setItems(buildTickerItems(Array.from(tickerMap.values()), flashCounters));
    };

    const loadSnapshot = async () => {
      const controller = new AbortController();
      activeControllers.add(controller);

      try {
        const response = await fetch(`${SPOT_BASE}/api/v3/ticker/24hr`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as SpotTicker24hListItem[];
        if (ignore) {
          return;
        }

        tickerMap.clear();
        payload.forEach((item) => {
          tickerMap.set(item.symbol, item);
        });
        hasSnapshot = true;
        commitItems();
      } catch {
        if (ignore || hasSnapshot) {
          return;
        }

        setItems([
          {
            id: "ticker-unavailable",
            flashToken: 0,
            symbol: "BINANCE",
            priceLabel: "24H Movers",
            changeLabel: "暂不可用",
            badge: "LIVE",
            direction: "neutral"
          }
        ]);
      } finally {
        activeControllers.delete(controller);
      }
    };

    const applyMiniTickerUpdates = (payload: MiniTickerStreamItem[]) => {
      payload.forEach((item) => {
        const previous = tickerMap.get(item.s);
        const nextChangePercent = formatPriceChangePercent(item.c, item.o);
        const didChange =
          previous?.lastPrice !== item.c || previous?.priceChangePercent !== nextChangePercent;

        tickerMap.set(item.s, {
          symbol: item.s,
          lastPrice: item.c,
          openPrice: item.o,
          highPrice: item.h,
          lowPrice: item.l,
          priceChangePercent: nextChangePercent,
          volume: item.v,
          quoteVolume: item.q
        });

        if (didChange) {
          flashCounters.set(item.s, (flashCounters.get(item.s) ?? 0) + 1);
        }
      });

      commitItems();
    };

    const connectStream = () => {
      if (ignore) {
        return;
      }

      socket = new WebSocket(SPOT_WS_BASE);

      socket.onmessage = (event) => {
        if (ignore) {
          return;
        }

        try {
          const payload = JSON.parse(event.data) as MiniTickerStreamItem[];
          if (!Array.isArray(payload) || payload.length === 0) {
            return;
          }

          applyMiniTickerUpdates(payload);
        } catch {
          return;
        }
      };

      socket.onclose = () => {
        if (ignore) {
          return;
        }

        reconnectTimer = window.setTimeout(() => {
          void loadSnapshot();
          connectStream();
        }, RECONNECT_DELAY_MS);
      };
    };

    void loadSnapshot();
    connectStream();

    return () => {
      ignore = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    };
  }, []);

  return items;
}
