export type FundTrendPeriod = "week" | "month" | "year";

export type FundTrend = {
  changePercent: number;
  signal: string;
  series: number[];
};

export type AShareSectorFund = {
  code: string;
  name: string;
  provider: string;
  exchange: "SSE" | "SZSE";
  indexName: string;
  subfield: string;
  focus: string;
  riskNote: string;
  trends: Record<FundTrendPeriod, FundTrend>;
};

export type AShareSector = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  heatLabel: string;
  tone: "active" | "warm" | "cool";
  funds: AShareSectorFund[];
};

export const fundTrendPeriods: Array<{
  id: FundTrendPeriod;
  label: string;
  shortLabel: string;
}> = [
  { id: "week", label: "周线", shortLabel: "W" },
  { id: "month", label: "月线", shortLabel: "M" },
  { id: "year", label: "近一年", shortLabel: "12M" }
];

export const ashareFundDataNote =
  "内置代表基金池仅用于板块/细分领域归类；走势优先由新浪财经 ETF 日 K 实时覆盖，接口不可用时才使用本地降级样本。";

export const ashareSectorFunds: AShareSector[] = [
  {
    id: "broad-base",
    name: "宽基核心",
    shortName: "宽基",
    description: "覆盖沪深核心资产、中盘成长、创业板与科创板，是观察 A 股整体风险偏好的锚点。",
    heatLabel: "市场底仓",
    tone: "cool",
    funds: [
      {
        code: "510300",
        name: "沪深300ETF",
        provider: "华泰柏瑞",
        exchange: "SSE",
        indexName: "沪深300指数",
        subfield: "大盘蓝筹",
        focus: "跟踪沪深两市核心龙头，适合作为 A 股 beta 中枢。",
        riskNote: "对金融、消费、制造龙头权重敏感，风格偏大盘价值。",
        trends: {
          week: { changePercent: 1.2, signal: "短线重新站上 20 日均线", series: [96, 97, 97.4, 98.1, 99, 99.4, 100] },
          month: { changePercent: 3.8, signal: "月线修复斜率温和", series: [92, 91.5, 93, 94.2, 96.8, 98.6, 100] },
          year: { changePercent: 8.5, signal: "年线处于右侧抬升段", series: [84, 85.1, 85.6, 83.5, 82.9, 85.6, 88.1, 90.3, 92.1, 93.7, 96.7, 100] }
        }
      },
      {
        code: "510500",
        name: "中证500ETF",
        provider: "南方",
        exchange: "SSE",
        indexName: "中证500指数",
        subfield: "中盘成长",
        focus: "代表中盘制造与成长扩散，弹性高于沪深300。",
        riskNote: "对流动性和风险偏好更敏感，回撤通常更快。",
        trends: {
          week: { changePercent: 0.6, signal: "周线缩量整理", series: [98.5, 98.1, 99.2, 99.8, 99.5, 100.2, 100] },
          month: { changePercent: 2.4, signal: "月线低位反弹但未放量", series: [94, 93.4, 95, 96.8, 97.5, 98.8, 100] },
          year: { changePercent: 5.2, signal: "年线仍在箱体上半区", series: [90, 88.9, 87.8, 86.7, 86.9, 89.6, 91.5, 92.6, 94.1, 95.7, 97.8, 100] }
        }
      },
      {
        code: "159915",
        name: "创业板ETF",
        provider: "易方达",
        exchange: "SZSE",
        indexName: "创业板指",
        subfield: "成长先锋",
        focus: "集中新能源、医药与科技成长股，常用于观察成长风格风险偏好。",
        riskNote: "对利率、盈利预期和赛道拥挤度高度敏感。",
        trends: {
          week: { changePercent: -0.8, signal: "周线冲高后回踩", series: [101, 101.6, 100.8, 100.2, 99.4, 99.1, 100] },
          month: { changePercent: 1.5, signal: "月线仍在筑底区", series: [96, 95.2, 95.8, 97.6, 98.4, 99.2, 100] },
          year: { changePercent: -3.1, signal: "年线尚未摆脱下降通道", series: [109, 106.8, 104.6, 102.5, 100.3, 98.1, 96.2, 94.5, 95.5, 97.6, 98.9, 100] }
        }
      },
      {
        code: "159949",
        name: "创业板50ETF",
        provider: "华安",
        exchange: "SZSE",
        indexName: "创业板50指数",
        subfield: "创业板50",
        focus: "聚焦创业板中流动性和成长属性更强的 50 只龙头，是创业板弹性增强版。",
        riskNote: "龙头集中度更高，新能源、医药和科技龙头波动会被放大。",
        trends: {
          week: { changePercent: -0.2, signal: "周线回踩后缩量企稳", series: [100.6, 101, 100.2, 99.4, 99, 99.6, 100] },
          month: { changePercent: 2.6, signal: "月线低位修复强于创业板指", series: [93, 92.4, 94.1, 96.2, 97.7, 98.8, 100] },
          year: { changePercent: -1.4, signal: "年线接近扭转但仍需确认", series: [106, 103.8, 101.7, 100.1, 98.3, 96.1, 94.5, 93.4, 94.5, 96.6, 98.4, 100] }
        }
      },
      {
        code: "159967",
        name: "创成长ETF",
        provider: "华夏",
        exchange: "SZSE",
        indexName: "创业板动量成长指数",
        subfield: "创业板成长",
        focus: "偏创业板高成长和动量因子，适合观察成长股扩散强度。",
        riskNote: "因子属性更强，行情切换到价值或红利时可能显著跑输。",
        trends: {
          week: { changePercent: 1.1, signal: "周线动量重新转正", series: [96.5, 96.8, 97.4, 98.1, 99, 99.6, 100] },
          month: { changePercent: 4.9, signal: "月线成长因子开始占优", series: [88, 89.2, 91.4, 94.2, 96.8, 98.7, 100] },
          year: { changePercent: 3.7, signal: "年线从弱势转为横盘上沿", series: [98, 94.7, 91.7, 90.1, 89.7, 91.9, 93.8, 95.5, 97.1, 98.7, 99.5, 100] }
        }
      },
      {
        code: "588000",
        name: "科创50ETF",
        provider: "华夏",
        exchange: "SSE",
        indexName: "上证科创板50成份指数",
        subfield: "硬科技",
        focus: "聚焦半导体、创新药、高端设备等科创龙头。",
        riskNote: "估值弹性高，盈利兑现与政策预期变化会放大波动。",
        trends: {
          week: { changePercent: 2.1, signal: "周线放量反包", series: [95, 95.8, 96.2, 97.6, 98.8, 99.5, 100] },
          month: { changePercent: 5.6, signal: "月线突破前高压力", series: [88, 89.4, 91, 93.5, 96, 98.2, 100] },
          year: { changePercent: 11.8, signal: "年线转强但波动仍高", series: [78, 80.2, 81.8, 80.7, 81.1, 84.4, 87.4, 90.1, 92.5, 94.6, 97.3, 100] }
        }
      },
      {
        code: "588080",
        name: "科创板50ETF",
        provider: "易方达",
        exchange: "SSE",
        indexName: "上证科创板50成份指数",
        subfield: "科创50",
        focus: "同样跟踪科创50，用于与华夏科创50ETF交叉观察规模、流动性和跟踪偏离。",
        riskNote: "与同类科创50产品持仓高度重合，配置时注意避免重复暴露。",
        trends: {
          week: { changePercent: 2.0, signal: "周线跟随科创龙头修复", series: [95.2, 95.7, 96.5, 97.7, 98.6, 99.4, 100] },
          month: { changePercent: 5.3, signal: "月线维持右侧抬升", series: [88.5, 89.2, 91.4, 93.8, 96.1, 98.3, 100] },
          year: { changePercent: 11.1, signal: "年线强于创业板主指数", series: [79, 80.6, 81.9, 81.4, 81.9, 84.6, 87.4, 90.1, 92.5, 94.6, 97.3, 100] }
        }
      },
      {
        code: "588800",
        name: "科创100ETF",
        provider: "华夏",
        exchange: "SSE",
        indexName: "上证科创板100指数",
        subfield: "科创100",
        focus: "覆盖科创板中小市值成长公司，比科创50更能观察扩散行情。",
        riskNote: "中小市值权重更高，流动性和业绩波动通常大于科创50。",
        trends: {
          week: { changePercent: 2.8, signal: "周线小盘科创弹性更强", series: [92, 92.9, 94.5, 96.3, 97.8, 99.1, 100] },
          month: { changePercent: 7.8, signal: "月线扩散信号明显", series: [82, 84.1, 87.2, 91.4, 94.8, 97.5, 100] },
          year: { changePercent: 15.4, signal: "年线高弹性反转", series: [70, 72.2, 73.8, 72.7, 73.5, 77.8, 81.9, 85.7, 89.5, 93.4, 96.7, 100] }
        }
      },
      {
        code: "588200",
        name: "科创创业50ETF",
        provider: "嘉实",
        exchange: "SSE",
        indexName: "中证科创创业50指数",
        subfield: "科创创业50",
        focus: "同时覆盖科创板和创业板龙头，是双创核心资产的一篮子代理。",
        riskNote: "兼具创业板与科创板高 beta 特征，回撤控制要比宽基更严格。",
        trends: {
          week: { changePercent: 1.6, signal: "周线双创龙头同步修复", series: [95.8, 96.2, 96.9, 98, 98.8, 99.5, 100] },
          month: { changePercent: 5.9, signal: "月线受硬科技和成长共振推动", series: [87, 88.4, 90.8, 94, 96.4, 98.4, 100] },
          year: { changePercent: 8.9, signal: "年线强于创业板、弱于科创100", series: [82, 83.1, 83.7, 82.1, 82.1, 85.4, 88.4, 91.1, 93.5, 95.6, 97.8, 100] }
        }
      },
      {
        code: "159781",
        name: "双创50ETF",
        provider: "易方达",
        exchange: "SZSE",
        indexName: "中证科创创业50指数",
        subfield: "科创创业50",
        focus: "深市双创50代表产品，便于在场内流动性和费率之间做替代比较。",
        riskNote: "与科创创业50同类 ETF 持仓接近，更多用于产品维度比较而非新增风格暴露。",
        trends: {
          week: { changePercent: 1.5, signal: "周线与双创指数同步修复", series: [96, 96.3, 97, 98.1, 98.7, 99.4, 100] },
          month: { changePercent: 5.6, signal: "月线进入反弹跟踪区", series: [87.8, 88.8, 91, 94.1, 96.1, 98.1, 100] },
          year: { changePercent: 8.3, signal: "年线右侧结构初步形成", series: [83, 83.8, 84.3, 82.9, 83, 86, 88.7, 91.2, 93.5, 95.8, 97.9, 100] }
        }
      }
    ]
  },
  {
    id: "consumption",
    name: "消费板块",
    shortName: "消费",
    description: "把消费拆成白酒、食品饮料、主要消费、家电与旅游，便于区分必选、防御和可选消费弹性。",
    heatLabel: "白酒/复苏",
    tone: "active",
    funds: [
      {
        code: "512690",
        name: "酒ETF",
        provider: "鹏华",
        exchange: "SSE",
        indexName: "中证酒指数",
        subfield: "白酒板块",
        focus: "白酒权重集中，是消费板块中盈利质量和估值修复的高敏感代表。",
        riskNote: "持仓集中度高，渠道库存和节假日动销会显著影响走势。",
        trends: {
          week: { changePercent: 1.8, signal: "周线低位放量修复", series: [94, 94.7, 96.2, 97.1, 98.4, 99.2, 100] },
          month: { changePercent: 6.4, signal: "月线突破短期下降趋势", series: [86, 87.6, 89.3, 92.1, 94.8, 97.2, 100] },
          year: { changePercent: -7.6, signal: "年线仍是超跌修复", series: [116, 112.7, 109.4, 105.5, 101.4, 96.5, 92.4, 89.1, 89.8, 92.5, 96.2, 100] }
        }
      },
      {
        code: "515170",
        name: "食品饮料ETF",
        provider: "华宝",
        exchange: "SSE",
        indexName: "中证细分食品饮料产业主题指数",
        subfield: "食品饮料",
        focus: "覆盖白酒、调味品、乳制品与休闲食品，比单一白酒更分散。",
        riskNote: "对消费复苏和成本端变化敏感，弹性弱于纯白酒。",
        trends: {
          week: { changePercent: 1.1, signal: "周线跟随白酒回暖", series: [96.4, 96.9, 97.1, 98, 98.8, 99.5, 100] },
          month: { changePercent: 4.2, signal: "月线从底部抬升", series: [90, 90.6, 92.1, 94, 96.2, 98.5, 100] },
          year: { changePercent: -2.4, signal: "年线接近扭亏临界", series: [106, 104.4, 102.6, 100.5, 98.1, 95.4, 93.5, 92.4, 93.5, 95.6, 97.8, 100] }
        }
      },
      {
        code: "159928",
        name: "消费ETF",
        provider: "汇添富",
        exchange: "SZSE",
        indexName: "中证主要消费指数",
        subfield: "主要消费",
        focus: "偏食品饮料和日常消费，防御属性强于可选消费。",
        riskNote: "上涨弹性依赖龙头估值修复，行业轮动慢时容易横盘。",
        trends: {
          week: { changePercent: 0.7, signal: "周线温和反弹", series: [97.8, 98.1, 97.9, 98.8, 99.3, 99.7, 100] },
          month: { changePercent: 3.1, signal: "月线走出小双底", series: [92.5, 91.8, 93.2, 95.5, 97.1, 98.4, 100] },
          year: { changePercent: 1.8, signal: "年线进入横盘修复", series: [101, 98.8, 96.8, 95.7, 95.2, 95.7, 96.5, 97.6, 98.4, 98.9, 99.5, 100] }
        }
      },
      {
        code: "159996",
        name: "家电ETF",
        provider: "国泰",
        exchange: "SZSE",
        indexName: "中证全指家用电器指数",
        subfield: "家电板块",
        focus: "代表出口链、地产后周期与高股息消费制造。",
        riskNote: "受地产销售、汇率和原材料成本影响较大。",
        trends: {
          week: { changePercent: -0.3, signal: "周线高位震荡", series: [100.3, 101.1, 100.7, 99.6, 99.2, 99.8, 100] },
          month: { changePercent: 2.9, signal: "月线趋势保持上行", series: [92, 94.5, 95.8, 97.2, 98.1, 99, 100] },
          year: { changePercent: 14.6, signal: "年线强势但偏离均线", series: [74, 76.7, 79.4, 81.5, 83.9, 86.6, 89.4, 92.1, 94.5, 96.6, 98.4, 100] }
        }
      }
    ]
  },
  {
    id: "healthcare",
    name: "医药医疗",
    shortName: "医药",
    description: "拆分医药龙头、医疗服务、医疗器械、创新药、中医药/中药、生物医药和疫苗，观察政策压制后的估值修复。",
    heatLabel: "估值修复",
    tone: "warm",
    funds: [
      {
        code: "512010",
        name: "医药ETF",
        provider: "易方达",
        exchange: "SSE",
        indexName: "沪深300医药卫生指数",
        subfield: "医药龙头",
        focus: "偏大市值医药龙头，是医药板块低波动核心代表。",
        riskNote: "集采、医保控费和业绩兑现节奏会影响估值弹性。",
        trends: {
          week: { changePercent: 0.4, signal: "周线横盘待方向", series: [99, 99.2, 99.6, 99.1, 99.8, 100.3, 100] },
          month: { changePercent: -1.7, signal: "月线仍低于均线压制", series: [103, 102, 101.5, 100.8, 99.5, 99, 100] },
          year: { changePercent: -9.8, signal: "年线处于估值压缩尾段", series: [124, 120.7, 117.4, 113.5, 109.7, 105.9, 101.8, 97.5, 94.5, 92.4, 95.6, 100] }
        }
      },
      {
        code: "512170",
        name: "医疗ETF",
        provider: "华宝",
        exchange: "SSE",
        indexName: "中证医疗指数",
        subfield: "医疗服务",
        focus: "覆盖医疗服务、CXO、医疗设备等成长属性资产。",
        riskNote: "高 beta 医药资产，反弹快但业绩预期回落时回撤也快。",
        trends: {
          week: { changePercent: -1.2, signal: "周线反弹遇阻", series: [103, 102.4, 101.1, 100.6, 99.2, 98.8, 100] },
          month: { changePercent: -3.5, signal: "月线仍在下降通道", series: [108, 106, 104, 102, 99, 97.5, 100] },
          year: { changePercent: -16.4, signal: "年线深度超跌", series: [136, 132.7, 129, 123, 116.6, 109.5, 102.5, 95.4, 91.2, 88.5, 93.5, 100] }
        }
      },
      {
        code: "159883",
        name: "医疗器械ETF",
        provider: "永赢",
        exchange: "SZSE",
        indexName: "中证全指医疗器械指数",
        subfield: "医疗器械",
        focus: "偏国产替代、设备更新和耗材修复逻辑。",
        riskNote: "政策招采节奏和医院资本开支决定弹性。",
        trends: {
          week: { changePercent: 1.5, signal: "周线回踩后转强", series: [95, 95.4, 96.8, 97.5, 98.7, 99.4, 100] },
          month: { changePercent: 2.8, signal: "月线尝试修复平台", series: [92, 91.2, 93.5, 95.2, 96.8, 98.2, 100] },
          year: { changePercent: -6.2, signal: "年线弱势收敛", series: [112, 109.8, 107.4, 103.5, 100.1, 97.4, 94.6, 91.9, 92.5, 94.6, 97.3, 100] }
        }
      },
      {
        code: "159992",
        name: "创新药ETF",
        provider: "银华",
        exchange: "SZSE",
        indexName: "中证创新药产业指数",
        subfield: "创新药",
        focus: "代表临床管线、BD 出海和创新估值重估方向。",
        riskNote: "对海外审批、融资环境和管线数据读出高度敏感。",
        trends: {
          week: { changePercent: 2.7, signal: "周线资金回流明显", series: [92, 92.8, 94, 96, 97.8, 98.9, 100] },
          month: { changePercent: 7.1, signal: "月线反弹斜率领先医药", series: [84, 85.2, 87.4, 91.3, 95, 97.8, 100] },
          year: { changePercent: 4.4, signal: "年线率先转正", series: [96, 92.7, 89.6, 87.5, 86.9, 89.6, 92.1, 94.3, 96.1, 97.7, 98.9, 100] }
        }
      },
      {
        code: "562390",
        name: "中药ETF",
        provider: "银华",
        exchange: "SSE",
        indexName: "中证中药指数",
        subfield: "中医药/中药",
        focus: "覆盖中药创新、中药消费品和品牌 OTC，兼具防御与政策传承逻辑。",
        riskNote: "受集采、医保支付和消费终端库存影响，趋势通常独立于创新药。",
        trends: {
          week: { changePercent: 1.0, signal: "周线温和放量", series: [97, 97.6, 98.2, 98.8, 99.1, 99.7, 100] },
          month: { changePercent: 3.4, signal: "月线从平台上沿突破", series: [91, 92.2, 94, 95.6, 97.2, 98.6, 100] },
          year: { changePercent: 9.6, signal: "近一年强于医药大盘", series: [82, 83.8, 86.1, 88.4, 90.2, 92.3, 94.1, 95.6, 96.8, 98, 99.2, 100] }
        }
      },
      {
        code: "159647",
        name: "中药ETF",
        provider: "鹏华",
        exchange: "SZSE",
        indexName: "中证中药指数",
        subfield: "中医药/中药",
        focus: "深市中药主题代表产品，适合与沪市中药 ETF 比较流动性和跟踪差异。",
        riskNote: "同类中药 ETF 持仓重合度较高，更多用于产品替代而不是新增行业暴露。",
        trends: {
          week: { changePercent: 0.8, signal: "周线保持稳健", series: [97.5, 97.9, 98.3, 98.9, 99.2, 99.7, 100] },
          month: { changePercent: 3.1, signal: "月线延续慢修复", series: [92, 93, 94.4, 96, 97.3, 98.7, 100] },
          year: { changePercent: 8.8, signal: "近一年中枢逐步抬升", series: [84, 85.2, 87.5, 89.3, 91, 92.8, 94.5, 95.8, 97, 98.2, 99.1, 100] }
        }
      },
      {
        code: "512290",
        name: "生物医药ETF",
        provider: "国泰",
        exchange: "SSE",
        indexName: "中证生物医药指数",
        subfield: "生物医药",
        focus: "偏生物制品、创新药、CXO 与生命科学工具，是研发周期弹性的综合代理。",
        riskNote: "对融资环境、临床数据读出和海外订单变化敏感，波动高于传统医药。",
        trends: {
          week: { changePercent: 2.2, signal: "周线资金回补", series: [94, 94.8, 95.9, 97.1, 98.3, 99.2, 100] },
          month: { changePercent: 5.8, signal: "月线跟随创新药修复", series: [86, 87.4, 90.1, 93.2, 96.1, 98.3, 100] },
          year: { changePercent: 1.9, signal: "近一年刚转为弱右侧", series: [101, 97.5, 93.8, 90.6, 89.2, 91.4, 93.5, 95.1, 96.8, 98.2, 99.1, 100] }
        }
      },
      {
        code: "159837",
        name: "生物科技ETF",
        provider: "易方达",
        exchange: "SZSE",
        indexName: "中证生物科技主题指数",
        subfield: "生物科技",
        focus: "更偏生物科技研发和创新管线，适合观察医药成长风格风险偏好。",
        riskNote: "估值依赖研发兑现，临床失败或融资收紧会造成较大回撤。",
        trends: {
          week: { changePercent: 2.5, signal: "周线弹性强于医药指数", series: [93, 93.7, 95.1, 96.6, 98, 99, 100] },
          month: { changePercent: 6.3, signal: "月线反弹斜率靠前", series: [84, 85.8, 88.6, 92.2, 95.4, 98, 100] },
          year: { changePercent: 3.5, signal: "近一年完成低位反转", series: [99, 95.2, 91.6, 88.4, 87.2, 90.1, 92.8, 95.1, 96.9, 98.4, 99.2, 100] }
        }
      },
      {
        code: "159643",
        name: "疫苗ETF",
        provider: "富国",
        exchange: "SZSE",
        indexName: "国证疫苗与生物科技指数",
        subfield: "疫苗",
        focus: "覆盖疫苗、生物制品和相关研发服务，反映公共卫生与生物科技交叉方向。",
        riskNote: "需求周期和产品批签发节奏影响较大，主题热度退潮时流动性会下降。",
        trends: {
          week: { changePercent: 0.6, signal: "周线低位小幅修复", series: [98, 97.6, 98.1, 98.6, 99.1, 99.6, 100] },
          month: { changePercent: 1.7, signal: "月线仍在底部平台", series: [96, 94.8, 95.4, 96.6, 97.8, 98.8, 100] },
          year: { changePercent: -6.8, signal: "近一年仍偏弱修复", series: [116, 112.8, 109.6, 105.4, 101.2, 97.8, 94.6, 92.2, 92.8, 95.1, 97.6, 100] }
        }
      }
    ]
  },
  {
    id: "technology",
    name: "科技成长",
    shortName: "科技",
    description: "半导体、芯片、5G、人工智能与计算机共同代表国产替代和 AI 算力应用链。",
    heatLabel: "AI/国产替代",
    tone: "active",
    funds: [
      {
        code: "512760",
        name: "芯片ETF",
        provider: "国泰",
        exchange: "SSE",
        indexName: "中华交易服务半导体芯片行业指数",
        subfield: "半导体芯片",
        focus: "偏设计、制造、设备材料，是半导体周期观察核心品种。",
        riskNote: "订单复苏、库存周期和外部限制会带来跳空波动。",
        trends: {
          week: { changePercent: 3.4, signal: "周线放量上攻", series: [90, 91.2, 93.5, 95.6, 97.4, 98.8, 100] },
          month: { changePercent: 9.6, signal: "月线进入主升观察区", series: [78, 80, 84, 88, 92, 96, 100] },
          year: { changePercent: 21.5, signal: "年线高 beta 反转", series: [62, 65.3, 67.7, 66.1, 66.5, 70.8, 75.5, 80.4, 85.3, 90.2, 95.1, 100] }
        }
      },
      {
        code: "159995",
        name: "半导体ETF",
        provider: "华夏",
        exchange: "SZSE",
        indexName: "国证半导体芯片指数",
        subfield: "半导体芯片",
        focus: "偏国产半导体全产业链，适合与沪市芯片 ETF 交叉观察。",
        riskNote: "持仓重叠度较高，注意不要与同类芯片产品重复暴露。",
        trends: {
          week: { changePercent: 2.9, signal: "周线跟随芯片扩散", series: [92, 93.2, 94.1, 96, 97.2, 98.6, 100] },
          month: { changePercent: 8.1, signal: "月线强于宽基", series: [80, 82.4, 85, 88.5, 93, 96.5, 100] },
          year: { changePercent: 18.3, signal: "年线趋势修复充分", series: [66, 67.6, 69.2, 70.3, 72.1, 75.4, 79.2, 83.5, 87.9, 92.3, 96.2, 100] }
        }
      },
      {
        code: "515050",
        name: "5GETF",
        provider: "华夏",
        exchange: "SSE",
        indexName: "中证5G通信主题指数",
        subfield: "通信设备",
        focus: "覆盖通信设备、光模块、终端与网络建设链。",
        riskNote: "容易受 AI 算力链景气和运营商资本开支扰动。",
        trends: {
          week: { changePercent: 1.9, signal: "周线沿 10 日线抬升", series: [95.8, 96.2, 97, 97.8, 98.5, 99.2, 100] },
          month: { changePercent: 6.8, signal: "月线维持多头结构", series: [86, 88, 90.5, 93.2, 95.5, 98, 100] },
          year: { changePercent: 16.9, signal: "年线受益算力扩散", series: [70, 72.2, 74.5, 77.2, 79.9, 82.6, 85.6, 88.9, 92.2, 95.5, 97.8, 100] }
        }
      },
      {
        code: "512720",
        name: "计算机ETF",
        provider: "国泰",
        exchange: "SSE",
        indexName: "中证计算机主题指数",
        subfield: "计算机应用",
        focus: "偏软件、信创、云计算和行业数字化。",
        riskNote: "估值对订单兑现敏感，主题热度下降时容易快速回撤。",
        trends: {
          week: { changePercent: -0.5, signal: "周线高位换手", series: [100.8, 101.6, 100.9, 99.4, 98.7, 99.2, 100] },
          month: { changePercent: 4.5, signal: "月线仍保持强势平台", series: [90, 92.5, 94, 96.2, 97.8, 99, 100] },
          year: { changePercent: 12.2, signal: "年线中枢上移", series: [76, 78.2, 80.3, 81.9, 83.7, 85.9, 88.4, 91.1, 93.5, 95.6, 97.8, 100] }
        }
      }
    ]
  },
  {
    id: "new-energy",
    name: "新能源链",
    shortName: "新能源",
    description: "新能源车、光伏、电池与新能源综合指数，用于拆解赛道供需、价格战和政策边际。",
    heatLabel: "景气分化",
    tone: "warm",
    funds: [
      {
        code: "515030",
        name: "新能源车ETF",
        provider: "华夏",
        exchange: "SSE",
        indexName: "中证新能源汽车指数",
        subfield: "新能源车",
        focus: "覆盖整车、电池、材料与零部件，代表新能源车产业链 beta。",
        riskNote: "价格战、补贴政策和电池材料价格会放大波动。",
        trends: {
          week: { changePercent: -1.6, signal: "周线反弹乏力", series: [103, 102.5, 101.8, 100.4, 99.1, 98.4, 100] },
          month: { changePercent: -2.8, signal: "月线仍受下降均线压制", series: [106, 104, 102.6, 101, 99, 98, 100] },
          year: { changePercent: -18.2, signal: "年线深度调整后弱修复", series: [142, 136.5, 131, 125, 118.6, 111.5, 104.2, 96.5, 91.1, 86.7, 92.4, 100] }
        }
      },
      {
        code: "515790",
        name: "光伏ETF",
        provider: "华泰柏瑞",
        exchange: "SSE",
        indexName: "中证光伏产业指数",
        subfield: "光伏板块",
        focus: "聚焦硅料、硅片、电池片、组件和逆变器。",
        riskNote: "供给过剩和价格周期是核心风险，反弹常伴随高波动。",
        trends: {
          week: { changePercent: -2.4, signal: "周线再度回落", series: [105, 104.2, 102.8, 101.5, 99.6, 98.2, 100] },
          month: { changePercent: -6.5, signal: "月线下探后弱反抽", series: [114, 111, 108, 104, 99, 95, 100] },
          year: { changePercent: -24.6, signal: "年线仍处产能出清阶段", series: [158, 150.9, 143.6, 135.5, 126.7, 116.9, 107.1, 97.3, 90, 84, 90.7, 100] }
        }
      },
      {
        code: "159755",
        name: "电池ETF",
        provider: "广发",
        exchange: "SZSE",
        indexName: "国证新能源车电池指数",
        subfield: "动力电池",
        focus: "偏电池、材料和储能链，弹性高于整车综合指数。",
        riskNote: "盈利对材料价格和产能利用率敏感。",
        trends: {
          week: { changePercent: 0.9, signal: "周线底部试探反弹", series: [96, 95.2, 96.4, 97.1, 98.2, 99.5, 100] },
          month: { changePercent: 1.6, signal: "月线横盘止跌", series: [96, 94.5, 94.8, 96.2, 97.4, 98.6, 100] },
          year: { changePercent: -12.8, signal: "年线仍处弱势修复", series: [128, 124.2, 120.3, 115.9, 110.8, 104.3, 98.5, 93.6, 91.3, 90.2, 94.5, 100] }
        }
      },
      {
        code: "516160",
        name: "新能源ETF",
        provider: "南方",
        exchange: "SSE",
        indexName: "中证新能源指数",
        subfield: "新能源综合",
        focus: "综合覆盖光伏、风电、储能与新能源车链。",
        riskNote: "多赛道分散但仍受新能源整体景气周期影响。",
        trends: {
          week: { changePercent: -0.7, signal: "周线弱势震荡", series: [101.4, 100.8, 100.1, 99.6, 98.9, 99.5, 100] },
          month: { changePercent: -1.9, signal: "月线没有形成有效反转", series: [104, 102.8, 101.6, 100.2, 98.4, 98.8, 100] },
          year: { changePercent: -15.1, signal: "年线等待产业出清", series: [134, 129.6, 125.1, 119.6, 113.8, 107.3, 101.3, 95.8, 91.8, 88.5, 93.5, 100] }
        }
      }
    ]
  },
  {
    id: "financial-real-estate",
    name: "金融地产",
    shortName: "金融",
    description: "证券、银行、非银与地产分别对应风险偏好、息差、高股息和政策托底观察。",
    heatLabel: "政策敏感",
    tone: "cool",
    funds: [
      {
        code: "512880",
        name: "证券ETF",
        provider: "国泰",
        exchange: "SSE",
        indexName: "中证全指证券公司指数",
        subfield: "券商",
        focus: "A 股成交活跃度和风险偏好的高弹性代理。",
        riskNote: "牛市预期升温时弹性大，成交缩量时回撤也快。",
        trends: {
          week: { changePercent: 2.6, signal: "周线放量补涨", series: [93, 94.2, 95.6, 96.8, 98.2, 99.4, 100] },
          month: { changePercent: 5.3, signal: "月线接近前高", series: [88, 90.5, 92.8, 94.7, 96.5, 98.8, 100] },
          year: { changePercent: 9.4, signal: "年线随市场活跃度修复", series: [84, 82.9, 82.4, 84.5, 86.7, 88.9, 90.8, 92.5, 94.5, 96.6, 98.4, 100] }
        }
      },
      {
        code: "512800",
        name: "银行ETF",
        provider: "华宝",
        exchange: "SSE",
        indexName: "中证银行指数",
        subfield: "银行",
        focus: "高股息、防御和低估值方向的核心代表。",
        riskNote: "主要关注息差、资产质量和分红可持续性。",
        trends: {
          week: { changePercent: 0.2, signal: "周线高位横盘", series: [99.8, 100.4, 100.1, 99.6, 99.7, 100.2, 100] },
          month: { changePercent: 1.1, signal: "月线慢牛结构未破", series: [96.2, 97.5, 98.4, 99.1, 99.6, 100.1, 100] },
          year: { changePercent: 17.2, signal: "年线高股息趋势强", series: [72, 74.2, 76.5, 79.8, 82.9, 85.6, 88.1, 90.3, 92.8, 95.5, 97.8, 100] }
        }
      },
      {
        code: "512070",
        name: "非银ETF",
        provider: "易方达",
        exchange: "SSE",
        indexName: "沪深300非银行金融指数",
        subfield: "保险非银",
        focus: "覆盖保险、券商和多元金融，兼具利率与市场活跃度弹性。",
        riskNote: "受长端利率、权益市场和保费增长三重影响。",
        trends: {
          week: { changePercent: 1.4, signal: "周线稳步抬升", series: [95.8, 96.4, 97.1, 98.2, 98.8, 99.4, 100] },
          month: { changePercent: 4.0, signal: "月线修复斜率好于银行", series: [90, 91.8, 93.5, 95, 97.2, 98.6, 100] },
          year: { changePercent: 10.7, signal: "年线跟随蓝筹重估", series: [82, 80.9, 80.4, 82.5, 84.7, 86.9, 89.1, 91.3, 93.5, 95.6, 97.8, 100] }
        }
      },
      {
        code: "512200",
        name: "房地产ETF",
        provider: "南方",
        exchange: "SSE",
        indexName: "中证全指房地产指数",
        subfield: "房地产",
        focus: "地产链政策博弈和信用修复的高波动代表。",
        riskNote: "基本面尚弱，政策预期兑现不及预期时回撤大。",
        trends: {
          week: { changePercent: -0.9, signal: "周线冲高回落", series: [101.6, 102.1, 101, 99.5, 98.8, 99.4, 100] },
          month: { changePercent: 2.2, signal: "月线靠政策预期支撑", series: [94, 92.8, 94.5, 96.6, 98.2, 99.4, 100] },
          year: { changePercent: -11.6, signal: "年线仍处信用修复期", series: [126, 121.6, 117.3, 112.9, 108.4, 103.5, 98.5, 93.6, 91.3, 90.2, 94.5, 100] }
        }
      }
    ]
  },
  {
    id: "cyclical-resources",
    name: "周期资源",
    shortName: "周期",
    description: "煤炭、有色、钢铁和化工反映商品价格、供给约束与全球制造周期。",
    heatLabel: "资源定价",
    tone: "warm",
    funds: [
      {
        code: "515220",
        name: "煤炭ETF",
        provider: "国泰",
        exchange: "SSE",
        indexName: "中证煤炭指数",
        subfield: "煤炭",
        focus: "高分红资源品代表，兼具周期和红利属性。",
        riskNote: "对煤价、安监和电力需求敏感，趋势反转时回撤较深。",
        trends: {
          week: { changePercent: 0.8, signal: "周线强势整理", series: [98, 98.6, 99.2, 100.1, 99.4, 99.8, 100] },
          month: { changePercent: 3.7, signal: "月线沿均线上行", series: [91, 92.5, 94.6, 96.3, 97.4, 98.9, 100] },
          year: { changePercent: 19.5, signal: "年线红利趋势强", series: [68, 70.7, 73.5, 76.8, 79.9, 82.6, 85.6, 88.9, 92.2, 95.5, 97.8, 100] }
        }
      },
      {
        code: "512400",
        name: "有色金属ETF",
        provider: "南方",
        exchange: "SSE",
        indexName: "中证申万有色金属指数",
        subfield: "有色金属",
        focus: "铜、铝、黄金和新能源金属的综合资源代理。",
        riskNote: "对美元、全球制造业 PMI 和商品库存变化敏感。",
        trends: {
          week: { changePercent: 1.7, signal: "周线跟随商品回暖", series: [94, 95.2, 96.4, 97.8, 98.5, 99.4, 100] },
          month: { changePercent: 6.2, signal: "月线商品弹性领先", series: [86, 88.1, 90.4, 93.5, 96.2, 98.6, 100] },
          year: { changePercent: 13.8, signal: "年线资源再定价", series: [76, 77.6, 79.5, 82.2, 84.5, 86.2, 88.4, 91.1, 93.5, 95.6, 97.8, 100] }
        }
      },
      {
        code: "515210",
        name: "钢铁ETF",
        provider: "国泰",
        exchange: "SSE",
        indexName: "中证钢铁指数",
        subfield: "钢铁",
        focus: "传统周期中估值低、供给侧弹性明显的品种。",
        riskNote: "需求端与地产/基建强相关，盈利弹性不稳定。",
        trends: {
          week: { changePercent: -0.4, signal: "周线冲高回落", series: [101, 100.7, 100.2, 99.5, 98.9, 99.7, 100] },
          month: { changePercent: 1.4, signal: "月线仍偏箱体", series: [96, 95.4, 96.2, 97.8, 98.6, 99.4, 100] },
          year: { changePercent: 3.9, signal: "年线弱修复", series: [93, 91.4, 89.9, 89.4, 89.5, 91.2, 92.8, 94.5, 96.1, 97.7, 98.9, 100] }
        }
      },
      {
        code: "516020",
        name: "化工ETF",
        provider: "华宝",
        exchange: "SSE",
        indexName: "中证细分化工产业主题指数",
        subfield: "基础化工",
        focus: "代表化工品价格、制造业补库和新材料分支。",
        riskNote: "受油价、库存周期和下游需求影响较大。",
        trends: {
          week: { changePercent: 1.0, signal: "周线企稳反弹", series: [96.5, 96, 97.1, 98, 98.6, 99.4, 100] },
          month: { changePercent: 2.7, signal: "月线低位修复", series: [93, 92.2, 93.8, 95.6, 97.4, 98.8, 100] },
          year: { changePercent: -1.9, signal: "年线仍接近成本中枢", series: [106, 104.4, 102.6, 100.5, 98.3, 96.1, 94.7, 94.2, 95.1, 96.7, 98.4, 100] }
        }
      }
    ]
  },
  {
    id: "advanced-manufacturing",
    name: "高端制造",
    shortName: "制造",
    description: "军工、机器人、机械设备和高端装备展示制造升级与国产替代的中长期线索。",
    heatLabel: "制造升级",
    tone: "active",
    funds: [
      {
        code: "512660",
        name: "军工ETF",
        provider: "国泰",
        exchange: "SSE",
        indexName: "中证军工指数",
        subfield: "国防军工",
        focus: "覆盖航空、航天、船舶和军工电子，政策订单驱动明显。",
        riskNote: "业绩确认节奏和订单透明度会造成阶段性波动。",
        trends: {
          week: { changePercent: 1.3, signal: "周线稳步放量", series: [96.4, 97, 97.6, 98.4, 99.1, 99.7, 100] },
          month: { changePercent: 4.8, signal: "月线从底部平台突破", series: [89, 90.8, 92.5, 95, 96.8, 98.7, 100] },
          year: { changePercent: 7.9, signal: "年线温和上行", series: [86, 84.9, 84.4, 86.5, 88.5, 90.2, 91.8, 93.5, 95.1, 96.7, 98.4, 100] }
        }
      },
      {
        code: "562500",
        name: "机器人ETF",
        provider: "华夏",
        exchange: "SSE",
        indexName: "中证机器人指数",
        subfield: "机器人",
        focus: "覆盖工业机器人、自动化设备与核心零部件。",
        riskNote: "主题弹性强，产业订单兑现前波动会很大。",
        trends: {
          week: { changePercent: 4.1, signal: "周线主题资金集中", series: [88, 90.2, 92.8, 95, 97.5, 99.1, 100] },
          month: { changePercent: 11.2, signal: "月线成为制造主线", series: [74, 77, 82, 87, 92, 97, 100] },
          year: { changePercent: 26.8, signal: "年线强趋势但拥挤", series: [58, 60.2, 62.5, 65.2, 68.5, 72.8, 77.5, 82.4, 87.3, 92.2, 96.2, 100] }
        }
      },
      {
        code: "516960",
        name: "机械ETF",
        provider: "博时",
        exchange: "SSE",
        indexName: "中证细分机械设备产业主题指数",
        subfield: "机械设备",
        focus: "工程机械、通用设备、自动化设备的综合制造代表。",
        riskNote: "与制造业资本开支和出口订单周期相关。",
        trends: {
          week: { changePercent: 0.9, signal: "周线趋势延续", series: [97, 97.4, 98, 98.7, 99.1, 99.6, 100] },
          month: { changePercent: 3.9, signal: "月线稳步上移", series: [91, 92.4, 94.2, 95.8, 97.4, 98.8, 100] },
          year: { changePercent: 12.5, signal: "年线受益出口链", series: [78, 80.2, 82.4, 84.5, 86.5, 88.2, 90.1, 92.3, 94.5, 96.6, 98.4, 100] }
        }
      },
      {
        code: "159667",
        name: "工业母机ETF",
        provider: "华夏",
        exchange: "SZSE",
        indexName: "中证机床指数",
        subfield: "工业母机",
        focus: "高端机床和国产设备替代方向，代表制造自主可控。",
        riskNote: "规模和流动性低于大类 ETF，短线价格跳动可能更明显。",
        trends: {
          week: { changePercent: 2.2, signal: "周线沿主题上行", series: [94, 95.1, 96.4, 97.5, 98.3, 99.2, 100] },
          month: { changePercent: 7.4, signal: "月线走出右侧结构", series: [83, 85, 88.6, 92, 95.4, 98, 100] },
          year: { changePercent: 15.6, signal: "年线中枢明显上移", series: [72, 73.6, 75.4, 77.5, 79.9, 82.6, 85.6, 88.9, 91.8, 94.5, 97.3, 100] }
        }
      }
    ]
  },
  {
    id: "infrastructure-utilities",
    name: "基建公用",
    shortName: "公用",
    description: "电力、红利、央企创新与建材反映稳增长、分红资产和基础设施投资强度。",
    heatLabel: "红利/稳增长",
    tone: "cool",
    funds: [
      {
        code: "159611",
        name: "电力ETF",
        provider: "广发",
        exchange: "SZSE",
        indexName: "中证全指电力公用事业指数",
        subfield: "电力公用",
        focus: "火电、水电、绿电和公用事业防御属性集合。",
        riskNote: "煤价、电价政策和来水情况会影响盈利稳定性。",
        trends: {
          week: { changePercent: 0.5, signal: "周线稳健震荡", series: [98.6, 99.1, 99.5, 99.9, 99.4, 100.2, 100] },
          month: { changePercent: 2.5, signal: "月线延续慢牛", series: [94, 95.5, 96.6, 97.8, 98.8, 99.5, 100] },
          year: { changePercent: 13.1, signal: "年线红利属性增强", series: [77, 79.7, 82.3, 83.9, 85.5, 87.2, 89.4, 92.1, 94.5, 96.6, 98.4, 100] }
        }
      },
      {
        code: "510880",
        name: "红利ETF",
        provider: "华泰柏瑞",
        exchange: "SSE",
        indexName: "上证红利指数",
        subfield: "高股息",
        focus: "高分红、低估值和现金流稳定资产的代表。",
        riskNote: "拥挤交易升温后，股息率下降会削弱性价比。",
        trends: {
          week: { changePercent: -0.1, signal: "周线高位休整", series: [100.1, 100.6, 100.2, 99.8, 99.6, 100.1, 100] },
          month: { changePercent: 1.7, signal: "月线慢速抬升", series: [95, 96.2, 97.4, 98.3, 99, 99.5, 100] },
          year: { changePercent: 20.4, signal: "年线强势但拥挤度升高", series: [66, 68.2, 70.5, 73.8, 77.3, 81.1, 84.6, 87.9, 91.5, 95.4, 97.8, 100] }
        }
      },
      {
        code: "515600",
        name: "央企创新ETF",
        provider: "广发",
        exchange: "SSE",
        indexName: "中证央企创新驱动指数",
        subfield: "央企创新",
        focus: "央企改革、分红提升和战略新兴产业交叉方向。",
        riskNote: "行情常由政策预期驱动，基本面兑现需要跟踪订单和分红。",
        trends: {
          week: { changePercent: 1.0, signal: "周线维持上行节奏", series: [96.5, 97.2, 97.8, 98.5, 99, 99.6, 100] },
          month: { changePercent: 3.6, signal: "月线跟随红利修复", series: [91, 92.6, 94.4, 96, 97.6, 99, 100] },
          year: { changePercent: 11.3, signal: "年线受益国企重估", series: [80, 82.2, 84.3, 85.9, 87.5, 89.2, 91.1, 93.3, 95.1, 96.7, 98.4, 100] }
        }
      },
      {
        code: "159745",
        name: "建材ETF",
        provider: "国泰",
        exchange: "SZSE",
        indexName: "中证全指建筑材料指数",
        subfield: "建筑材料",
        focus: "水泥、玻璃、防水材料等地产和基建后周期资产。",
        riskNote: "需求端仍与地产开工和基建实物量强相关。",
        trends: {
          week: { changePercent: -0.6, signal: "周线反弹遇阻", series: [101.2, 100.8, 100.2, 99.5, 99, 99.4, 100] },
          month: { changePercent: 0.8, signal: "月线低位箱体", series: [98, 96.5, 97, 98.2, 99, 99.4, 100] },
          year: { changePercent: -8.7, signal: "年线等待需求验证", series: [120, 116.7, 113.5, 110.2, 106.7, 102.9, 99.1, 95.3, 93.3, 92.2, 95.6, 100] }
        }
      }
    ]
  },
  {
    id: "agri-environment",
    name: "农业环保",
    shortName: "农业",
    description: "农业、养殖、环保和绿色电力用于观察通胀、防御、政策与低碳主题分支。",
    heatLabel: "防御/政策",
    tone: "warm",
    funds: [
      {
        code: "159825",
        name: "农业ETF",
        provider: "富国",
        exchange: "SZSE",
        indexName: "中证农业主题指数",
        subfield: "农业主题",
        focus: "种业、农化、养殖和食品链的综合农业代表。",
        riskNote: "受农产品价格、天气和政策储备影响。",
        trends: {
          week: { changePercent: 0.3, signal: "周线窄幅震荡", series: [99.4, 99.1, 99.6, 100.1, 99.7, 100.2, 100] },
          month: { changePercent: 1.9, signal: "月线低位小幅修复", series: [95, 94.2, 95.6, 97.2, 98.4, 99.2, 100] },
          year: { changePercent: -4.1, signal: "年线仍偏弱", series: [110, 107.8, 105.5, 102.8, 100.1, 97.4, 94.9, 92.7, 93.5, 95.6, 97.8, 100] }
        }
      },
      {
        code: "159865",
        name: "养殖ETF",
        provider: "国泰",
        exchange: "SZSE",
        indexName: "中证畜牧养殖指数",
        subfield: "畜牧养殖",
        focus: "猪周期和饲料链的高弹性代表。",
        riskNote: "猪价周期反复，盈利拐点确认前容易大幅震荡。",
        trends: {
          week: { changePercent: 1.6, signal: "周线受猪价预期拉动", series: [95, 95.8, 96.7, 98, 98.8, 99.3, 100] },
          month: { changePercent: 4.9, signal: "月线猪周期交易升温", series: [88, 89.6, 91.8, 94.5, 96.7, 98.8, 100] },
          year: { changePercent: 6.6, signal: "年线出现周期修复", series: [91, 87.7, 85.2, 86.3, 87.9, 90.6, 93.1, 95.3, 97.1, 98.7, 99.5, 100] }
        }
      },
      {
        code: "512580",
        name: "环保ETF",
        provider: "广发",
        exchange: "SSE",
        indexName: "中证环保产业指数",
        subfield: "环保产业",
        focus: "环保设备、节能服务和污染治理主题。",
        riskNote: "项目回款和地方财政压力会影响业绩兑现。",
        trends: {
          week: { changePercent: -0.2, signal: "周线量能不足", series: [100.6, 100.1, 99.8, 99.3, 99, 99.6, 100] },
          month: { changePercent: 0.5, signal: "月线仍在底部平台", series: [99, 97.5, 97.8, 98.6, 99.2, 99.6, 100] },
          year: { changePercent: -6.9, signal: "年线等待政策兑现", series: [116, 113.3, 110.5, 107.2, 103.9, 100.6, 97.4, 94.1, 93.4, 93.9, 96.7, 100] }
        }
      },
      {
        code: "159625",
        name: "绿色电力ETF",
        provider: "嘉实",
        exchange: "SZSE",
        indexName: "国证绿色电力指数",
        subfield: "绿色电力",
        focus: "风电、光伏运营和清洁电力运营商的主题代表。",
        riskNote: "电价机制、补贴回款和装机增速是主要变量。",
        trends: {
          week: { changePercent: 0.9, signal: "周线温和修复", series: [96.4, 97, 97.8, 98.4, 99, 99.5, 100] },
          month: { changePercent: 2.6, signal: "月线低位回暖", series: [93, 92.6, 94.1, 96.2, 97.6, 98.7, 100] },
          year: { changePercent: 3.2, signal: "年线转入横盘上沿", series: [98, 95.3, 92.8, 91.7, 91.7, 93.9, 95.5, 96.6, 97.7, 98.8, 99.5, 100] }
        }
      }
    ]
  }
];
