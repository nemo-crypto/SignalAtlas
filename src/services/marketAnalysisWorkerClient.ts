import type { MarketOverview } from "../data/marketOverviewData";
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

  const activeWorker = new Worker(new URL("../workers/marketAnalysisWorker.ts", import.meta.url), {
    type: "module"
  });

  worker = activeWorker;
  activeWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    if (worker !== activeWorker) return;
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

  const failWorker = (error: unknown) => {
    if (worker !== activeWorker) return;
    worker = null;
    activeWorker.terminate();
    pendingRequests.forEach((pending) => pending.reject(error));
    pendingRequests.clear();
  };
  activeWorker.onerror = (event) => {
    failWorker(event.error ?? new Error("market analysis worker crashed"));
  };
  activeWorker.onmessageerror = () => {
    failWorker(new Error("market analysis worker response could not be decoded"));
  };

  return activeWorker;
}

export function analyzeMarketSnapshot(snapshot: RawMarketSnapshot): Promise<MarketOverview> {
  return new Promise<MarketOverview>((resolve, reject) => {
    const nextRequestId = ++requestId;
    try {
      const activeWorker = getWorker();
      pendingRequests.set(nextRequestId, { resolve, reject });
      activeWorker.postMessage({ requestId: nextRequestId, snapshot });
    } catch (error) {
      // 构造或发送失败同样返回 rejected Promise，并释放未发出的请求记录。
      pendingRequests.delete(nextRequestId);
      reject(error);
    }
  });
}
