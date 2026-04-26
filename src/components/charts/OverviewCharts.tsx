import { useId } from "react";
import type { MarketDimension, OrderBookDepth } from "../../data/mockData";

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

export function OverviewPriceSparkline({ points }: { points: number[] }) {
  const gradientId = normalizeSvgId(useId());
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const mapY = (point: number) => 42 - ((point - min) / range) * 30;
  const polyline = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = mapY(point);
      return `${x},${y}`;
    })
    .join(" ");
  const lastPoint = points[points.length - 1] ?? min;
  const lastY = mapY(lastPoint);

  return (
    <div className="sparkline-shell">
      <svg className="sparkline" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 159, 90, 0.4)" />
            <stop offset="100%" stopColor="rgba(255, 159, 90, 0.02)" />
          </linearGradient>
        </defs>

        {[10, 20, 30, 40].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} className="sparkline-grid-line" />
        ))}

        <polyline points={`0,42 ${polyline} 100,42`} fill={`url(#${gradientId}-fill)`} stroke="none" />
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="100" cy={lastY} r="4.8" className="sparkline-end-glow" />
        <circle cx="100" cy={lastY} r="2.6" className="sparkline-end-dot" />
      </svg>
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
          <p className="muted">基于 Binance 前十档深度，展示累计挂单曲线与盘口失衡。</p>
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
