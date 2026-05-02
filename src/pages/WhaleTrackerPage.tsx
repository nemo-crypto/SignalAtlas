import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SectionHeader } from "../components/SectionHeader";
import { StatCard } from "../components/StatCard";
import {
  whaleBestPractices,
  whaleConceptCards,
  whaleMethodCards,
  whaleRulePresets,
  whaleSymbols
} from "../data/whaleTrackerData";
import { useBinanceWhaleMarket } from "../hooks/useBinanceWhaleMarket";
import {
  buildDeskVerdict,
  confidenceOptions,
  formatCompactUsd,
  formatMinutesAgo,
  formatObservationTime,
  formatOptionalSignedPercent,
  formatPercent,
  formatPrice,
  formatSignedUsd,
  getLiveStatusLabel,
  getLiveStatusVariant,
  getTradeSideLabel,
  parseWhaleRouteSeed,
  symbolNameMap,
  thresholdOptions,
  type ConfidenceFilter,
  type SymbolFilter,
  type WindowFilter,
  windowOptions
} from "./whaleTracker/shared";
import {
  buildFilteredTrades,
  buildRepeatedTradeClusters,
  buildScopedContexts,
  buildScopedOrderBooks,
  buildScopedTrades,
  buildWhaleAlerts,
  buildWhaleFocusBundle,
  buildWhaleMetricBundle
} from "./whaleTracker/selectors";
import { useWhaleObservationJournal } from "./whaleTracker/useWhaleObservationJournal";

function getSignedTrendTextClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "trend-text-neutral";
  }

  return value >= 0 ? "trend-text-up trend-text-emphasis" : "trend-text-down trend-text-emphasis";
}

export function WhaleTrackerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeSeed = useMemo(() => parseWhaleRouteSeed(location.search), [location.search]);
  const {
    trades: liveTrades,
    orderBooks: liveOrderBooks,
    contexts: liveContexts,
    connectionState,
    statusNote,
    lastUpdatedAt
  } = useBinanceWhaleMarket();
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolFilter>(() => routeSeed?.selectedSymbol ?? "ALL");
  const [selectedWindow, setSelectedWindow] = useState<WindowFilter>(() => routeSeed?.selectedWindow ?? 10);
  const [minTradeValue, setMinTradeValue] = useState<number>(() => routeSeed?.minTradeValue ?? 500000);
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>(() => routeSeed?.confidenceFilter ?? "中高");
  const [aggressiveOnly, setAggressiveOnly] = useState(() => routeSeed?.aggressiveOnly ?? true);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [routeNote, setRouteNote] = useState<string | null>(() => routeSeed?.note ?? null);

  useEffect(() => {
    if (!routeSeed) {
      return;
    }

    setSelectedSymbol(routeSeed.selectedSymbol);
    setSelectedWindow(routeSeed.selectedWindow);
    setMinTradeValue(routeSeed.minTradeValue);
    setConfidenceFilter(routeSeed.confidenceFilter);
    setAggressiveOnly(routeSeed.aggressiveOnly);
    setSelectedTradeId(null);
    setRouteNote(routeSeed.note);
    navigate(
      {
        pathname: location.pathname,
        hash: location.hash
      },
      { replace: true }
    );
  }, [location.hash, location.pathname, navigate, routeSeed]);

  const scopedTrades = useMemo(() => {
    return buildScopedTrades(liveTrades, selectedSymbol, selectedWindow);
  }, [liveTrades, selectedSymbol, selectedWindow]);

  const filteredTrades = useMemo(() => {
    return buildFilteredTrades(scopedTrades, minTradeValue, aggressiveOnly, confidenceFilter);
  }, [aggressiveOnly, confidenceFilter, minTradeValue, scopedTrades]);

  const scopedOrderBooks = useMemo(() => {
    return buildScopedOrderBooks(liveOrderBooks, selectedSymbol);
  }, [liveOrderBooks, selectedSymbol]);

  const scopedContexts = useMemo(() => {
    return buildScopedContexts(liveContexts, selectedSymbol);
  }, [liveContexts, selectedSymbol]);

  useEffect(() => {
    if (filteredTrades.some((trade) => trade.id === selectedTradeId)) {
      return;
    }

    setSelectedTradeId(filteredTrades[0]?.id ?? null);
  }, [filteredTrades, selectedTradeId]);

  const { focusedTrade, focusedOrderBook, focusedContext, overviewSymbol, observationScopeSymbol } = useMemo(() => {
    return buildWhaleFocusBundle({
      selectedSymbol,
      selectedTradeId,
      filteredTrades,
      scopedTrades,
      scopedOrderBooks,
      scopedContexts,
      fallbackSymbol: whaleSymbols[0].symbol
    });
  }, [filteredTrades, scopedContexts, scopedOrderBooks, scopedTrades, selectedSymbol, selectedTradeId]);

  const { buyValue, totalWindowValue, trackedValue, aggressiveBuyShare, strongestWallRatio, netFlowUsd, activePairs } =
    useMemo(() => {
      return buildWhaleMetricBundle(scopedTrades, filteredTrades, scopedOrderBooks);
    }, [filteredTrades, scopedOrderBooks, scopedTrades]);

  const repeatedClusters = useMemo(() => {
    return buildRepeatedTradeClusters(filteredTrades);
  }, [filteredTrades]);

  const alerts = useMemo(() => {
    return buildWhaleAlerts({
      filteredTrades,
      repeatedClusters,
      scopedOrderBooks,
      scopedContexts
    });
  }, [filteredTrades, repeatedClusters, scopedContexts, scopedOrderBooks]);

  const verdict = buildDeskVerdict(focusedTrade, focusedOrderBook, focusedContext, selectedWindow);
  const { observationHistory, isObservationHistoryLoading } = useWhaleObservationJournal({
    observationScopeSymbol,
    focusedTrade,
    focusedOrderBook,
    selectedWindow,
    minTradeValue,
    confidenceFilter,
    aggressiveOnly,
    verdict,
    netFlowUsd,
    alertCount: alerts.length
  });

  const dismissRouteNote = () => {
    setRouteNote(null);
  };

  const resetDeskFilters = () => {
    setSelectedSymbol("ALL");
    setSelectedWindow(10);
    setMinTradeValue(500000);
    setConfidenceFilter("中高");
    setAggressiveOnly(true);
    setSelectedTradeId(null);
    setRouteNote(null);
  };

  const handleReturnToOverview = () => {
    const search = new URLSearchParams({
      source: "execution-page",
      symbol: overviewSymbol,
      focus: "strategy-router",
      note: `已从 Whale Tracker 返回总览，保留 ${overviewSymbol} 的大单观察上下文。`
    }).toString();

    navigate({ pathname: "/", search: `?${search}` });
  };

  return (
    <section className="page-content crypto-market-theme">
      <div className="hero-panel whale-panel">
        <div>
          <p className="eyebrow">Whale Tracker</p>
          <h3>监听币安大户买入页面</h3>
          <p className="hero-copy">
            成交流来自 Binance `aggTrade`，买墙来自 Binance 深度快照，
            背景确认来自 Binance Futures 公共接口；页面只基于真实公共行情生成观察结论。
          </p>
        </div>
        <div className={`hero-badge signal-hero-badge tone-${verdict.tone}`}>
          <span>Whale Activity</span>
          <strong>{verdict.label}</strong>
          <small>置信度 {verdict.confidence}% · 当前筛出 {filteredTrades.length} 笔重点成交</small>
        </div>
      </div>

      <div className="live-status-row">
        <div className={`live-status-pill ${getLiveStatusVariant(connectionState)}`}>{getLiveStatusLabel(connectionState)}</div>
        <p className="live-status-copy live-status-copy-grid">
          <span className="live-status-copy-segment">
            订阅 <strong>{selectedSymbol === "ALL" ? whaleSymbols.length : 1}</strong> 个交易对
          </span>
          <span className="live-status-copy-segment live-status-copy-segment-time">
            最近更新{" "}
            <strong>
              {lastUpdatedAt
                ? new Date(lastUpdatedAt).toLocaleTimeString("zh-CN", { hour12: false })
                : "等待首个快照"}
            </strong>
          </span>
          <span className="live-status-copy-segment">
            当前时间窗 <strong>{selectedWindow} 分钟</strong>
          </span>
        </p>
        <span className="live-refresh-chip">{statusNote}</span>
      </div>
      {routeNote ? (
        <div className="alert-chip-banner whale-summary-banner">
          {routeNote}
          {selectedSymbol !== "ALL" ? ` 当前已锁定 ${selectedSymbol}。` : ""}
        </div>
      ) : null}
      <div className="strategy-context-bar">
        <div className="strategy-context-meta">
          <span className="pill">当前焦点 {overviewSymbol}</span>
          <p className="strategy-context-copy">
            {routeNote ?? "可直接回到总览继续看综合信号，或一键恢复本页默认筛选模板。"}
          </p>
        </div>
        <div className="action-button-row strategy-context-actions">
          <button type="button" className="action-button action-button-ghost" onClick={handleReturnToOverview}>
            返回总览保留上下文
          </button>
          <button type="button" className="action-button action-button-primary" onClick={resetDeskFilters}>
            恢复默认筛选
          </button>
        </div>
      </div>

      <section className="panel whale-control-panel">
        <SectionHeader
          eyebrow="Desk Controls"
          title="多币对与阈值筛选"
          description="先用成交流筛掉噪音，再把订单簿与衍生品背景叠加到同一个观察面板里。"
        />

        <div className="symbol-switch">
          <button
            type="button"
            className={selectedSymbol === "ALL" ? "symbol-chip symbol-chip-active" : "symbol-chip"}
            onClick={() => {
              dismissRouteNote();
              setSelectedSymbol("ALL");
            }}
          >
            <strong>ALL</strong>
            <span>同时观察主流币的大额行为</span>
          </button>

          {whaleSymbols.map((item) => (
            <button
              key={item.symbol}
              type="button"
              className={selectedSymbol === item.symbol ? "symbol-chip symbol-chip-active" : "symbol-chip"}
              onClick={() => {
                dismissRouteNote();
                setSelectedSymbol(item.symbol);
              }}
            >
              <strong>{item.symbol}</strong>
              <span>{item.note}</span>
            </button>
          ))}
        </div>

        <div className="alert-form-grid whale-filter-grid">
          <label>
            监控时间窗
            <select
              value={selectedWindow}
              onChange={(event) => {
                dismissRouteNote();
                setSelectedWindow(Number(event.target.value) as WindowFilter);
              }}
            >
              {windowOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            最小成交额
            <select
              value={minTradeValue}
              onChange={(event) => {
                dismissRouteNote();
                setMinTradeValue(Number(event.target.value));
              }}
            >
              {thresholdOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            最低置信等级
            <select
              value={confidenceFilter}
              onChange={(event) => {
                dismissRouteNote();
                setConfidenceFilter(event.target.value as ConfidenceFilter);
              }}
            >
              {confidenceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            成交方向
            <button
              type="button"
              className={aggressiveOnly ? "action-button action-button-primary" : "action-button action-button-ghost"}
              onClick={() => {
                dismissRouteNote();
                setAggressiveOnly((current) => !current);
              }}
            >
              {aggressiveOnly ? "仅看主动买入" : "显示买卖双方"}
            </button>
          </label>
        </div>

        <div className="alert-chip-banner whale-summary-banner">
          当前筛选共覆盖 <strong>{activePairs.size}</strong> 个币对，窗口成交额 <strong>{formatCompactUsd(totalWindowValue)}</strong>，
          实际进入监控列表 <strong>{formatCompactUsd(trackedValue)}</strong>。
        </div>
      </section>

      <div className="stats-grid">
        <StatCard
          label="主动买单价值"
          value={formatCompactUsd(buyValue)}
          detail="当前时间窗内的买方主动成交总额"
          trend="up"
        />
        <StatCard
          label="聚合告警"
          value={`${alerts.length} 条`}
          detail={repeatedClusters.length > 0 ? "含连续拆单信号" : "按阈值自动更新"}
          trend={alerts.some((alert) => alert.severity === "high") ? "up" : "neutral"}
        />
        <StatCard
          label="最强买墙占比"
          value={formatPercent(strongestWallRatio)}
          detail="墙体超过 30% 时才纳入确认信号"
          trend={strongestWallRatio >= 0.3 ? "up" : "neutral"}
        />
        <StatCard
          label="主动成交净额"
          value={formatSignedUsd(netFlowUsd)}
          detail="主动买入记正，主动卖出记负"
          trend={netFlowUsd >= 0 ? "up" : "down"}
        />
      </div>

      <div className="content-grid two-columns">
        <section className="panel whale-feed-panel">
          <SectionHeader
            eyebrow="AggTrade Feed"
            title="大额成交监控流"
            description="点击任意成交可联动右侧判断；其中“成交簇”标签来自 Binance aggTrade 聚类，不代表真实账户身份或链上地址。"
          />

          <div className="whale-feed-list">
            {filteredTrades.length > 0 ? (
              filteredTrades.map((trade) => {
                const tradeTone = trade.side === "buy" ? "bullish" : "bearish";
                return (
                  <button
                    key={trade.id}
                    type="button"
                    className={
                      trade.id === focusedTrade?.id
                        ? `whale-feed-item whale-feed-item-active sentiment-${tradeTone}`
                        : `whale-feed-item sentiment-${tradeTone}`
                    }
                    onClick={() => {
                      setSelectedTradeId(trade.id);
                    }}
                  >
                    <div className="whale-feed-top">
                      <div>
                        <strong>{trade.symbol}</strong>
                        <p className="muted">{trade.clusterLabel}</p>
                      </div>
                      <div className="whale-feed-chip-row">
                        <span className={trade.side === "buy" ? "pill whale-side-pill whale-side-buy" : "pill whale-side-pill whale-side-sell"}>
                          {getTradeSideLabel(trade.side)}
                        </span>
                        <span className="pill">{trade.confidence}</span>
                      </div>
                    </div>

                    <div className="whale-feed-meta">
                      <span>{formatCompactUsd(trade.usdValue)}</span>
                      <span>
                        {trade.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} @ {formatPrice(trade.price)}
                      </span>
                      <span>{formatMinutesAgo(trade.minutesAgo)}</span>
                    </div>

                    <p className="whale-feed-behavior">{trade.behavior}</p>
                    <p className="muted whale-feed-note">
                      拆单 {trade.chunks} 笔 · {trade.note}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="whale-empty-state">
                <strong>当前没有匹配的成交记录</strong>
                <p className="muted">可以尝试放宽金额阈值、扩大时间窗，或切换到“显示买卖双方”。</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel signal-board-panel">
          <SectionHeader
            eyebrow="Alert Engine"
            title="聚合告警与当前解读"
            description="把大额成交、买墙真实性与衍生品背景叠在一起，形成更接近实盘的判断。"
          />

          <div className={`signal-board tone-${verdict.tone}`}>
            <div className="signal-board-heading">
              <div>
                <p className="eyebrow">Current Verdict</p>
                <h4>{verdict.label}</h4>
              </div>
              <div className="confidence-pill">置信度 {verdict.confidence}%</div>
            </div>

            <div className="signal-board-meta">
              <div>
                <span>当前焦点</span>
                <strong>{focusedTrade ? `${focusedTrade.symbol} · ${formatCompactUsd(focusedTrade.usdValue)}` : "暂无成交"}</strong>
              </div>
              <div>
                <span>买墙确认位</span>
                <strong>{focusedOrderBook?.confirmationZone ?? "等待深度数据"}</strong>
              </div>
              <div>
                <span>失效参考</span>
                <strong>{verdict.stopLoss}</strong>
              </div>
            </div>

            <div className="score-bar-list">
              <div className="score-bar-item">
                <div>
                  <span>主动买入占比</span>
                  <strong>{formatPercent(aggressiveBuyShare)}</strong>
                </div>
                <div className="score-bar-track">
                  <div className="score-bar-fill is-bull" style={{ width: `${aggressiveBuyShare * 100}%` }} />
                </div>
              </div>

              <div className="score-bar-item">
                <div>
                  <span>买墙占比</span>
                  <strong>{focusedOrderBook ? formatPercent(focusedOrderBook.wallRatio) : "0%"}</strong>
                </div>
                <div className="score-bar-track">
                  <div
                    className="score-bar-fill is-neutral"
                    style={{ width: `${(focusedOrderBook?.wallRatio ?? 0) * 100}%` }}
                  />
                </div>
              </div>

              <div className="score-bar-item">
                <div>
                  <span>诱骗风险</span>
                  <strong>{focusedOrderBook ? formatPercent(focusedOrderBook.cancelRisk) : "0%"}</strong>
                </div>
                <div className="score-bar-track">
                  <div
                    className="score-bar-fill is-bear"
                    style={{ width: `${(focusedOrderBook?.cancelRisk ?? 0) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="signal-warning">⚠️ 结论摘要：{verdict.thesis}</p>
            <p className="muted whale-board-copy">执行建议：{verdict.action}</p>
            <p className="muted whale-board-copy">有效期：{verdict.validity}</p>
          </div>

          <div className="whale-alert-list">
            {alerts.map((alert) => (
              <article key={alert.id} className={`whale-alert-item whale-alert-item-${alert.severity}`}>
                <div>
                  <div className="whale-alert-title-row">
                    <strong>{alert.title}</strong>
                    <span className={`whale-severity-pill whale-severity-${alert.severity}`}>
                      {alert.severity === "high" ? "高优先级" : alert.severity === "medium" ? "中优先级" : "提醒"}
                    </span>
                  </div>
                  <p className="muted">{alert.detail}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="rule-list whale-rule-list">
            {whaleRulePresets.map((rule) => (
              <article key={rule.id} className="rule-item">
                <span className="rule-index" />
                <div>
                  <strong>{rule.title}</strong>
                  <p className="muted">
                    {rule.detail} · 阈值 {rule.threshold}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel whale-history-panel">
        <SectionHeader
          eyebrow="Observation Journal"
          title="已保存观察历史"
          description="把最近关注过的鲸鱼成交、筛选条件和当时判断持久化到 IndexedDB，便于回看。"
        />

        <div className="whale-history-list">
          {isObservationHistoryLoading ? (
            <div className="whale-empty-state">
              <strong>正在加载观察历史</strong>
              <p className="muted">优先读取 IndexedDB 中已保存的 Whale Tracker 观察记录。</p>
            </div>
          ) : observationHistory.length > 0 ? (
            observationHistory.map((item) => (
              <article key={item.id} className={`whale-history-item whale-history-${item.verdictTone}`}>
                <div className="whale-history-top">
                  <div>
                    <strong>
                      {item.symbol} · {item.verdictLabel}
                    </strong>
                    <p className="muted">
                      {formatObservationTime(item.recordedAt)} · {item.clusterLabel}
                    </p>
                  </div>
                  <div className="whale-feed-chip-row whale-history-pill-row">
                    <span className={item.side === "buy" ? "pill whale-side-pill whale-side-buy" : "pill whale-side-pill whale-side-sell"}>
                      {getTradeSideLabel(item.side)}
                    </span>
                    <span className="pill">置信度 {item.verdictConfidence}%</span>
                  </div>
                </div>

                <div className="whale-history-meta">
                  <span>成交金额 {formatCompactUsd(item.usdValue)}</span>
                  <span>
                    价格 {formatPrice(item.price)} · 记录时延 {item.minutesAgo} 分钟
                  </span>
                  <span>
                    筛选 {item.selectedWindow}m / {formatCompactUsd(item.minTradeValue)} / {item.confidenceFilter} / {item.aggressiveOnly ? "仅买入" : "买卖双向"}
                  </span>
                </div>

                <p className="whale-history-thesis">{item.thesis}</p>

                <div className="whale-history-summary">
                  <span>告警 {item.alertCount} 条</span>
                  <span>
                    主动成交净额{" "}
                    <strong className={getSignedTrendTextClass(item.netFlowUsd)}>
                      {formatSignedUsd(item.netFlowUsd)}
                    </strong>
                  </span>
                  <span>买墙 {item.wallRatio != null ? formatPercent(item.wallRatio) : "--"}</span>
                  <span>撤单风险 {item.cancelRisk != null ? formatPercent(item.cancelRisk) : "--"}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="whale-empty-state">
              <strong>当前还没有已保存的观察记录</strong>
              <p className="muted">
                选择成交记录并形成判断后，页面会自动把该观察记录写入 IndexedDB。
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="panel accent-panel">
        <SectionHeader
          eyebrow="Liquidity Lens"
          title="买墙吸收与诱骗风险"
          description="订单簿只做确认，不直接代替成交信号；重点看墙体占比、主动买入比例和撤单风险。"
        />

        <div className="context-grid whale-depth-grid">
          {scopedOrderBooks.map((book) => (
            <article key={book.symbol} className="context-card whale-depth-card">
              <div className="context-card-header">
                <div>
                  <h4>{book.symbol}</h4>
                  <p className="muted">{symbolNameMap[book.symbol]} · {book.status}</p>
                </div>
                <span className="pill">买墙 {formatPercent(book.wallRatio)}</span>
              </div>

              <div className="metric-grid whale-depth-metrics">
                <article className="metric-card">
                  <span>墙体价位</span>
                  <strong>{formatPrice(book.wallPrice)}</strong>
                  <p>{formatCompactUsd(book.wallValueUsd)}</p>
                </article>
                <article className="metric-card">
                  <span>Taker 买入比</span>
                  <strong>{formatPercent(book.takerBuyRatio)}</strong>
                  <p>用来确认是否真有追价买盘</p>
                </article>
                <article className="metric-card">
                  <span>撤单风险</span>
                  <strong>{formatPercent(book.cancelRisk)}</strong>
                  <p>超过 40% 时优先警惕假买墙</p>
                </article>
              </div>

              <div className="detail-note-box">
                <p>
                  吸收区：{book.absorptionZone} · 确认区：{book.confirmationZone}
                </p>
                <small>
                  失效位：{book.invalidationZone} · {book.spoofingSignal}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="content-grid two-columns">
        <section className="panel">
          <SectionHeader
            eyebrow="Futures Context"
            title="真实资金背景观察"
            description="展示 Binance Futures 公共接口返回的真实杠杆背景，用资金费率、多空比和未平仓变化辅助确认。"
          />

          <div className="context-grid whale-transfer-grid">
            {scopedContexts.length > 0 ? (
              scopedContexts.map((context) => {
                return (
                  <article key={context.symbol} className={`context-card whale-transfer-card sentiment-${context.bias}`}>
                    <div className="context-card-header">
                      <div>
                        <h4>{context.symbol}</h4>
                        <p className="muted">
                          Binance Futures · {new Date(context.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })}
                        </p>
                      </div>
                      <span className="pill">{context.headline}</span>
                    </div>
                    <strong>{context.summary}</strong>
                    <p className="muted whale-transfer-address">
                      资金费率{" "}
                      <span className={getSignedTrendTextClass(context.fundingRate)}>
                        {formatOptionalSignedPercent(context.fundingRate, 3)}
                      </span>
                      {" · "}多空比 {context.longShortRatio?.toFixed(2) ?? "--"} {" · "}OI{" "}
                      <span className={getSignedTrendTextClass(context.openInterestChange)}>
                        {formatOptionalSignedPercent(context.openInterestChange, 1)}
                      </span>
                    </p>
                    <p className="whale-transfer-implication">{context.detail}</p>
                    <small className="muted">
                      未平仓规模 {context.openInterestValue != null ? formatCompactUsd(context.openInterestValue) : "--"}
                    </small>
                  </article>
                );
              })
            ) : (
              <div className="whale-empty-state whale-transfer-empty">
                <strong>当前还没有可用的真实背景记录</strong>
                <p className="muted">等待 Binance Futures 公共接口返回首个快照后，这里会自动刷新。</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <SectionHeader
            eyebrow="Methods & Guardrails"
            title="监控方法与最佳实践"
            description="不只看单一指标，而是把成交、订单簿和真实背景拼成完整判断。"
          />

          <div className="heat-grid whale-method-grid">
            {[...whaleConceptCards, ...whaleMethodCards].map((item) => (
              <article key={item.id} className={`heat-cell ${item.tone}`}>
                <div>
                  <span>{item.title}</span>
                  <strong>{item.emphasis}</strong>
                </div>
                <p className="muted">{item.description}</p>
              </article>
            ))}
          </div>

          <div className="rule-list whale-best-practice-list">
            {whaleBestPractices.map((item) => (
              <article key={item} className="rule-item">
                <span className="rule-index" />
                <p>{item}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
