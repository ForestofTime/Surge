const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/PinduoduoNative.sgmodule');
const scriptPath = path.resolve(__dirname, '../PinduoduoNative.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const harPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-12-171514.har';
const latestHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-12-180639.har';
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
  assert.match(moduleText, /保留首页百亿补贴卡片。v4/);
  assert.match(moduleText, /^\[Body Rewrite\]$/m);
  assert.ok(moduleText.includes('http-response-jq ^https:\\/\\/api\\.pinduoduo\\.com\\/api\\/alexa\\/homepage\\/hub'));
  assert.ok(moduleText.includes('http-response-jq ^https:\\/\\/api\\.pinduoduo\\.com\\/api\\/alexa\\/cells\\/hub\\/v3'));
  assert.match(moduleText, /^拼多多-响应净化 = type=http-response,/m);
  assert.match(moduleText, /\/JS\/PinduoduoNative\.js\?v=4/);
  assert.match(moduleText, /^\[Map Local\]$/m);
  assert.match(moduleText, /^hostname = %APPEND% api\.pinduoduo\.com$/m);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../../Module/PinduoduoAds.sgmodule')), false);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../PinduoduoAds.js')), false);
});

test('retains HTTPDNS interception and blocks executable component delivery without blocking subsidy config', () => {
  assert.ok(moduleText.includes('URL-REGEX,"^http:\\/\\/'));
  assert.ok(moduleText.includes('USER-AGENT,"*com.xunmeng.pinduoduo*"'));
  assert.match(moduleText, /PROTOCOL,UDP/);
  assert.equal((moduleText.match(/DOMAIN,titan\.pinduoduo\.com/g) || []).length, 1);
  for (const host of [
    'cdl-1.pddpic.com',
    'cdl-p2.pddpic.com',
    'cd-1.pddpic.com',
  ]) {
    assert.ok(moduleText.includes(`DOMAIN,${host},REJECT`), `${host} must stay blocked`);
  }
  assert.equal(moduleText.includes('DOMAIN,meta.pinduoduo.com,REJECT'), false, 'subsidy config must remain reachable');
});

test('latest HAR HTTPDNS v3 endpoint is intercepted before it can bypass named-host rewrites', { skip: !fs.existsSync(latestHarPath) }, () => {
  const har = JSON.parse(fs.readFileSync(latestHarPath, 'utf8'));
  const bypasses = har.log.entries.filter((entry) => {
    if (!/^http:\/\/[^/]+\/v3\/d\?/.test(entry.request.url)) return false;
    return (entry.request.headers || []).some((header) =>
      String(header.name).toLowerCase() === 'user-agent' &&
      /BundleID\/com\.xunmeng\.pinduoduo/.test(String(header.value))
    );
  });
  assert.ok(bypasses.length > 0, 'latest HAR must reproduce the unblocked /v3/d HTTPDNS path');
  assert.ok(bypasses.every((entry) => entry.response.status === 200));
  const rulePattern = moduleText.match(/URL-REGEX,"([^"]*v3\\\/d[^"]*)"/);
  assert.ok(rulePattern, 'the native module must declare the current /v3/d HTTPDNS path');
  const ruleRegex = new RegExp(rulePattern[1]);
  assert.ok(bypasses.every((entry) => ruleRegex.test(entry.request.url)));
  assert.ok(ruleRegex.test('http://101.35.204.35/d4?dn=legacy'));
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
    assert.ok(
      moduleText.includes(endpoint + '(?:\\?|$) data-type=text data="{}" status-code=200'),
      endpoint + ' must return an explicit empty JSON object'
    );
  }
});

test('keeps only the homepage billion-subsidy card and core bottom tabs', () => {
  const body = {
    success: true,
    result: {
      all_top_opts: [
        { tab_id: 1, opt_name: '推荐', link: 'index.html' },
        { tab_id: 4, opt_name: '七夕特惠', link: 'attendance.html' },
        { tab_id: 2, opt_name: '电器' },
      ],
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
        { module_name: 'icon_set' },
        { module_name: 'new_user_zone' },
        { module_name: 'ad_module' },
        { module_name: 'billion_subsidy_entrance' },
        { module_name: 'billion_subsidy_entrance_dy' },
        { module_name: 'billion_subsidy_entrance_lite' },
      ],
      dy_module: {
        irregular_banner_dy: { id: 1 },
        recommend_fresh_info: { id: 2 },
        billion_subsidy_entrance_dy: { data: { title: '百亿补贴' } },
      },
      icon_set: { icons: [] },
      search_bar_hot_query: ['广告词'],
    },
  };
  const output = rewrittenBody('https://api.pinduoduo.com/api/alexa/homepage/hub?x=1', body);
  assert.deepEqual(output.result.all_top_opts, []);
  assert.deepEqual(output.result.bottom_tabs.map((tab) => tab.title), ['首页', '聊天', '个人中心']);
  assert.deepEqual(output.result.buffer_bottom_tabs.map((tab) => tab.title), ['首页', '聊天', '个人中心']);
  assert.deepEqual(output.result.module_order, [
    { module_name: 'billion_subsidy_entrance' },
    { module_name: 'billion_subsidy_entrance_dy' },
    { module_name: 'billion_subsidy_entrance_lite' },
  ]);
  assert.deepEqual(output.result.dy_module, {
    billion_subsidy_entrance_dy: { data: { title: '百亿补贴' } },
  });
  assert.equal(output.result.icon_set, undefined);
  assert.equal(output.result.search_bar_hot_query, undefined);
});

test('replays the working Zenmo HAR and retains the exact billion-subsidy payload only', { skip: !fs.existsSync(harPath) }, () => {
  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const entry = har.log.entries.find((item) =>
    item.request.url.includes('/api/alexa/homepage/hub?') &&
    item.request.url.includes('req_action_type=10')
  );
  assert.ok(entry, 'latest HAR must contain the homepage hub response');
  const before = JSON.parse(entry.response.content.text);
  const expectedCard = before.result.dy_module.billion_subsidy_entrance_dy;
  assert.equal(expectedCard.data.data.title, '官方补贴');

  const after = rewrittenBody(entry.request.url, before);
  assert.deepEqual(after.result.dy_module, {
    billion_subsidy_entrance_dy: expectedCard,
  });
  assert.deepEqual(after.result.module_order.map((item) => item.module_name), [
    'billion_subsidy_entrance',
    'billion_subsidy_entrance_dy',
    'billion_subsidy_entrance_lite',
  ]);
  assert.deepEqual(after.result.all_top_opts, []);
  assert.deepEqual(after.result.bottom_tabs.map((item) => item.link), [
    'index.html',
    'chat_list.html',
    'personal.html',
  ]);
});

test('clears the shared homepage goods feed used below home, chat, and personal pages', () => {
  const output = rewrittenBody('https://api.pinduoduo.com/api/alexa/cells/hub/v3?scene=homegoods_dy_tpl', {
    has_more: true,
    data: {
      goods_list: [{ data: { goods_name: '广告商品' }, type: 0 }],
      intel_req_rules: { keep: true },
    },
    org: 'arec',
  });
  assert.equal(output.has_more, false);
  assert.deepEqual(output.data.goods_list, []);
  assert.deepEqual(output.data.intel_req_rules, { keep: true });
  assert.equal(output.org, 'arec');
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

test('latest HAR proves the working Zenmo rule preserved the homepage subsidy card', { skip: !fs.existsSync(harPath) }, () => {
  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const entries = har.log.entries;
  const appUserAgent = entries.flatMap((entry) => entry.request.headers || [])
    .find((header) => String(header.name).toLowerCase() === 'user-agent' && /com\.xunmeng\.pinduoduo/.test(header.value));
  assert.match(appUserAgent.value, /AppVersion\/8\.20\.0/);
  assert.ok(entries.some((entry) => /\/d4\?/.test(entry.request.url) && /拼多多净化页面布局/.test(entry.comment || '')));
  assert.ok(entries.some((entry) => /meta\.pinduoduo\.com/.test(entry.request.url) && entry.response.status === 200));
  assert.ok(entries.some((entry) => /cdl-1\.pddpic\.com/.test(entry.request.url) && entry.response.status === 200));
  const homepage = entries.find((entry) => entry.request.url.includes('/api/alexa/homepage/hub?'));
  assert.match(homepage.response.content.text, /"billion_subsidy_entrance_dy"/);
  assert.match(homepage.response.content.text, /"title":"官方补贴"/);
});

test('latest v2 HAR proves the module was not applied while the shared goods feed supplied the regression', () => {
  const latestPath =
    '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-12-174620.har';
  if (!fs.existsSync(latestPath)) return;
  const har = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  const homepage = har.log.entries.find((entry) => entry.request.url.includes('/api/alexa/homepage/hub?'));
  const feed = har.log.entries.find((entry) => entry.request.url.includes('/api/alexa/cells/hub/v3?'));
  assert.ok(homepage);
  assert.ok(feed);
  assert.doesNotMatch(homepage.comment || '', /Script found|Response body is modified|Body Rewrite/i);
  assert.match(feed.response.content.text, /"goods_list":\[/);
  assert.ok(JSON.parse(feed.response.content.text).data.goods_list.length > 0);
});

test('passes malformed and unrelated response bodies through once', () => {
  assert.deepEqual(runResponse('https://api.pinduoduo.com/api/alexa/homepage/hub', 'not-json'), {});
  assert.deepEqual(runResponse('https://api.pinduoduo.com/api/unknown', '{"keep":true}'), {});
});

test('documents only the replacement Pinduoduo module path', () => {
  assert.match(readmeText, /`Module\/PinduoduoNative\.sgmodule` \| AdBlock \| 拼多多原生 Surge/);
  assert.equal(readmeText.includes('Module/PinduoduoAds.sgmodule'), false);
});
