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
  "内置代表基金池仅用于板块/细分领域归类；走势必须由新浪财经 ETF 日 K 或缓存真实行情覆盖，接口不可用时仅展示等待真实行情的中性基线。";

const ashareSectorFundCatalog: AShareSector[] = [
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
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
        trends: buildUnavailableTrends()
      }
    ]
  }
];


function buildUnavailableTrend(periodName: string): FundTrend {
  const pointCount = periodName === "近一年" ? 12 : 7;

  return {
    changePercent: 0,
    signal: `${periodName}等待真实行情`,
    series: Array.from({ length: pointCount }, () => 100)
  };
}

function buildUnavailableTrends(): Record<FundTrendPeriod, FundTrend> {
  return {
    week: buildUnavailableTrend("周线"),
    month: buildUnavailableTrend("月线"),
    year: buildUnavailableTrend("近一年")
  };
}

function stripLocalTrendSamples(fund: AShareSectorFund): AShareSectorFund {
  return {
    ...fund,
    trends: buildUnavailableTrends()
  };
}

export const ashareSectorFunds: AShareSector[] = ashareSectorFundCatalog.map((sector) => ({
  ...sector,
  funds: sector.funds.map(stripLocalTrendSamples)
}));
