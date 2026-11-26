import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { loadSource } from './helpers/load-source.mjs';
const { act, create } = TestRenderer;
const { useHeaderMarketTicker } = await loadSource('../../src/hooks/useHeaderMarketTicker.ts');
const rest = (price = '101') => [{ symbol: 'BTCUSDT', lastPrice: price, openPrice: '100', priceChangePercent: String(Number(price) - 100), quoteVolume: '10000000', highPrice: price, lowPrice: '100', volume: '100' }];
const tick = price => [{ e: '24hrMiniTicker', E: Date.now(), s: 'BTCUSDT', c: price, o: '100', h: price, l: '100', v: '100', q: '10000000' }];
async function fixture(t) {
  const requests = [], sockets = [], timers = new Map();
  let current, root, nextId = 0;
  class Socket { constructor() { sockets.push(this); } close() {} }
  const win = { setTimeout(fn) { const id = ++nextId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  for (const [key, value] of Object.entries({ window: win, WebSocket: Socket })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => requests.push(payload => resolve(new Response(JSON.stringify(payload))))));
  function Probe() { current = useHeaderMarketTicker(); return null; }
  await act(async () => { root = create(React.createElement(Probe)); });
  return { get items() { return current; }, sockets, timers,
    async resolve(index, payload) { await act(async () => { requests[index](payload); }); },
    async message(index, payload) { await act(async () => { sockets[index].onmessage?.({ data: JSON.stringify(payload) }); }); },
    async reconnect() { await act(async () => { sockets.at(-1).onclose(); const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); }); },
    close() { act(() => root.unmount()); }
  };
}
test('a slow REST snapshot cannot replace a newer streamed ticker', async t => {
  const f = await fixture(t);
  try {
    await f.message(0, tick('120'));
    assert.equal(f.items[0].priceLabel, '$120');
    await f.resolve(0, rest('101'));
    assert.equal(f.items[0].priceLabel, '$120');
    assert.equal(f.items[0].changeLabel, '+20.00%');
  } finally { f.close(); }
});

test('a superseded snapshot response cannot overwrite the snapshot loaded after reconnect', async t => {
  const f = await fixture(t);
  try {
    await f.reconnect();
    await f.resolve(1, rest('130'));
    await f.resolve(0, rest('101'));
    assert.equal(f.items[0].priceLabel, '$130');
  } finally { f.close(); }
});
test('REST still fills untouched symbols while preserving streamed symbols', async t => {
  const f = await fixture(t);
  try {
    await f.message(0, tick('120'));
    const other = { ...rest('110')[0], symbol: 'ETHUSDT' };
    await f.resolve(0, [...rest('101'), other]);
    assert.equal(f.items.find(item => item.symbol === 'BTC').priceLabel, '$120');
    assert.equal(f.items.find(item => item.symbol === 'ETH').priceLabel, '$110');
  } finally { f.close(); }
});
