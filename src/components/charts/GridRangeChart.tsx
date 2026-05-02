import type { GridSymbol } from "../../data/gridStrategyData";

type GridRangeChartProps = {
  symbol: GridSymbol;
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  levels: number[];
  currentPrice: number;
  priceTrail: number[];
  openSlots: number[];
  formatPrice: (value: number, symbol: GridSymbol) => string;
};

function formatAxisPrice(value: number, symbol: GridSymbol): string {
  const digits = symbol === "BNBUSDT" ? 2 : value >= 1000 ? 0 : 2;
  return value.toFixed(digits);
}

export function GridRangeChart({
  symbol,
  lowerPrice,
  upperPrice,
  gridCount,
  levels,
  currentPrice,
  priceTrail,
  openSlots,
  formatPrice
}: GridRangeChartProps) {
  const hasUsablePrice = Number.isFinite(currentPrice) && currentPrice > 0 && priceTrail.length > 0;

  if (!hasUsablePrice) {
    return (
      <div className="grid-chart-shell">
        <div className="grid-chart-header">
          <div>
            <strong>{symbol} Paper Grid</strong>
            <p className="muted">当前仍在等待 Binance 真实价格，拿到首笔行情后再展示执行轨迹。</p>
          </div>
          <span className="pill">当前价 --</span>
        </div>

        <div className="grid-chart-summary-strip">
          <article className="grid-chart-summary-card">
            <span>运行区间</span>
            <strong>
              {formatPrice(lowerPrice, symbol)} - {formatPrice(upperPrice, symbol)}
            </strong>
          </article>
          <article className="grid-chart-summary-card">
            <span>网格密度</span>
            <strong>
              {gridCount} 格 / 间距 {formatPrice(Math.max((upperPrice - lowerPrice) / Math.max(gridCount, 1), 0), symbol)}
            </strong>
          </article>
          <article className="grid-chart-summary-card">
            <span>短时动量</span>
            <strong>等待实价</strong>
          </article>
        </div>
      </div>
    );
  }

  const spacing = Math.max((upperPrice - lowerPrice) / Math.max(gridCount, 1), 1e-6);
  const chartMin = Math.min(lowerPrice - spacing * 1.6, ...priceTrail);
  const chartMax = Math.max(upperPrice + spacing * 1.6, ...priceTrail);
  const chartRange = Math.max(chartMax - chartMin, spacing * 2, 1);
  const chartHeight = 320;
  const chartWidth = 720;
  const priceDelta = currentPrice - priceTrail[Math.max(priceTrail.length - 2, 0)];
  const priceDeltaLabel = `${priceDelta >= 0 ? "+" : ""}${priceDelta.toFixed(2)}`;
  const openBuyLevels = new Set(openSlots.map((slotIndex) => levels[slotIndex]));
  const openSellTargets = new Set(openSlots.map((slotIndex) => levels[slotIndex + 1]));
  const rangeTop = Math.min(lowerPrice, upperPrice);
  const rangeBottom = Math.max(lowerPrice, upperPrice);

  const mapY = (price: number) => {
    return 14 + ((chartMax - price) / chartRange) * (chartHeight - 28);
  };

  const trailPolyline = priceTrail
    .map((price, index) => {
      const x = (index / Math.max(priceTrail.length - 1, 1)) * chartWidth;
      return `${x},${mapY(price).toFixed(2)}`;
    })
    .join(" ");
  const trailFill = `${trailPolyline} ${chartWidth},${chartHeight - 2} 0,${chartHeight - 2}`;
  const rangeBandY = mapY(rangeTop);
  const rangeBandHeight = Math.max(mapY(rangeBottom) - rangeBandY, 2);
  const currentY = mapY(currentPrice);
  const upperY = mapY(upperPrice);
  const lowerY = mapY(lowerPrice);
  const priceDeltaClassName =
    priceDelta >= 0 ? "trend-text-up trend-text-emphasis" : "trend-text-down trend-text-emphasis";

  return (
    <div className="grid-chart-shell">
      <div className="grid-chart-header">
        <div>
          <strong>{symbol} Paper Grid</strong>
          <p className="muted">把运行区间、当前价格、挂单方向和短时轨迹压缩进同一张执行图。</p>
        </div>
        <span className="pill">当前价 {formatPrice(currentPrice, symbol)}</span>
      </div>

      <div className="grid-chart-summary-strip">
        <article className="grid-chart-summary-card">
          <span>运行区间</span>
          <strong>
            {formatPrice(lowerPrice, symbol)} - {formatPrice(upperPrice, symbol)}
          </strong>
        </article>
        <article className="grid-chart-summary-card">
          <span>网格密度</span>
          <strong>
            {gridCount} 格 / 间距 {formatPrice(spacing, symbol)}
          </strong>
        </article>
        <article className="grid-chart-summary-card">
          <span>短时动量</span>
          <strong className={priceDeltaClassName}>{priceDeltaLabel}</strong>
        </article>
      </div>

      <svg className="grid-chart-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="grid-range-band" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(106, 153, 255, 0.28)" />
            <stop offset="100%" stopColor="rgba(69, 210, 189, 0.08)" />
          </linearGradient>
          <linearGradient id="grid-trail-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 159, 90, 0.26)" />
            <stop offset="100%" stopColor="rgba(255, 159, 90, 0.02)" />
          </linearGradient>
        </defs>

        <rect
          x="0"
          y={rangeBandY}
          width={chartWidth}
          height={rangeBandHeight}
          rx="3"
          className="grid-chart-range-band"
          fill="url(#grid-range-band)"
        />

        {levels.map((level) => (
          <g key={level}>
            <line x1="0" x2={chartWidth} y1={mapY(level)} y2={mapY(level)} className="grid-chart-level-line" />
            <text x={chartWidth - 14} y={mapY(level) - 5} className="grid-chart-label">
              {formatAxisPrice(level, symbol)}
            </text>
          </g>
        ))}

        <line x1="0" x2={chartWidth} y1={upperY} y2={upperY} className="grid-chart-boundary-line" />
        <line x1="0" x2={chartWidth} y1={lowerY} y2={lowerY} className="grid-chart-boundary-line" />
        <polygon points={trailFill} className="grid-chart-trail-fill" fill="url(#grid-trail-fill)" />
        <polyline points={trailPolyline} className="grid-chart-trail" />
        <line x1="0" x2={chartWidth} y1={currentY} y2={currentY} className="grid-chart-price-line" />
        <circle cx={chartWidth - 24} cy={currentY} r="5.5" className="grid-chart-price-dot" />

        {Array.from(openBuyLevels).map((level) => (
          <circle key={`buy-${level}`} cx="64" cy={mapY(level)} r="5.5" className="grid-chart-buy-dot" />
        ))}
        {Array.from(openSellTargets).map((level) => (
          <circle key={`sell-${level}`} cx={chartWidth - 64} cy={mapY(level)} r="5.5" className="grid-chart-sell-dot" />
        ))}
      </svg>

      <div className="grid-chart-legend">
        <span>
          <i className="grid-legend-dot grid-legend-current" />
          当前价格线
        </span>
        <span>
          <i className="grid-legend-dot grid-legend-buy" />
          已挂买单
        </span>
        <span>
          <i className="grid-legend-dot grid-legend-sell" />
          已挂卖单
        </span>
        <span>
          <i className="grid-legend-dot grid-legend-range" />
          有效运行区
        </span>
      </div>
    </div>
  );
}
