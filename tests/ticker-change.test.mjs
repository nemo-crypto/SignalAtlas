import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/load-source.mjs';
const {connectBinanceMarketStream} = await loadSource('../../src/services/binance.ts');
function stream(t) {
  let socket, current = {dimensions: [], reportHighlights: [], price: 0.2, change24h: 5}, updates = 0;
  let close = () => {};
  t.after(() => close());
  class Socket {constructor(url) {this.url = url; socket = this;} close() {}}
  for (const [name, value] of Object.entries({WebSocket: Socket, window: {clearTimeout() {}}})) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
    t.after(() => {if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name];});
  }
  close = connectBinanceMarketStream('XRPUSDT', {onOverview(update) {current = update(current); updates++;}});
  return {send(data) {socket.onmessage({data: JSON.stringify({stream: 'xrpusdt@miniTicker', data})});}, get current() {return current;}, get updates() {return updates;}};
}
test('percentage change uses the actual opening price for assets below one dollar', t => {
  const s = stream(t);
  s.send({e: '24hrMiniTicker', c: '0.22', o: '0.2'});
  assert.ok(Math.abs(s.current.change24h - 10) < 1e-9);
  s.send({e: '24hrMiniTicker', c: '0.18', o: '0.2'});
  assert.ok(Math.abs(s.current.change24h + 10) < 1e-9);
});

test('invalid prices cannot overwrite the last valid displayed quote', t => {
  const s = stream(t);
  s.send({e: '24hrMiniTicker', c: '0.21', o: '0'});
  assert.equal(s.current.price, 0.21);
  assert.equal(s.current.change24h, 5);
  s.send({e: '24hrMiniTicker', c: 'invalid', o: '0.2'});
  assert.equal(s.current.price, 0.21);
  assert.equal(s.current.change24h, 5);
});
