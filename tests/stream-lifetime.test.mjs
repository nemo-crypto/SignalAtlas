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
  return {close, raw(data) {socket.onmessage({data});}, send(data) {socket.onmessage({data: JSON.stringify({stream: 'xrpusdt@miniTicker', data})});}, get current() {return current;}, get updates() {return updates;}};
}
test('messages queued after stream cleanup cannot update the page', t => {
  const s = stream(t);
  s.close();
  s.send({e: '24hrMiniTicker', c: '0.22', o: '0.2'});
  assert.equal(s.updates, 0);
});
test('malformed frames are ignored without breaking subsequent valid updates', t => {
  const s = stream(t);
  for (const raw of ['{broken', 'null', '{}', '{"data":null}']) {
    assert.doesNotThrow(() => s.raw(raw));
  }
  s.send({e: '24hrMiniTicker', c: '0.22', o: '0.2'});
  assert.equal(s.updates, 1);
});

test('cleanup is repeatable and keeps previously displayed data intact', t => {
  const s = stream(t);
  s.send({e: '24hrMiniTicker', c: '0.22', o: '0.2'});
  s.close(); s.close();
  s.send({e: '24hrMiniTicker', c: '0.99', o: '0.2'});
  assert.equal(s.updates, 1);
  assert.equal(s.current.price, 0.22);
});
