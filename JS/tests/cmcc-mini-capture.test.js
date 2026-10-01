'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(repoRoot, 'Module/CMCCMiniCapture.sgmodule'), 'utf8');
const scriptText = fs.readFileSync(path.join(repoRoot, 'JS/CMCCMiniCapture.js'), 'utf8');

test('module only intercepts the two applet wmhsso request endpoints', () => {
  const scriptLines = moduleText.split('\n').filter((line) => line.startsWith('中国移动-'));
  assert.equal(scriptLines.length, 1);
  const line = scriptLines[0];
  assert.match(line, /type=http-request/);
  assert.match(line, /requires-body=false/);
  assert.match(line, /wx\\\.online-cmcc\\\.cn/);
  assert.match(line, /\(?:alipay-applet\|wechat86-applet\)\\/);
  assert.match(line, /\\\/wmhsso/);
  // 只挂 wmhsso 请求头捕获；不碰 login 响应链（那是 CMCCJwtCapture 的领地）。
  assert.doesNotMatch(line, /\\\/login(?:\\|[^/])/);
});

test('module declares MITM for the wmhnewcenter host and upstash arguments', () => {
  assert.match(moduleText, /\[MITM\]/);
  assert.match(moduleText, /%APPEND% wx\.online-cmcc\.cn/);
  assert.match(moduleText, /upstash_url:/);
  assert.match(moduleText, /upstash_token:/);
});

test('module pins the script with a cache-busting version', () => {
  const match = moduleText.match(/CMCCMiniCapture\.js\?v=(\d+)/);
  assert.ok(match, 'script-path 必须带 ?v= 版本号');
  assert.ok(Number(match[1]) >= 1, '至少为 v1');
});

test('script carries the full three-step chain verbatim', () => {
  assert.match(scriptText, /wmhssoDecrypt/);
  assert.match(scriptText, /async function identify\(jwt, end\)/);
  assert.match(scriptText, /for \(let hop = 0; hop < 6/);
  assert.match(scriptText, /user\/info/);
  assert.match(scriptText, /QWHD_SESSION_TOKEN/);
  assert.match(scriptText, /upstashGet|upstashSet/);
  assert.match(scriptText, /dFZrZGFSV1JZMFprVjFWcg==/); // AES 引擎密钥同源
});

test('script disables auto-redirect so the 302 cookie hop is observable', () => {
  assert.match(scriptText, /'auto-redirect': !noRedirect/);
  assert.match(scriptText, /'auto-cookie': false/);
});

test('script strips hand-written Content-Length for Surge framing', () => {
  assert.match(scriptText, /content-length/);
});

test('script argument map takes precedence over persistent storage', () => {
  const argIdx = scriptText.indexOf('function argMap()');
  const loadIdx = scriptText.indexOf('function loadUpstash()');
  assert.ok(argIdx >= 0 && loadIdx > argIdx, 'argMap 必须先定义');
  assert.match(scriptText, /a\['UpStash_URL'\]/);
  assert.match(scriptText, /getVal\(UPSTASH_URL_KEY/); // 兜底源
});

test('script notifies via Surge first and QX fallback', () => {
  assert.match(scriptText, /\$notification\.post\.apply/);
  assert.match(scriptText, /\$notify/);
});

test('script stays dual-platform: keeps QX $task.fetch and $prefs paths', () => {
  assert.match(scriptText, /\$task\.fetch\(o\)/);
  assert.match(scriptText, /\$prefs\.valueForKey\(key\)/);
});

test('script passthrough semantics: bare $done({}) continues the request', () => {
  assert.match(scriptText, /\$done\(\{\}\)/);
});

function loadScript(extraGlobals) {
  const context = {
    console,
    URL,
    setTimeout,
    TextEncoder,
    escape,
    unescape,
    ...extraGlobals,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: 'CMCCMiniCapture.js' });
  return context;
}

test('script runs under a Surge-shaped sandbox and captures the 302 ticket', async () => {
  const store = {};
  const calls = [];
  const b64 = (s) => Buffer.from(s).toString('base64');
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from('1234123412ABCDEF'), Buffer.from('ABCDEF1234123412'));
  const wmhssoBody = JSON.stringify({
    encryptData: b64(b64(Buffer.concat([cipher.update(Buffer.from(JSON.stringify({ token: 'WMTOKEN_TEST' }))), cipher.final()]))),
  });
  const step = (status, headers, body) => (options, callback) => {
    calls.push({ url: options.url, autoRedirect: options['auto-redirect'] });
    callback(null, { status, headers }, body || '');
  };
  const routes = [
    (o) => (o.url.indexOf('upstash') >= 0 && calls.filter((c) => c.url.indexOf('upstash') >= 0).length === 0)
      ? step(200, {}, JSON.stringify({ result: '[]' })) : null, // upstashGet → 空库
    (o) => (o.url.indexOf('/wmhsso') >= 0) ? step(200, {}, wmhssoBody) : null,
    (o) => (o.url.indexOf('/qwhdmark/') >= 0 && !calls.some((c) => c.url.indexOf('/qwhdmark/') >= 0))
      ? step(302, { Location: 'https://wx.10086.cn/qwhdhub/qwhdmark/next' }) : null,
    (o) => (o.url.indexOf('/qwhdmark/') >= 0)
      ? step(302, { 'Set-Cookie': 'QWHD_SESSION_TOKEN=QWHDSSOD20261001T000000000DU1021122301H000000000000; Path=/' }) : null,
    (o) => (o.url.indexOf('user/info') >= 0)
      ? step(200, {}, JSON.stringify({ data: { openid: 'oTEST1', nickName: '13800001111' } })) : null,
    (o) => (o.url.indexOf('upstash') >= 0) ? step(200, {}, JSON.stringify({ result: 'OK' })) : null, // upstashSet
  ];
  const httpClient = {};
  for (const m of ['get', 'post', 'put', 'delete', 'head', 'patch']) {
    httpClient[m] = (options, callback) => {
      for (const route of routes) {
        const handler = route(options);
        if (handler) return handler(options, callback);
      }
      callback('no-route: ' + options.url.slice(0, 60), null, null);
    };
  }

  loadScript({
    $argument: 'UpStash_URL=' + encodeURIComponent('https://example.upstash.io') + '&UpStash_Token=TESTTOKEN',
    $persistentStore: { read: (k) => (k in store ? store[k] : null), write: (v, k) => { store[k] = String(v); return true; } },
    $httpClient: httpClient,
    $notification: { post: () => {} },
    $request: {
      url: 'https://wx.online-cmcc.cn/wmhnewcenter/alipay-applet/wmhsso?redirectSource=SSO_YQS',
      headers: { 'X-ALIPAY-APPLET-JWT': 'JWT_TEST_1234567890' },
    },
  });

  // 等识别链异步收敛（最多 2s）
  for (let i = 0; i < 40 && calls.length < 4; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  // qwhdmark 两跳按 URL 识别（calls 前置有 upstash 读云端与 wmhsso，位置不定）
  const hops = calls.filter((c) => c.url.indexOf('/qwhdmark/') >= 0);
  assert.ok(hops.length >= 2, `qwhdmark 应至少两跳，实际 ${hops.length}`);
  assert.ok(hops.every((c) => c.autoRedirect === false), 'qwhdmark 所有跳必须禁自动跟随');
  const wmhssoCall = calls.find((c) => c.url.indexOf('/wmhsso') >= 0);
  assert.ok(wmhssoCall, '应发出 wmhsso 换 token');
  assert.equal(wmhssoCall.autoRedirect, true, 'wmhsso 允许自动跟随（非票据跳）');
});

test('wmhsso roundtrip decrypts a token from a real AES payload', async () => {
  const b64 = (s) => Buffer.from(s).toString('base64');
  const plain = JSON.stringify({ token: 'ROUNDTRIPTOKEN' });
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from('1234123412ABCDEF'), Buffer.from('ABCDEF1234123412'));
  const enc = b64(b64(Buffer.concat([cipher.update(Buffer.from(plain)), cipher.final()])));

  const context = loadScript({ $persistentStore: { read: () => null, write: () => true } });
  const dec = await vm.runInContext(`wmhssoDecrypt(${JSON.stringify(enc)})`, context);
  assert.equal(dec && dec.token, 'ROUNDTRIPTOKEN');
});
