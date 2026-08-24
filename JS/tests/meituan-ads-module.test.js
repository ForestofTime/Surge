const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const modulePath = path.join(repoRoot, 'Module/MeituanAds.sgmodule');
const scriptPath = path.join(repoRoot, 'JS/MeituanAds.js');
const hornRequestScriptPath = path.join(repoRoot, 'JS/MeituanHornRequest.js');
const readIfPresent = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const moduleText = readIfPresent(modulePath);
const scriptText = readIfPresent(scriptPath);
const hornRequestScriptText = readIfPresent(hornRequestScriptPath);
const mapLocalText = (moduleText.match(/\[Map Local\]([\s\S]*?)\n\[/) || [])[1] || '';
const abTestLine = mapLocalText.split('\n').find((line) => line.includes('recommend\\/unity\\/abtest')) || '';
const cartRecommendLine = mapLocalText.split('\n').find((line) => line.includes('recommend\\/unity\\/recommends')) || '';
const mineRecommendLine = mapLocalText.split('\n').find((line) => line.includes('lycoris\\/scene\\/personalcenter_2154')) || '';
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

function runRequestScript({ url, body, method = 'POST', headers = {} }) {
  let result;
  vm.runInNewContext(hornRequestScriptText, {
    $request: { url, body, method, headers },
    $done(value) {
      result = value;
    },
    URL,
    Uint8Array,
    console: { log() {} },
  });
  return result;
}

test('publishes a bounded repository-native Meituan module', () => {
  assert.ok(moduleText, 'Module/MeituanAds.sgmodule must exist');
  assert.ok(scriptText, 'JS/MeituanAds.js must exist');
  assert.ok(hornRequestScriptText, 'JS/MeituanHornRequest.js must exist');
  assert.match(moduleText, /^#!name=美团去广告$/m);
  assert.match(moduleText, /^#!desc=.*v8$/m);
  assert.match(moduleText, /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/MeituanAds\.sgmodule$/m);
  assert.ok(moduleText.includes('type=http-request,pattern=^https:\\/\\/h\\.meituan\\.com\\/horn_ios\\/mergeRequest'));
  assert.match(moduleText, /script-path=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/JS\/MeituanHornRequest\.js\?v=8/);
  assert.match(moduleText, /script-path=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/JS\/MeituanAds\.js\?v=8/);
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /美团-推荐平台配置请求[^\n]*binary-body-mode=true/);
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
  assert.match(moduleText, /feedguess\\\.meituan\\\.com\\\/lycoris\\\/scene\\\/personalcenter_2154/);
  assert.doesNotMatch(moduleText, /blk_conf_\\(?:d|d\+|\\d|\\d\+)/);
});

test('does not reject shared business, layout, HTTPDNS, or image delivery', () => {
  assert.doesNotMatch(moduleText, /DOMAIN-SUFFIX,d\.meituan\.net/);
  assert.doesNotMatch(moduleText, /httpdns|httpdnsmultiapi|59\.82\.113\.10|103\.37\.152\./i);
  assert.doesNotMatch(moduleText, /(?:DOMAIN|hostname =).*p\d\.meituan\.net/);
  assert.doesNotMatch(moduleText, /maplocatesdksnapshot|metrics-picture/);
  assert.doesNotMatch(mapLocalText, /gaea\\\.meituan\\\.com\\\/mapi\\\/usercenter/);
  assert.doesNotMatch(moduleText, /horn_ios\\\/mergeRequest[^\n]*data-type=(?:text|json)/);
  assert.doesNotMatch(moduleText, /shark-mt|force-http-engine-hosts|tcp-connection\s*=\s*true/i);
});

test('returns successful empty data only for the two HAR-confirmed recommendation feeds', () => {
  assert.equal(abTestLine, '', 'the unrequested AB endpoint must not be overridden');

  assert.ok(cartRecommendLine, 'shopping-cart recommendations need an immediate local response');
  assert.match(cartRecommendLine, /status-code=200/);
  assert.match(cartRecommendLine, /data="\{\\"status\\":0,\\"data\\":\[\]\}"/);

  assert.ok(mineRecommendLine, 'the personal-center MSC recommendation scene needs an immediate local response');
  assert.match(mineRecommendLine, /status-code=200/);
  assert.match(mineRecommendLine, /data="\{\\"code\\":0,\\"status\\":0,\\"data\\":\[\],\\"homeData\\":\[\],\\"isEnd\\":true,\\"hasMore\\":false,\\"extensionRequestOptions\\":\{\}\}"/);
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

test('requests a fresh recommendation-platform Horn value without changing sibling requests', () => {
  const source = {
    launch_protect: { query: '', etag: 'W/"keep"' },
    recommend_platform_config: { query: 'stale-query', etag: 'W/"stale"' },
    unicode_keep: '美团业务字段保持不变',
  };

  const result = runRequestScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: JSON.stringify(source),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(JSON.stringify(source))),
      'X-Keep': 'keep',
    },
  });
  const output = JSON.parse(result.body);
  assert.deepEqual(output.launch_protect, source.launch_protect);
  assert.equal(output.recommend_platform_config.query, '');
  assert.equal(output.recommend_platform_config.etag, '');
  assert.equal(output.user_config.query, '');
  assert.equal(output.user_config.etag, '');
  assert.equal(output.unicode_keep, source.unicode_keep);
  assert.equal(result.headers['Content-Length'], String(Buffer.byteLength(result.body)));
  assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(result.headers['X-Keep'], 'keep');
});

test('rewrites the real Horn request as UTF-8 bytes in Surge binary body mode', () => {
  const source = {
    launch_protect: { query: '', etag: 'W/"keep"' },
    unicode_keep: '美团请求体',
  };
  const body = new TextEncoder().encode(JSON.stringify(source));
  const result = runRequestScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.byteLength),
    },
  });

  assert.ok(result.body instanceof Uint8Array);
  const output = JSON.parse(new TextDecoder().decode(result.body));
  assert.deepEqual(output.launch_protect, source.launch_protect);
  assert.equal(output.unicode_keep, source.unicode_keep);
  assert.deepEqual(output.recommend_platform_config, { query: '', etag: '' });
  assert.deepEqual(output.user_config, { query: '', etag: '' });
  assert.equal(result.headers['Content-Length'], String(result.body.byteLength));
});

test('blacklists only the HAR-confirmed personal-center scene and its persisted cache via Horn', () => {
  const source = {
    recommend_platform_config: {
      data: {
        customer: {
          enabled: true,
          cacheEnabled: true,
          feedbackEnabled: true,
          showCacheWhenRequestError: true,
          blackList: ['keep-scene'],
          cacheBlackList: ['keep-cache-scene'],
          showCacheWhenRequestErrorWhiteList: ['keep-white-scene'],
        },
        horn: { version: 1341225, keep: true },
      },
      etag: 'W/"keep-etag"',
    },
    unrelated_config: { data: { customer: { enabled: true } } },
  };

  const result = runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);
  const customer = output.recommend_platform_config.data.customer;
  assert.equal(customer.enabled, true);
  assert.equal(customer.cacheEnabled, true);
  assert.equal(customer.feedbackEnabled, true);
  assert.equal(customer.showCacheWhenRequestError, true);
  assert.deepEqual(customer.blackList, ['keep-scene', 'personalcenter_2154']);
  assert.deepEqual(customer.cacheBlackList, ['keep-cache-scene', 'personalcenter_2154']);
  assert.deepEqual(customer.showCacheWhenRequestErrorWhiteList, ['keep-white-scene']);
  assert.deepEqual(output.recommend_platform_config.data.horn, source.recommend_platform_config.data.horn);
  assert.equal(output.recommend_platform_config.etag, 'W/"keep-etag"');
  assert.deepEqual(output.unrelated_config, source.unrelated_config);
});

test('injects a complete scene blacklist when the latest HAR returns an empty Horn object', () => {
  const result = runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: '{}',
  });
  const output = JSON.parse(result.body);
  const target = output.recommend_platform_config;
  assert.ok(target.data.horn, 'the injected Horn value needs a complete cache envelope');
  assert.equal(target.data.customer.enabled, true);
  assert.equal(target.data.customer.cacheEnabled, true);
  assert.deepEqual(target.data.customer.blackList, ['personalcenter_2154']);
  assert.deepEqual(target.data.customer.cacheBlackList, ['personalcenter_2154']);
  assert.equal(output.user_config.data.customer.showRecommendSwitch, false);
  assert.equal(output.user_config.data.customer.forceOpenRecommendSwitch, false);
});

test('turns off the native personal-page recommendation switch and preserves user config siblings', () => {
  const source = {
    user_config: {
      data: {
        customer: {
          showRecommendSwitch: true,
          forceOpenRecommendSwitch: true,
          showClearHistorySwitch: true,
          marketingFullLayerShowInterval: 24,
        },
        horn: { version: 515595 },
      },
      etag: 'W/"keep-user-etag"',
    },
  };
  const result = runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);
  const customer = output.user_config.data.customer;
  assert.equal(customer.showRecommendSwitch, false);
  assert.equal(customer.forceOpenRecommendSwitch, false);
  assert.equal(customer.showClearHistorySwitch, true);
  assert.equal(customer.marketingFullLayerShowInterval, 24);
  assert.deepEqual(output.user_config.data.horn, source.user_config.data.horn);
  assert.equal(output.user_config.etag, 'W/"keep-user-etag"');
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
  assert.match(indexText, /### `JS\/MeituanHornRequest\.js`/);
  assert.match(indexText, /### `JS\/tests\/meituan-ads-module\.test\.js`/);
  assert.match(indexText, /### `Module\/MeituanAds\.sgmodule`/);
});
