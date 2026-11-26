import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/load-source.mjs';
const {normalizeEventCandles} = await loadSource('../../src/services/eventPrediction.ts');
const candle = {id: 'BTCUSDT-60000', symbol: 'BTCUSDT', openTime: 60000, closeTime: 119999, open: 100, high: 110, low: 90, close: 101, volume: 10, storedAt: 1};
test('incoming updates replace the earlier snapshot of the same candle', () => {
  const updated = {...candle, close: 109, storedAt: 2};
  assert.deepEqual(normalizeEventCandles([candle, updated]), [updated]);
  assert.equal(candle.close, 101);
});
test('invalid OHLC values cannot enter technical analysis', () => {
  const invalid = [{...candle, high: Infinity}, {...candle, low: 105}, {...candle, volume: -1}, {...candle, closeTime: 0}];
  for (const item of invalid) assert.deepEqual(normalizeEventCandles([item]), []);
});
