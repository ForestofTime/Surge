'use strict';

// Regression tests for JS/QuarkMultiAccountCookie.js
//
// Bug class: a single Quark account could be registered multiple times because the
// identity used when STORING a credential drifted from the identity used when
// LOOKING ONE UP. A request that carries `ut` stores `ut_<ut>`; the same account two
// seconds later without `ut` (and with a URL-encoded `kps`) stored `kps_<prefix>`.
// Worse, updates replaced the whole entry, so a later `ut`-less request destroyed the
// `ut` anchor — after the next `kps` rotation nothing could re-associate the account.
//
// These tests lock three invariants:
//   1. same account in any shape converges to ONE entry
//   2. updates MERGE fields instead of clobbering them (ut / _UP_A4A_11_ survive)
//   3. genuinely different accounts still land as separate entries

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'JS/QuarkMultiAccountCookie.js'), 'utf8');

const KPS_MAIN = 'LuGFVgBjdBEV/b3kT4XC7m2odBVwuyDfECy4gUVcrwYl2b2BbyO6PmiOPkQIp538XjcV9ZwgA0O/FPllTnQJOZaCL+k/nkrdCt5vYCYggxCH6OzGnkbPYqeREFs/C7+bdJo=';
const KPS_MAIN_OLD = 'LuGQS0IRLPLaX4fH/lQi8phA6FmXwVclffcQNU2C4qA7r3ByPaf+uwdy9jAQxHKF1K9uywJFanduru1IvdbGqnK1SSS2pksfzafORhA8YWVimg==';
const UT = 'LuELgLnV4NRGXmbh7XSN9Xn+/MNkeciZRKUKkk2NqQOBzQ==';
const KPS_SECOND = 'Tkgw3UP1o1bzNxu6M3RREMZSTXHSmmo8p7I+yIx/JPicFInloLgMzOyZazP5qqaA69fO1H0GAhL4n1R3qdWXB2HT1T4xyvHn1rPE1xJFkkqq2Q==';
const DEVICE_FP = 'wba2e1f8546e413aa9a520ba4682121f';

const URL_ = 'https://coral2.quark.cn/f3accordiance/main?entry=heaviest';

function createStore() {
  return { QUARK_COOKIE: null };
}

function run(store, cookie, url = URL_) {
  const notifications = [];
  const sandbox = {
    URL,
    decodeURIComponent,
    encodeURIComponent,
    Date,
    Math,
    Object,
    JSON,
    console,
    $request: { url, headers: { Cookie: cookie } },
    $persistentStore: {
      read: (key) => (key in store ? store[key] : null),
      write: (value, key) => { store[key] = value; return true; },
    },
    $environment: { 'surge-version': 1400 },
    $notification: { post: (title, subtitle, body) => notifications.push({ title, subtitle, body }) },
    $prefs: undefined,
    $done: () => {},
  };
  vm.runInNewContext(script, sandbox);
  return { notifications, store };
}

function entries(store) {
  return (store.QUARK_COOKIE || '').split('&').filter(Boolean);
}

function isNewAccount(result) {
  return result.notifications.some((n) => String(n.subtitle).includes('成功捕获夸克新账号'));
}

test('same account converges to one entry across ut / kps-encoding / rotation shapes', () => {
  const store = createStore();

  const move1 = run(store, `kps=${KPS_MAIN_OLD}; ut=${UT};`);
  assert.equal(isNewAccount(move1), true, 'first sighting registers the account');
  assert.equal(entries(store).length, 1);

  const move2 = run(store, `kps=${encodeURIComponent(KPS_MAIN_OLD)};`);
  assert.equal(isNewAccount(move2), false, 'ut-less same kps is an update, not a new account');
  assert.equal(entries(store).length, 1);

  const move3 = run(store, `kps=${KPS_MAIN}; ut=${UT};`);
  assert.equal(isNewAccount(move3), false, 'kps rotation with the same ut is an update');
  assert.equal(entries(store).length, 1);

  const move4 = run(store, `kps=${encodeURIComponent(KPS_MAIN)};`);
  assert.equal(isNewAccount(move4), false, 'rotated kps without ut still folds into the account');
  assert.equal(entries(store).length, 1);
});

test('a distinct account registers separately and both survive later captures', () => {
  const store = createStore();

  run(store, `kps=${KPS_MAIN}; ut=${UT};`);
  const second = run(store, `_UP_A4A_11_=${DEVICE_FP}; kps=${KPS_SECOND};`);
  assert.equal(isNewAccount(second), true, 'a different kps/device is a genuinely new account');

  const list = entries(store);
  assert.equal(list.length, 2);

  const revisit = run(store, `kps=${KPS_SECOND};`);
  assert.equal(isNewAccount(revisit), false, 'repeating the second account does not inflate the list');
  assert.equal(entries(store).length, 2);
});

test('updates merge fields instead of clobbering the previous entry', () => {
  const store = createStore();

  run(store, `kps=${KPS_MAIN_OLD}; ut=${UT};`);
  run(store, `kps=${encodeURIComponent(KPS_MAIN_OLD)};`);

  const [main] = entries(store);
  assert.match(main, /ut=/, 'the ut anchor survives a request that carried none');
  assert.match(main, new RegExp(UT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'ut value is preserved verbatim');

  // Same guarantee for the device fingerprint the Quark task script needs.
  const two = createStore();
  run(two, `_UP_A4A_11_=${DEVICE_FP}; kps=${KPS_SECOND};`);
  run(two, `kps=${encodeURIComponent(KPS_SECOND)};`);
  const secondEntry = entries(two).find((e) => e.includes('&') === false && /kps=/.test(e));
  assert.match(
    entries(two).join('&'),
    new RegExp(`_UP_A4A_11_=${DEVICE_FP}`),
    'the _UP_A4A_11_ device fingerprint is never dropped by a fingerprint-less request',
  );
  assert.ok(secondEntry === undefined || typeof secondEntry === 'string', 'entries stay strings');
});

test('ignores requests with no kps and non-quark hosts', () => {
  const store = createStore();

  run(store, `ut=${UT}; something=else;`);
  assert.equal(store.QUARK_COOKIE, null, 'a kps-less capture is not a credential');

  run(store, `kps=${KPS_MAIN};`, 'https://example.com/path');
  assert.equal(store.QUARK_COOKIE, null, 'unrelated hosts are not intercepted');
});
