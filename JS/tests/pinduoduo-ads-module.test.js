const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/PinduoduoAds.sgmodule');
const scriptPath = path.resolve(__dirname, '../PinduoduoAds.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const harPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-12-164910.har';
const moduleText = fs.readFileSync(modulePath, 'utf8');
const scriptText = fs.readFileSync(scriptPath, 'utf8');
const readmeText = fs.readFileSync(readmePath, 'utf8');

function runResponse(url, body) {
  const doneCalls = [];
  vm.runInNewContext(scriptText, {
    $request: { url },
    $response: { body },
    $done: (value) => doneCalls.push(JSON.parse(JSON.stringify(value))),
  }, { filename: scriptPath });
  assert.equal(doneCalls.length, 1, 'script must call $done exactly once');
  return doneCalls[0];
}

function rewrittenBody(url, body) {
  const result = runResponse(url, JSON.stringify(body));
  return JSON.parse(result.body);
}

test('is a standalone native Surge conversion of the QingRex module', () => {
  assert.match(moduleText, /^#!name=拼多多去广告（原生 Surge）$/m);
  assert.match(moduleText, /^拼多多-响应净化 = type=http-response,/m);
  assert.match(moduleText, /\/JS\/PinduoduoAds\.js\?v=3/);
  assert.doesNotMatch(moduleText, /^\[Body Rewrite\]$/m);
  assert.doesNotMatch(moduleText, /http-response-jq/);
  assert.match(moduleText, /^\[Map Local\]$/m);
  assert.match(moduleText, /^hostname = %APPEND% api\.pinduoduo\.com$/m);
});

test('retains QingRex HTTPDNS and domain interception without duplicate rules', () => {
  assert.match(moduleText, /URL-REGEX,"\^http:\\\/\\\//);
  assert.match(moduleText, /USER-AGENT,"\*com\.xunmeng\.pinduoduo\*"/);
  assert.match(moduleText, /DOMAIN,meta\.pinduoduo\.com,REJECT/);
  assert.match(moduleText, /DOMAIN,cdl-1\.pddpic\.com,REJECT/);
  assert.match(moduleText, /PROTOCOL,UDP/);
  assert.equal((moduleText.match(/DOMAIN,titan\.pinduoduo\.com/g) || []).length, 1);
});

test('uses explicit empty JSON Map Local responses for QingRex endpoints and splash', () => {
  for (const endpoint of [
    'api\\/cappuccino\\/splash',
    'api\\/aquarius\\/hungary\\/global\\/homepage',
    'api\\/zaire_biz\\/chat\\/resource\\/get_list_data',
    'api\\/caterham\\/v3\\/query\\/personal',
    'api\\/growth\\/nagato\\/app\\/index\\/gather',
    'api\\/buffon\\/nasus\\/recommend',
  ]) {
    assert.match(moduleText, new RegExp(endpoint + '.*data="\\{\\}" status-code=200'));
  }
});

test('keeps the billion-subsidy column while removing unwanted bottom tabs', () => {
  const body = {
    success: true,
    result: {
      bottom_tabs: [
        { title: '首页', link: 'index.html' },
        { title: '多多视频', link: 'pdd_video.html' },
        { title: '百亿补贴', link: 'brand_activity_subsidy.html?access_from=home' },
        { title: '聊天', link: 'chat_list.html' },
        { title: '个人中心', link: 'personal.html' },
      ],
      buffer_bottom_tabs: [
        { title: '首页', link: 'index.html' },
        { title: '百亿补贴', link: 'brand_activity_subsidy.html' },
        { title: '分类', link: 'classification.html' },
        { title: '聊天', link: 'chat_list.html' },
        { title: '个人中心', link: 'personal.html' },
      ],
      module_order: [
        { module_name: 'irregular_banner_dy' },
        { module_name: 'billion_subsidy_entrance_dy' },
      ],
      dy_module: {
        irregular_banner_dy: { id: 1 },
        billion_subsidy_entrance_dy: { data: { title: '百亿补贴' } },
      },
      icon_set: { icons: [] },
      search_bar_hot_query: ['广告词'],
    },
  };
  const output = rewrittenBody('https://api.pinduoduo.com/api/alexa/homepage/hub?x=1', body);
  assert.deepEqual(output.result.bottom_tabs.map((tab) => tab.title), ['首页', '百亿补贴', '聊天', '个人中心']);
  assert.deepEqual(output.result.buffer_bottom_tabs.map((tab) => tab.title), ['首页', '百亿补贴', '聊天', '个人中心']);
  assert.deepEqual(output.result.module_order, [
    { module_name: 'irregular_banner_dy' },
    { module_name: 'billion_subsidy_entrance_dy' },
  ]);
  assert.equal(output.result.dy_module.irregular_banner_dy, undefined);
  assert.deepEqual(output.result.dy_module.billion_subsidy_entrance_dy, { data: { title: '百亿补贴' } });
  assert.equal(output.result.icon_set, undefined);
  assert.equal(output.result.search_bar_hot_query, undefined);
});

test('implements the remaining QingRex response rewrites and keeps sibling business data', () => {
  const personal = rewrittenBody('https://api.pinduoduo.com/api/philo/personal/hub?x=1', {
    monthly_card_entrance: {},
    personal_center_style_v2_vo: {},
    icon_set: { icons: [1], top_personal_icons: [2], keep: 3 },
    user: { id: 1 },
  });
  assert.equal(personal.monthly_card_entrance, undefined);
  assert.equal(personal.personal_center_style_v2_vo, undefined);
  assert.deepEqual(personal.icon_set, { keep: 3 });
  assert.deepEqual(personal.user, { id: 1 });

  const order = rewrittenBody('https://api.pinduoduo.com/api/aristotle/order_list_v4?x=1', {
    orders: [{ order_buttons: [{ title: '确认收货', order_growth_tip: '推广' }] }],
  });
  assert.deepEqual(order.orders, [{ order_buttons: [{ title: '确认收货' }] }]);
});

test('latest HAR proves the referenced QingRex rules actually ran on Pinduoduo 8.20.0', { skip: !fs.existsSync(harPath) }, () => {
  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const entries = har.log.entries;
  const appUserAgent = entries.flatMap((entry) => entry.request.headers || [])
    .find((header) => String(header.name).toLowerCase() === 'user-agent' && /com\.xunmeng\.pinduoduo/.test(header.value));
  assert.match(appUserAgent.value, /AppVersion\/8\.20\.0/);
  assert.ok(entries.some((entry) => /\/d4\?/.test(entry.request.url) && /拼多多去广告/.test(entry.comment || '')));
  assert.ok(entries.some((entry) => /meta\.pinduoduo\.com/.test(entry.request.url) && /拼多多去广告/.test(entry.comment || '')));
  assert.ok(entries.some((entry) => entry.request.url.includes('/api/caterham/v3/query/personal') && entry.response.content.text === '{}'));
  assert.ok(entries.some((entry) => entry.request.url.includes('/api/zaire_biz/chat/resource/get_list_data') && entry.response.content.text === '{}'));
});

test('passes malformed and unrelated response bodies through once', () => {
  assert.deepEqual(runResponse('https://api.pinduoduo.com/api/alexa/homepage/hub', 'not-json'), {});
  assert.deepEqual(runResponse('https://api.pinduoduo.com/api/unknown', '{"keep":true}'), {});
});

test('documents only the replacement Pinduoduo module path', () => {
  assert.match(readmeText, /`Module\/PinduoduoAds\.sgmodule` \| AdBlock \| 拼多多原生 Surge/);
  assert.equal((readmeText.match(/Module\/PinduoduoAds\.sgmodule/g) || []).length, 1);
});
