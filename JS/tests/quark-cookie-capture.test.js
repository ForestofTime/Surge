'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'JS/QuarkCookieCapture.js'), 'utf8');
const moduleText = fs.readFileSync(path.join(root, 'Module/QuarkCookieCapture.sgmodule'), 'utf8');

function execute({ url = 'https://coral2.quark.cn/quark/welfare/v3/query', cookie = 'kps=fixture-secret; broccoli-user-id=fixture-user;', argument } = {}) {
  let done;
  let post;
  vm.runInNewContext(script, {
    decodeURIComponent,
    $argument: argument,
    $request: { url, headers: { Cookie: cookie } },
    $httpClient: { post: (options, callback) => { post = options; callback(); } },
    $done: (value) => { done = value; },
  });
  return { done, post };
}

test('uses a narrow two-host MITM rule and private Tailnet receiver', () => {
  assert.match(moduleText, /\(\?:coral2\\\.quark\|broccoli\\\.uc\)\\\.cn/);
  assert.match(moduleText, /receiver_url:https:\/\/hynmac-mini\.taila66285\.ts\.net\/quark-cookie/);
  assert.match(moduleText, /requires-body=false/);
  assert.doesNotMatch(moduleText, /Authorization|QUARK_COOKIE=/i);
});

test('relays only the URL and valid Cookie without iOS persistence or logs', () => {
  const result = execute();
  const payload = JSON.parse(result.post.body);
  assert.equal(result.post.url, 'https://hynmac-mini.taila66285.ts.net/quark-cookie');
  assert.equal(result.post.policy, 'Tailnet');
  assert.match(payload.cookie, /^kps=/);
  assert.match(payload.url, /^https:\/\/coral2\.quark\.cn\//);
  assert.doesNotMatch(script, /persistentStore|console\.log|QUARK_COOKIE/);
});

test('passes through invalid hosts, missing kps, and public receivers', () => {
  assert.equal(execute({ url: 'https://example.com/path' }).post, undefined);
  assert.equal(execute({ cookie: 'ut=device-only;' }).post, undefined);
  assert.equal(execute({ argument: 'receiver_url=https%3A%2F%2Fexample.com%2Fquark-cookie' }).post, undefined);
});
