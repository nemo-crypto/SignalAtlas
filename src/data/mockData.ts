export type Sentiment = "bullish" | "bearish" | "neutral";

export type DimensionMetric = {
  label: string;
  value: string;
  insight: string;
};

export type MarketDimension = {
  id: string;
  name: string;
  shortLabel: string;
  weight: number;
  enabled: boolean;
  score: number;
  sentiment: Sentiment;
  signal: string;
  summary: string;
  note: string;
  details: DimensionMetric[];
};

export type SignalHistoryItem = {
  id?: string;
  recordedAt?: number;
  confidence?: number | null;
  time: string;
  symbol: string;
  signal: string;
  triggerPrice: string;
  after1hPrice: string;
  marketPnl?: string;
  pnl: string;
  accuracy: string;
  signalTone?: Sentiment;
  resolved?: boolean;
  marketPnlValue?: number | null;
  pnlValue?: number | null;
  outcome?: "correct" | "incorrect" | "warning" | "pending";
};

export type OrderBookDepthLevel = {
  price: number;
  quantity: number;
  cumulative: number;
};

export type OrderBookDepth = {
  bids: OrderBookDepthLevel[];
  asks: OrderBookDepthLevel[];
  spreadPercent: number;
  imbalance: number;
};

export type MarketOverview = {
  symbol: string;
  displayName: string;
  price: number;
  change24h: number;
  fundingRate: string;
  longShortRatio: string;
  openInterest: string;
  validity: string;
  riskNote: string;
  support: string;
  resistance: string;
  defaultAlertPrice: number;
  sparkline: number[];
  orderBookDepth?: OrderBookDepth | null;
  reportHighlights: string[];
  dimensions: MarketDimension[];
  history: SignalHistoryItem[];
};

export const signalUniverse: Record<string, MarketOverview> = {
  BTCUSDT: {
    symbol: "BTCUSDT",
    displayName: "Bitcoin",
    price: 68520,
    change24h: 3.42,
    fundingRate: "-0.015%",
    longShortRatio: "0.68",
    openInterest: "+8.4%",
    validity: "约 45 分钟",
    riskNote: "4H RSI 接近 68，若冲高量能衰减，短线要防止假突破。",
    support: "$68,300 买方墙",
    resistance: "$69,180 短线抛压",
    defaultAlertPrice: 69000,
    sparkline: [67280, 67340, 67420, 67580, 67620, 67740, 67980, 68040, 68190, 68280, 68410, 68520],
    orderBookDepth: {
      bids: [
        { price: 68510, quantity: 8.4, cumulative: 8.4 },
        { price: 68500, quantity: 10.2, cumulative: 18.6 },
        { price: 68490, quantity: 12.8, cumulative: 31.4 },
        { price: 68480, quantity: 15.6, cumulative: 47 },
        { price: 68470, quantity: 18.9, cumulative: 65.9 },
        { price: 68460, quantity: 22.4, cumulative: 88.3 }
      ],
      asks: [
        { price: 68530, quantity: 7.8, cumulative: 7.8 },
        { price: 68540, quantity: 9.1, cumulative: 16.9 },
        { price: 68550, quantity: 11.4, cumulative: 28.3 },
        { price: 68560, quantity: 13.2, cumulative: 41.5 },
        { price: 68570, quantity: 14.8, cumulative: 56.3 },
        { price: 68580, quantity: 17.6, cumulative: 73.9 }
      ],
      spreadPercent: 0.03,
      imbalance: 0.24
    },
    reportHighlights: [
      "多周期共振维度拿到 6/6 分，15m、1H、4H 同向偏多。",
      "资金费率转负且多空比仅 0.68，存在逼空弹性。",
      "订单簿在 68,300 一带出现显著买方墙，回踩有承接。"
    ],
    dimensions: [
      {
        id: "trend",
        name: "趋势维度",
        shortLabel: "趋势",
        weight: 8,
        enabled: true,
        score: 8,
        sentiment: "bullish",
        signal: "EMA 多头排列 + ADX 强势",
        summary: "EMA9 > EMA21 > EMA50，趋势结构完整。",
        note: "只要价格继续站稳 9EMA，上升趋势仍优先。",
        details: [
          { label: "EMA 排列", value: "9 > 21 > 50", insight: "典型多头排列" },
          { label: "ADX(14)", value: "32", insight: "趋势市而非震荡市" },
          { label: "价格 / 200EMA", value: "1.07", insight: "处在强势区但未极端偏离" }
        ]
      },
      {
        id: "momentum",
        name: "动量维度",
        shortLabel: "动量",
        weight: 9,
        enabled: true,
        score: 6,
        sentiment: "bullish",
        signal: "MACD 金叉延续，RSI 未过热",
        summary: "动量仍偏多，但靠近短线过热区域。",
        note: "如果 RSI 突破 70 且量能跟不上，需要降低追高意愿。",
        details: [
          { label: "RSI(14)", value: "64", insight: "偏强但未到超买极值" },
          { label: "MACD", value: "柱状图翻正", insight: "快线继续位于慢线上方" },
          { label: "随机 RSI", value: "24 / 18", insight: "K 线二次上穿 D 线" }
        ]
      },
      {
        id: "volume",
        name: "成交量维度",
        shortLabel: "量能",
        weight: 7,
        enabled: true,
        score: 7,
        sentiment: "bullish",
        signal: "放量上涨确认突破有效",
        summary: "量价共振明显，OBV 与 CMF 同步走强。",
        note: "后续若出现价涨量缩，需警惕上涨衰竭。",
        details: [
          { label: "量比", value: "1.7x", insight: "高于 20 均量阈值" },
          { label: "OBV", value: "日内新高", insight: "资金随价格同步流入" },
          { label: "CMF(21)", value: "0.16", insight: "处于明显资金流入区" }
        ]
      },
      {
        id: "volatility",
        name: "波动率维度",
        shortLabel: "波动",
        weight: 6,
        enabled: true,
        score: 1,
        sentiment: "neutral",
        signal: "波动率扩张初段",
        summary: "ATR 开始抬升，但还没进入风险极端区。",
        note: "若 HV 继续冲向 80% 分位，短线波动风险会显著增加。",
        details: [
          { label: "布林带宽度", value: "12.4%", insight: "刚脱离挤压区" },
          { label: "ATR(14)", value: "915", insight: "波动扩张启动但尚可控" },
          { label: "HV 分位", value: "61%", insight: "中高但未达到情绪高潮" }
        ]
      },
      {
        id: "money-flow",
        name: "资金流维度",
        shortLabel: "资金",
        weight: 8,
        enabled: true,
        score: 8,
        sentiment: "bullish",
        signal: "主动买盘占优 + 大单扫货",
        summary: "聪明钱持续流入，现货 CVD 与 Taker 比均偏多。",
        note: "若大单停止追价且 CVD 转平，容易进入高位震荡。",
        details: [
          { label: "现货 CVD", value: "15m 新高", insight: "成交主动性偏买方" },
          { label: "Taker 买卖比", value: "1.34", insight: "高于 1.2 阈值" },
          { label: "大额成交", value: "68 BTC 扫单", insight: "过去 1 小时出现两次追价买入" }
        ]
      },
      {
        id: "sentiment",
        name: "市场情绪维度",
        shortLabel: "情绪",
        weight: 7,
        enabled: true,
        score: 5,
        sentiment: "bullish",
        signal: "空头拥挤，情绪反向利多",
        summary: "资金费率转负，多空比过低，具备反身性上冲条件。",
        note: "如果费率快速回正，说明逼空红利已被市场消化。",
        details: [
          { label: "资金费率", value: "-0.015%", insight: "空头拥挤，存在逼空可能" },
          { label: "多空比", value: "0.68", insight: "散户明显偏空" },
          { label: "未平仓合约", value: "+8.4%", insight: "新资金正持续入场" }
        ]
      },
      {
        id: "on-chain",
        name: "链上数据维度",
        shortLabel: "链上",
        weight: 6,
        enabled: true,
        score: 0,
        sentiment: "neutral",
        signal: "链上数据中性偏稳",
        summary: "交易所余额略降，但还不足以形成强驱动。",
        note: "本阶段保留占位，后续可接入公开链上数据源。",
        details: [
          { label: "交易所储备", value: "-1.2%", insight: "偏利多但力度一般" },
          { label: "长线持有比例", value: "稳定", insight: "没有出现明显派发" },
          { label: "矿工流出", value: "暂不可用", insight: "纯前端阶段仅展示占位" }
        ]
      },
      {
        id: "multi-timeframe",
        name: "多周期共振",
        shortLabel: "共振",
        weight: 9,
        enabled: true,
        score: 9,
        sentiment: "bullish",
        signal: "15m / 1H / 4H 三周期同向",
        summary: "这是当前最强的看涨来源，短中长周期共振明显。",
        note: "一旦 1H 动量先转弱，综合信号会明显回落。",
        details: [
          { label: "15m", value: "+1", insight: "EMA9 > EMA21 且价格站上 9EMA" },
          { label: "1H", value: "+2", insight: "MACD 柱状图为正且 RSI > 50" },
          { label: "4H", value: "+3", insight: "价格位于 200EMA 上方，ADX > 25" }
        ]
      },
      {
        id: "order-book",
        name: "订单簿维度",
        shortLabel: "订单簿",
        weight: 7,
        enabled: true,
        score: 6,
        sentiment: "bullish",
        signal: "买盘失衡 + 买方墙支撑",
        summary: "短线深度分布偏多，回踩更容易得到承接。",
        note: "如果买一反复撤单，需提防虚假流动性。",
        details: [
          { label: "失衡度", value: "0.24", insight: "超过 0.2 的买方优势阈值" },
          { label: "买方墙", value: "$68,300", insight: "单档挂单量占总深度 31%" },
          { label: "价差", value: "0.03%", insight: "流动性良好，适合分批执行" }
        ]
      },
      {
        id: "macro",
        name: "宏观关联维度",
        shortLabel: "宏观",
        weight: 4,
        enabled: true,
        score: 1,
        sentiment: "neutral",
        signal: "宏观背景偏友好但不是主导变量",
        summary: "风险资产情绪稳定，对 BTC 有边际支撑。",
        note: "宏观维度当前只做辅助，不建议单独驱动交易决策。",
        details: [
          { label: "DXY", value: "104.2", insight: "短线震荡，对风险资产压制有限" },
          { label: "标普期货", value: "+0.3%", insight: "外围风险偏好回暖" },
          { label: "恐惧贪婪", value: "71", insight: "市场乐观但未极度亢奋" }
        ]
      }
    ],
    history: [
      {
        time: "14:32",
        symbol: "BTC",
        signal: "强烈买入",
        confidence: 82,
        triggerPrice: "$68,420",
        after1hPrice: "$69,100",
        marketPnl: "+0.99%",
        pnl: "+0.99%",
        accuracy: "✅"
      },
      {
        time: "11:48",
        symbol: "BTC",
        signal: "谨慎买入",
        confidence: 61,
        triggerPrice: "$67,980",
        after1hPrice: "$68,260",
        marketPnl: "+0.41%",
        pnl: "+0.41%",
        accuracy: "✅"
      },
      {
        time: "09:15",
        symbol: "BTC",
        signal: "中性观望",
        confidence: 34,
        triggerPrice: "$67,520",
        after1hPrice: "$67,460",
        marketPnl: "-0.09%",
        pnl: "-0.09%",
        accuracy: "⚠️"
      }
    ]
  },
  ETHUSDT: {
    symbol: "ETHUSDT",
    displayName: "Ethereum",
    price: 3248,
    change24h: 1.18,
    fundingRate: "+0.037%",
    longShortRatio: "1.42",
    openInterest: "+2.1%",
    validity: "约 30 分钟",
    riskNote: "ETH 短线多头拥挤，若 BTC 回落，ETH 更容易先出现补跌。",
    support: "$3,210 结构支撑",
    resistance: "$3,290 卖方墙",
    defaultAlertPrice: 3290,
    sparkline: [3186, 3192, 3198, 3206, 3218, 3224, 3231, 3236, 3241, 3245, 3249, 3248],
    orderBookDepth: {
      bids: [
        { price: 3247.5, quantity: 21.6, cumulative: 21.6 },
        { price: 3247, quantity: 24.2, cumulative: 45.8 },
        { price: 3246.5, quantity: 27.1, cumulative: 72.9 },
        { price: 3246, quantity: 31.7, cumulative: 104.6 },
        { price: 3245.5, quantity: 34.8, cumulative: 139.4 },
        { price: 3245, quantity: 38.5, cumulative: 177.9 }
      ],
      asks: [
        { price: 3248.5, quantity: 22.8, cumulative: 22.8 },
        { price: 3249, quantity: 26.1, cumulative: 48.9 },
        { price: 3249.5, quantity: 28.9, cumulative: 77.8 },
        { price: 3250, quantity: 33.4, cumulative: 111.2 },
        { price: 3250.5, quantity: 36.8, cumulative: 148 },
        { price: 3251, quantity: 41.2, cumulative: 189.2 }
      ],
      spreadPercent: 0.05,
      imbalance: -0.08
    },
    reportHighlights: [
      "趋势仍维持高位整理，但 1H 动量已有放缓迹象。",
      "资金费率偏高且多空比接近 1.5，多头拥挤度上升。",
      "波动率接近高位分位，适合等待回踩确认而非追高。"
    ],
    dimensions: [
      {
        id: "trend",
        name: "趋势维度",
        shortLabel: "趋势",
        weight: 8,
        enabled: true,
        score: 4,
        sentiment: "bullish",
        signal: "趋势仍偏多，但强度弱于 BTC",
        summary: "EMA 仍多头排列，但 ADX 仅接近趋势阈值。",
        note: "趋势没坏，但继续追涨的赔率一般。",
        details: [
          { label: "EMA 排列", value: "9 > 21 > 50", insight: "多头结构尚未破坏" },
          { label: "ADX(14)", value: "23", insight: "接近趋势阈值，强度一般" },
          { label: "价格 / 200EMA", value: "1.02", insight: "略高于长期均线" }
        ]
      },
      {
        id: "momentum",
        name: "动量维度",
        shortLabel: "动量",
        weight: 9,
        enabled: true,
        score: -2,
        sentiment: "bearish",
        signal: "1H 动量开始钝化",
        summary: "MACD 动能柱缩短，随机 RSI 出现高位死叉。",
        note: "如果回踩后再度金叉，会显著改善综合评分。",
        details: [
          { label: "RSI(14)", value: "59", insight: "强势区回落但尚未转空" },
          { label: "MACD", value: "柱状图收缩", insight: "上涨动能放缓" },
          { label: "随机 RSI", value: "78 / 84", insight: "高位死叉，短线偏弱" }
        ]
      },
      {
        id: "volume",
        name: "成交量维度",
        shortLabel: "量能",
        weight: 7,
        enabled: true,
        score: 2,
        sentiment: "neutral",
        signal: "量能略有跟随，但不够强",
        summary: "价格抬升有成交量支持，不过未达到爆量级别。",
        note: "若出现放量站稳 3,290，量能维度会转向看涨。",
        details: [
          { label: "量比", value: "1.18x", insight: "高于均量但不算强势放量" },
          { label: "OBV", value: "横向抬升", insight: "资金缓慢流入" },
          { label: "CMF(21)", value: "0.05", insight: "处于轻微净流入状态" }
        ]
      },
      {
        id: "volatility",
        name: "波动率维度",
        shortLabel: "波动",
        weight: 6,
        enabled: true,
        score: -4,
        sentiment: "bearish",
        signal: "高波动区不利于追涨",
        summary: "ATR 和 HV 同时处于高位，继续上冲的风险收益比下降。",
        note: "更优解是等波动回落后再寻找二次进场。",
        details: [
          { label: "布林带位置", value: "靠近上轨", insight: "高位震荡风险升高" },
          { label: "ATR(14)", value: "86", insight: "接近过去 20 日高位" },
          { label: "HV 分位", value: "82%", insight: "情绪接近高潮区" }
        ]
      },
      {
        id: "money-flow",
        name: "资金流维度",
        shortLabel: "资金",
        weight: 8,
        enabled: true,
        score: 1,
        sentiment: "neutral",
        signal: "资金流偏中性",
        summary: "主动买卖比接近均衡，大单动作并不一致。",
        note: "需要等待 CVD 明确抬升，才能确认资金重新表态。",
        details: [
          { label: "现货 CVD", value: "横盘", insight: "买卖主动性相对平衡" },
          { label: "Taker 买卖比", value: "1.05", insight: "略偏多，但不构成强信号" },
          { label: "大额成交", value: "买卖交替", insight: "短线资金分歧较大" }
        ]
      },
      {
        id: "sentiment",
        name: "市场情绪维度",
        shortLabel: "情绪",
        weight: 7,
        enabled: true,
        score: -3,
        sentiment: "bearish",
        signal: "多头开始拥挤",
        summary: "资金费率偏高，多空比高位，追多性价比降低。",
        note: "若费率继续抬升，应主动降低杠杆或等待洗盘。",
        details: [
          { label: "资金费率", value: "+0.037%", insight: "接近过热区" },
          { label: "多空比", value: "1.42", insight: "散户偏多，反向不利" },
          { label: "未平仓合约", value: "+2.1%", insight: "新增资金有限" }
        ]
      },
      {
        id: "on-chain",
        name: "链上数据维度",
        shortLabel: "链上",
        weight: 6,
        enabled: true,
        score: 2,
        sentiment: "neutral",
        signal: "链上数据平稳略偏正面",
        summary: "质押净流入稳定，活跃地址数有所恢复。",
        note: "链上维度当前只提供辅助视角，不直接驱动交易。",
        details: [
          { label: "交易所余额", value: "持平", insight: "没有显著抛压信号" },
          { label: "活跃地址", value: "+4.6%", insight: "链上活跃度回暖" },
          { label: "质押流向", value: "净流入", insight: "中长期筹码仍在锁定" }
        ]
      },
      {
        id: "multi-timeframe",
        name: "多周期共振",
        shortLabel: "共振",
        weight: 9,
        enabled: true,
        score: 2,
        sentiment: "neutral",
        signal: "短中长周期略有分化",
        summary: "15m 仍偏强，但 1H 和 4H 没有形成同步加速。",
        note: "需要新的趋势催化，才会重回高置信度共振。",
        details: [
          { label: "15m", value: "+1", insight: "短线 EMA 仍维持偏多" },
          { label: "1H", value: "0", insight: "MACD 和 RSI 尚未给出强方向" },
          { label: "4H", value: "+1", insight: "仍在 200EMA 上方，但趋势强度有限" }
        ]
      },
      {
        id: "order-book",
        name: "订单簿维度",
        shortLabel: "订单簿",
        weight: 7,
        enabled: true,
        score: -2,
        sentiment: "bearish",
        signal: "上方卖压更明显",
        summary: "3,290 一带存在厚卖墙，短线更像冲高承压。",
        note: "若卖墙被连续吃穿，订单簿信号会快速修正。",
        details: [
          { label: "失衡度", value: "-0.14", insight: "卖盘略占优" },
          { label: "卖方墙", value: "$3,290", insight: "上方挂单集中" },
          { label: "价差", value: "0.04%", insight: "流动性尚可，但阻力清晰" }
        ]
      },
      {
        id: "macro",
        name: "宏观关联维度",
        shortLabel: "宏观",
        weight: 4,
        enabled: true,
        score: 2,
        sentiment: "neutral",
        signal: "宏观与风险偏好温和支撑",
        summary: "外围风险资产尚可，给 ETH 提供一定 beta 支撑。",
        note: "宏观不是 ETH 当前的主导变量，仍需回到自身结构。",
        details: [
          { label: "DXY", value: "104.2", insight: "没有出现加速上冲" },
          { label: "纳指期货", value: "+0.4%", insight: "成长风险偏好稳定" },
          { label: "恐惧贪婪", value: "71", insight: "市场偏乐观，但仍需防止情绪透支" }
        ]
      }
    ],
    history: [
      {
        time: "13:15",
        symbol: "ETH",
        signal: "谨慎卖出",
        confidence: 66,
        triggerPrice: "$3,240",
        after1hPrice: "$3,215",
        marketPnl: "-0.77%",
        pnl: "+0.77%",
        accuracy: "✅"
      },
      {
        time: "10:20",
        symbol: "ETH",
        signal: "中性观望",
        confidence: 38,
        triggerPrice: "$3,198",
        after1hPrice: "$3,206",
        marketPnl: "+0.25%",
        pnl: "+0.25%",
        accuracy: "⚠️"
      },
      {
        time: "08:42",
        symbol: "ETH",
        signal: "谨慎买入",
        confidence: 58,
        triggerPrice: "$3,160",
        after1hPrice: "$3,188",
        marketPnl: "+0.88%",
        pnl: "+0.88%",
        accuracy: "✅"
      }
    ]
  }
};

export const marketFactors = [
  { name: "现货资金费率", weight: "24%", status: "偏多" },
  { name: "ETF 净流入", weight: "19%", status: "增强" },
  { name: "链上活跃地址", weight: "15%", status: "回升" },
  { name: "稳定币净铸造", weight: "12%", status: "中性" }
];

export const whaleOrders = [
  {
    wallet: "0x8A9F...21CE",
    symbol: "BTCUSDT",
    size: "$3.42M",
    behavior: "连续三次扫单",
    confidence: "高"
  },
  {
    wallet: "0x31DD...9BC2",
    symbol: "ETHUSDT",
    size: "$1.18M",
    behavior: "突破前高追价",
    confidence: "中高"
  },
  {
    wallet: "0xB1C4...77AA",
    symbol: "SOLUSDT",
    size: "$960K",
    behavior: "低波动区吸筹",
    confidence: "中"
  }
];

export const gridSignals = [
  {
    pair: "BTC/USDT",
    regime: "震荡偏强",
    buyZone: "61,200 - 62,050",
    trigger: "RSI 回到 42-47 且量能收缩",
    priority: "A"
  },
  {
    pair: "ETH/USDT",
    regime: "高位回踩",
    buyZone: "3,070 - 3,120",
    trigger: "4H 布林中轨企稳",
    priority: "B+"
  },
  {
    pair: "BNB/USDT",
    regime: "箱体整理",
    buyZone: "563 - 571",
    trigger: "MACD 零轴上方金叉",
    priority: "B"
  }
];
