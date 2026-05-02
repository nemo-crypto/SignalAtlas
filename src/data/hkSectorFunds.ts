export type HkFundTrendPeriod = "week" | "month" | "year";

export type HkFundTrend = {
  changePercent: number;
  signal: string;
  series: number[];
};

export type HkFundMarketSnapshot = {
  source: "live" | "cache" | "fallback";
  latestDate: string | null;
  latestClose: number | null;
  sampleCount: number;
  updatedAt: string | null;
};

export type HkSectorFund = {
  code: string;
  name: string;
  provider: string;
  exchange: "HKEX";
  indexName: string;
  subfield: string;
  focus: string;
  riskNote: string;
  trends: Record<HkFundTrendPeriod, HkFundTrend>;
  market?: HkFundMarketSnapshot;
};

export type HkSector = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  heatLabel: string;
  tone: "active" | "warm" | "cool";
  funds: HkSectorFund[];
};

export const hkFundTrendPeriods: Array<{
  id: HkFundTrendPeriod;
  label: string;
  shortLabel: string;
}> = [
  { id: "week", label: "周线", shortLabel: "W" },
  { id: "month", label: "月线", shortLabel: "M" },
  { id: "year", label: "近一年", shortLabel: "12M" }
];

export const hkFundDataNote =
  "内置港股 ETF 基金池仅用于板块/细分领域归类；走势必须由腾讯港股 ETF 日 K 或缓存真实行情覆盖，接口不可用时仅展示等待真实行情的中性基线。";

function buildFallbackTrend(periodName: string): HkFundTrend {
  const pointCount = periodName === "近一年" ? 12 : 7;

  return {
    changePercent: 0,
    signal: `${periodName}等待真实行情`,
    series: Array.from({ length: pointCount }, () => 100)
  };
}

function buildFallbackTrends(): Record<HkFundTrendPeriod, HkFundTrend> {
  return {
    week: buildFallbackTrend("周线"),
    month: buildFallbackTrend("月线"),
    year: buildFallbackTrend("近一年")
  };
}

export const hkSectorFunds: HkSector[] = [
  {
    id: "broad-base",
    name: "港股宽基",
    shortName: "宽基",
    description: "覆盖恒生指数、国企指数和 MSCI 中国，是观察港股整体风险偏好的核心锚点。",
    heatLabel: "恒指/国企",
    tone: "cool",
    funds: [
      {
        code: "02800",
        name: "盈富基金",
        provider: "道富环球",
        exchange: "HKEX",
        indexName: "恒生指数",
        subfield: "恒生指数",
        focus: "跟踪香港蓝筹核心资产，适合作为港股大盘 beta 中枢。",
        riskNote: "金融、互联网和地产权重变化会影响指数弹性。",
        trends: buildFallbackTrends()
      },
      {
        code: "03115",
        name: "安硕恒生指数",
        provider: "iShares",
        exchange: "HKEX",
        indexName: "恒生指数",
        subfield: "恒生指数",
        focus: "恒生指数低成本替代品，用于和盈富基金交叉比较流动性与跟踪偏离。",
        riskNote: "与盈富基金持仓高度相似，配置时避免重复暴露。",
        trends: buildFallbackTrends()
      },
      {
        code: "02828",
        name: "恒生中国企业",
        provider: "恒生投资",
        exchange: "HKEX",
        indexName: "恒生中国企业指数",
        subfield: "国企指数",
        focus: "覆盖 H 股大型中国企业，是南向资金观察中国资产风险偏好的常用工具。",
        riskNote: "金融、能源、电信与互联网龙头权重较高。",
        trends: buildFallbackTrends()
      },
      {
        code: "03167",
        name: "工银南方中国",
        provider: "工银南方",
        exchange: "HKEX",
        indexName: "MSCI 中国指数",
        subfield: "MSCI 中国",
        focus: "覆盖离岸中国资产，便于与恒生指数和国企指数做风格对照。",
        riskNote: "受中概互联网和离岸中国资产估值波动影响更明显。",
        trends: buildFallbackTrends()
      }
    ]
  },
  {
    id: "technology",
    name: "科技互联网",
    shortName: "科技",
    description: "聚焦恒生科技、平台互联网、AI 与半导体，是港股弹性最高的方向。",
    heatLabel: "恒科/平台",
    tone: "active",
    funds: [
      {
        code: "03033",
        name: "南方恒生科技",
        provider: "南方东英",
        exchange: "HKEX",
        indexName: "恒生科技指数",
        subfield: "恒生科技",
        focus: "跟踪港股科技龙头，适合观察互联网、硬件和 AI 主题的共振。",
        riskNote: "估值弹性高，受海外利率、监管预期和盈利兑现影响大。",
        trends: buildFallbackTrends()
      },
      {
        code: "03067",
        name: "安硕恒生科技",
        provider: "iShares",
        exchange: "HKEX",
        indexName: "恒生科技指数",
        subfield: "恒生科技",
        focus: "恒生科技指数另一只核心 ETF，用于比较同类产品流动性。",
        riskNote: "与恒生科技同类 ETF 重合度高，注意控制主题集中度。",
        trends: buildFallbackTrends()
      },
      {
        code: "03032",
        name: "恒生科技ETF",
        provider: "恒生投资",
        exchange: "HKEX",
        indexName: "恒生科技指数",
        subfield: "恒生科技",
        focus: "恒生投资旗下恒科产品，补充观察港股科技赛道资金偏好。",
        riskNote: "主题集中且波动大，适合配合支撑/压力信号做仓位控制。",
        trends: buildFallbackTrends()
      },
      {
        code: "02837",
        name: "GX恒生科技",
        provider: "Global X",
        exchange: "HKEX",
        indexName: "恒生科技指数",
        subfield: "恒生科技",
        focus: "Global X 恒生科技产品，便于在不同发行人之间做交易替代。",
        riskNote: "流动性和买卖价差需要结合成交额观察。",
        trends: buildFallbackTrends()
      }
    ]
  },
  {
    id: "china-core",
    name: "中国资产",
    shortName: "中国",
    description: "覆盖 A50、沪深300、沪深港通和中国核心资产，是港股上市人民币/港币 ETF 的重要部分。",
    heatLabel: "A50/沪深300",
    tone: "warm",
    funds: [
      {
        code: "02822",
        name: "南方A50",
        provider: "南方东英",
        exchange: "HKEX",
        indexName: "富时中国A50指数",
        subfield: "A50",
        focus: "港股市场交易 A 股大盘龙头的代表工具，常用于海外资金观察 A 股风险偏好。",
        riskNote: "受 A 股大盘蓝筹和人民币汇率影响。",
        trends: buildFallbackTrends()
      },
      {
        code: "03188",
        name: "华夏沪深三百",
        provider: "华夏基金香港",
        exchange: "HKEX",
        indexName: "沪深300指数",
        subfield: "沪深300",
        focus: "港股上市沪深300 ETF，用于离岸市场配置 A 股核心资产。",
        riskNote: "和 A 股沪深300 ETF 高相关，需关注汇率和交易时段差异。",
        trends: buildFallbackTrends()
      },
      {
        code: "02846",
        name: "安硕沪深三百",
        provider: "iShares",
        exchange: "HKEX",
        indexName: "沪深300指数",
        subfield: "沪深300",
        focus: "iShares 旗下沪深300产品，适合比较不同发行人的跟踪效率。",
        riskNote: "底层风险仍主要来自 A 股大盘权重股。",
        trends: buildFallbackTrends()
      },
      {
        code: "03040",
        name: "GX中国",
        provider: "Global X",
        exchange: "HKEX",
        indexName: "MSCI 中国指数",
        subfield: "中国核心",
        focus: "覆盖中国核心资产，兼具港股和中概暴露。",
        riskNote: "风格切换时可能与恒生指数出现阶段性偏离。",
        trends: buildFallbackTrends()
      }
    ]
  },
  {
    id: "income",
    name: "红利与高息",
    shortName: "高息",
    description: "覆盖恒生高股息、香港高息和防御类资产，适合观察港股红利风格。",
    heatLabel: "股息/防御",
    tone: "cool",
    funds: [
      {
        code: "03110",
        name: "GX恒生高股息率",
        provider: "Global X",
        exchange: "HKEX",
        indexName: "恒生高股息率指数",
        subfield: "高股息",
        focus: "聚焦港股高股息资产，是红利风格和防御配置的代表。",
        riskNote: "对利率、派息稳定性和行业集中度敏感。",
        trends: buildFallbackTrends()
      },
      {
        code: "03070",
        name: "平安香港高息",
        provider: "平安资管",
        exchange: "HKEX",
        indexName: "香港高股息指数",
        subfield: "香港高息",
        focus: "偏本地高息资产，适合观察防御和收益型资金偏好。",
        riskNote: "地产、公用和金融权重变化会影响净值稳定性。",
        trends: buildFallbackTrends()
      },
      {
        code: "03403",
        name: "华夏恒ESG",
        provider: "华夏基金香港",
        exchange: "HKEX",
        indexName: "恒生 ESG 增强指数",
        subfield: "ESG",
        focus: "兼顾恒生权重和 ESG 因子，适合作为低碳/治理风格观察。",
        riskNote: "因子筛选会导致与恒生指数存在跟踪差异。",
        trends: buildFallbackTrends()
      }
    ]
  },
  {
    id: "global-hedge",
    name: "全球与避险",
    shortName: "全球",
    description: "覆盖黄金、美债、纳指、亚洲债等港股上市 ETF，用于观察跨市场防御和海外资产配置。",
    heatLabel: "黄金/债券",
    tone: "warm",
    funds: [
      {
        code: "02840",
        name: "SPDR金ETF",
        provider: "SPDR",
        exchange: "HKEX",
        indexName: "伦敦金现货",
        subfield: "黄金",
        focus: "港股市场最具代表性的黄金 ETF，用于避险和美元实际利率观察。",
        riskNote: "受美元、实际利率和金价波动影响，和权益资产相关性较低。",
        trends: buildFallbackTrends()
      },
      {
        code: "03081",
        name: "价值黄金",
        provider: "价值伙伴",
        exchange: "HKEX",
        indexName: "黄金价格",
        subfield: "黄金",
        focus: "黄金主题替代产品，补充观察贵金属避险需求。",
        riskNote: "需关注买卖价差和成交活跃度。",
        trends: buildFallbackTrends()
      },
      {
        code: "03141",
        name: "华夏亚投债",
        provider: "华夏基金香港",
        exchange: "HKEX",
        indexName: "亚洲投资级债券指数",
        subfield: "债券",
        focus: "港股上市亚洲债券 ETF，作为权益波动下的防御观察。",
        riskNote: "受美元利率、信用利差和汇率波动影响。",
        trends: buildFallbackTrends()
      },
      {
        code: "03086",
        name: "华夏纳指",
        provider: "华夏基金香港",
        exchange: "HKEX",
        indexName: "纳斯达克100指数",
        subfield: "美股科技",
        focus: "港股市场交易美股科技资产的代表工具。",
        riskNote: "受美股科技估值、美元利率和港股交易时段差异影响。",
        trends: buildFallbackTrends()
      }
    ]
  }
];
