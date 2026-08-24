const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const baiduModulePath = path.join(repoRoot, 'Module/BaiduNetDisk.sgmodule');
const baiduScriptPath = path.join(repoRoot, 'JS/BaiduNetDiskAds.js');
const caocaoModulePath = path.join(repoRoot, 'Module/CaoCaoTravel.sgmodule');

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const baiduModule = readIfPresent(baiduModulePath);
const baiduScript = readIfPresent(baiduScriptPath);
const caocaoModule = readIfPresent(caocaoModulePath);

function runBaiduScript({ url, body }) {
  let result;
  vm.runInNewContext(baiduScript, {
    $request: { url },
    $response: { body },
    $done(value) {
      result = value;
    },
    console: { log() {} },
  });
  return result;
}

test('publishes a repository-native Baidu Netdisk module without ScriptHub dependencies', () => {
  assert.ok(baiduModule, 'Module/BaiduNetDisk.sgmodule must exist');
  assert.ok(baiduScript, 'JS/BaiduNetDiskAds.js must exist');
  assert.match(baiduModule, /^#!name=百度网盘去广告$/m);
  assert.match(baiduModule, /^#!desc=.*v1$/m);
  assert.match(baiduModule, /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/BaiduNetDisk\.sgmodule$/m);
  assert.doesNotMatch(baiduModule, /script\.hub|ddgksf2013\.top\/scripts/);
  assert.match(baiduModule, /script-path=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/JS\/BaiduNetDiskAds\.js\?v=1/);
  assert.match(baiduModule, /requires-body=true/);
  assert.match(baiduModule, /max-size=1048576/);
  assert.doesNotMatch(baiduModule, /max-size=-1/);
});

test('ports every supplied Baidu endpoint with explicit native response semantics', () => {
  for (const endpoint of [
    '/api/getconfig',
    '/membership/(?:proxy\\/)?guide',
    '/act/v\\d+/(?:bchannel|welfare)/list',
    '/pcs/ad',
    '/act/api/activityentry',
    '/feed/hotlist',
    'zhangyuyidong\\.cn',
    '/api/getsyscfg',
    '/queryintent/queryhint',
    '/coins/center/notice',
    '/recommend/shortseries/list',
    '/membership/user\\?method=gamecenter',
    'afd\\.baidu\\.com/afd/entry',
  ]) {
    assert.match(baiduModule, new RegExp(endpoint), endpoint);
  }
  assert.match(baiduModule, /http-response-jq .*\/api\\\/taskscore\\\/tasklist .*'\.result\.list=\[\]'/);
  assert.match(baiduModule, /hostname = %APPEND% .*pan\.baidu\.com.*afd\.baidu\.com.*zhangyuyidong\.cn/);
});

test('removes only Baidu homepage ad cards and preserves sibling business data', () => {
  const source = {
    errno: 0,
    data: {
      cards: [{ id: 'ad-card' }],
      recommendations: [{ id: 'file-recommendation' }],
      navigation: ['file', 'share'],
    },
    request_id: 'keep',
  };
  const result = runBaiduScript({
    url: 'https://pan.baidu.com/feed/cardinfos?clienttype=1',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);
  assert.deepEqual(output.data.cards, []);
  assert.deepEqual(output.data.recommendations, source.data.recommendations);
  assert.deepEqual(output.data.navigation, source.data.navigation);
  assert.equal(output.request_id, 'keep');
});

test('passes malformed and unrelated Baidu responses through', () => {
  assert.deepEqual(runBaiduScript({
    url: 'https://pan.baidu.com/feed/cardinfos',
    body: '{broken',
  }), {});
  assert.deepEqual(runBaiduScript({
    url: 'https://pan.baidu.com/api/list',
    body: JSON.stringify({ data: { cards: [1] } }),
  }), {});
});

test('publishes a native CaoCao module covering the supplied rule families', () => {
  assert.ok(caocaoModule, 'Module/CaoCaoTravel.sgmodule must exist');
  assert.match(caocaoModule, /^#!name=曹操出行去广告$/m);
  assert.match(caocaoModule, /^#!desc=.*资源更新.*v1$/m);
  assert.match(caocaoModule, /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/CaoCaoTravel\.sgmodule$/m);
  for (const fragment of [
    'advert-bss',
    'queryBpsAggregation',
    'notice-server',
    'ab-gateway',
    'commonMsgBar',
    'queryMessage',
    'indexSuggestAddress',
    'resource-service',
    'hot-patch-service',
    'advert/picture',
    'specialCarTeam',
    'qipao\\.gif',
    'advertFile',
    'cmall-core/home',
    'querySecTipsResource',
  ]) {
    assert.match(caocaoModule, new RegExp(fragment), fragment);
  }
  assert.doesNotMatch(caocaoModule, /\]\(https?:\/\//, 'Markdown links must not leak into Surge rules');
  assert.doesNotMatch(caocaoModule, /script-path|script\.hub/);
  assert.match(caocaoModule, /hostname = %APPEND% .*cap\.caocaokeji\.cn.*notice\.caocaokeji\.cn/);
});

test('uses anchored and deduplicated CaoCao native reject rules', () => {
  const section = caocaoModule.match(/\[URL Rewrite\]([\s\S]*?)(?:\n\[|$)/)?.[1] || '';
  const rules = section.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  assert.ok(rules.length >= 8);
  assert.equal(new Set(rules).size, rules.length);
  for (const rule of rules) {
    assert.match(rule, /^\^https\?:\\\/\\\//);
    assert.match(rule, / - reject$/);
  }
});
