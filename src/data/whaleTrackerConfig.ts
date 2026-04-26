import type {
  WhaleMethodCard,
  WhaleRulePreset,
  WhaleSymbolMeta
} from "./whaleTrackerTypes";

export const whaleSymbols: WhaleSymbolMeta[] = [
  {
    symbol: "BTCUSDT",
    name: "Bitcoin",
    note: "主导盘口与突破方向，适合先看买墙是否真实承接。"
  },
  {
    symbol: "ETHUSDT",
    name: "Ethereum",
    note: "大额追价更快反映情绪，适合结合多空比与资金费率。"
  },
  {
    symbol: "BNBUSDT",
    name: "BNB",
    note: "弹性和承接通常更同步，适合结合盘口与期货背景一起看。"
  },
  {
    symbol: "SOLUSDT",
    name: "Solana",
    note: "弹性高但噪音也大，建议使用更高的成交额阈值。"
  }
];

export const whaleRulePresets: WhaleRulePreset[] = [
  {
    id: "single-large-buy",
    title: "单笔主动买入阈值",
    detail: "单笔价值超过阈值时立即升级告警，用来识别一次性扫单。",
    threshold: ">$500K"
  },
  {
    id: "split-order-burst",
    title: "连续拆单聚合",
    detail: "同一成交簇在 3 分钟内连续主动买入两次以上，视为同一意图的拆单执行。",
    threshold: "3 分钟 / 2 笔+"
  },
  {
    id: "buy-wall-confirmation",
    title: "买墙真实性校验",
    detail: "只有买墙占比高且撤单风险低，才把订单簿信号计入看多结论。",
    threshold: "墙体 > 30%"
  }
];

export const whaleMethodCards: WhaleMethodCard[] = [
  {
    id: "agg-trade",
    title: "成交流识别大单",
    description: "直接读取 Binance `@aggTrade`，用成交额、方向与连续性识别大户主动买盘。",
    emphasis: "短线最直接，优先级最高。",
    tone: "active"
  },
  {
    id: "order-book",
    title: "订单簿监测买墙",
    description: "关注买墙占比、吃单速度与撤单率，判断是护盘还是诱骗。",
    emphasis: "适合做确认，不建议单独使用。",
    tone: "warm"
  },
  {
    id: "futures-context",
    title: "衍生品背景确认",
    description: "结合 Binance Futures 的资金费率、多空比与未平仓变化，判断杠杆是否拥挤。",
    emphasis: "适合作为背景确认，不直接替代成交信号。",
    tone: "cool"
  }
];

export const whaleBestPractices = [
  "区分挂单与成交：订单簿大单可能只是诱饵，真实意图要以成交面为准。",
  "避免信号噪音：阈值过低会让小额成交淹没真正的大单。",
  "处理 WebSocket 重连：币安连接会定期断开，生产实现必须能自动恢复。",
  "优先使用多币对合并流，减少连接数与状态同步复杂度。",
  "把大单行为放回趋势、关键位和杠杆背景里解读，不要孤立下结论。"
];

export const whaleConceptCards: WhaleMethodCard[] = [
  {
    id: "exchange-trade",
    title: "交易所内成交",
    description: "表示盘口里真实发生的买入或卖出，直接影响价格和订单簿。",
    emphasis: "适合做短线触发与即时风控。",
    tone: "active"
  },
  {
    id: "derivatives-context",
    title: "衍生品背景",
    description: "表示杠杆资金的拥挤度与风险偏好，更适合作为成交后的背景确认。",
    emphasis: "适合做结构过滤，不应直接等同于买入。",
    tone: "cool"
  }
];
