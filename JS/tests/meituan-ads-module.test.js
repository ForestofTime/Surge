const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const modulePath = path.join(repoRoot, 'Module/MeituanAds.sgmodule');
const scriptPath = path.join(repoRoot, 'JS/MeituanAds.js');
const readIfPresent = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const moduleText = readIfPresent(modulePath);
const scriptText = readIfPresent(scriptPath);
const readmeText = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const indexText = fs.readFileSync(path.join(repoRoot, 'docs/repo-file-index.md'), 'utf8');

function runScript({ url, body }) {
  let result;
  vm.runInNewContext(scriptText, {
    $request: { url },
    $response: { body },
    $done(value) {
      result = value;
    },
    URL,
    console: { log() {} },
  });
  return result;
}

test('publishes a bounded repository-native Meituan module', () => {
  assert.ok(moduleText, 'Module/MeituanAds.sgmodule must exist');
  assert.ok(scriptText, 'JS/MeituanAds.js must exist');
  assert.match(moduleText, /^#!name=美团去广告$/m);
  assert.match(moduleText, /^#!desc=.*v2$/m);
  assert.match(moduleText, /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/MeituanAds\.sgmodule$/m);
  assert.match(moduleText, /script-path=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/JS\/MeituanAds\.js\?v=2/);
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /max-size=1048576/);
  assert.doesNotMatch(moduleText, /script\.hub|script-path=.*(?:MeChenCC|fmz200|blackmatrix7|zirawell)/i);
});

test('keeps only precise ad resources and current response filtering', () => {
  assert.match(moduleText, /wmapi\\\.meituan\\\.com.*loadInfo\|openscreen\|startpicture/);
  assert.match(moduleText, /img\\\.meituan\\\.net\\\/bizad\\\/bizad_brandCpt_/);
  assert.match(moduleText, /img\\\.meituan\\\.net\\\/goodsawardpic\\\//);
  assert.match(moduleText, /blk_conf_73\\\.json/);
  assert.match(moduleText, /apimobile\\\.meituan\\\.com\\\/group\\\/v4\\\/recommend\\\/home\\\/startPageChannel/);
  assert.match(moduleText, /h\\\.meituan\\\.com\\\/horn_ios\\\/mergeRequest/);
  assert.match(moduleText, /gaea\\\.meituan\\\.com\\\/mapi\\\/usercenter/);
  assert.match(moduleText, /apimobile\\\.meituan\\\.com\\\/group\\\/v1\\\/recommend\\\/unity\\\/recommends/);
  assert.doesNotMatch(moduleText, /blk_conf_\\(?:d|d\+|\\d|\\d\+)/);
});

test('does not reject shared business, layout, HTTPDNS, or image delivery', () => {
  assert.doesNotMatch(moduleText, /DOMAIN-SUFFIX,d\.meituan\.net/);
  assert.doesNotMatch(moduleText, /httpdns|httpdnsmultiapi|59\.82\.113\.10|103\.37\.152\./i);
  assert.doesNotMatch(moduleText, /(?:DOMAIN|hostname =).*p\d\.meituan\.net/);
  assert.doesNotMatch(moduleText, /maplocatesdksnapshot|metrics-picture/);
  assert.doesNotMatch(moduleText, /(?:DOMAIN|hostname =).*p\d\.meituan\.net/);
  assert.doesNotMatch(moduleText, /\[Map Local\][\s\S]*gaea\\\.meituan\\\.com\\\/mapi\\\/usercenter/);
  assert.doesNotMatch(moduleText, /\[Map Local\][\s\S]*group\\\/v1\\\/recommend\\\/unity\\\/recommends/);
  assert.doesNotMatch(moduleText, /horn_ios\\\/mergeRequest[^\n]*data-type=(?:text|json)/);
});

test('disables only the two advertising push switches found in the latest HAR', () => {
  const source = {
    launch_protect: { enabled: true },
    pikeConfig: {
      data: {
        customer: {
          sharkpush_marketing_dsp_pop: true,
          sharkpush_meishi_float_picasso: true,
          sharkpush_order_used_alert: true,
          transport_config: { retry: 3 },
        },
        keep: 'pike-data',
      },
      keep: 'pike',
    },
    traceId: 'keep',
  };

  const result = runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest?app=group',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);
  const customer = output.pikeConfig.data.customer;
  assert.equal(customer.sharkpush_marketing_dsp_pop, false);
  assert.equal(customer.sharkpush_meishi_float_picasso, false);
  assert.equal(customer.sharkpush_order_used_alert, true);
  assert.deepEqual(customer.transport_config, source.pikeConfig.data.customer.transport_config);
  assert.equal(output.launch_protect.enabled, true);
  assert.equal(output.pikeConfig.data.keep, 'pike-data');
  assert.equal(output.pikeConfig.keep, 'pike');
  assert.equal(output.traceId, 'keep');
});

test('removes only the personal-page cross recommendation area', () => {
  const source = {
    code: 0,
    msg: 'success',
    data: {
      areas: [
        { areaName: 'account', areaData: { account: { name: 'keep' } } },
        { areaName: 'order', areaData: { order: { orderStatusList: [{ id: 1 }] } } },
        { areaName: 'mine_cross_recommend', areaData: { feed: true }, bidClick: 'ad' },
        { areaName: 'mine_cross_recommend', areaData: { keep: true } },
        { areaName: 'new_mine_tool_v4', areaData: { newTools: [{ id: 2 }] } },
      ],
      keep: 'mine-data',
    },
    traceId: 'keep',
  };

  const result = runScript({
    url: 'http://gaea.meituan.com/mapi/usercenter?requestType=prefetch',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);
  assert.equal(output.data.areas.length, 4);
  assert.equal(output.data.areas.some((area) => (
    area.areaName === 'mine_cross_recommend' &&
    Object.prototype.hasOwnProperty.call(area.areaData, 'feed')
  )), false);
  assert.deepEqual(output.data.areas, [
    source.data.areas[0],
    source.data.areas[1],
    source.data.areas[3],
    source.data.areas[4],
  ]);
  assert.equal(output.data.keep, 'mine-data');
  assert.equal(output.traceId, 'keep');
});

test('clears only the shopping-cart recommendation array', () => {
  const source = {
    status: 0,
    data: [{ id: 'ad-1' }, { id: 'ad-2' }],
    titlePosition: 0,
    valLab: { scene: 'shoppingcart' },
    bottom: false,
    tabHidden: false,
    isShopping: 'true',
    business: { keep: true },
  };

  const result = runScript({
    url: 'https://apimobile.meituan.com/group/v1/recommend/unity/recommends?scene=shoppingcart',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);
  assert.deepEqual(output.data, []);
  assert.equal(output.status, 0);
  assert.equal(output.titlePosition, 0);
  assert.deepEqual(output.valLab, source.valLab);
  assert.equal(output.bottom, false);
  assert.equal(output.tabHidden, false);
  assert.equal(output.isShopping, 'true');
  assert.deepEqual(output.business, source.business);
});

test('passes unrelated, missing-field, and malformed responses through', () => {
  assert.equal(JSON.stringify(runScript({
    url: 'https://h.meituan.com/api/app-aggregation/request',
    body: JSON.stringify({ data: { keep: true } }),
  })), '{}');
  assert.equal(JSON.stringify(runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: JSON.stringify({ pikeConfig: { data: { customer: { keep: true } } } }),
  })), '{}');
  assert.equal(JSON.stringify(runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: '{invalid-json',
  })), '{}');
  assert.equal(JSON.stringify(runScript({
    url: 'http://gaea.meituan.com/mapi/usercenter',
    body: JSON.stringify({ data: { areas: [{ areaName: 'mine_cross_recommend', areaData: { keep: true } }] } }),
  })), '{}');
  assert.equal(JSON.stringify(runScript({
    url: 'https://apimobile.meituan.com/group/v1/recommend/unity/recommends',
    body: JSON.stringify({ status: 0, data: [], keep: true }),
  })), '{}');
});

test('indexes the published module and its local maintenance files', () => {
  assert.match(readmeText, /Module\/MeituanAds\.sgmodule/);
  assert.match(readmeText, /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FMeituanAds\.sgmodule/);
  assert.match(indexText, /### `JS\/MeituanAds\.js`/);
  assert.match(indexText, /### `JS\/tests\/meituan-ads-module\.test\.js`/);
  assert.match(indexText, /### `Module\/MeituanAds\.sgmodule`/);
});
