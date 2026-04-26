export type GridSymbol = "BTCUSDT" | "ETHUSDT" | "BNBUSDT";

export type GridPreset = {
  symbol: GridSymbol;
  name: string;
  regime: string;
  mode: "对称网格" | "压力支撑网格" | "动态网格";
  buyZone: string;
  trigger: string;
  priority: string;
  readiness: number;
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  investPerGrid: number;
  support: string;
  resistance: string;
  fundingRate: string;
  volatilityHint: string;
  winRate: number;
  note: string;
};

export type GridMethodCard = {
  id: string;
  title: string;
  emphasis: string;
  description: string;
  tone: "active" | "warm" | "cool";
};

export const gridPresets: GridPreset[] = [
  {
    symbol: "BTCUSDT",
    name: "Bitcoin",
    regime: "震荡偏强",
    mode: "压力支撑网格",
    buyZone: "67,900 - 68,380",
    trigger: "回踩买墙且量能回落，Taker Buy Ratio > 0.58",
    priority: "A",
    readiness: 84,
    lowerPrice: 66600,
    upperPrice: 69400,
    gridCount: 12,
    investPerGrid: 150,
    support: "$67,980 订单簿承接",
    resistance: "$69,180 短线抛压",
    fundingRate: "-0.011%",
    volatilityHint: "ATR 回落，适合做中密度网格",
    winRate: 72,
    note: "BTC 中枢清晰，适合用支撑/压力边界布网格。"
  },
  {
    symbol: "ETHUSDT",
    name: "Ethereum",
    regime: "高位回踩",
    mode: "对称网格",
    buyZone: "3,188 - 3,228",
    trigger: "4H 布林中轨企稳且 BTC 未失守关键位",
    priority: "A-",
    readiness: 76,
    lowerPrice: 3140,
    upperPrice: 3335,
    gridCount: 10,
    investPerGrid: 120,
    support: "$3,210 中轨支撑",
    resistance: "$3,290 卖压回补区",
    fundingRate: "+0.024%",
    volatilityHint: "波动适中，但更依赖 BTC 方向",
    winRate: 66,
    note: "ETH 适合对称布网，但要控制网格间距别太密。"
  },
  {
    symbol: "BNBUSDT",
    name: "BNB",
    regime: "箱体整理",
    mode: "动态网格",
    buyZone: "596 - 603",
    trigger: "箱体下沿企稳且链上净流出继续放大",
    priority: "B+",
    readiness: 71,
    lowerPrice: 588,
    upperPrice: 618,
    gridCount: 9,
    investPerGrid: 90,
    support: "$598 护盘墙",
    resistance: "$610 - $612 供应带",
    fundingRate: "+0.009%",
    volatilityHint: "更适合小区间动态跟随，不宜重仓",
    winRate: 61,
    note: "BNB 更适合轻仓动态网格，收益稳但突破要及时停机。"
  }
];

export const gridChecklist = [
  "确认行情仍是震荡而非单边趋势，避免逆势越跌越补。",
  "确认 ATR 与成交量回落，说明网格不会被高波动反复穿透。",
  "确认资金费率没有极端拥挤，避免合约端形成挤仓。",
  "首次运行建议只使用总资金的 20%-30%，先观察一轮完整来回。"
];

export const gridBestPractices = [
  "先用模拟交易模式跑通一轮，再考虑接入真实 WebSocket 与下单接口。",
  "网格数量增加会提升成交频率，但也会提高手续费与噪音成本。",
  "突破区间后要及时停机，别把震荡策略硬扛成趋势死扛。",
  "保存策略快照很重要，刷新页面后至少要保留配置、持仓和最近成交记录。"
];

export const gridMethodCards: GridMethodCard[] = [
  {
    id: "config-panel",
    title: "配置面板",
    emphasis: "先定边界，再定格数与资金。",
    description: "先设定上下沿、网格格数和每格投入，再决定是否启动纸交易引擎。",
    tone: "active"
  },
  {
    id: "grid-engine",
    title: "网格命中引擎",
    emphasis: "下穿买、上穿卖。",
    description: "价格跌破网格线触发买单，反弹到上一格上方时自动记一次卖出和平仓。",
    tone: "warm"
  },
  {
    id: "state-snapshot",
    title: "本地快照",
    emphasis: "配置与订单历史都要保留。",
    description: "页面刷新后恢复策略配置、已开仓格子和最近执行记录，符合 PRD 的快照思路。",
    tone: "cool"
  }
];
