import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import {IDBFactory, IDBKeyRange} from 'fake-indexeddb';
import {loadSource} from './helpers/load-source.mjs';
const {act, create} = TestRenderer;
const {useLiveMarketOverview} = await loadSource('../../src/hooks/useLiveMarketOverview.ts');
const storage = await loadSource('../../src/services/persistence.ts');
const {getBaselineOverview, fetchHistoricalClosePrice} = await loadSource('../../src/services/binance.ts');
async function fixture(t) {
  const intervals = new Map(); let id = 0, current, root, historicalPrice = null;
  const now = Date.now(), recordedAt = now - 7200000, target = recordedAt + 3600000;
  const window = {setInterval(callback, delay) {intervals.set(++id, {callback, delay}); return id;}, clearInterval(key) {intervals.delete(key);}, clearTimeout() {}};
  class Socket {close() {}}
  for (const [name, value] of Object.entries({window, WebSocket: Socket, indexedDB: new IDBFactory(), IDBKeyRange})) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, value});
    t.after(() => {if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name];});
  }
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('interval=1m') && historicalPrice !== null) {
      const start = Math.floor(target / 60000) * 60000;
      return new Response(JSON.stringify([[start, '90', '100', '80', String(historicalPrice), '1', start + 59999]]));
    }
    return new Response('', {status: 503});
  });
  await storage.saveLiveSnapshot({symbol: 'BTCUSDT', overview: {...getBaselineOverview('BTCUSDT'), price: 100}, connectionState: 'live', updatedAt: now - 1000, recomputedAt: now - 1000, storedAt: now});
  await storage.appendSignalHistory({id: 'pending', symbol: 'BTCUSDT', recordedAt, signal: '买入', confidence: 70, compositeBias: 20, price: 90, connectionState: 'live'});
  function Probe() {current = useLiveMarketOverview('BTCUSDT'); return null;}
  const flush = async () => {for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));};
  await act(async () => {root = create(React.createElement(Probe)); await flush();});
  assert.equal(current.overview.price, 100);
  return {
    async tick() {await act(async () => {for (const timer of [...intervals.values()]) if (timer.delay === 60000) timer.callback(); await flush();});},
    price(value) {historicalPrice = value;},
    close() {act(() => root.unmount());},
  };
}
test('failed historical quotes leave one-hour outcomes pending instead of using the current price', async t => {
  const f = await fixture(t);
  try {
    await f.tick();
    assert.equal((await storage.loadPendingSignalHistoryEntries('BTCUSDT')).length, 1);
  } finally {f.close();}
});
test('historical lookup does not substitute unrelated candles or zero prices', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([[1000, '1', '1', '1', '0', '1', 1999]])));
  assert.equal(await fetchHistoricalClosePrice('BTCUSDT', 1500, new AbortController().signal), null);
  assert.equal(await fetchHistoricalClosePrice('BTCUSDT', 9000, new AbortController().signal), null);
});

test('pending outcomes resolve after historical data recovers', async t => {
  const f = await fixture(t);
  try {
    await f.tick();
    f.price(95);
    await f.tick();
    assert.equal((await storage.loadPendingSignalHistoryEntries('BTCUSDT')).length, 0);
    const history = await storage.loadSignalHistory('BTCUSDT');
    assert.equal(history[0].marketPnlValue, (95 - 90) / 90 * 100);
  } finally {f.close();}
});
