import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FundDetailTechnicalChart } from "../components/charts/FundDetailTechnicalChart";
import { SectionHeader } from "../components/SectionHeader";
import { StatCard } from "../components/StatCard";
import {
  buildPeriodSeries,
  defaultTechnicalSignalConfig,
  findHkFundByCode,
  formatSignedPercent,
  formatTechnicalValue,
  getTechnicalSignalFromValues,
  type FundDetailPeriod
} from "../services/hkTechnicalSignals";
import {
  fetchHkFundDetailSeries,
  fetchHkFundWithMarketData,
  type HkMarketDataSource,
  type HkMarketDataStatus
} from "../services/hkFundMarketData";

const detailPeriods: Array<{
  id: FundDetailPeriod;
  label: string;
  detail: string;
}> = [
  { id: "day", label: "日", detail: "近20交易日" },
  { id: "week", label: "周", detail: "近5交易日" },
  { id: "month", label: "月", detail: "近22交易日" },
  { id: "year", label: "年", detail: "近一年月K" }
];

function getSignalLabel(action: "buy" | "sell" | "watch"): string {
  if (action === "buy") {
    return "买入观察";
  }

  if (action === "sell") {
    return "卖出观察";
  }

  return "等待确认";
}

function getSignalTone(action: "buy" | "sell" | "watch"): "up" | "down" | "neutral" {
  if (action === "buy") {
    return "up";
  }

  if (action === "sell") {
    return "down";
  }

  return "neutral";
}

function formatMarketUpdatedAt(value: string | null): string {
  if (!value) {
    return "等待行情";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMarketDate(value: string | null | undefined): string {
  if (!value) {
    return "等待行情";
  }

  return value;
}

function formatHkPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return `${value.toFixed(3)} HKD`;
}

export function HkFundDetailPage() {
  const { code } = useParams();
  const baseFund = useMemo(() => findHkFundByCode(code), [code]);
  const [liveFund, setLiveFund] = useState(baseFund);
  const [detailSeries, setDetailSeries] = useState<Partial<Record<FundDetailPeriod, number[]>>>({});
  const [marketDataStatus, setMarketDataStatus] = useState<HkMarketDataStatus>("idle");
  const [marketDataSource, setMarketDataSource] = useState<HkMarketDataSource>("fallback");
  const [marketQualityWarning, setMarketQualityWarning] = useState<string | null>(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<FundDetailPeriod>("year");
  const fund = liveFund ?? baseFund;

  useEffect(() => {
    setLiveFund(baseFund);
    setDetailSeries({});
    setMarketDataStatus(baseFund ? "loading" : "idle");
    setMarketDataSource("fallback");
    setMarketQualityWarning(null);
    setMarketUpdatedAt(null);

    if (!baseFund) {
      return;
    }

    const controller = new AbortController();

    Promise.all([
      fetchHkFundWithMarketData(baseFund, controller.signal),
      fetchHkFundDetailSeries(baseFund, controller.signal)
    ])
      .then(([nextFund, nextSeries]) => {
        setLiveFund(nextFund);
        setDetailSeries(nextSeries);
        setMarketDataStatus("success");
        setMarketDataSource(nextSeries.source);
        setMarketQualityWarning(nextSeries.warning);
        setMarketUpdatedAt(nextSeries.updatedAt);
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setMarketDataStatus("error");
        setMarketDataSource("fallback");
      });

    return () => controller.abort();
  }, [baseFund]);

  const periodValues = useMemo(() => {
    if (!fund) {
      return [];
    }

    return detailSeries[activePeriod] ?? buildPeriodSeries(fund, activePeriod);
  }, [activePeriod, detailSeries, fund]);
  const signal = useMemo(() => {
    if (!fund) {
      return null;
    }

    return getTechnicalSignalFromValues(fund, periodValues, defaultTechnicalSignalConfig);
  }, [fund, periodValues]);

  if (!fund || !signal) {
    return (
      <div className="page-content ashare-detail-page">
        <div className="panel">
          <SectionHeader
            eyebrow="Fund Detail"
            title="未找到基金"
            description="当前基金代码没有匹配到港股基金池，请返回港股基金图谱重新选择。"
          />
          <Link to="/hk-sector-funds" className="action-button">
            返回 港股图谱
          </Link>
        </div>
      </div>
    );
  }

  const activePeriodMeta = detailPeriods.find((period) => period.id === activePeriod) ?? detailPeriods[3];
  const marketDataLabel =
    marketDataStatus === "success"
      ? `${marketDataSource === "cache" ? "缓存行情" : "实时行情"} ${formatMarketUpdatedAt(marketUpdatedAt)}`
      : marketDataStatus === "loading"
        ? "真实行情加载中"
        : "本地降级数据";

  return (
    <div className="page-content ashare-detail-page">
      <div className="topbar">
        <div>
          <p className="eyebrow">HK Fund Detail / {fund.code}</p>
          <h2>{fund.name}</h2>
          <p className="topbar-copy">
            {fund.sectorName} · {fund.subfield} · {fund.indexName}。港股详情页放大展示
            <strong>支撑位、压力位、MACD 与布林轨</strong>，并支持日/周/月/年周期切换。
          </p>
        </div>
        <div className="topbar-status-group">
          <Link to="/hk-sector-funds" className="action-button action-button-ghost">
            返回 港股图谱
          </Link>
          <span className="status-chip">
            <span className="status-dot" />
            {getSignalLabel(signal.action)}
          </span>
          <span className="status-chip">
            <span className="status-dot" />
            {marketDataLabel}
          </span>
          <span className="status-chip">
            最新 {formatHkPrice(fund.market?.latestClose)} · {formatMarketDate(fund.market?.latestDate)}
          </span>
          {marketQualityWarning ? (
            <span className="status-chip">{marketQualityWarning}</span>
          ) : null}
        </div>
      </div>

      <section className="hero-panel ashare-detail-hero">
        <div>
          <p className="eyebrow">Signal Context</p>
          <h3>{signal.title}</h3>
          <p className="hero-copy">{signal.summary}</p>
          <div className="ashare-detail-period-tabs" aria-label="详情周期切换">
            {detailPeriods.map((period) => (
              <button
                key={period.id}
                type="button"
                className={activePeriod === period.id ? "time-chip time-chip-active" : "time-chip"}
                onClick={() => setActivePeriod(period.id)}
              >
                {period.label} · {period.detail}
              </button>
            ))}
          </div>
        </div>
        <aside className="hero-badge ashare-hero-badge">
          <span>Signal Score</span>
          <strong>{signal.score}</strong>
          <small>{activePeriodMeta.detail} / {getSignalLabel(signal.action)}</small>
        </aside>
      </section>

      <section className="stats-grid">
        <StatCard
          label="最新收盘"
          value={formatHkPrice(fund.market?.latestClose)}
          detail={`交易日 ${formatMarketDate(fund.market?.latestDate)}`}
          trend={getSignalTone(signal.action)}
        />
        <StatCard
          label="当前相对值"
          value={formatTechnicalValue(signal.currentValue)}
          detail={`${activePeriodMeta.detail} 最新点位`}
          trend={getSignalTone(signal.action)}
        />
        <StatCard
          label="支撑位"
          value={formatTechnicalValue(signal.support)}
          detail={`距支撑 ${signal.supportDistancePercent.toFixed(1)}%`}
          trend="up"
        />
        <StatCard
          label="压力位"
          value={formatTechnicalValue(signal.resistance)}
          detail={`距压力 ${signal.resistanceDistancePercent.toFixed(1)}%`}
          trend="down"
        />
        <StatCard
          label="MACD 柱"
          value={signal.macdHistogram.toFixed(2)}
          detail={`MACD ${signal.macd.toFixed(2)} / Signal ${signal.macdSignal.toFixed(2)}`}
          trend={signal.macdHistogram >= 0 ? "up" : "down"}
        />
      </section>

      <section className="panel ashare-detail-chart-panel">
        <SectionHeader
          eyebrow="Technical Chart"
          title={`${activePeriodMeta.label}线技术图`}
          description="大图同时展示价格/净值路径、支撑位、压力位、布林轨和 MACD 柱状图，用于判断当前点位是否接近买卖区域。"
        />
        <FundDetailTechnicalChart values={periodValues} signal={signal} />
      </section>

      <section className="content-grid two-columns">
        <div className="panel">
          <SectionHeader
            eyebrow="Buy Checks"
            title="买入条件拆解"
            description="支撑位买入观察需要位置、布林下轨和 MACD 修复同时满足。"
          />
          <div className="ashare-detail-check-list">
            {signal.buyChecks.map((check) => (
              <article key={check.id} className={check.passed ? "ashare-check-pass" : "ashare-check-fail"}>
                <strong>{check.passed ? "通过" : "未过"} · {check.label}</strong>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <SectionHeader
            eyebrow="Sell Checks"
            title="卖出条件拆解"
            description="压力位卖出观察需要上涨接近压力、布林上轨和 MACD 降温同时满足。"
          />
          <div className="ashare-detail-check-list">
            {signal.sellChecks.map((check) => (
              <article key={check.id} className={check.passed ? "ashare-check-pass" : "ashare-check-fail"}>
                <strong>{check.passed ? "通过" : "未过"} · {check.label}</strong>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <SectionHeader
          eyebrow="Fund Profile"
          title="基金画像"
          description="展示基金所属板块、细分领域、跟踪指数和风险说明，便于把技术信号放回行业语境。"
        />
        <div className="ashare-detail-profile-grid">
          <article>
            <span>代码</span>
            <strong>{fund.exchange} · {fund.code}</strong>
          </article>
          <article>
            <span>基金公司</span>
            <strong>{fund.provider}</strong>
          </article>
          <article>
            <span>细分领域</span>
            <strong>{fund.subfield}</strong>
          </article>
          <article>
            <span>近一年</span>
            <strong>{formatSignedPercent(fund.trends.year.changePercent)}</strong>
          </article>
          <article>
            <span>行情来源</span>
            <strong>{fund.market?.source === "cache" ? "缓存真实行情" : fund.market?.source === "live" ? "实时行情" : "本地降级"}</strong>
          </article>
          <article>
            <span>K线样本</span>
            <strong>{fund.market?.sampleCount ? `${fund.market.sampleCount} 条` : "--"}</strong>
          </article>
        </div>
        <p className="ashare-risk-note">
          <span>Risk</span>
          {fund.riskNote}
        </p>
      </section>
    </div>
  );
}
