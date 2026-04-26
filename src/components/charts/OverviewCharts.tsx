import { useId, useMemo, useState } from "react";
import type {
  MarketDimension,
  OrderBookDepth,
  RealtimeCanvasData,
  RealtimeCanvasInterval,
  RealtimeCanvasSnapshot
} from "../../data/mockData";

function normalizeSvgId(value: string): string {
  return value.replace(/:/g, "");
}

function polarPoint(index: number, count: number, ratio: number, center: number, radius: number) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return {
    x: center + Math.cos(angle) * radius * ratio,
    y: center + Math.sin(angle) * radius * ratio
  };
}

function buildPolygon(
  dimensions: MarketDimension[],
  mapper: (dimension: MarketDimension) => number
): string {
  const center = 120;
  const radius = 82;
  const count = dimensions.length;

  return dimensions
    .map((dimension, index) => {
      const point = polarPoint(index, count, mapper(dimension), center, radius);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

const realtimeCanvasIntervals: RealtimeCanvasInterval[] = ["5m", "10m", "15m"];

function buildSeriesPath(
  values: Array<number | null>,
  mapX: (index: number) => number,
  mapY: (value: number) => number
): string {
  let path = "";
  let segmentOpen = false;

  values.forEach((value, index) => {
    if (value == null) {
      segmentOpen = false;
      return;
    }

    const command = segmentOpen ? "L" : "M";
    path += `${command}${mapX(index).toFixed(2)},${mapY(value).toFixed(2)} `;
    segmentOpen = true;
  });

  return path.trim();
}

function buildBandAreaPath(
  snapshot: RealtimeCanvasSnapshot,
  mapX: (index: number) => number,
  mapY: (value: number) => number
): string {
  const indexes = snapshot.candles
    .map((candle, index) =>
      candle.bollingerUpper != null && candle.bollingerLower != null ? index : null
    )
    .filter((value): value is number => value !== null);

  if (indexes.length < 2) {
    return "";
  }

  const upperPath = indexes
    .map((index) => `${mapX(index).toFixed(2)},${mapY(snapshot.candles[index].bollingerUpper ?? 0).toFixed(2)}`)
    .join(" ");
  const lowerPath = [...indexes]
    .reverse()
    .map((index) => `${mapX(index).toFixed(2)},${mapY(snapshot.candles[index].bollingerLower ?? 0).toFixed(2)}`)
    .join(" ");

  return `${upperPath} ${lowerPath}`;
}

function getRealtimeTrendClass(tone: RealtimeCanvasSnapshot["trend"]["tone"]): string {
  if (tone === "bullish") {
    return "realtime-canvas-badge realtime-canvas-badge-bull";
  }

  if (tone === "bearish") {
    return "realtime-canvas-badge realtime-canvas-badge-bear";
  }

  return "realtime-canvas-badge";
}

function formatDepthQuantity(value: number): string {
  if (value >= 100) {
    return value.toFixed(0);
  }

  if (value >= 1) {
    return value.toFixed(2);
  }

  if (value >= 0.01) {
    return value.toFixed(3);
  }

  return value.toFixed(4);
}

type OverviewRealtimeCanvasProps = {
  canvas: RealtimeCanvasData | null | undefined;
  depth: OrderBookDepth | null | undefined;
  activeInterval: RealtimeCanvasInterval;
  onIntervalChange: (interval: RealtimeCanvasInterval) => void;
  currentPrice: number;
  formatPrice: (value: number) => string;
};

export function OverviewRealtimeCanvas({
  canvas,
  depth,
  activeInterval,
  onIntervalChange,
  currentPrice,
  formatPrice
}: OverviewRealtimeCanvasProps) {
  const gradientId = normalizeSvgId(useId());
  const [hoveredDepthKey, setHoveredDepthKey] = useState<string | null>(null);
  const [lockedDepthKey, setLockedDepthKey] = useState<string | null>(null);
  const snapshot = canvas?.intervals[activeInterval] ?? canvas?.intervals[canvas?.defaultInterval ?? "5m"];
  const dimensions = useMemo(
    () => ({
      width: 960,
      height: 428,
      left: 24,
      right: 84,
      depthInsetWidth: 72,
      depthInsetGap: 16,
      priceTop: 26,
      priceBottom: 246,
      macdTop: 286,
      macdBottom: 392
    }),
    []
  );

  if (!snapshot || snapshot.candles.length === 0) {
    return (
      <div className="sparkline-shell realtime-canvas-shell">
        <div className="realtime-canvas-toolbar">
          <div className="realtime-canvas-toolbar-group">
            {realtimeCanvasIntervals.map((interval) => (
              <button
                key={interval}
                type="button"
                className={interval === activeInterval ? "time-chip time-chip-active" : "time-chip"}
                onClick={() => onIntervalChange(interval)}
              >
                {interval}
              </button>
            ))}
          </div>
        </div>
        <div className="realtime-canvas-empty">
          <strong>实时 K 线准备中</strong>
          <p className="muted">等待 Binance 返回 5m / 10m / 15m K 线后，这里会自动叠加布林轨、趋势和 MACD。</p>
        </div>
      </div>
    );
  }

  const priceRangeValues = snapshot.candles.flatMap((candle) => [
    candle.low,
    candle.high,
    candle.bollingerUpper ?? candle.high,
    candle.bollingerLower ?? candle.low
  ]);
  if (snapshot.supportPrice != null) {
    priceRangeValues.push(snapshot.supportPrice);
  }
  if (snapshot.resistancePrice != null) {
    priceRangeValues.push(snapshot.resistancePrice);
  }
  if (currentPrice > 0) {
    priceRangeValues.push(currentPrice);
  }

  const rawPriceMin = Math.min(...priceRangeValues);
  const rawPriceMax = Math.max(...priceRangeValues);
  const pricePadding = Math.max((rawPriceMax - rawPriceMin) * 0.12, rawPriceMax * 0.004, 1);
  const priceMin = rawPriceMin - pricePadding;
  const priceMax = rawPriceMax + pricePadding;
  const pricePanelEnd = dimensions.width - dimensions.right;
  const plotRight = pricePanelEnd - dimensions.depthInsetGap - dimensions.depthInsetWidth;
  const plotWidth = plotRight - dimensions.left;
  const slotWidth = plotWidth / Math.max(snapshot.candles.length, 1);
  const candleBodyWidth = Math.min(Math.max(slotWidth * 0.46, 3.2), 8.5);
  const mapX = (index: number) => dimensions.left + slotWidth * index + slotWidth / 2;
  const mapPriceY = (value: number) =>
    dimensions.priceBottom -
    ((value - priceMin) / Math.max(priceMax - priceMin, 1e-6)) *
      (dimensions.priceBottom - dimensions.priceTop);
  const priceGridValues = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return priceMax - (priceMax - priceMin) * ratio;
  });
  const currentPriceY = mapPriceY(currentPrice > 0 ? currentPrice : snapshot.candles[snapshot.candles.length - 1]?.close ?? 0);

  const macdValues = snapshot.macd.flatMap((item) => [item.macd, item.signal, item.histogram]);
  const macdMax = Math.max(...macdValues.map((value) => Math.abs(value)), 0.01);
  const macdMid = (dimensions.macdTop + dimensions.macdBottom) / 2;
  const mapMacdY = (value: number) =>
    macdMid -
    (value / macdMax) * ((dimensions.macdBottom - dimensions.macdTop) / 2 - 10);

  const upperBandPath = buildSeriesPath(
    snapshot.candles.map((item) => item.bollingerUpper),
    mapX,
    mapPriceY
  );
  const middleBandPath = buildSeriesPath(
    snapshot.candles.map((item) => item.bollingerMiddle),
    mapX,
    mapPriceY
  );
  const lowerBandPath = buildSeriesPath(
    snapshot.candles.map((item) => item.bollingerLower),
    mapX,
    mapPriceY
  );
  const macdPath = buildSeriesPath(
    snapshot.macd.map((item) => item.macd),
    mapX,
    mapMacdY
  );
  const signalPath = buildSeriesPath(
    snapshot.macd.map((item) => item.signal),
    mapX,
    mapMacdY
  );
  const bandAreaPath = buildBandAreaPath(snapshot, mapX, mapPriceY);
  const depthInsetStart = plotRight + dimensions.depthInsetGap;
  const depthInsetEnd = pricePanelEnd;
  const depthInsetCenter = (depthInsetStart + depthInsetEnd) / 2;
  const depthInsetHalfWidth = Math.max((depthInsetEnd - depthInsetStart) / 2 - 4, 8);
  const depthLevelsAvailable = Boolean(depth && depth.bids.length > 0 && depth.asks.length > 0);
  const bidLevels = depthLevelsAvailable ? [...(depth?.bids ?? [])].sort((left, right) => left.price - right.price) : [];
  const askLevels = depthLevelsAvailable ? [...(depth?.asks ?? [])].sort((left, right) => left.price - right.price) : [];
  const depthOverlayLevels = [
    ...bidLevels.map((level) => ({
      ...level,
      side: "bid" as const,
      key: `bid-${level.price}-${level.cumulative}`
    })),
    ...askLevels.map((level) => ({
      ...level,
      side: "ask" as const,
      key: `ask-${level.price}-${level.cumulative}`
    }))
  ];
  const depthMaxCumulative = Math.max(
    ...bidLevels.map((level) => level.cumulative),
    ...askLevels.map((level) => level.cumulative),
    1
  );
  const mapDepthX = (cumulative: number, side: "bid" | "ask") =>
    side === "bid"
      ? depthInsetCenter - (cumulative / depthMaxCumulative) * depthInsetHalfWidth
      : depthInsetCenter + (cumulative / depthMaxCumulative) * depthInsetHalfWidth;
  const buildDepthOverlayArea = (levels: OrderBookDepth["bids"], side: "bid" | "ask") => {
    if (levels.length < 2) {
      return "";
    }

    const firstY = mapPriceY(levels[0].price);
    const lastY = mapPriceY(levels[levels.length - 1].price);
    const points = levels
      .map((level) => `${mapDepthX(level.cumulative, side).toFixed(2)},${mapPriceY(level.price).toFixed(2)}`)
      .join(" ");

    return `${depthInsetCenter.toFixed(2)},${firstY.toFixed(2)} ${points} ${depthInsetCenter.toFixed(2)},${lastY.toFixed(2)}`;
  };
  const buildDepthOverlayLine = (levels: OrderBookDepth["bids"], side: "bid" | "ask") =>
    levels
      .map((level) => `${mapDepthX(level.cumulative, side).toFixed(2)},${mapPriceY(level.price).toFixed(2)}`)
      .join(" ");
  const effectiveLockedDepthKey =
    lockedDepthKey && depthOverlayLevels.some((level) => level.key === lockedDepthKey)
      ? lockedDepthKey
      : null;
  const activeDepthKey = effectiveLockedDepthKey ?? hoveredDepthKey;
  const activeDepthLevel =
    depthOverlayLevels.find((level) => level.key === activeDepthKey) ?? null;
  const isDepthLocked = activeDepthLevel?.key != null && effectiveLockedDepthKey === activeDepthLevel.key;
  const activeDepthY = activeDepthLevel ? mapPriceY(activeDepthLevel.price) : null;
  const activeDepthPriceLabel = activeDepthLevel ? formatPrice(activeDepthLevel.price) : null;
  const activeDepthBubbleWidth = activeDepthPriceLabel
    ? Math.max(activeDepthPriceLabel.length * 7.2 + 20, 72)
    : 0;
  const activeDepthBubbleHeight = 24;
  const activeDepthBubbleX = dimensions.width - activeDepthBubbleWidth - 10;
  const activeDepthBubbleY =
    activeDepthY == null
      ? null
      : Math.min(
          Math.max(activeDepthY - activeDepthBubbleHeight / 2, dimensions.priceTop + 2),
          dimensions.priceBottom - activeDepthBubbleHeight - 2
        );
  const activeDepthPointerY =
    activeDepthY != null && activeDepthBubbleY != null
      ? Math.min(
          Math.max(activeDepthY, activeDepthBubbleY + 6),
          activeDepthBubbleY + activeDepthBubbleHeight - 6
        )
      : null;
  const activeDepthPointerTipX = activeDepthBubbleX - 8;
  const activeDepthFocusLineEndX =
    activeDepthPriceLabel && activeDepthBubbleY != null ? activeDepthPointerTipX : pricePanelEnd + 12;
  const depthFocusTone =
    activeDepthLevel?.side === "bid"
      ? `realtime-canvas-focus-panel realtime-canvas-focus-panel-bid${activeDepthLevel ? " realtime-canvas-focus-panel-active" : ""}${
          isDepthLocked ? " realtime-canvas-focus-panel-locked" : ""
        }`
      : activeDepthLevel?.side === "ask"
        ? `realtime-canvas-focus-panel realtime-canvas-focus-panel-ask${activeDepthLevel ? " realtime-canvas-focus-panel-active" : ""}${
            isDepthLocked ? " realtime-canvas-focus-panel-locked" : ""
          }`
        : "realtime-canvas-focus-panel";

  return (
    <div className="sparkline-shell realtime-canvas-shell" onMouseLeave={() => setHoveredDepthKey(null)}>
      <div className="realtime-canvas-toolbar">
        <div className="realtime-canvas-toolbar-group">
          {realtimeCanvasIntervals.map((interval) => (
            <button
              key={interval}
              type="button"
              className={interval === snapshot.interval ? "time-chip time-chip-active" : "time-chip"}
              onClick={() => onIntervalChange(interval)}
            >
              {interval}
            </button>
          ))}
        </div>

        <div className="realtime-canvas-toolbar-group realtime-canvas-legend">
          <span>
            <i className="realtime-canvas-legend-swatch realtime-canvas-legend-band" />
            布林轨
          </span>
          <span>
            <i className="realtime-canvas-legend-swatch realtime-canvas-legend-macd" />
            MACD
          </span>
          <span>
            <i className="realtime-canvas-legend-swatch realtime-canvas-legend-level" />
            支撑 / 阻力
          </span>
          <span>
            <i className="realtime-canvas-legend-swatch realtime-canvas-legend-depth" />
            盘口轮廓
          </span>
        </div>
      </div>

      <div className="realtime-canvas-meta">
        <div className="realtime-canvas-meta-copy">
          <span className={getRealtimeTrendClass(snapshot.trend.tone)}>{snapshot.trend.label}</span>
          <p className="muted">{snapshot.trend.detail}</p>
        </div>

        <div className={depthFocusTone}>
          {activeDepthLevel ? (
            <>
              <span>
                {activeDepthLevel.side === "bid" ? "买盘挂墙" : "卖盘挂墙"}
                {isDepthLocked ? " · 已锁定" : ""}
              </span>
              <strong>
                {formatPrice(activeDepthLevel.price)} · Qty {formatDepthQuantity(activeDepthLevel.quantity)}
              </strong>
              <small>
                累计 {formatDepthQuantity(activeDepthLevel.cumulative)}，
                {isDepthLocked ? " 点击同档位解锁，或点其他档位切换锁定。" : " 已同步高亮到主图价位，点一下可锁定。"}
              </small>
            </>
          ) : (
            <>
              <span>盘口联动</span>
              <strong>悬停或点击右侧盘口轮廓</strong>
              <small>桌面端支持 hover，移动端可点击锁定具体档位并持续观察。</small>
            </>
          )}
        </div>
      </div>

      <svg className="sparkline realtime-canvas-svg" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${gradientId}-band`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(106, 153, 255, 0.2)" />
            <stop offset="100%" stopColor="rgba(106, 153, 255, 0.02)" />
          </linearGradient>
        </defs>

        {priceGridValues.map((value) => {
          const y = mapPriceY(value);
          return (
            <g key={value}>
              <line x1={dimensions.left} x2={pricePanelEnd + 12} y1={y} y2={y} className="sparkline-grid-line" />
              <text x={dimensions.width - 8} y={y + 4} className="realtime-canvas-axis-label" textAnchor="end">
                {formatPrice(value)}
              </text>
            </g>
          );
        })}

        <line x1={dimensions.left} x2={pricePanelEnd + 12} y1={macdMid} y2={macdMid} className="realtime-canvas-macd-zero" />

        {activeDepthLevel && activeDepthY != null ? (
          <g key={`depth-focus-${activeDepthLevel.key}-${isDepthLocked ? "locked" : "hover"}`} className="realtime-canvas-depth-focus-group">
            <line
              x1={dimensions.left}
              x2={activeDepthFocusLineEndX}
              y1={activeDepthY}
              y2={activeDepthY}
              className="realtime-canvas-depth-focus-line"
            />
            <circle
              cx={mapDepthX(activeDepthLevel.cumulative, activeDepthLevel.side)}
              cy={activeDepthY}
              r="4.2"
              className={
                activeDepthLevel.side === "bid"
                  ? "realtime-canvas-focus-marker realtime-canvas-focus-marker-bid"
                  : "realtime-canvas-focus-marker realtime-canvas-focus-marker-ask"
              }
            />
            {activeDepthPriceLabel && activeDepthBubbleY != null ? (
              <g>
                {activeDepthPointerY != null ? (
                  <polygon
                    points={`${activeDepthBubbleX},${activeDepthPointerY - 5} ${activeDepthBubbleX},${activeDepthPointerY + 5} ${activeDepthPointerTipX},${activeDepthPointerY}`}
                    className={
                      activeDepthLevel.side === "bid"
                        ? "realtime-canvas-depth-price-pointer realtime-canvas-depth-price-bubble-bid"
                        : "realtime-canvas-depth-price-pointer realtime-canvas-depth-price-bubble-ask"
                    }
                  />
                ) : null}
                <rect
                  x={activeDepthBubbleX}
                  y={activeDepthBubbleY}
                  width={activeDepthBubbleWidth}
                  height={activeDepthBubbleHeight}
                  rx="12"
                  className={
                    activeDepthLevel.side === "bid"
                      ? "realtime-canvas-depth-price-bubble realtime-canvas-depth-price-bubble-bid"
                      : "realtime-canvas-depth-price-bubble realtime-canvas-depth-price-bubble-ask"
                  }
                />
                <text
                  x={activeDepthBubbleX + activeDepthBubbleWidth / 2}
                  y={activeDepthBubbleY + 16}
                  textAnchor="middle"
                  className="realtime-canvas-depth-price-text"
                >
                  {activeDepthPriceLabel}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}

        {depthLevelsAvailable ? (
          <g>
            <rect
              x={depthInsetStart}
              y={dimensions.priceTop}
              width={depthInsetEnd - depthInsetStart}
              height={dimensions.priceBottom - dimensions.priceTop}
              rx="10"
              className="realtime-canvas-depth-shell"
            />
            <line
              x1={depthInsetCenter}
              x2={depthInsetCenter}
              y1={dimensions.priceTop + 4}
              y2={dimensions.priceBottom - 4}
              className="realtime-canvas-depth-centerline"
            />
            <text
              x={depthInsetCenter}
              y={dimensions.priceTop - 8}
              className="realtime-canvas-axis-label"
              textAnchor="middle"
            >
              Depth
            </text>
            <polygon
              points={buildDepthOverlayArea(bidLevels, "bid")}
              className="realtime-canvas-depth-area realtime-canvas-depth-area-bid"
            />
            <polygon
              points={buildDepthOverlayArea(askLevels, "ask")}
              className="realtime-canvas-depth-area realtime-canvas-depth-area-ask"
            />
            <polyline
              points={buildDepthOverlayLine(bidLevels, "bid")}
              className="realtime-canvas-depth-line realtime-canvas-depth-line-bid"
            />
            <polyline
              points={buildDepthOverlayLine(askLevels, "ask")}
              className="realtime-canvas-depth-line realtime-canvas-depth-line-ask"
            />
            {depthOverlayLevels.map((level) => {
              const y = mapPriceY(level.price);
              return (
                <rect
                  key={level.key}
                  x={depthInsetStart}
                  y={y - 7}
                  width={depthInsetEnd - depthInsetStart}
                  height="14"
                  rx="7"
                  className="realtime-canvas-depth-hitbox"
                  onMouseEnter={() => setHoveredDepthKey(level.key)}
                  onClick={(event) => {
                    event.stopPropagation();
                    const nextLockedDepthKey =
                      effectiveLockedDepthKey === level.key ? null : level.key;
                    setHoveredDepthKey(nextLockedDepthKey ? level.key : null);
                    setLockedDepthKey(nextLockedDepthKey);
                  }}
                />
              );
            })}
          </g>
        ) : null}

        {bandAreaPath ? (
          <polygon points={bandAreaPath} className="realtime-canvas-band-area" fill={`url(#${gradientId}-band)`} />
        ) : null}

        {snapshot.supportPrice != null ? (
          <g>
            <line
              x1={dimensions.left}
              x2={pricePanelEnd + 12}
              y1={mapPriceY(snapshot.supportPrice)}
              y2={mapPriceY(snapshot.supportPrice)}
              className="realtime-canvas-support-line"
            />
            <text
              x={dimensions.left + 6}
              y={mapPriceY(snapshot.supportPrice) - 6}
              className="realtime-canvas-level-label realtime-canvas-level-support"
            >
              支撑
            </text>
          </g>
        ) : null}

        {snapshot.resistancePrice != null ? (
          <g>
            <line
              x1={dimensions.left}
              x2={pricePanelEnd + 12}
              y1={mapPriceY(snapshot.resistancePrice)}
              y2={mapPriceY(snapshot.resistancePrice)}
              className="realtime-canvas-resistance-line"
            />
            <text
              x={dimensions.left + 6}
              y={mapPriceY(snapshot.resistancePrice) - 6}
              className="realtime-canvas-level-label realtime-canvas-level-resistance"
            >
              阻力
            </text>
          </g>
        ) : null}

        <line
          x1={dimensions.left}
          x2={pricePanelEnd + 12}
          y1={currentPriceY}
          y2={currentPriceY}
          className="realtime-canvas-price-line"
        />
        <text x={dimensions.width - 8} y={currentPriceY - 8} className="realtime-canvas-price-tag" textAnchor="end">
          Price {formatPrice(currentPrice > 0 ? currentPrice : snapshot.candles[snapshot.candles.length - 1]?.close ?? 0)}
        </text>

        {upperBandPath ? <path d={upperBandPath} className="realtime-canvas-band-line realtime-canvas-band-upper" /> : null}
        {middleBandPath ? <path d={middleBandPath} className="realtime-canvas-band-line realtime-canvas-band-middle" /> : null}
        {lowerBandPath ? <path d={lowerBandPath} className="realtime-canvas-band-line realtime-canvas-band-lower" /> : null}

        {snapshot.candles.map((candle, index) => {
          const x = mapX(index);
          const openY = mapPriceY(candle.open);
          const closeY = mapPriceY(candle.close);
          const highY = mapPriceY(candle.high);
          const lowY = mapPriceY(candle.low);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), 1.4);
          const directionClass =
            candle.close >= candle.open
              ? "realtime-canvas-candle realtime-canvas-candle-up"
              : "realtime-canvas-candle realtime-canvas-candle-down";

          return (
            <g key={candle.openTime}>
              <line x1={x} x2={x} y1={highY} y2={lowY} className={`${directionClass} realtime-canvas-wick`} />
              <rect
                x={x - candleBodyWidth / 2}
                y={bodyTop}
                width={candleBodyWidth}
                height={bodyHeight}
                rx="1.2"
                className={`${directionClass} realtime-canvas-body`}
              />
            </g>
          );
        })}

        {snapshot.macd.map((point, index) => {
          const x = mapX(index);
          const y = mapMacdY(point.histogram);
          const baseY = mapMacdY(0);
          return (
            <rect
              key={point.openTime}
              x={x - candleBodyWidth / 2}
              y={Math.min(y, baseY)}
              width={Math.max(candleBodyWidth - 1, 2)}
              height={Math.max(Math.abs(baseY - y), 1.2)}
              rx="1"
              className={
                point.histogram >= 0
                  ? "realtime-canvas-histogram realtime-canvas-histogram-positive"
                  : "realtime-canvas-histogram realtime-canvas-histogram-negative"
              }
            />
          );
        })}

        {macdPath ? <path d={macdPath} className="realtime-canvas-macd-line" /> : null}
        {signalPath ? <path d={signalPath} className="realtime-canvas-signal-line" /> : null}

        <text x={dimensions.left} y={dimensions.macdTop - 8} className="realtime-canvas-subtitle">
          MACD
        </text>
        <text x={dimensions.width - 8} y={dimensions.macdTop - 8} className="realtime-canvas-axis-label" textAnchor="end">
          {snapshot.interval}
        </text>
      </svg>

      <div className="chart-summary-strip chart-summary-strip-canvas">
        <article className="chart-summary-tile">
          <span>区间低点</span>
          <strong>{formatPrice(snapshot.low)}</strong>
        </article>
        <article className="chart-summary-tile">
          <span>当前价格</span>
          <strong>{formatPrice(currentPrice > 0 ? currentPrice : snapshot.candles[snapshot.candles.length - 1]?.close ?? 0)}</strong>
        </article>
        <article className="chart-summary-tile">
          <span>区间高点</span>
          <strong>{formatPrice(snapshot.high)}</strong>
        </article>
        <article className="chart-summary-tile">
          <span>波动区间</span>
          <strong>{snapshot.volatilityPercent.toFixed(2)}%</strong>
        </article>
        <article className="chart-summary-tile">
          <span>趋势状态</span>
          <strong>{snapshot.trend.label}</strong>
        </article>
      </div>
    </div>
  );
}

export function OverviewSignalRadar({ dimensions }: { dimensions: MarketDimension[] }) {
  const bullPolygon = buildPolygon(dimensions, (dimension) => {
    if (!dimension.enabled) {
      return 0;
    }

    return Math.max(dimension.score, 0) / 10;
  });
  const bearPolygon = buildPolygon(dimensions, (dimension) => {
    if (!dimension.enabled) {
      return 0;
    }

    return Math.max(-dimension.score, 0) / 10;
  });
  const center = 120;
  const radius = 82;
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="radar-wrap">
      <svg viewBox="0 0 240 240" className="radar-chart" aria-hidden="true">
        <circle cx={center} cy={center} r="10" className="radar-core-glow" />

        {rings.map((ratio) => (
          <polygon
            key={ratio}
            points={buildPolygon(dimensions, () => ratio)}
            className="radar-ring"
          />
        ))}

        {dimensions.map((dimension, index) => {
          const outer = polarPoint(index, dimensions.length, 1, center, radius);
          const label = polarPoint(index, dimensions.length, 1.22, center, radius);
          return (
            <g key={dimension.id}>
              <line
                x1={center}
                y1={center}
                x2={outer.x}
                y2={outer.y}
                className="radar-axis"
              />
              <text
                x={label.x}
                y={label.y}
                className={dimension.enabled ? "radar-label" : "radar-label radar-label-muted"}
                textAnchor={label.x > 172 ? "start" : label.x < 68 ? "end" : "middle"}
              >
                {dimension.shortLabel}
              </text>
            </g>
          );
        })}

        <polygon points={bearPolygon} className="radar-area radar-bear" />
        <polygon points={bullPolygon} className="radar-area radar-bull" />
      </svg>

      <div className="radar-legend">
        <span>
          <i className="legend-swatch legend-bull" />做多支持
        </span>
        <span>
          <i className="legend-swatch legend-bear" />做空压力
        </span>
      </div>
    </div>
  );
}

type OverviewOrderBookDepthChartProps = {
  depth: OrderBookDepth | null | undefined;
  currentPrice: number;
  formatPrice: (value: number) => string;
  formatCompactQuantity: (value: number) => string;
};

export function OverviewOrderBookDepthChart({
  depth,
  currentPrice,
  formatPrice,
  formatCompactQuantity
}: OverviewOrderBookDepthChartProps) {
  const gradientId = normalizeSvgId(useId());

  if (!depth || depth.bids.length === 0 || depth.asks.length === 0) {
    return (
      <div className="depth-card">
        <div className="depth-card-header">
          <div>
            <strong>订单簿实时深度图</strong>
            <p className="muted">当前没有可用盘口快照，恢复 Binance 深度流后会自动补齐。</p>
          </div>
        </div>
      </div>
    );
  }

  const bidLevels = [...depth.bids].sort((left, right) => left.price - right.price);
  const askLevels = [...depth.asks].sort((left, right) => left.price - right.price);
  const allLevels = [...bidLevels, ...askLevels];
  const minPrice = allLevels[0]?.price ?? currentPrice;
  const maxPrice = allLevels[allLevels.length - 1]?.price ?? currentPrice;
  const maxCumulative = Math.max(
    ...depth.bids.map((level) => level.cumulative),
    ...depth.asks.map((level) => level.cumulative),
    1
  );
  const width = 340;
  const height = 180;
  const topPadding = 18;
  const bottomPadding = 22;
  const usableHeight = height - topPadding - bottomPadding;

  const toX = (price: number) =>
    ((price - minPrice) / Math.max(maxPrice - minPrice, 1e-6)) * width;
  const toY = (cumulative: number) =>
    height - bottomPadding - (cumulative / Math.max(maxCumulative, 1)) * usableHeight;

  const buildPolyline = (levels: OrderBookDepth["bids"]) =>
    levels.map((level) => `${toX(level.price)},${toY(level.cumulative)}`).join(" ");

  const buildArea = (levels: OrderBookDepth["bids"]) => {
    const polyline = buildPolyline(levels);
    const firstX = toX(levels[0]?.price ?? minPrice);
    const lastX = toX(levels[levels.length - 1]?.price ?? maxPrice);
    const baselineY = height - bottomPadding;
    return `${firstX},${baselineY} ${polyline} ${lastX},${baselineY}`;
  };

  const bestBid = depth.bids[0];
  const bestAsk = depth.asks[0];
  const imbalancePercent = `${depth.imbalance >= 0 ? "+" : ""}${(depth.imbalance * 100).toFixed(1)}%`;
  const depthTone =
    depth.imbalance >= 0.18
      ? "depth-pill depth-pill-bull"
      : depth.imbalance <= -0.18
        ? "depth-pill depth-pill-bear"
        : "depth-pill";

  return (
    <div className="depth-card">
      <div className="depth-card-header">
        <div>
          <strong>订单簿实时深度图</strong>
          <p className="muted">主图已叠加盘口轮廓，这里保留 Binance 前十档累计挂单与失衡明细。</p>
        </div>
        <span className={depthTone}>失衡度 {imbalancePercent}</span>
      </div>

      <div className="depth-plot-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="depth-chart-svg" aria-hidden="true">
          <defs>
            <linearGradient id={`${gradientId}-bid`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 114, 98, 0.28)" />
              <stop offset="100%" stopColor="rgba(255, 114, 98, 0.03)" />
            </linearGradient>
            <linearGradient id={`${gradientId}-ask`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(69, 210, 189, 0.3)" />
              <stop offset="100%" stopColor="rgba(69, 210, 189, 0.03)" />
            </linearGradient>
          </defs>

          <line
            x1="0"
            y1={height - bottomPadding}
            x2={width}
            y2={height - bottomPadding}
            className="depth-baseline"
          />
          <line x1={toX(currentPrice)} y1="10" x2={toX(currentPrice)} y2={height - 10} className="depth-midline" />
          <polygon points={buildArea(bidLevels)} className="depth-area depth-area-bid" fill={`url(#${gradientId}-bid)`} />
          <polygon points={buildArea(askLevels)} className="depth-area depth-area-ask" fill={`url(#${gradientId}-ask)`} />
          <polyline points={buildPolyline(bidLevels)} className="depth-line depth-line-bid" />
          <polyline points={buildPolyline(askLevels)} className="depth-line depth-line-ask" />
        </svg>

        <div className="depth-axis-labels">
          <span>{formatPrice(minPrice)}</span>
          <span>盘口价格</span>
          <span>{formatPrice(maxPrice)}</span>
        </div>
      </div>

      <div className="depth-legend">
        <span>
          <i className="depth-legend-swatch depth-legend-bid" />
          买盘累计
        </span>
        <span>
          <i className="depth-legend-swatch depth-legend-ask" />
          卖盘累计
        </span>
        <span>
          <i className="depth-legend-swatch depth-legend-mid" />
          当前价
        </span>
      </div>

      <div className="chart-summary-row depth-summary-row">
        <span>买一 {formatPrice(bestBid.price)}</span>
        <span>卖一 {formatPrice(bestAsk.price)}</span>
        <span>价差 {depth.spreadPercent.toFixed(3)}%</span>
        <span>
          深度 {formatCompactQuantity(bestBid.cumulative)} / {formatCompactQuantity(bestAsk.cumulative)}
        </span>
      </div>
    </div>
  );
}
