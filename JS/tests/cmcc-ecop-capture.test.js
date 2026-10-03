'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(repoRoot, 'Module/CMCCEcopCapture.sgmodule'), 'utf8');
const scriptText = fs.readFileSync(path.join(repoRoot, 'JS/CMCCEcopCapture.js'), 'utf8');

test('module covers both capture points: biz request cookie + login response set-cookie', () => {
  const scriptLines = moduleText.split('\n').filter((line) => line.startsWith('中国移动-'));
  assert.equal(scriptLines.length, 2);
  const requestLine = scriptLines.find((l) => l.includes('type=http-request'));
  const responseLine = scriptLines.find((l) => l.includes('type=http-response'));
  assert.ok(requestLine, '必须挂业务请求抓取');
  assert.ok(responseLine, '必须挂换端响应抓取');
  assert.match(requestLine, /wap\\\.gd\\\.10086\\\.cn\\\/ech\\\/ecop\\\/app\\\/act\\\//);
  assert.match(responseLine, /ecop\\\/common\\\/sso\\\/groupAppTokenLogin/);
  // 不需要 body —— 会话全在 Cookie/Set-Cookie 头里
  assert.match(requestLine, /requires-body=false/);
  assert.match(responseLine, /requires-body=false/);
});

test('module declares MITM for wap.gd.10086.cn and the receiver argument', () => {
  assert.match(moduleText, /\[MITM\]/);
  assert.match(moduleText, /%APPEND% wap\.gd\.10086\.cn/);
  assert.match(moduleText, /receiver_url:https:\/\/hynmac-mini\.taila66285\.ts\.net\/cmcc-ecop/);
  assert.match(moduleText, /script-arguments="receiver_url=\{\{\{receiver_url\}\}\}"/);
  assert.doesNotMatch(moduleText, /receiver_url=%receiver_url/);
});

test('module pins the script with a cache-busting version', () => {
  const matches = moduleText.match(/CMCCEcopCapture\.js\?v=(\d+)/g) || [];
  assert.ok(matches.length >= 1, 'script-path 必须带 ?v= 版本号');
  const versions = new Set(matches.map((m) => m.split('=')[1]));
  assert.equal(versions.size, 1, '两条规则必须同版本');
  assert.ok(Number([...versions][0]) >= 1);
});

test('script never hardcodes credentials — cookie only read at runtime', () => {
  // 不该出现任何长 base64/hex 密文常量
  assert.doesNotMatch(scriptText, /[A-Za-z0-9+/]{60,}={0,2}/);
  assert.match(scriptText, /DEFAULT_RECEIVER_URL = 'https:\/\/hynmac-mini\.taila66285\.ts\.net\/cmcc-ecop'/);
});

/** 在 vm 里跑脚本，模拟 Surge 的 $request / $response / $httpClient / $done */
function execute({ url, headers, response, argument }) {
  const captured = { posts: [], done: 0, logs: [] };
  const sandbox = {
    console: { log: (s) => captured.logs.push(String(s)) },
    $argument: argument,
    $request: url === undefined ? undefined : { url, headers: headers || {} },
    $done: () => { captured.done += 1; },
    $httpClient: {
      post: (opts, cb) => {
        captured.posts.push({ url: opts.url, body: opts.body });
        // 立刻回调，避免 setTimeout 兜底先触发
        cb(null, { status: 200 }, JSON.stringify({ ok: true, tail: '6707' }));
      },
    },
    $notification: { post: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  if (response !== undefined) sandbox.$response = response;
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox);
  return captured;
}

const RECEIVER_ARG = 'receiver_url=https%3A%2F%2Fhynmac-mini.taila66285.ts.net%2Fcmcc-ecop';

test('biz-request cookie with token is forwarded to the receiver', () => {
  const r = execute({
    url: 'https://wap.gd.10086.cn/ech/ecop/app/act/bigWheelAct',
    headers: { Cookie: 'token=T0KEN123; JSESSIONID=abc; appId=501144; UC=a&b&c&13800006707; Path=/' },
    argument: RECEIVER_ARG,
  });
  assert.equal(r.posts.length, 1);
  const payload = JSON.parse(r.posts[0].body);
  assert.equal(payload.phase, 'biz-request');
  assert.equal(payload.phone, '13800006707');
  assert.match(payload.ck, /token=T0KEN123/);
  assert.doesNotMatch(payload.ck, /Path=/);
});

test('login-response Set-Cookie is forwarded', () => {
  const r = execute({
    url: 'https://wap.gd.10086.cn/ech/ecop/common/sso/groupAppTokenLogin',
    response: { headers: { 'Set-Cookie': ['token=RSP999; Path=/; Secure', 'JSESSIONID=zzz; Path=/'] } },
    argument: RECEIVER_ARG,
  });
  assert.equal(r.posts.length, 1);
  const payload = JSON.parse(r.posts[0].body);
  assert.equal(payload.phase, 'login-response');
  assert.match(payload.ck, /token=RSP999/);
  assert.match(payload.ck, /JSESSIONID=zzz/);
});

test('cookie without token= is not reported', () => {
  const r = execute({
    url: 'https://wap.gd.10086.cn/ech/ecop/app/act/bigWheelAct',
    headers: { Cookie: 'qwhd_center_router=hua' },
    argument: RECEIVER_ARG,
  });
  assert.equal(r.posts.length, 0);
  assert.equal(r.done, 1);
});

test('unrelated hosts/paths are ignored', () => {
  const r1 = execute({ url: 'https://example.com/ech/ecop/app/act/x', headers: { Cookie: 'token=x' }, argument: RECEIVER_ARG });
  assert.equal(r1.posts.length, 0);
  const r2 = execute({ url: 'https://wap.gd.10086.cn/ech/other/path', headers: { Cookie: 'token=x' }, argument: RECEIVER_ARG });
  assert.equal(r2.posts.length, 0);
});

test('non-tailnet receiver url is rejected', () => {
  const r = execute({
    url: 'https://wap.gd.10086.cn/ech/ecop/app/act/bigWheelAct',
    headers: { Cookie: 'token=x' },
    argument: 'receiver_url=https%3A%2F%2Fevil.example.com%2Fcmcc-ecop',
  });
  assert.equal(r.posts.length, 0);
  assert.equal(r.done, 1);
});

test('missing argument falls back to the built-in default receiver', () => {
  const r = execute({
    url: 'https://wap.gd.10086.cn/ech/ecop/app/act/bigWheelAct',
    headers: { Cookie: 'token=x; UC=a&b&c&13800004663' },
  });
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].url, 'https://hynmac-mini.taila66285.ts.net/cmcc-ecop');
  assert.equal(JSON.parse(r.posts[0].body).phone, '13800004663');
});
