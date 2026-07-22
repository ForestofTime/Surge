const test = require('node:test');
const assert = require('node:assert/strict');
const capture = require('../fallback-capture.js');
const { createStore } = require('./fallback-test-helpers.js');

test('normalizes a hostname, ignores control-plane hosts, and deduplicates per day', () => {
  const store = createStore();
  const now = new Date('2026-07-21T18:00:00.000Z');
  const first = capture.capture({ store, request: { hostname: 'Example.COM.' }, now });
  const second = capture.capture({ store, request: { hostname: 'example.com' }, now });
  const control = capture.capture({ store, request: { hostname: 'api.github.com' }, now });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'duplicate');
  assert.equal(control.accepted, false);
  assert.equal(control.reason, 'control-plane');
  const liveKey = Array.from(store.values.keys()).find((key) => key.startsWith('frq.live.'));
  assert.equal(JSON.parse(store.get(liveKey)).q[0].i.length, 1);
  const liveWrite = store.calls.find((call) => call[0] === 'write' && call[2] === liveKey);
  assert.ok(liveWrite, 'persistentStore.write must receive data first and key second');
  assert.match(liveWrite[1], /\"v\":1/);
});

test('rejects invalid, local, private, multicast, and single-label targets', () => {
  const store = createStore();
  const now = new Date('2026-07-21T18:00:00.000Z');
  for (const hostname of ['localhost', 'printer.local', 'home.arpa', '192.168.1.1', '127.0.0.1', '224.0.0.1', 'bad host']) {
    const result = capture.capture({ store, request: { hostname }, now });
    assert.equal(result.accepted, false, hostname);
  }
});

test('records IPv4 and IPv6 using the fixed wire tags', () => {
  const store = createStore();
  const now = new Date('2026-07-21T18:00:00.000Z');
  assert.equal(capture.capture({ store, request: { hostname: '203.0.113.5' }, now }).kind, '4');
  assert.equal(capture.capture({ store, request: { hostname: '2001:db8::1' }, now }).kind, '6');
  const all = Array.from(store.values.entries())
    .filter(([key]) => key.startsWith('frq.live.'))
    .flatMap(([, value]) => JSON.parse(value).q.flatMap((bucket) => bucket.i));
  assert.deepEqual(all, [['4', '203.0.113.5'], ['6', '2001:db8::1']]);
});

test('uses a best-effort single-flight lock and never logs a token or target', () => {
  const store = createStore();
  const now = new Date('2026-07-21T18:00:00.000Z');
  const shard = capture.shardFor('d:example.org');
  store.write(JSON.stringify({ owner: 'other', expires: now.getTime() + 10000 }), `frq.lock.capture.${String(shard).padStart(2, '0')}`);
  const result = capture.capture({ store, request: { hostname: 'example.org' }, now });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'busy');
});

test('does not overwrite an old day silently when the device was offline', () => {
  const key = `frq.live.${String(capture.shardFor('d:new.example')).padStart(2, '0')}`;
  const store = createStore({
    [key]: JSON.stringify({ v: 1, q: [{ d: '2026-07-20', i: [['d', 'old.example']] }] })
  });
  const result = capture.capture({ store, request: { hostname: 'new.example' }, now: new Date('2026-07-21T18:00:00.000Z') });
  assert.equal(result.accepted, true);
  const queue = JSON.parse(store.get(key)).q;
  assert.deepEqual(queue.map((bucket) => bucket.d), ['2026-07-20', '2026-07-21']);
});
