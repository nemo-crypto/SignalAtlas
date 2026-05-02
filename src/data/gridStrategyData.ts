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
  defaultRangePercent: number;
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
    regime: "等待实时校准",
    mode: "压力支撑网格",
    buyZone: "等待 Binance 实时价格校准",
    trigger: "实时价格接入后，按当前价上下沿自动生成初始网格。",
    priority: "实时",
    readiness: 0,
    lowerPrice: 0,
    upperPrice: 0,
    defaultRangePercent: 4.2,
    gridCount: 12,
    investPerGrid: 150,
    support: "等待实时区间下沿",
    resistance: "等待实时区间上沿",
    fundingRate: "等待 Binance Futures",
    volatilityHint: "等待真实行情后按当前价自动校准区间",
    winRate: 0,
    note: "BTC 模板只保留格数和资金参数；价格区间必须由实时行情或用户手动输入。"
  },
  {
    symbol: "ETHUSDT",
    name: "Ethereum",
    regime: "等待实时校准",
    mode: "对称网格",
    buyZone: "等待 Binance 实时价格校准",
    trigger: "实时价格接入后，按当前价上下沿自动生成初始网格。",
    priority: "实时",
    readiness: 0,
    lowerPrice: 0,
    upperPrice: 0,
    defaultRangePercent: 5.0,
    gridCount: 10,
    investPerGrid: 120,
    support: "等待实时区间下沿",
    resistance: "等待实时区间上沿",
    fundingRate: "等待 Binance Futures",
    volatilityHint: "等待真实行情后按当前价自动校准区间",
    winRate: 0,
    note: "ETH 模板只保留格数和资金参数；价格区间必须由实时行情或用户手动输入。"
  },
  {
    symbol: "BNBUSDT",
    name: "BNB",
    regime: "等待实时校准",
    mode: "动态网格",
    buyZone: "等待 Binance 实时价格校准",
    trigger: "实时价格接入后，按当前价上下沿自动生成初始网格。",
    priority: "实时",
    readiness: 0,
    lowerPrice: 0,
    upperPrice: 0,
    defaultRangePercent: 5.2,
    gridCount: 9,
    investPerGrid: 90,
    support: "等待实时区间下沿",
    resistance: "等待实时区间上沿",
    fundingRate: "等待 Binance Futures",
    volatilityHint: "等待真实行情后按当前价自动校准区间",
    winRate: 0,
    note: "BNB 模板只保留格数和资金参数；价格区间必须由实时行情或用户手动输入。"
  }
];

export const gridChecklist = [
  "确认行情仍是震荡而非单边趋势，避免逆势越跌越补。",
  "确认 ATR 与成交量回落，说明网格不会被高波动反复穿透。",
  "确认资金费率没有极端拥挤，避免合约端形成挤仓。",
  "首次运行建议只使用总资金的 20%-30%，先观察一轮完整来回。"
];

export const gridBestPractices = [
  "先用纸交易演练模式跑通一轮，再考虑接入真实 WebSocket 与下单接口。",
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
    description: "页面刷新后恢复策略配置、已开仓格子和最近执行记录，方便连续跟踪。",
    tone: "cool"
  }
];
