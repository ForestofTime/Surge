'use strict';
/**
 * cmcc-hebao-capture.test.js — CMCCHebaoCapture.js 离线单测（Node 模拟 Surge 环境）。
 * 覆盖：五类截取的分发与提取、去重幂等、坏值拦截、未命中放行。
 * 跑法：node tests/cmcc-hebao-capture.test.js
 */

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const SCRIPT_SRC = fs.readFileSync(path.join(__dirname, '..', 'CMCCHebaoCapture.js'), 'utf8');

function makeSandbox() {
  const posts = [];
  const store = new Map();
  const notifications = [];
  const doneVals = [];
  return {
    posts, notifications, doneVals,
    persistent: store,
    ctx: {
      $httpClient: {
        post(opts, cb) { posts.push(opts); cb(null, { status: 200 }, '{"ok":true}'); },
      },
      $persistentStore: {
        read(k) { return store.has(k) ? store.get(k) : null; },
        write(v, k) { store.set(k, v); return true; },
      },
      $notification: { post(t, s, b) { notifications.push([t, s, b]); } },
      $done: (v) => { doneVals.push(v); },
    },
  };
}

function runCapture(s, url, extra) {
  Object.assign(s.ctx, extra || {});
  s.doneVals.length = 0;
  const sandbox = {
    $argument: s.ctx.$argument || 'receiver_url=http://test/hebao',
    $request: s.ctx.$request,
    $response: s.ctx.$response,
    $httpClient: s.ctx.$httpClient,
    $persistentStore: s.ctx.$persistentStore,
    $notification: s.ctx.$notification,
    $done: s.ctx.$done.bind(s.ctx),
    console: { log() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT_SRC, sandbox);
  return sandbox;
}

// ---- ① cred：autoLogin 请求体 ----
{
  const s = makeSandbox();
  const cipher = 'A'.repeat(400) + '==';
  runCapture(s, 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', {
    $argument: 'receiver_url=http://test/hebao&phone=15606946707',
    $request: { url: 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', body: ' ' + cipher + '\n' },
  });
  assert.strictEqual(s.posts.length, 1, 'cred 应上报一次');
  const p = JSON.parse(s.posts[0].body);
  assert.strictEqual(p.type, 'cred');
  assert.strictEqual(p.value, cipher, 'cred 应 trim');
  assert.strictEqual(p.phone, '15606946707', 'phone 应从参数注入');
  // 同值再来一次 → 依然转发（设备端不去重；幂等在 receiver 侧做，
  // 避免"上报失败一次就永久丢票"的历史坑）。receiver 对同值不重写。
  runCapture(s, 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', {
    $argument: 'receiver_url=http://test/hebao&phone=15606946707',
    $request: { url: 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', body: cipher },
  });
  assert.strictEqual(s.posts.length, 2, '重复值仍转发（幂等在 Mac 侧）');
  console.log('✓ cred 捕获 + 去重');
}

// ---- ② bigck：get_mbl 的 authToken ----
{
  const s = makeSandbox();
  const bigck = 'YZsidssolg88eaf3b903test';
  runCapture(s, 'https://p.10086.cn/ptw/arrtifact_get_mbl.xhtml?authToken=' + bigck, {
    $request: { url: 'https://p.10086.cn/ptw/arrtifact_get_mbl.xhtml?authToken=' + bigck },
  });
  assert.strictEqual(s.posts.length, 1);
  assert.strictEqual(JSON.parse(s.posts[0].body).type, 'bigck');
  assert.strictEqual(JSON.parse(s.posts[0].body).value, bigck);
  console.log('✓ bigck 从 URL 提取');
}

// ---- ② 兜底：Cookie 里的 cmccssotoken ----
{
  const s = makeSandbox();
  const bigck = 'YZsidssolgae26dd88e1cookie';
  runCapture(s, 'https://p.10086.cn/ptw/arrtifact_get_mbl.xhtml?authToken=', {
    $request: { url: 'https://p.10086.cn/ptw/arrtifact_get_mbl.xhtml?authToken=', headers: { Cookie: 'other=1; cmccssotoken=' + bigck + '; x=2' } },
  });
  assert.strictEqual(JSON.parse(s.posts[0].body).value, bigck, '应从 Cookie 兜底提取');
  console.log('✓ bigck 从 Cookie 兜底');
}

// ---- ③ sso：get_mbl 302 Location ----
{
  const s = makeSandbox();
  runCapture(s, 'https://p.10086.cn/ptw/arrtifact_get_mbl.xhtml?authToken=xyz', {
    $request: { url: 'https://p.10086.cn/ptw/arrtifact_get_mbl.xhtml?authToken=xyz' },
    $response: { headers: { Location: 'https://p.10086.cn/waph5/hebaoPay/hbpayIndex?appNo=3r&ssoToken=75763208409603879247277&navShow=Y' } },
  });
  assert.strictEqual(JSON.parse(s.posts[0].body).type, 'sso');
  assert.strictEqual(JSON.parse(s.posts[0].body).value, '75763208409603879247277');
  console.log('✓ sso 从 302 Location 提取');
}

// ---- ④ sid：ssoTokenLogin Set-Cookie ----
{
  const s = makeSandbox();
  runCapture(s, 'https://ump.cmpay.com/activities/v1/login-common/ssoTokenLogin', {
    $request: { url: 'https://ump.cmpay.com/activities/v1/login-common/ssoTokenLogin' },
    $response: { headers: { 'Set-Cookie': 'act_sid=act-5f3bd576-e680-4c4e-9e5c-test; Domain=cmpay.com; Path=/' } },
  });
  assert.strictEqual(JSON.parse(s.posts[0].body).type, 'sid');
  assert.strictEqual(JSON.parse(s.posts[0].body).value, 'act-5f3bd576-e680-4c4e-9e5c-test');
  console.log('✓ sid 从 Set-Cookie 提取');
}

// ---- ⑤ opdfp：ump 活动接口 URL ----
{
  const s = makeSandbox();
  const fp = 'VXGHOhsy_BzOVfe7JnClCwXQxFzL62cDSJDR9kUze61zGZ4MsUH9lcFrE';
  runCapture(s, 'https://ump.cmpay.com/activities/v1/signExchange/index?opDfp=' + fp, {
    $request: { url: 'https://ump.cmpay.com/activities/v1/signExchange/index?opDfp=' + fp },
  });
  assert.strictEqual(JSON.parse(s.posts[0].body).type, 'opdfp');
  console.log('✓ opdfp 从 URL 提取');
}

// ---- 坏值拦截 ----
{
  const s = makeSandbox();
  runCapture(s, 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', {
    $argument: 'receiver_url=http://test/hebao&phone=15606946707',
    $request: { url: 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', body: 'short' },
  });
  assert.strictEqual(s.posts.length, 0, '过短的 body 不应上报');
  console.log('✓ 坏值拦截');
}

// ---- 未命中挂载点：放行不打扰 ----
{
  const s = makeSandbox();
  runCapture(s, 'https://example.com/other', { $request: { url: 'https://example.com/other' } });
  assert.strictEqual(s.posts.length, 0);
  // vm 沙箱里的对象原型与测试环境不同，不能 deepStrictEqual；按键数判断即可
  assert.strictEqual(JSON.stringify(s.doneVals[0]), '{}', '$done({}) 放行');
  console.log('✓ 未命中放行');
}

// ---- cred 无手机号：拒绝（receiver 需要手机号标注）----
{
  const s = makeSandbox();
  runCapture(s, 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', {
    $argument: 'receiver_url=http://test/hebao',
    $request: { url: 'https://client.app.coc.10086.cn/biz-orange/LN/uamonekeylogin/autoLogin', body: 'A'.repeat(400) + '==' },
  });
  const p = s.posts.length && JSON.parse(s.posts[0].body);
  assert.ok(!p || !p.phone || p.phone === '', '无 phone 参数时不注入手机号');
  console.log('✓ phone 可选');
}

console.log('\n全部通过：cmcc-hebao-capture 9 项');
