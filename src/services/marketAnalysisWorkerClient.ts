import type { MarketOverview } from "../data/mockData";
import type { RawMarketSnapshot } from "./marketAnalysis";

type PendingRequest = {
  reject: (reason?: unknown) => void;
  resolve: (overview: MarketOverview) => void;
};

type WorkerResponse =
  | {
      requestId: number;
      success: true;
      overview: MarketOverview;
    }
  | {
      requestId: number;
      success: false;
      error: string;
    };

let requestId = 0;
let worker: Worker | null = null;
const pendingRequests = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(new URL("../workers/marketAnalysisWorker.ts", import.meta.url), {
    type: "module"
  });

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const pending = pendingRequests.get(response.requestId);

    if (!pending) {
      return;
    }

    pendingRequests.delete(response.requestId);

    if (response.success) {
      pending.resolve(response.overview);
      return;
    }

    pending.reject(new Error(response.error));
  };

  worker.onerror = (event) => {
    pendingRequests.forEach((pending) => {
      pending.reject(event.error ?? new Error("market analysis worker crashed"));
    });
    pendingRequests.clear();
    worker = null;
  };

  return worker;
}

export function analyzeMarketSnapshot(snapshot: RawMarketSnapshot): Promise<MarketOverview> {
  const activeWorker = getWorker();
  const nextRequestId = ++requestId;

  return new Promise<MarketOverview>((resolve, reject) => {
    pendingRequests.set(nextRequestId, { resolve, reject });
    activeWorker.postMessage({
      requestId: nextRequestId,
      snapshot
    });
  });
}
