import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/load-source.mjs';
const {settleEventPredictionRecords} = await loadSource('../../src/services/eventPrediction.ts');
const prediction = {id: 'p', symbol: 'BTCUSDT', status: 'pending', expiryAt: 90000, direction: 'UP', basePrice: 100, stake: 10, payoutRatio: 0.8};
const candle = {id: 'BTCUSDT-60000', symbol: 'BTCUSDT', openTime: 60000, closeTime: 119999, open: 100, high: 110, low: 90, close: 105, volume: 10, storedAt: 1};
test('settlement waits for the covering candle to close', () => {
  assert.deepEqual(settleEventPredictionRecords({predictions: [prediction], candlesBySymbol: {BTCUSDT: [candle]}, now: 90001}), []);
  const result = settleEventPredictionRecords({predictions: [prediction], candlesBySymbol: {BTCUSDT: [candle]}, now: 120000});
  assert.equal(result[0].status, 'won');
  assert.equal(result[0].pnl, 8);
});
test('a later candle cannot stand in for missing expiry-time data', () => {
  const later = {...candle, openTime: 180000, closeTime: 239999};
  assert.deepEqual(settleEventPredictionRecords({predictions: [prediction], candlesBySymbol: {BTCUSDT: [later]}, now: 300000}), []);
});

test('exact close-time boundaries and flat outcomes remain deterministic', () => {
  const result = settleEventPredictionRecords({
    predictions: [{...prediction, expiryAt: candle.closeTime}],
    candlesBySymbol: {BTCUSDT: [{...candle, close: prediction.basePrice}]},
    now: candle.closeTime,
  });
  assert.equal(result[0].status, 'flat');
  assert.equal(result[0].pnl, 0);
  assert.equal(result[0].correct, false);
});
