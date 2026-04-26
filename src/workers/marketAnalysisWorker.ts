import { buildLiveOverview, type RawMarketSnapshot } from "../services/marketAnalysis";

type WorkerRequest = {
  requestId: number;
  snapshot: RawMarketSnapshot;
};

type WorkerResponse =
  | {
      requestId: number;
      success: true;
      overview: ReturnType<typeof buildLiveOverview>;
    }
  | {
      requestId: number;
      success: false;
      error: string;
    };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, snapshot } = event.data;

  try {
    const overview = buildLiveOverview(snapshot);
    const response: WorkerResponse = {
      requestId,
      success: true,
      overview
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      requestId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown market analysis worker error"
    };
    self.postMessage(response);
  }
};

export {};
