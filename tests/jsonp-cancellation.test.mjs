import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './helpers/load-source.mjs';
const {fetchAshareFundMarketSnapshot} = await loadSource('../../src/services/ashareFundMarketData.ts');
const {ashareSectorFunds} = await loadSource('../../src/data/ashareSectorFunds.ts');
function browser(t) {
  const scripts = [], timers = new Set();
  let id = 0;
  const window = {setTimeout() {timers.add(++id); return id;}, clearTimeout(key) {timers.delete(key);}};
  const document = {createElement() {return {removed: false, remove() {this.removed = true;}};}, head: {appendChild(script) {scripts.push(script);}}};
  t.after(() => scripts.forEach(script => script.onerror?.()));
  for (const [name, value] of Object.entries({window, document})) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {configurable: true, value});
    t.after(() => {if (previous) Object.defineProperty(globalThis, name, previous); else delete globalThis[name];});
  }
  return {scripts, timers};
}
test('an already-aborted request rejects before inserting JSONP resources', async t => {
  const b = browser(t), controller = new AbortController();
  controller.abort();
  const result = await Promise.race([
    fetchAshareFundMarketSnapshot(ashareSectorFunds[0].funds[0], controller.signal).then(() => 'success', error => error.name),
    new Promise(resolve => setImmediate(() => resolve('pending'))),
  ]);
  assert.equal(result, 'AbortError');
  assert.equal(b.scripts.length, 0);
  assert.equal(b.timers.size, 0);
});

test('cancelling an active JSONP request removes its script and timeout', async t => {
  const b = browser(t), controller = new AbortController();
  const result = fetchAshareFundMarketSnapshot(ashareSectorFunds[0].funds[0], controller.signal);
  const rejection = assert.rejects(result, {name: 'AbortError'});
  assert.equal(b.scripts.length, 1);
  controller.abort();
  await rejection;
  assert.equal(b.scripts[0].removed, true);
  assert.equal(b.timers.size, 0);
});
