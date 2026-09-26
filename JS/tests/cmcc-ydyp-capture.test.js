'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(repoRoot, 'Module/CMCCYdypCapture.sgmodule'), 'utf8');
const scriptText = fs.readFileSync(path.join(repoRoot, 'JS/CMCCYdypCapture.js'), 'utf8');

test('module only intercepts ydyp auth-bearing hosts', () => {
  const scriptLines = moduleText.split('\n').filter((line) => line.startsWith('移动云盘-'));
  assert.equal(scriptLines.length, 1);
  for (const line of scriptLines) {
    assert.match(line, /type=http-request/);
    assert.doesNotMatch(line, /type=http-response/);
    assert.ok(line.includes('139' + String.fromCharCode(92) + '.com'), 'pattern must anchor on the 139.com apex');
  }
  // 业务域不用响应阶段：只抓请求头里的票/JWT，不碰响应体
  assert.doesNotMatch(moduleText, /authTokenRefresh/);
});

test('module declares MITM for the ydyp hosts', () => {
  assert.match(moduleText, /\[MITM\]/);
  assert.match(moduleText, /%APPEND% \*\.yun\.139\.com/);
  assert.match(moduleText, /m\.mcloud\.139\.com/);
  assert.match(moduleText, /caiyun\.feixin\.10086\.cn/);
});

test('module pins the script with a cache-busting version', () => {
  const match = moduleText.match(/CMCCYdypCapture\.js\?v=(\d+)/);
  assert.ok(match, 'script-path 必须带 ?v= 版本号');
  assert.ok(Number(match[1]) >= 1);
});

test('script accepts only a tailnet /cmcc-ydyp receiver', () => {
  assert.match(scriptText, /\.ts\.net\/cmcc-ydyp/);
  const code = scriptText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
    .join('\n');
  assert.doesNotMatch(code, /http:\/\//);
});

test('script extracts RCS ticket from authorization or app_auth with the |1|RCS| marker', () => {
  let posted;
  let done = false;
  const inner = `mobile:13812345678:abc|1|RCS|1727100000000|sig`;
  const basic = 'Basic ' + Buffer.from(inner, 'utf8').toString('base64');
  const sandbox = {
    $argument: 'receiver_url=https%3A%2F%2Ffixture.taila66285.ts.net%2Fcmcc-ydyp',
    $request: {
      url: 'https://personal-kd-njs.yun.139.com/hcy/file/list',
      headers: { Authorization: basic },
    },
    $httpClient: {
      post(opts, cb) { posted = opts; cb(null, { status: 202 }, '{}'); },
    },
    console,
    setTimeout,
    atob,
    $done() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { timeout: 1000 });
  assert.ok(posted, '必须上报');
  const payload = JSON.parse(posted.body);
  assert.equal(payload.kind, 'rcs');
  assert.equal(payload.ticket, 'abc|1|RCS|1727100000000|sig');
  assert.equal(payload.phone, '13812345678');
});

test('script extracts jwtToken from the cookie header', () => {
  const posts = [];
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig';
  const sandbox = {
    $argument: 'receiver_url=https%3A%2F%2Ffixture.taila66285.ts.net%2Fcmcc-ydyp',
    $request: {
      url: 'https://m.mcloud.139.com/market/signin/page/infoV3?client=app',
      headers: { Cookie: `jwtToken=${jwt}; userDomainId=abc` },
    },
    $httpClient: {
      post(opts) { posts.push(opts); },
    },
    console,
    setTimeout,
    atob,
    $done() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { timeout: 1000 });
  assert.equal(posts.length, 1);
  const payload = JSON.parse(posts[0].body);
  assert.equal(payload.kind, 'jwt');
  assert.equal(payload.jwt, jwt);
});

test('script posts nothing when neither ticket nor jwt is present', () => {
  let posts = 0;
  const sandbox = {
    $argument: 'receiver_url=https%3A%2F%2Ffixture.taila66285.ts.net%2Fcmcc-ydyp',
    $request: {
      url: 'https://personal-kd-njs.yun.139.com/hcy/file/list',
      headers: {},
    },
    $httpClient: {
      post() { posts += 1; },
    },
    console,
    setTimeout,
    atob,
    $done() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { timeout: 1000 });
  assert.equal(posts, 0);
});
