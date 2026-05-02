import type { TechnicalSignal } from "../../services/ashareTechnicalSignals";

type FundDetailTechnicalChartProps = {
  values: number[];
  signal: TechnicalSignal;
};

function buildLinePath(values: number[], mapX: (index: number) => number, mapY: (value: number) => number): string {
  return values
    .map((value, index) => `${index === 0 ? "M" : "L"}${mapX(index).toFixed(2)},${mapY(value).toFixed(2)}`)
    .join(" ");
}

export function FundDetailTechnicalChart({
  values,
  signal
}: FundDetailTechnicalChartProps) {
  const chartValues = values.length >= 2 ? values : [100, 100];
  const width = 960;
  const height = 520;
  const left = 42;
  const right = 72;
  const priceTop = 32;
  const priceBottom = 318;
  const macdTop = 370;
  const macdBottom = 482;
  const extraValues = [
    signal.support,
    signal.resistance,
    signal.bollingerUpper,
    signal.bollingerMiddle,
    signal.bollingerLower
  ];
  const minValue = Math.min(...chartValues, ...extraValues);
  const maxValue = Math.max(...chartValues, ...extraValues);
  const padding = Math.max((maxValue - minValue) * 0.12, 1);
  const priceMin = minValue - padding;
  const priceMax = maxValue + padding;
  const plotWidth = width - left - right;
  const slotWidth = plotWidth / Math.max(chartValues.length - 1, 1);
  const mapX = (index: number) => left + slotWidth * index;
  const mapY = (value: number) =>
    priceBottom -
    ((value - priceMin) / Math.max(priceMax - priceMin, 1e-6)) *
      (priceBottom - priceTop);
  const pricePath = buildLinePath(chartValues, mapX, mapY);
  const fillPath = `${pricePath} L${mapX(chartValues.length - 1).toFixed(2)},${priceBottom} L${left},${priceBottom} Z`;
  const priceGridValues = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return priceMax - (priceMax - priceMin) * ratio;
  });
  const macdValues = chartValues.map((value, index) => {
    const previous = chartValues[Math.max(index - 1, 0)];
    return value - previous;
  });
  const macdMax = Math.max(...macdValues.map((value) => Math.abs(value)), Math.abs(signal.macdHistogram), 0.1);
  const macdMid = (macdTop + macdBottom) / 2;
  const mapMacdY = (value: number) =>
    macdMid - (value / macdMax) * ((macdBottom - macdTop) / 2 - 8);

  return (
    <div className="fund-detail-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="fund-detail-price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 203, 159, 0.24)" />
            <stop offset="100%" stopColor="rgba(255, 203, 159, 0.02)" />
          </linearGradient>
        </defs>
        {priceGridValues.map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={mapY(value)} y2={mapY(value)} className="fund-detail-grid" />
            <text x={width - right + 10} y={mapY(value) + 4} className="fund-detail-axis-label">
              {value.toFixed(1)}
            </text>
          </g>
        ))}
        <path d={fillPath} fill="url(#fund-detail-price-fill)" className="fund-detail-area" />
        <line x1={left} x2={width - right} y1={mapY(signal.support)} y2={mapY(signal.support)} className="fund-detail-support" />
        <line x1={left} x2={width - right} y1={mapY(signal.resistance)} y2={mapY(signal.resistance)} className="fund-detail-resistance" />
        <line x1={left} x2={width - right} y1={mapY(signal.bollingerUpper)} y2={mapY(signal.bollingerUpper)} className="fund-detail-boll" />
        <line x1={left} x2={width - right} y1={mapY(signal.bollingerMiddle)} y2={mapY(signal.bollingerMiddle)} className="fund-detail-boll-middle" />
        <line x1={left} x2={width - right} y1={mapY(signal.bollingerLower)} y2={mapY(signal.bollingerLower)} className="fund-detail-boll" />
        <path d={pricePath} className="fund-detail-price-line" />
        <circle
          cx={mapX(chartValues.length - 1)}
          cy={mapY(chartValues[chartValues.length - 1])}
          r="6"
          className="fund-detail-current-dot"
        />
        <text x={left} y={mapY(signal.support) - 8} className="fund-detail-level-label">支撑 {signal.support.toFixed(1)}</text>
        <text x={left} y={mapY(signal.resistance) - 8} className="fund-detail-level-label">压力 {signal.resistance.toFixed(1)}</text>
        <line x1={left} x2={width - right} y1={macdMid} y2={macdMid} className="fund-detail-macd-zero" />
        {macdValues.map((value, index) => {
          const barWidth = Math.max(slotWidth * 0.42, 4);
          const x = mapX(index) - barWidth / 2;
          const y = value >= 0 ? mapMacdY(value) : macdMid;
          const barHeight = Math.abs(mapMacdY(value) - macdMid);

          return (
            <rect
              key={`${value}-${index}`}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx="2"
              className={value >= 0 ? "fund-detail-macd-bar-up" : "fund-detail-macd-bar-down"}
            />
          );
        })}
        <text x={left} y={macdTop - 12} className="fund-detail-level-label">
          MACD Histogram {signal.macdHistogram.toFixed(2)}
        </text>
      </svg>
      <div className="fund-detail-chart-legend">
        <span><i className="fund-detail-legend-price" />价格/净值</span>
        <span><i className="fund-detail-legend-support" />支撑位</span>
        <span><i className="fund-detail-legend-resistance" />压力位</span>
        <span><i className="fund-detail-legend-boll" />布林轨</span>
        <span><i className="fund-detail-legend-macd" />MACD</span>
      </div>
    </div>
  );
}
