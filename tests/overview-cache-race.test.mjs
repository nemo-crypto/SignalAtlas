import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import {IDBFactory, IDBKeyRange, IDBObjectStore} from 'fake-indexeddb';
import {loadSource} from './helpers/load-source.mjs';
const {act, create} = TestRenderer;
const {useLiveMarketOverview} = await loadSource('../../src/hooks/useLiveMarketOverview.ts');
const {saveLiveSnapshot} = await loadSource('../../src/services/persistence.ts');
const {getBaselineOverview} = await loadSource('../../src/services/binance.ts');
async function fixture(t, live = true) {
  let current, root, release, nextTimer = 0;
  const baseline = getBaselineOverview('BTCUSDT');
  class Worker {
    postMessage(message) {queueMicrotask(() => this.onmessage({data: {requestId: message.requestId, success: true, overview: {...baseline, price: 200}}}));}
    terminate() {}
  }
  class Socket {close() {}}
  const window = {setInterval() {return ++nextTimer;}, clearInterval() {}, clearTimeout() {}};
  for (const [name, value] of Object.entries({window, WebSocket: Socket, Worker, indexedDB: new IDBFactory(), IDBKeyRange})) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, value});
    t.after(() => {if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name];});
  }
  await saveLiveSnapshot({symbol: 'BTCUSDT', overview: {...baseline, price: 100}, connectionState: 'live', updatedAt: Date.now() - 10000, recomputedAt: Date.now() - 10000, storedAt: Date.now()});
  const originalGet = IDBObjectStore.prototype.get;
  t.mock.method(IDBObjectStore.prototype, 'get', function(key) {
    const request = originalGet.call(this, key);
    if (this.name === 'snapshots') {
      let success;
      Object.defineProperty(request, 'onsuccess', {configurable: true, set(value) {success = value;}});
      request.addEventListener('success', event => {release = () => success(event);});
    }
    return request;
  });
  t.mock.method(globalThis, 'fetch', async url => live
    ? new Response(JSON.stringify(String(url).includes('openInterestHist') || String(url).includes('Ratio') || String(url).includes('klines') ? [] : {}))
    : new Response('', {status: 503}));
  function Probe() {current = useLiveMarketOverview('BTCUSDT'); return null;}
  const flush = async () => {for (let i = 0; i < 25; i++) await new Promise(resolve => setImmediate(resolve));};
  await act(async () => {root = create(React.createElement(Probe)); await flush();});
  return {get current() {return current;}, async release() {await act(async () => {assert.equal(typeof release, 'function'); release(); await flush();});}, close() {act(() => root.unmount()); release?.();}};
}
test('a delayed cached snapshot cannot replace newer live market data', async t => {
  const f = await fixture(t);
  try {
    assert.equal(f.current.overview.price, 200);
    const timestamp = f.current.lastUpdatedAt;
    await f.release();
    assert.equal(f.current.overview.price, 200);
    assert.equal(f.current.lastUpdatedAt, timestamp);
  } finally {f.close();}
});

test('cached snapshots still populate the page when live data is unavailable', async t => {
  const f = await fixture(t, false);
  try {
    await f.release();
    assert.equal(f.current.overview.price, 100);
    assert.equal(f.current.connectionState, 'fallback');
  } finally {f.close();}
});
