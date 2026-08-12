const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/PinduoduoAds.sgmodule');
const scriptPath = path.resolve(__dirname, '../PinduoduoAds.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const moduleText = fs.readFileSync(modulePath, 'utf8');
const scriptText = fs.readFileSync(scriptPath, 'utf8');
const readmeText = fs.readFileSync(readmePath, 'utf8');

function runScript({ url, body, argument = '' }) {
  const doneCalls = [];
  const context = {
    $request: { url },
    $argument: argument,
    $done: (value) => doneCalls.push(JSON.parse(JSON.stringify(value))),
  };
  if (body !== undefined) context.$response = { body };
  vm.runInNewContext(scriptText, context, { filename: scriptPath });
  assert.equal(doneCalls.length, 1, 'script must call $done exactly once');
  return doneCalls[0];
}

function responseBody(result) {
  return JSON.parse(result.body);
}

test('declares a parameterised native Surge module without IP or telemetry blocking', () => {
  assert.match(moduleText, /^#!name=拼多多去广告$/m);
  assert.match(moduleText, /^#!arguments=splash:true,home:true,personal:true,orders:true,search:true,chat:true,fresh:false,detail:false$/m);
  assert.match(moduleText, /^拼多多-广告请求净化 = type=http-request,/m);
  assert.match(moduleText, /^拼多多-广告响应净化 = type=http-response,/m);
  assert.match(moduleText, /requires-body=true,max-size=2097152/);
  assert.match(moduleText, /^hostname = %APPEND% api\.pinduoduo\.com, api\.yangkeduo\.com, mobile\.yangkeduo\.com$/m);
  for (const unsafe of ['121.5.84.85', 'titan.pinduoduo.com', 'sdk.1rtb.net', 'apm.pinduoduo.com']) {
    assert.equal(moduleText.includes(unsafe), false, unsafe + ' must not be blocked without HAR evidence');
  }
});

test('returns QX-equivalent empty JSON only for enabled request categories', () => {
  const splash = runScript({ url: 'https://api.pinduoduo.com/api/cappuccino/splash?x=1' });
  assert.deepEqual(splash, { response: { status: 200, headers: { 'Content-Type': 'application/json' }, body: '{}' } });
  assert.deepEqual(
    runScript({ url: 'https://api.pinduoduo.com/api/caterham/v3/query/personal', argument: 'personal=false' }),
    {}
  );
  assert.deepEqual(
    runScript({ url: 'https://api.pinduoduo.com/api/brand-olay/goods_detail/bybt_guide' }),
    {}
  );
});

test('cleans home layout while preserving non-ad tabs and functional fields', () => {
  const input = {
    result: {
      bottom_tabs: [{ title: '首页' }, { title: '多多视频' }, { title: '个人中心' }],
      icon_set: { icons: [1] },
      search_bar_hot_query: ['热词'],
      dy_module: { irregular_banner_dy: { id: 1 }, stable: true },
      module_order: [{ module_name: 'irregular_banner_dy' }, { module_name: 'goods' }],
      account: { id: 'keep' },
    },
  };
  const output = responseBody(runScript({ url: 'https://api.pinduoduo.com/api/alexa/homepage/hub?x=1', body: JSON.stringify(input) }));
  assert.deepEqual(output.result.bottom_tabs, [{ title: '首页' }, { title: '个人中心' }]);
  assert.equal(output.result.icon_set, undefined);
  assert.equal(output.result.search_bar_hot_query, undefined);
  assert.equal(output.result.dy_module.irregular_banner_dy, undefined);
  assert.equal(output.result.dy_module.stable, true);
  assert.deepEqual(output.result.module_order, [{ module_name: 'goods' }]);
  assert.deepEqual(output.result.account, { id: 'keep' });
});

test('keeps optional fresh content until the fresh parameter is enabled', () => {
  const body = JSON.stringify({ result: { recommend_fresh_info: { id: 1 }, keep: true } });
  assert.deepEqual(runScript({ url: 'https://api.pinduoduo.com/api/alexa/homepage/hub', body }), {});
  const output = responseBody(runScript({ url: 'https://api.pinduoduo.com/api/alexa/homepage/hub', body, argument: 'fresh=true' }));
  assert.equal(output.result.recommend_fresh_info, undefined);
  assert.equal(output.result.keep, true);
});

test('cleans personal and order advertising fields while preserving account and order data', () => {
  const personal = responseBody(runScript({
    url: 'https://api.pinduoduo.com/api/philo/personal/hub?x=1',
    body: JSON.stringify({ result: { monthly_card_entrance: {}, personal_center_style_v2_vo: {}, icon_set: { icons: [1], top_personal_icons: [2], keep: 3 }, user: { id: 1 } } }),
  }));
  assert.equal(personal.result.monthly_card_entrance, undefined);
  assert.equal(personal.result.personal_center_style_v2_vo, undefined);
  assert.equal(personal.result.icon_set.icons, undefined);
  assert.equal(personal.result.icon_set.keep, 3);
  assert.deepEqual(personal.result.user, { id: 1 });

  const order = responseBody(runScript({
    url: 'https://api.pinduoduo.com/order/1-2/shipping?x=1',
    body: JSON.stringify({ shipping: { banner_above_recommend: {}, carrier: 'keep' }, marketing_banner_vo: {}, order_id: 9 }),
  }));
  assert.equal(order.shipping.banner_above_recommend, undefined);
  assert.equal(order.marketing_banner_vo, undefined);
  assert.equal(order.shipping.carrier, 'keep');
  assert.equal(order.order_id, 9);
});

test('passes malformed and unrelated response bodies through', () => {
  assert.deepEqual(runScript({ url: 'https://api.pinduoduo.com/api/alexa/homepage/hub', body: 'not-json' }), {});
  assert.deepEqual(runScript({ url: 'https://api.pinduoduo.com/api/unknown', body: JSON.stringify({ keep: true }) }), {});
});

test('documents the raw module and one-click import', () => {
  assert.match(readmeText, /`Module\/PinduoduoAds\.sgmodule` \| AdBlock \| 拼多多/);
  assert.match(readmeText, /PinduoduoAds\.sgmodule/);
});
