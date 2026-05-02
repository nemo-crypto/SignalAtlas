import { useId } from "react";

type FundTrendSparklineProps = {
  values: number[];
  changePercent: number;
};

function getTone(changePercent: number): "up" | "down" | "neutral" {
  if (changePercent > 0.15) {
    return "up";
  }

  if (changePercent < -0.15) {
    return "down";
  }

  return "neutral";
}

export function FundTrendSparkline({
  values,
  changePercent
}: FundTrendSparklineProps) {
  const gradientId = useId().replace(/:/g, "");
  const chartValues = values.length >= 2 ? values : [100, 100];
  const width = 180;
  const height = 76;
  const paddingX = 8;
  const paddingY = 10;
  const minValue = Math.min(...chartValues);
  const maxValue = Math.max(...chartValues);
  const valueRange = Math.max(maxValue - minValue, 1);
  const tone = getTone(changePercent);

  const mapX = (index: number) =>
    paddingX + (index / Math.max(chartValues.length - 1, 1)) * (width - paddingX * 2);
  const mapY = (value: number) =>
    height - paddingY - ((value - minValue) / valueRange) * (height - paddingY * 2);

  const linePath = chartValues
    .map((value, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${mapX(index).toFixed(2)},${mapY(value).toFixed(2)}`;
    })
    .join(" ");
  const firstX = mapX(0);
  const lastX = mapX(chartValues.length - 1);
  const baseY = height - paddingY;
  const areaPath = `${linePath} L${lastX.toFixed(2)},${baseY.toFixed(2)} L${firstX.toFixed(2)},${baseY.toFixed(2)} Z`;
  const endValue = chartValues[chartValues.length - 1];

  return (
    <svg
      className={`fund-trend-sparkline fund-trend-sparkline-${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`fund-spark-${gradientId}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={paddingX} x2={width - paddingX} y1={baseY} y2={baseY} className="fund-trend-axis" />
      <path d={areaPath} className="fund-trend-area" fill={`url(#fund-spark-${gradientId})`} />
      <path d={linePath} className="fund-trend-line" />
      <circle cx={lastX} cy={mapY(endValue)} r="3.2" className="fund-trend-dot" />
    </svg>
  );
}
