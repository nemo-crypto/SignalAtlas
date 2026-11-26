import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/load-source.mjs';
async function runtime(t) {
  const workers = [];
  class Worker {
    constructor() {this.messages = []; this.terminated = false; workers.push(this);}
    postMessage(message) {this.messages.push(message);}
    terminate() {this.terminated = true;}
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', {configurable: true, writable: true, value: Worker});
  t.after(() => {if (previous) Object.defineProperty(globalThis, 'Worker', previous); else delete globalThis.Worker;});
  const api = await loadSource('../../src/services/marketAnalysisWorkerClient.ts');
  return {...api, workers};
}
test('failed workers are terminated and stale events cannot reject replacement work', async t => {
  const r = await runtime(t);
  const first = r.analyzeMarketSnapshot({});
  const rejected = assert.rejects(first, /crashed/);
  const old = r.workers[0];
  old.onerror({error: new Error('crashed')});
  await rejected;
  assert.equal(old.terminated, true);
  const next = r.analyzeMarketSnapshot({});
  const fresh = r.workers[1];
  old.onerror({error: new Error('stale error')});
  fresh.onmessage({data: {requestId: fresh.messages[0].requestId, success: true, overview: {symbol: 'BTCUSDT'}}});
  assert.deepEqual(await next, {symbol: 'BTCUSDT'});
});

test('worker construction failures reject the API promise and later calls recover', async t => {
  const r = await runtime(t);
  const WorkingWorker = globalThis.Worker;
  globalThis.Worker = class {constructor() {throw new Error('worker blocked');}};
  let result;
  assert.doesNotThrow(() => {result = r.analyzeMarketSnapshot({});});
  await assert.rejects(result, /worker blocked/);
  globalThis.Worker = WorkingWorker;
  const next = r.analyzeMarketSnapshot({});
  const worker = r.workers[0];
  worker.onmessage({data: {requestId: worker.messages[0].requestId, success: true, overview: {symbol: 'ETHUSDT'}}});
  assert.equal((await next).symbol, 'ETHUSDT');
});
