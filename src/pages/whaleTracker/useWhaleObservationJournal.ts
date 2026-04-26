import { useEffect, useState } from "react";
import type { WhaleOrderBookWatch, WhaleSymbol, WhaleTrade } from "../../data/whaleTrackerData";
import {
  appendWhaleObservation,
  loadWhaleObservations,
  type StoredWhaleObservationEntry
} from "../../services/persistence";
import type { ConfidenceFilter, WhaleDeskVerdict } from "./shared";

type UseWhaleObservationJournalArgs = {
  observationScopeSymbol: WhaleSymbol | undefined;
  focusedTrade: WhaleTrade | null;
  focusedOrderBook: WhaleOrderBookWatch | null;
  selectedWindow: number;
  minTradeValue: number;
  confidenceFilter: ConfidenceFilter;
  aggressiveOnly: boolean;
  verdict: WhaleDeskVerdict;
  netFlowUsd: number;
  alertCount: number;
};

type WhaleObservationJournalState = {
  observationHistory: StoredWhaleObservationEntry[];
  isObservationHistoryLoading: boolean;
};

function buildObservationSignature(args: {
  focusedTrade: WhaleTrade;
  focusedOrderBook: WhaleOrderBookWatch | null;
  selectedWindow: number;
  minTradeValue: number;
  confidenceFilter: ConfidenceFilter;
  aggressiveOnly: boolean;
  verdict: WhaleDeskVerdict;
  netFlowUsd: number;
  alertCount: number;
}): string {
  return [
    args.focusedTrade.id,
    args.selectedWindow,
    args.minTradeValue,
    args.confidenceFilter,
    args.aggressiveOnly ? "1" : "0",
    args.verdict.label,
    args.verdict.confidence,
    args.focusedOrderBook ? args.focusedOrderBook.wallRatio.toFixed(2) : "na",
    args.focusedOrderBook ? args.focusedOrderBook.cancelRisk.toFixed(2) : "na",
    Math.round(args.netFlowUsd / 100000),
    args.alertCount
  ].join("|");
}

export function useWhaleObservationJournal(
  args: UseWhaleObservationJournalArgs
): WhaleObservationJournalState {
  const [observationHistory, setObservationHistory] = useState<StoredWhaleObservationEntry[]>([]);
  const [isObservationHistoryLoading, setIsObservationHistoryLoading] = useState(true);
  const [observationHistoryVersion, setObservationHistoryVersion] = useState(0);

  useEffect(() => {
    let ignore = false;

    const hydrateObservationHistory = async () => {
      setIsObservationHistoryLoading(true);

      try {
        const entries = await loadWhaleObservations({
          symbol: args.observationScopeSymbol,
          limit: 8
        });

        if (!ignore) {
          setObservationHistory(entries);
        }
      } catch {
        if (!ignore) {
          setObservationHistory([]);
        }
      } finally {
        if (!ignore) {
          setIsObservationHistoryLoading(false);
        }
      }
    };

    void hydrateObservationHistory();

    return () => {
      ignore = true;
    };
  }, [args.observationScopeSymbol, observationHistoryVersion]);

  useEffect(() => {
    if (!args.focusedTrade) {
      return;
    }

    void appendWhaleObservation({
      id: `whale-${args.focusedTrade.id}-${Date.now()}`,
      symbol: args.focusedTrade.symbol,
      recordedAt: Date.now(),
      signature: buildObservationSignature({
        focusedTrade: args.focusedTrade,
        focusedOrderBook: args.focusedOrderBook,
        selectedWindow: args.selectedWindow,
        minTradeValue: args.minTradeValue,
        confidenceFilter: args.confidenceFilter,
        aggressiveOnly: args.aggressiveOnly,
        verdict: {
          tone: args.verdict.tone,
          label: args.verdict.label,
          confidence: args.verdict.confidence,
          thesis: args.verdict.thesis,
          action: args.verdict.action,
          stopLoss: args.verdict.stopLoss,
          validity: args.verdict.validity
        },
        netFlowUsd: args.netFlowUsd,
        alertCount: args.alertCount
      }),
      tradeId: args.focusedTrade.id,
      clusterLabel: args.focusedTrade.clusterLabel,
      side: args.focusedTrade.side,
      usdValue: args.focusedTrade.usdValue,
      price: args.focusedTrade.price,
      minutesAgo: args.focusedTrade.minutesAgo,
      selectedWindow: args.selectedWindow,
      minTradeValue: args.minTradeValue,
      confidenceFilter: args.confidenceFilter,
      aggressiveOnly: args.aggressiveOnly,
      verdictLabel: args.verdict.label,
      verdictTone: args.verdict.tone,
      verdictConfidence: args.verdict.confidence,
      thesis: args.verdict.thesis,
      wallRatio: args.focusedOrderBook?.wallRatio ?? null,
      cancelRisk: args.focusedOrderBook?.cancelRisk ?? null,
      netFlowUsd: args.netFlowUsd,
      alertCount: args.alertCount
    })
      .then((appended) => {
        if (appended) {
          setObservationHistoryVersion((current) => current + 1);
        }
      })
      .catch(() => undefined);
  }, [
    args.aggressiveOnly,
    args.alertCount,
    args.confidenceFilter,
    args.focusedOrderBook,
    args.focusedTrade,
    args.minTradeValue,
    args.netFlowUsd,
    args.selectedWindow,
    args.verdict.confidence,
    args.verdict.label,
    args.verdict.thesis,
    args.verdict.tone
  ]);

  return {
    observationHistory,
    isObservationHistoryLoading
  };
}
