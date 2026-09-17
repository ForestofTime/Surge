const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(root, 'Module/CMCCAutoLoginCapture.sgmodule'), 'utf8');
const script = fs.readFileSync(path.join(root, 'JS/CMCCAutoLoginCapture.js'), 'utf8');

function execute({ body, argument, response = null, includeUrl = false }) {
  let done;
  let post;
  vm.runInNewContext(script, {
    decodeURIComponent,
    $request: { body },
    ...(response ? { $response: response } : {}),
    $argument: argument,
    $httpClient: { post: (options, callback) => { post = options; callback(); } },
    $done: (result) => { done = result; },
    ...(includeUrl ? { URL } : {}),
  });
  return { done, post };
}

test('uses a narrow autoLogin response hook and Tailnet-only receiver argument', () => {
  assert.match(moduleText, /^#!arguments = receiver_url:https:\/\/hynmac-mini\.taila66285\.ts\.net\/cmcc-autologin$/m);
  assert.match(moduleText, /type=http-response/);
  assert.ok(moduleText.includes('(?:uamrandcodelogin|uamonekeylogin)\\/autoLogin'));
  assert.match(moduleText, /CMCCAutoLoginCapture\.js\?v=4/);
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /hostname = %APPEND% client\.app\.coc\.10086\.cn/);
  assert.doesNotMatch(moduleText, /Authorization|token=/i);
});

test('sends only a valid captured body to the configured Tailnet endpoint', () => {
  const body = 'A'.repeat(512);
  const responseBody = 'B'.repeat(512);
  const result = execute({
    body,
    response: { status: 200, body: responseBody, headers: { 'Set-Cookie': 'JSESSIONID=fixture' } },
    argument: 'receiver_url=https%3A%2F%2Fhynmac-mini.taila66285.ts.net%2Fcmcc-autologin',
  });
  assert.equal(JSON.stringify(result.done), '{}');
  assert.equal(result.post.url, 'https://hynmac-mini.taila66285.ts.net/cmcc-autologin');
  assert.equal(JSON.parse(result.post.body).body, body);
  assert.deepEqual(JSON.parse(result.post.body).response, { status: 200, body: responseBody, setCookie: 'JSESSIONID=fixture' });
  assert.equal(result.post.policy, 'Tailnet');
});

test('works without browser URL support and uses the safe default only when no argument is set', () => {
  const result = execute({ body: 'A'.repeat(512), response: { status: 200, body: 'B'.repeat(512), headers: { 'set-cookie': 'JSESSIONID=fixture' } }, argument: undefined });
  assert.equal(result.post.url, 'https://hynmac-mini.taila66285.ts.net/cmcc-autologin');
});

test('passes the app response through when receiver, request, or response input is invalid', () => {
  const result = execute({ body: 'bad', argument: 'receiver_url=https%3A%2F%2Fexample.com%2Fcmcc-autologin' });
  assert.equal(JSON.stringify(result.done), '{}');
  assert.equal(result.post, undefined);
});
