type FundTechnicalSignalChartProps = {
  values: number[];
  action: "buy" | "sell" | "watch";
  support: number;
  resistance: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
};

function getActionClass(action: FundTechnicalSignalChartProps["action"]): string {
  if (action === "buy") {
    return "fund-technical-chart-buy";
  }

  if (action === "sell") {
    return "fund-technical-chart-sell";
  }

  return "fund-technical-chart-watch";
}

export function FundTechnicalSignalChart({
  values,
  action,
  support,
  resistance,
  bollingerUpper,
  bollingerMiddle,
  bollingerLower
}: FundTechnicalSignalChartProps) {
  const chartValues = values.length >= 2 ? values : [100, 100];
  const width = 360;
  const height = 156;
  const paddingX = 16;
  const paddingY = 16;
  const extraLines = [support, resistance, bollingerUpper, bollingerMiddle, bollingerLower];
  const minValue = Math.min(...chartValues, ...extraLines);
  const maxValue = Math.max(...chartValues, ...extraLines);
  const valueRange = Math.max(maxValue - minValue, 1);
  const mapX = (index: number) =>
    paddingX + (index / Math.max(chartValues.length - 1, 1)) * (width - paddingX * 2);
  const mapY = (value: number) =>
    height - paddingY - ((value - minValue) / valueRange) * (height - paddingY * 2);
  const linePath = chartValues
    .map((value, index) => `${index === 0 ? "M" : "L"}${mapX(index).toFixed(2)},${mapY(value).toFixed(2)}`)
    .join(" ");
  const firstX = mapX(0);
  const lastX = mapX(chartValues.length - 1);
  const baseY = height - paddingY;
  const fillPath = `${linePath} L${lastX.toFixed(2)},${baseY.toFixed(2)} L${firstX.toFixed(2)},${baseY.toFixed(2)} Z`;
  const currentValue = chartValues[chartValues.length - 1];
  const supportY = mapY(support);
  const resistanceY = mapY(resistance);
  const upperY = mapY(bollingerUpper);
  const middleY = mapY(bollingerMiddle);
  const lowerY = mapY(bollingerLower);
  const currentY = mapY(currentValue);

  return (
    <div className={`fund-technical-chart ${getActionClass(action)}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="fund-technical-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={fillPath} className="fund-technical-area" fill="url(#fund-technical-fill)" />
        <line x1={paddingX} x2={width - paddingX} y1={supportY} y2={supportY} className="fund-technical-support" />
        <line
          x1={paddingX}
          x2={width - paddingX}
          y1={resistanceY}
          y2={resistanceY}
          className="fund-technical-resistance"
        />
        <line x1={paddingX} x2={width - paddingX} y1={upperY} y2={upperY} className="fund-technical-boll" />
        <line x1={paddingX} x2={width - paddingX} y1={middleY} y2={middleY} className="fund-technical-boll-middle" />
        <line x1={paddingX} x2={width - paddingX} y1={lowerY} y2={lowerY} className="fund-technical-boll" />
        <path d={linePath} className="fund-technical-line" />
        <line x1={lastX} x2={lastX} y1={paddingY} y2={height - paddingY} className="fund-technical-current-line" />
        <circle cx={lastX} cy={currentY} r="4.2" className="fund-technical-current-dot" />
      </svg>
      <div className="fund-technical-chart-legend">
        <span><i className="fund-technical-legend-price" />近一年</span>
        <span><i className="fund-technical-legend-support" />支撑</span>
        <span><i className="fund-technical-legend-resistance" />压力</span>
        <span><i className="fund-technical-legend-boll" />BOLL</span>
      </div>
    </div>
  );
}
