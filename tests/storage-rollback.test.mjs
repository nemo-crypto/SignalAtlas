import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory, IDBKeyRange} from 'fake-indexeddb';
import {loadSource} from './helpers/load-source.mjs';
const {saveEventCandles, loadEventCandles} = await loadSource('../../src/services/persistence.ts');
function database(t) {
  for (const [name, value] of Object.entries({indexedDB: new IDBFactory(), IDBKeyRange})) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, value});
    t.after(() => {if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name];});
  }
}
const candle = {id: 'first', symbol: 'BTCUSDT', openTime: 0, closeTime: 59999, open: 1, high: 2, low: 1, close: 2, volume: 10, storedAt: 1};
test('a failed batch write rolls back earlier successful requests', async t => {
  database(t);
  await assert.rejects(saveEventCandles([candle, {...candle, id: undefined}]));
  assert.deepEqual(await loadEventCandles({symbol: 'BTCUSDT'}), []);
});

test('a failed batch preserves existing data and later transactions can succeed', async t => {
  database(t);
  await saveEventCandles([candle]);
  await assert.rejects(saveEventCandles([{...candle, close: 9}, {...candle, id: undefined}]));
  assert.equal((await loadEventCandles({symbol: 'BTCUSDT'}))[0].close, 2);
  await saveEventCandles([{...candle, id: 'second', openTime: 60000}]);
  assert.equal((await loadEventCandles({symbol: 'BTCUSDT'})).length, 2);
});
