import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import {IDBFactory, IDBKeyRange} from 'fake-indexeddb';
import {loadSource} from './helpers/load-source.mjs';
const {act, create} = TestRenderer;
const {useLiveMarketOverview} = await loadSource('../../src/hooks/useLiveMarketOverview.ts');
function browser(t) {
  const intervals = new Set(), requests = [];
  let id = 0;
  const window = {setInterval() {const key = ++id; intervals.add(key); return key;}, clearInterval(key) {intervals.delete(key);}, clearTimeout() {}};
  class Socket {close() {}}
  for (const [name, value] of Object.entries({window, WebSocket: Socket, indexedDB: new IDBFactory(), IDBKeyRange})) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, value});
    t.after(() => {if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name];});
  }
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => requests.push(() => resolve(new Response('', {status: 503})))));
  return {intervals, async finish() {await act(async () => {requests.forEach(resolve => resolve()); await new Promise(resolve => setImmediate(resolve));});}};
}
function Probe() {useLiveMarketOverview('BTCUSDT'); return null;}
test('an unmounted overview cannot install a refresh timer when startup finishes later', async t => {
  const b = browser(t);
  let root;
  try {
    await act(async () => {root = create(React.createElement(Probe));});
    act(() => root.unmount());
    await b.finish();
    assert.equal(b.intervals.size, 0);
  } finally {if (root) act(() => root.unmount());}
});

test('a mounted overview starts refresh scheduling and clears every timer on unmount', async t => {
  const b = browser(t);
  let root;
  try {
    await act(async () => {root = create(React.createElement(Probe));});
    await b.finish();
    assert.ok(b.intervals.size > 0);
    act(() => root.unmount());
    assert.equal(b.intervals.size, 0);
  } finally {if (root) act(() => root.unmount());}
});
