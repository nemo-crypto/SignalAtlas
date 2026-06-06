import { useMemo, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { StatCard } from "../components/StatCard";
import {
  type EventPredictionSettings,
  useEventPredictionMarket
} from "../hooks/useEventPredictionMarket";
import {
  EVENT_HORIZONS,
  EVENT_SYMBOLS,
  formatEventPercent,
  formatEventPrice,
  formatEventTime,
  formatEventUsd,
  formatSignedEventUsd,
  type EventDirection,
  type EventPredictionMode,
  type EventPredictionSignal,
  type EventPredictionSymbol
} from "../services/eventPrediction";
import { type StoredEventPrediction } from "../services/persistence";

const DEFAULT_SETTINGS: EventPredictionSettings = {
  mode: "high-probability",
  minProbability: 74,
  stake: 5,
  initialBalance: 10000,
  payoutRatio: 0.82,
  backtestDays: 7,
  alertSound: true,
  alertPopup: false
};

function getDirectionLabel(direction: EventDirection): string {
  if (direction === "UP") {
    return "看涨";
  }

  if (direction === "DOWN") {
    return "看跌";
  }

  return "等待";
}

function getDirectionClass(direction: EventDirection): string {
  if (direction === "UP") {
    return "event-direction-up";
  }

  if (direction === "DOWN") {
    return "event-direction-down";
  }

  return "event-direction-wait";
}

function getModeLabel(mode: EventPredictionMode): string {
  return mode === "high-probability" ? "只在高概率时下注" : "每分钟都给方向";
}

function getPredictionStatusLabel(item: StoredEventPrediction): string {
  if (item.status === "won") {
    return "命中";
  }

  if (item.status === "lost") {
    return "失败";
  }

  if (item.status === "flat") {
    return "打平";
  }

  return "待结算";
}

function getPredictionStatusClass(item: StoredEventPrediction): string {
  if (item.status === "won") {
    return "event-history-won";
  }

  if (item.status === "lost") {
    return "event-history-lost";
  }

  if (item.status === "flat") {
    return "event-history-flat";
  }

  return "event-history-pending";
}

function formatPredictionPnl(item: StoredEventPrediction): string {
  if (typeof item.pnl !== "number") {
    return "待结算";
  }

  return formatSignedEventUsd(item.pnl);
}

function getBestSignal(signals: EventPredictionSignal[]): EventPredictionSignal | null {
  const actionable = signals
    .filter((signal) => signal.direction !== "WAIT")
    .sort((left, right) => right.probability - left.probability);

  return actionable[0] ?? signals[0] ?? null;
}

function formatNullablePercent(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? formatEventPercent(value, 2) : "--";
}

function clampInputNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export function EventPredictionPage() {
  const [symbol, setSymbol] = useState<EventPredictionSymbol>("BTCUSDT");
  const [settings, setSettings] = useState<EventPredictionSettings>(DEFAULT_SETTINGS);
  const market = useEventPredictionMarket(symbol, settings);
  const bestSignal = useMemo(() => getBestSignal(market.signals), [market.signals]);
  const backtest = market.backtest;
  const bestSignalDirection = bestSignal?.direction ?? "WAIT";
  const bestSignalTone =
    bestSignalDirection === "UP" ? "up" : bestSignalDirection === "DOWN" ? "down" : "neutral";
  const strategySummary = useMemo(() => {
    const highProbabilityCount = market.signals.filter((item) => item.actionable).length;
    const watchCount = market.signals.filter((item) => item.direction !== "WAIT" && !item.actionable).length;

    return `${highProbabilityCount} 档可下注 / ${watchCount} 档观察 / 阈值 ${settings.minProbability}%`;
  }, [market.signals, settings.minProbability]);

  const updateSettings = (patch: Partial<EventPredictionSettings>) => {
    setSettings((current) => ({
      ...current,
      ...patch
    }));
  };

  return (
    <div className="page-content crypto-market-theme event-page">
      <section className="hero-panel event-hero-panel">
        <div>
          <p className="eyebrow">Binance Event Contract Lab</p>
          <h3>BTC / ETH 30m / 1d 事件合约方向预测</h3>
          <p className="hero-copy">
            每分钟读取 Binance 1m K 线，对 30 分钟与 1 日两档未来价格做 UP / DOWN 概率判断。
            命中阈值后写入本地预测记录，并可用声音或弹窗提醒；回测默认按账户 10,000 USDT、每次下注 5 USDT 计算。
          </p>
          <div className="event-hero-actions">
            <button type="button" onClick={() => void market.runPredictionNow()}>
              立即预测
            </button>
            <button type="button" className="action-button-ghost" onClick={() => void market.syncHistory()} disabled={market.isSyncing}>
              {market.isSyncing ? "同步中..." : "同步历史 K 线"}
            </button>
            <button type="button" className="action-button-ghost" onClick={() => void market.refreshBacktest()} disabled={market.isBacktesting}>
              {market.isBacktesting ? "回测中..." : "刷新回测"}
            </button>
          </div>
        </div>
        <div className={`hero-badge event-hero-badge ${getDirectionClass(bestSignalDirection)}`}>
          <span>{symbol.replace("USDT", "")} 当前价格</span>
          <strong>{formatEventPrice(market.currentPrice, symbol)}</strong>
          <small>24H {formatNullablePercent(market.change24h)} · {market.statusNote}</small>
        </div>
      </section>

      <div className="stats-grid">
        <StatCard
          label="最强方向"
          value={bestSignal ? `${bestSignal.horizonLabel} ${getDirectionLabel(bestSignal.direction)}` : "等待"}
          detail={bestSignal ? `${bestSignal.probability}% · ${bestSignal.confidenceLabel} · Score ${bestSignal.score}` : "等待 K 线"}
          trend={bestSignalTone}
        />
        <StatCard
          label="策略触发"
          value={strategySummary}
          detail={getModeLabel(settings.mode)}
          trend={market.signals.some((item) => item.actionable) ? "up" : "neutral"}
        />
        <StatCard
          label="本地样本"
          value={`${market.candles.length} 根`}
          detail={market.dataNote}
          trend={market.candles.length > 1800 ? "up" : "neutral"}
        />
        <StatCard
          label="回测账户"
          value={backtest ? formatEventUsd(backtest.finalBalance) : "等待"}
          detail={backtest ? `P/L ${formatSignedEventUsd(backtest.totalPnl)} · ${backtest.totalTrades} 次` : "先同步历史 K 线"}
          trend={backtest && backtest.totalPnl >= 0 ? "up" : "down"}
        />
      </div>

      {market.alerts.length > 0 && (
        <section className="panel event-alert-stack">
          <SectionHeader
            eyebrow="Live Alerts"
            title="最新提醒"
            description="达到下注阈值后生成提醒；声音提醒需要浏览器允许页面播放音频。"
          />
          <div className="event-alert-list">
            {market.alerts.map((alert) => (
              <article key={alert.id} className={`event-alert-item ${getDirectionClass(alert.direction)}`}>
                <div>
                  <strong>{alert.message}</strong>
                  <p className="muted">触发时间 {formatEventTime(alert.triggeredAt)}</p>
                </div>
                <button type="button" className="action-button-ghost" onClick={() => market.dismissAlert(alert.id)}>
                  关闭
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="content-grid two-columns event-main-grid">
        <section className="panel accent-panel event-signal-panel">
          <SectionHeader
            eyebrow="Prediction Board"
            title="30m / 1d 价格方向"
            description="只保留 30m 与 1d 两个相对更稳定的时间窗；默认需要概率、预期波动和多因子一致率同时达标。"
          />
          <div className="event-signal-grid">
            {market.signals.map((signal) => (
              <article key={`${signal.symbol}-${signal.horizonMinutes}`} className={`event-signal-card ${getDirectionClass(signal.direction)} ${signal.actionable ? "event-signal-actionable" : ""}`}>
                <div className="event-signal-head">
                  <div>
                    <span className="pill">{signal.contractLabel}</span>
                    <h4>{signal.horizonLabel}</h4>
                  </div>
                  <strong>{getDirectionLabel(signal.direction)}</strong>
                </div>
                <div className="event-probability-row">
                  <span>概率</span>
                  <strong>{signal.probability}%</strong>
                </div>
                <div className="event-probability-track" aria-hidden="true">
                  <span style={{ width: `${signal.probability}%` }} />
                </div>
                <div className="event-signal-meta">
                  <span>当前价 {formatEventPrice(signal.basePrice, symbol)}</span>
                  <span>结算 {formatEventTime(signal.expiryAt)}</span>
                  <span>阈值 {signal.threshold}%</span>
                </div>
                <p className="event-signal-reason">{signal.reasons[1] ?? signal.reasons[0]}</p>
                {signal.warnings.length > 0 && <p className="event-warning">{signal.warnings[0]}</p>}
              </article>
            ))}
          </div>
        </section>

        <section className="panel event-control-panel">
          <SectionHeader
            eyebrow="Strategy Settings"
            title="策略与下注参数"
            description="所有配置只影响本地预测记录与回测，不会连接真实账户下单。"
          />
          <div className="alert-form-grid event-settings-grid">
            <label>
              币种
              <select value={symbol} onChange={(event) => setSymbol(event.target.value as EventPredictionSymbol)}>
                {EVENT_SYMBOLS.map((item) => (
                  <option key={item} value={item}>{item.replace("USDT", "")}</option>
                ))}
              </select>
            </label>
            <label>
              预测模式
              <select value={settings.mode} onChange={(event) => updateSettings({ mode: event.target.value as EventPredictionMode })}>
                <option value="high-probability">概率较大才下注</option>
                <option value="every-minute">每分钟都预测</option>
              </select>
            </label>
            <label>
              最小下注概率
              <input
                type="number"
                min="54"
                max="90"
                value={settings.minProbability}
                onChange={(event) => updateSettings({ minProbability: clampInputNumber(event.target.value, settings.minProbability, 54, 90) })}
              />
            </label>
            <label>
              每次下注 USDT
              <input
                type="number"
                min="1"
                max="1000"
                value={settings.stake}
                onChange={(event) => updateSettings({ stake: clampInputNumber(event.target.value, settings.stake, 1, 1000) })}
              />
            </label>
            <label>
              初始账户 USDT
              <input
                type="number"
                min="100"
                max="1000000"
                value={settings.initialBalance}
                onChange={(event) => updateSettings({ initialBalance: clampInputNumber(event.target.value, settings.initialBalance, 100, 1000000) })}
              />
            </label>
            <label>
              盈利赔率
              <input
                type="number"
                min="0.1"
                max="2"
                step="0.01"
                value={settings.payoutRatio}
                onChange={(event) => updateSettings({ payoutRatio: clampInputNumber(event.target.value, settings.payoutRatio, 0.1, 2) })}
              />
            </label>
            <label>
              回测天数
              <input
                type="number"
                min="1"
                max="45"
                value={settings.backtestDays}
                onChange={(event) => updateSettings({ backtestDays: clampInputNumber(event.target.value, settings.backtestDays, 1, 45) })}
              />
            </label>
            <label>
              提醒方式
              <select
                value={`${settings.alertSound ? "sound" : "silent"}-${settings.alertPopup ? "popup" : "inline"}`}
                onChange={(event) => {
                  const value = event.target.value;
                  updateSettings({
                    alertSound: value.startsWith("sound"),
                    alertPopup: value.endsWith("popup")
                  });
                }}
              >
                <option value="sound-inline">声音 + 页面提醒</option>
                <option value="silent-inline">仅页面提醒</option>
                <option value="sound-popup">声音 + 弹窗</option>
                <option value="silent-popup">仅弹窗</option>
              </select>
            </label>
          </div>
          <div className="event-method-list">
            <article>
              <strong>策略核心</strong>
              <p className="muted">使用多窗口收益率、EMA 趋势差、MACD、RSI、主动买卖量、成交活跃度、资金费率、多空比、OI 与 ATR 风险降权形成方向分数。</p>
            </article>
            <article>
              <strong>下注规则</strong>
              <p className="muted">高概率模式要求概率、预期波动、多因子一致率同时达标；每分钟模式仅用于观察，不建议直接下注。</p>
            </article>
            <article>
              <strong>本地回测</strong>
              <p className="muted">1m K 线写入 IndexedDB，刷新页面后仍可复用；没有本地数据时自动尝试同步。</p>
            </article>
          </div>
        </section>
      </div>

      <section className="panel event-backtest-panel">
        <SectionHeader
          eyebrow="Backtest"
          title="本地策略回测"
          description="以历史 1m 收盘价模拟事件合约到期涨跌，盈利按赔率、亏损按下注额计算。"
        />
        <div className="stats-grid history-stats-grid">
          <StatCard
            label="最终余额"
            value={backtest ? formatEventUsd(backtest.finalBalance) : "--"}
            detail={backtest ? `初始 ${formatEventUsd(backtest.initialBalance)}` : "等待回测"}
            trend={backtest && backtest.finalBalance >= settings.initialBalance ? "up" : "down"}
          />
          <StatCard
            label="总盈亏"
            value={backtest ? formatSignedEventUsd(backtest.totalPnl) : "--"}
            detail={backtest ? `期望 ${formatSignedEventUsd(backtest.expectancy)} / 单` : "等待回测"}
            trend={backtest && backtest.totalPnl >= 0 ? "up" : "down"}
          />
          <StatCard
            label="命中率"
            value={backtest ? `${backtest.winRate}%` : "--"}
            detail={backtest ? `胜 ${backtest.wins} / 负 ${backtest.losses}` : "等待回测"}
            trend={backtest && backtest.winRate >= 55 ? "up" : "down"}
          />
          <StatCard
            label="最大回撤"
            value={backtest ? formatEventUsd(backtest.maxDrawdown) : "--"}
            detail={backtest ? `${backtest.maxDrawdownPercent.toFixed(2)}% · PF ${backtest.profitFactor === null ? "∞" : backtest.profitFactor.toFixed(2)}` : "等待回测"}
            trend={backtest && backtest.maxDrawdownPercent <= 2 ? "up" : "down"}
          />
        </div>
        <div className="event-backtest-grid">
          <div className="event-bucket-list">
            {backtest?.buckets.map((bucket) => (
              <article key={bucket.key} className="event-bucket-item">
                <span>{bucket.label}</span>
                <strong>{bucket.winRate}%</strong>
                <small>{bucket.trades} 次 · {formatSignedEventUsd(bucket.pnl)}</small>
              </article>
            )) ?? <p className="muted">暂无回测数据。</p>}
          </div>
          <div className="event-backtest-range">
            <span className="pill">样本范围</span>
            <strong>{backtest ? `${formatEventTime(backtest.dataStartAt)} - ${formatEventTime(backtest.dataEndAt)}` : "等待历史数据"}</strong>
            <p className="muted">
              已跳过 {backtest?.skippedSignals ?? 0} 个未达阈值或无法结算的信号；平均预测概率 {backtest ? `${backtest.averageProbability.toFixed(1)}%` : "--"}。
            </p>
          </div>
        </div>
      </section>

      <div className="content-grid two-columns event-history-grid">
        <section className="panel event-history-panel">
          <SectionHeader
            eyebrow="Prediction Ledger"
            title="本地预测记录"
            description="达到下注规则的预测会保存到 IndexedDB，并在到期后用本地 K 线结算。"
          />
          <div className="event-history-list">
            {market.predictions.length > 0 ? (
              market.predictions.map((item) => (
                <article key={item.id} className={`event-history-item ${getPredictionStatusClass(item)}`}>
                  <div>
                    <strong>{item.symbol.replace("USDT", "")} · {item.horizonMinutes}m · {getDirectionLabel(item.direction)}</strong>
                    <p className="muted">{formatEventTime(item.recordedAt)} 开仓，{formatEventTime(item.expiryAt)} 到期</p>
                  </div>
                  <div className="event-history-values">
                    <span>{item.probability}%</span>
                    <span>{formatEventPrice(item.basePrice, item.symbol)}</span>
                    <strong>{getPredictionStatusLabel(item)} · {formatPredictionPnl(item)}</strong>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">暂无达到下注阈值的预测记录。</p>
            )}
          </div>
        </section>

        <section className="panel event-risk-panel">
          <SectionHeader
            eyebrow="Risk Notes"
            title="策略边界"
            description="这是研究和回测工具，不是交易建议；情绪因子来自 Binance Futures 公共数据，仍可能失真。"
          />
          <div className="event-risk-list">
            {EVENT_HORIZONS.map((horizon) => (
              <article key={horizon.id}>
                <strong>{horizon.label}</strong>
                <p className="muted">
                  最小样本 {horizon.minHistory} 根 1m K 线，默认下注阈值 {horizon.defaultThreshold}%，一致率要求 {(horizon.minConsensusRatio * 100).toFixed(0)}%，ATR 超过 {horizon.maxAtrPercent}% 时降权。
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
