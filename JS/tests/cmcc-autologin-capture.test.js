const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(root, 'Module/CMCCAutoLoginCapture.sgmodule'), 'utf8');
const script = fs.readFileSync(path.join(root, 'JS/CMCCAutoLoginCapture.js'), 'utf8');

function execute({ body, argument, response = null, id = 'request-1', url = 'https://client.app.coc.10086.cn/biz-orange/LN/uamrandcodelogin/autoLogin' }) {
  let done;
  let post;
  vm.runInNewContext(script, {
    decodeURIComponent,
    $request: { id, url, method: 'POST', ...(body === undefined ? {} : { body }) },
    ...(response ? { $response: response } : {}),
    $argument: argument,
    $httpClient: { post: (options, callback) => { post = options; callback(); } },
    $done: (result) => { done = result; },
  });
  return { done, post };
}

test('captures every bounded LN autoLogin path and uses a Tailnet-only receiver argument', () => {
  assert.match(moduleText, /^#!arguments = receiver_url:https:\/\/hynmac-mini\.taila66285\.ts\.net\/cmcc-autologin$/m);
  assert.match(moduleText, /type=http-request/);
  assert.match(moduleText, /type=http-response/);
  assert.ok(moduleText.includes('[A-Za-z0-9_-]+\\/autoLogin'));
  assert.match(moduleText, /CMCCAutoLoginCapture\.js\?v=7/g);
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /full-header-mode=true/);
  assert.match(moduleText, /hostname = %APPEND% client\.app\.coc\.10086\.cn/);
  assert.doesNotMatch(moduleText, /Authorization|token=/i);
});

test('relays every request event to the configured Tailnet endpoint without iOS-side pairing', () => {
  const body = 'A'.repeat(512);
  const result = execute({
    body,
    id: 'paired-id',
    argument: 'receiver_url=https%3A%2F%2Fhynmac-mini.taila66285.ts.net%2Fcmcc-autologin',
  });
  const payload = JSON.parse(result.post.body);
  assert.equal(payload.phase, 'request');
  assert.equal(payload.requestId, 'paired-id');
  assert.equal(payload.method, 'POST');
  assert.equal(payload.body, body);
  assert.match(payload.url, /uamrandcodelogin\/autoLogin$/);
  assert.equal(result.post.policy, 'Tailnet');
});

test('relays the corresponding raw response and full response headers', () => {
  const responseBody = 'B'.repeat(512);
  const result = execute({
    id: 'paired-id',
    response: { status: 200, body: responseBody, headers: [{ field: 'Set-Cookie', value: 'JSESSIONID=fixture' }] },
    argument: 'receiver_url=https%3A%2F%2Fhynmac-mini.taila66285.ts.net%2Fcmcc-autologin',
  });
  assert.equal(JSON.stringify(result.done), '{}');
  assert.equal(result.post.url, 'https://hynmac-mini.taila66285.ts.net/cmcc-autologin');
  const payload = JSON.parse(result.post.body);
  assert.equal(payload.phase, 'response');
  assert.equal(payload.requestId, 'paired-id');
  assert.equal(payload.body, responseBody);
  assert.equal(payload.status, 200);
  assert.equal(payload.headers[0].field, 'Set-Cookie');
  assert.equal(result.post.policy, 'Tailnet');
});

test('uses the safe default only when no argument is set', () => {
  const result = execute({ body: 'A'.repeat(512), argument: undefined });
  assert.equal(result.post.url, 'https://hynmac-mini.taila66285.ts.net/cmcc-autologin');
});

test('passes through when receiver, request, or response input is invalid', () => {
  const result = execute({ body: 'bad', argument: 'receiver_url=https%3A%2F%2Fexample.com%2Fcmcc-autologin' });
  assert.equal(JSON.stringify(result.done), '{}');
  assert.equal(result.post, undefined);
});
