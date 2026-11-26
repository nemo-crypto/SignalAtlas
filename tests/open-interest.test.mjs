import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/load-source.mjs';
const {fetchEventMarketContext} = await loadSource('../../src/services/eventPrediction.ts');
test('open interest growth follows timestamps regardless of response order', async t => {
  let history = [{timestamp: 1000, sumOpenInterest: '100'}, {timestamp: 2000, sumOpenInterest: '110'}];
  t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(
    url.includes('openInterestHist') ? history : url.includes('premiumIndex') ? {lastFundingRate: '0'} : url.includes('longShort') ? [{longShortRatio: '1'}] : {quoteVolume: '1000', priceChangePercent: '1'}
  )));
  assert.equal((await fetchEventMarketContext('BTCUSDT', new AbortController().signal)).openInterestChangePercent, 10);
  history = [...history].reverse();
  assert.equal((await fetchEventMarketContext('BTCUSDT', new AbortController().signal)).openInterestChangePercent, 10);
});

test('missing or unusable history never invents a directional change', async () => {
  const {summarizeOpenInterestHistory} = await loadSource('../../src/services/marketAnalysis.ts');
  assert.deepEqual(summarizeOpenInterestHistory([]), {current: null, changePercent: null});
  assert.deepEqual(summarizeOpenInterestHistory([{timestamp: 1, sumOpenInterest: '100'}]), {current: 100, changePercent: null});
  assert.deepEqual(summarizeOpenInterestHistory([{timestamp: 1, sumOpenInterest: '0'}, {timestamp: 2, sumOpenInterest: '100'}]), {current: 100, changePercent: null});
  assert.deepEqual(summarizeOpenInterestHistory([{timestamp: 1, sumOpenInterest: '100'}, {timestamp: 2, sumOpenInterest: '0'}, {timestamp: 3, sumOpenInterest: 'bad'}]), {current: 0, changePercent: -100});
});
