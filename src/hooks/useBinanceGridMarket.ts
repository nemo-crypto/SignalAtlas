import { useEffect, useState } from "react";
import { type MarketConnectionState } from "../services/binance";
import {
  type CombinedStreamMessage,
  type SpotTicker24h,
  toNumber
} from "../services/marketAnalysis";

type GridTradeTick = {
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: number;
};

type GridMarketState = {
  currentPrice: number;
  change24h: number | null;
  connectionState: MarketConnectionState;
  statusNote: string;
  lastUpdatedAt: number | null;
  latestTrade: GridTradeTick | null;
};

const SPOT_BASE = "https://api.binance.com";
const SPOT_WS_BASE = "wss://stream.binance.com:9443/stream?streams=";

function calculateChange24h(lastPrice: number, openPrice: number): number | null {
  if (!Number.isFinite(lastPrice) || !Number.isFinite(openPrice) || openPrice <= 0) {
    return null;
  }

  return ((lastPrice - openPrice) / openPrice) * 100;
}

export function useBinanceGridMarket(symbol: string): GridMarketState {
  const [state, setState] = useState<GridMarketState>(() => ({
    currentPrice: 0,
    change24h: null,
    connectionState: "connecting",
    statusNote: "正在连接 Binance 行情流...",
    lastUpdatedAt: null,
    latestTrade: null
  }));

  useEffect(() => {
    let ignore = false;
    let reconnectTimer = 0;
    let socket: WebSocket | null = null;

    setState({
      currentPrice: 0,
      change24h: null,
      connectionState: "connecting",
      statusNote: "正在连接 Binance REST / WebSocket 行情...",
      lastUpdatedAt: null,
      latestTrade: null
    });

    const hydrateTicker = async () => {
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
        const change24h = toNumber(ticker.priceChangePercent);

        setState((current) => ({
          ...current,
          currentPrice: lastPrice || current.currentPrice,
          change24h: Number.isFinite(change24h) ? change24h : current.change24h,
          statusNote: "已加载 Binance 24H 行情，正在等待实时增量流。",
          lastUpdatedAt: Date.now()
        }));
      } catch {
        if (ignore) {
          return;
        }

        setState((current) => ({
          ...current,
          connectionState: "fallback",
          statusNote: current.currentPrice > 0
            ? "Binance REST 初始化失败，当前保留最近一次真实价格，等待实时流恢复。"
            : "Binance REST 初始化失败，当前没有可用真实价格，不再回退到本地占位价。"
        }));
      }
    };

    const connect = () => {
      if (ignore) {
        return;
      }

      socket = new WebSocket(
        `${SPOT_WS_BASE}${symbol.toLowerCase()}@miniTicker/${symbol.toLowerCase()}@aggTrade`
      );

      socket.onopen = () => {
        if (ignore) {
          return;
        }

        setState((current) => ({
          ...current,
          connectionState: "connecting",
          statusNote: "Binance WebSocket 已连接，等待首个实时报价。"
        }));
      };

      socket.onmessage = (event) => {
        if (ignore) {
          return;
        }

        const message = JSON.parse(event.data) as CombinedStreamMessage;
        const now = Date.now();

        if (message.data.e === "24hrMiniTicker") {
          const ticker = message.data;
          const lastPrice = toNumber(ticker.c);
          const openPrice = toNumber(ticker.o);

          setState((current) => ({
            ...current,
            currentPrice: lastPrice || current.currentPrice,
            change24h: calculateChange24h(lastPrice, openPrice),
            connectionState: "live",
            statusNote: "Binance 实时 ticker 在线，当前价格持续刷新。",
            lastUpdatedAt: now
          }));
          return;
        }

        if (message.data.e === "aggTrade") {
          const trade = message.data;
          const price = toNumber(trade.p);
          const quantity = toNumber(trade.q);
          setState((current) => ({
            ...current,
            currentPrice: price || current.currentPrice,
            connectionState: "live",
            statusNote: "Binance aggTrade 在线，网格引擎按真实成交价推进。",
            lastUpdatedAt: trade.T || now,
            latestTrade: {
              price,
              quantity,
              side: trade.m ? "SELL" : "BUY",
              timestamp: trade.T || now
            }
          }));
        }
      };

      socket.onerror = () => {
        if (ignore) {
          return;
        }

        setState((current) => ({
          ...current,
          connectionState: "fallback",
          statusNote:
            current.currentPrice > 0
              ? "Binance WebSocket 异常，当前保留最近一次真实价格并等待自动重连。"
              : "Binance WebSocket 异常，当前仍未拿到真实价格，等待自动重连。"
        }));
      };

      socket.onclose = () => {
        if (ignore) {
          return;
        }

        setState((current) => ({
          ...current,
          connectionState: "fallback",
          statusNote:
            current.currentPrice > 0
              ? "Binance WebSocket 已断开，3 秒后自动重连；当前保留最近一次真实价格。"
              : "Binance WebSocket 已断开，3 秒后自动重连；当前没有可用真实价格。"
        }));
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    void hydrateTicker();
    connect();

    return () => {
      ignore = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [symbol]);

  return state;
}
