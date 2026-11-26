import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/load-source.mjs';
const {connectBinanceMarketStream} = await loadSource('../../src/services/binance.ts');
function stream(t) {
  let socket, current = {dimensions: [], reportHighlights: []}, updates = 0;
  let close = () => {};
  t.after(() => close());
  class Socket {constructor(url) {this.url = url; socket = this;} close() {}}
  for (const [name, value] of Object.entries({WebSocket: Socket, window: {clearTimeout() {}}})) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
    t.after(() => {if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name];});
  }
  close = connectBinanceMarketStream('BTCUSDT', {onOverview(update) {current = update(current); updates++;}});
  return {send(data) {socket.onmessage({data: JSON.stringify({stream: 'btcusdt@depth10', data})});}, get current() {return current;}, get updates() {return updates;}};
}
test('subscribed partial depth snapshots update the visible order book', t => {
  const s = stream(t);
  s.send({lastUpdateId: 160, bids: [['100', '10']], asks: [['101', '20']]});
  assert.equal(s.updates, 1);
  assert.equal(s.current.orderBookDepth.bids[0].price, 100);
  assert.equal(s.current.orderBookDepth.asks[0].price, 101);
});

test('new partial snapshots replace old price levels rather than accumulating them', t => {
  const s = stream(t);
  s.send({lastUpdateId: 160, bids: [['100', '10'], ['99', '5']], asks: [['101', '20']]});
  s.send({lastUpdateId: 161, bids: [['98', '3']], asks: [['102', '4']]});
  assert.equal(s.updates, 2);
  assert.deepEqual(s.current.orderBookDepth.bids.map(level => level.price), [98]);
  assert.deepEqual(s.current.orderBookDepth.asks.map(level => level.price), [102]);
});
