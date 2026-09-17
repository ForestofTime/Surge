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
    decodeURIComponent, URL,
    $argument: argument,
    $request: { url, headers: { Cookie: cookie } },
    $httpClient: { post: (options, callback) => { post = options; callback(); } },
    $done: (value) => { done = value; },
  });
  return { done, post };
}

test('only MITMs the welfare WebView and excludes the pinned native host', () => {
  assert.match(moduleText, /pattern=\^https\?:\\\/\\\/broccoli\\\.uc\\\.cn/);
  assert.match(moduleText, /^hostname = %APPEND% broccoli\.uc\.cn$/m);
  assert.match(moduleText, /^hostname-disabled = %APPEND% coral2\.quark\.cn$/m);
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
  assert.equal(payload.url, 'https://coral2.quark.cn/quark/welfare/v3/query');
  assert.doesNotMatch(script, /persistentStore|console\.log|QUARK_COOKIE/);
});

test('recovers kps and identity from query parameters without relaying the query string', () => {
  const result = execute({
    url: 'https://broccoli.uc.cn/welfare/query?kps=url-kps-fixture&ut=url-user-fixture',
    cookie: 'other=value;',
  });
  const payload = JSON.parse(result.post.body);
  assert.match(payload.cookie, /(?:^|;\s*)kps=url-kps-fixture;/);
  assert.match(payload.cookie, /(?:^|;\s*)ut=url-user-fixture;/);
  assert.equal(payload.url, 'https://broccoli.uc.cn/welfare/query');
  assert.doesNotMatch(result.post.body, /\?/);
});

test('passes through invalid hosts, missing kps, and public receivers', () => {
  assert.equal(execute({ url: 'https://example.com/path' }).post, undefined);
  assert.equal(execute({ cookie: 'ut=device-only;' }).post, undefined);
  assert.equal(execute({ argument: 'receiver_url=https%3A%2F%2Fexample.com%2Fquark-cookie' }).post, undefined);
});
