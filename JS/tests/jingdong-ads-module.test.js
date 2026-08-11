const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/JingdongAds.sgmodule');
const scriptPath = path.resolve(__dirname, '../JingdongAds.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const harPaths = [
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-11-105350.har',
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-11-093154.har',
];
const harPath = harPaths.find((path) => fs.existsSync(path));
const moduleText = fs.readFileSync(modulePath, 'utf8');
const scriptText = fs.readFileSync(scriptPath, 'utf8');
const readmeText = fs.readFileSync(readmePath, 'utf8');

function sectionLines(text, sectionName) {
  const section = text.match(
    new RegExp('\\[' + sectionName + '\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)')
  );
  assert.ok(section, '[' + sectionName + '] section must exist');
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function runScript(functionId, body, { url, requestBody } = {}) {
  const doneCalls = [];
  vm.runInNewContext(
    scriptText,
    {
      $request: {
        url: url || `https://api.m.jd.com/client.action?client=apple&functionId=${functionId}&t=1`,
        body: requestBody,
      },
      $response: { body: typeof body === 'string' ? body : JSON.stringify(body) },
      $done: (value) => doneCalls.push(value),
    },
    { filename: scriptPath }
  );
  assert.equal(doneCalls.length, 1, 'script must call $done exactly once');
  return doneCalls[0];
}

function runJson(functionId, body) {
  const result = runScript(functionId, body);
  return result.body ? JSON.parse(result.body) : body;
}

function runPostJson(functionId, body) {
  const result = runScript(functionId, body, {
    url: 'https://api.m.jd.com/client.action?',
    requestBody: `client=2&functionId=${functionId}&t=1`,
  });
  return result.body ? JSON.parse(result.body) : body;
}

test('uses local native Surge script and avoids the unavailable remote script hosts', () => {
  assert.match(moduleText, /^#!name=京东去广告$/m);
  assert.match(moduleText, /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/JingdongAds\.sgmodule$/m);
  assert.match(moduleText, /^京东-广告响应净化 = type=http-response,/m);
  assert.match(moduleText, /\/JS\/JingdongAds\.js\?v=5/);
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /max-size=2097152/);
  assert.doesNotMatch(moduleText, /(?:rucu6\.pages\.dev|kelee\.one)/);
  assert.doesNotMatch(moduleText, /PROTOCOL TCP|REJECT-NO-DROP/);
  assert.deepEqual(sectionLines(moduleText, 'MITM'), ['hostname = %APPEND% api.m.jd.com, m.360buyimg.com']);
});

test('uses the HAR-confirmed full-screen canvas path as a launch-material fallback', () => {
  const mapRules = sectionLines(moduleText, 'Map Local');
  assert.equal(mapRules.length, 1);
  assert.equal(
    mapRules[0],
    '^https?:\\/\\/m\\.360buyimg\\.com\\/mobilecms\\/s1125x2436_jfs(?:\\/|$) data-type=text data=" " status-code=200'
  );
});

test('handles functionId in the request body and returns valid JSON for independent recommendation endpoints', () => {
  for (const functionId of [
    'cartCouponRecommendGoods',
    'recommendShop',
    'searchBoxWord',
    'stationPullService',
    'uniformRecommend',
    'uniformRecommend0',
    'uniformRecommend6',
  ]) {
    assert.deepEqual(runPostJson(functionId, { data: { ad: true } }), {});
  }
});

test('disables only known HTTPDNS and socket-ahead configuration fields', () => {
  const input = {
    data: {
      JDMessage: {
        socketmonitor: { isSocketEstablishedAhead: 1, isSocketReport: 1, keep: true },
      },
      JDHttpToolKit: { httpdns: { httpdns: 1, endpoint: 'keep' } },
      JDAdsCore: { adDegradationConfig: { degraded: '0', keep: true } },
      JDUniformRecommend: {
        JDUniformRecommendmMyJdCache: { JDUniformRecommendmMyJdCache: '1' },
        uniformRecommendCache: { uniformRecommendCache: '1' },
      },
      JDFinderCache: {
        productRecommendXJ: { enable: '1' },
        personCenterDrawerXJ: { enable: '1' },
      },
      other: { keep: true },
    },
  };
  const output = runPostJson('basicConfig', input);
  assert.equal(output.data.JDMessage.socketmonitor.isSocketEstablishedAhead, 0);
  assert.equal(output.data.JDMessage.socketmonitor.isSocketReport, 0);
  assert.equal(output.data.JDMessage.socketmonitor.keep, true);
  assert.equal(output.data.JDHttpToolKit.httpdns.httpdns, 0);
  assert.equal(output.data.JDHttpToolKit.httpdns.endpoint, 'keep');
  assert.equal(output.data.JDAdsCore.adDegradationConfig.degraded, '1');
  assert.equal(output.data.JDAdsCore.adDegradationConfig.keep, true);
  assert.equal(output.data.JDUniformRecommend.JDUniformRecommendmMyJdCache.JDUniformRecommendmMyJdCache, '0');
  assert.equal(output.data.JDUniformRecommend.uniformRecommendCache.uniformRecommendCache, '0');
  assert.equal(output.data.JDFinderCache.productRecommendXJ.enable, '0');
  assert.equal(output.data.JDFinderCache.personCenterDrawerXJ.enable, '0');
  assert.deepEqual(output.data.other, { keep: true });
});

test('removes delivery, order and service-center promotions without removing order data', () => {
  const delivery = runJson('deliverLayer', {
    bannerInfo: { ad: true },
    floors: [{ mId: 'banner' }, { mId: 'jdDeliveryBanner' }, { mId: 'trace', packageNo: 'JD1' }],
  });
  assert.equal(Object.hasOwn(delivery, 'bannerInfo'), false);
  assert.deepEqual(delivery.floors, [{ mId: 'trace', packageNo: 'JD1' }]);

  const orders = runJson('myOrderInfo', {
    floors: [
      { mId: 'bannerFloor' },
      {
        mId: 'virtualServiceCenter',
        data: { virtualServiceCenters: [{ serviceList: [{ serviceTitle: '精选特惠' }, { serviceTitle: '物流服务' }] }] },
      },
      { mId: 'customerServiceFloor', data: { moreText: '更多服务', moreIcon: 'ad', moreIcon_dark: 'ad-dark' } },
      { mId: 'orders', data: { count: 2 } },
    ],
  });
  assert.deepEqual(orders.floors.map((floor) => floor.mId), ['virtualServiceCenter', 'customerServiceFloor', 'orders']);
  assert.deepEqual(orders.floors[0].data.virtualServiceCenters[0].serviceList, [{ serviceTitle: '物流服务' }]);
  assert.deepEqual(orders.floors[1].data, { moreText: ' ' });
  assert.equal(orders.floors[2].data.count, 2);
});

test('removes only confirmed cart recommendation fields and preserves real cart products', () => {
  const cart = runPostJson('cart', {
    cartLocationMap: {
      loc_emptyCartFloor2: { floorType: 'recommend' },
      loc_summary: { price: 188 },
    },
    emptyCartRecommendFloor: { items: [{ sku: 'ad' }] },
    vendors: [{ vendorId: 'v1', products: [{ skuId: '10001', name: '真实商品' }] }],
    couponInfo: { count: 1 },
  });
  assert.deepEqual(cart, {
    cartLocationMap: { loc_summary: { price: 188 } },
    vendors: [{ vendorId: 'v1', products: [{ skuId: '10001', name: '真实商品' }] }],
    couponInfo: { count: 1 },
  });
});

test('cleans only known profile and cart advertisement structures when newer endpoints are renamed', () => {
  const output = runPostJson('personCenterV9', {
    data: {
      floors: [
        { mId: 'recommendfloor', data: { products: [{ sku: 'ad' }] } },
        { mId: 'newWalletIdFloor', data: { balance: 1 } },
      ],
      cartLocationMap: { loc_emptyCartFloor2: { floorType: 'recommend' }, loc_summary: { price: 88 } },
      emptyCartRecommendFloor: { products: [{ sku: 'ad' }] },
      vendors: [{ vendorId: 'v1', products: [{ skuId: '10001' }] }],
    },
  });
  assert.deepEqual(output, {
    data: {
      floors: [{ mId: 'newWalletIdFloor', data: { balance: 1 } }],
      cartLocationMap: { loc_summary: { price: 88 } },
      vendors: [{ vendorId: 'v1', products: [{ skuId: '10001' }] }],
    },
  });
});

test('cleans known profile promotions in both response layouts and keeps wallet/order tools', () => {
  const output = runJson('personinfoBusiness', {
    floors: [
      { mId: 'bigSaleFloor' },
      { mId: 'basefloorinfo', data: { commonPopup: {}, commonTips: ['续费'], floatLayer: {} } },
      { mId: 'orderIdFloor', data: { commentRemindInfo: { infos: [{ id: 1 }] } } },
      { mId: 'userinfo', data: { newPlusBlackCard: {}, wallet: { balance: 1 } } },
      { mId: 'newWalletIdFloor', data: { balance: 1 } },
    ],
    others: {
      floors: [
        { mId: 'newsFloor' },
        { mId: 'basefloorinfo', data: { commonWindows: [{ id: 1 }] } },
        { mId: 'orderIdFloor', data: { commentRemindInfo: { infos: [] } } },
      ],
    },
  });
  assert.deepEqual(output.floors.map((floor) => floor.mId), ['basefloorinfo', 'orderIdFloor', 'userinfo', 'newWalletIdFloor']);
  assert.deepEqual(output.floors[0].data, { commonTips: [] });
  assert.deepEqual(output.floors[1].data.commentRemindInfo.infos, []);
  assert.deepEqual(output.floors[2].data, { wallet: { balance: 1 } });
  assert.deepEqual(output.others.floors.map((floor) => floor.mId), ['basefloorinfo', 'orderIdFloor']);
  assert.deepEqual(output.others.floors[0].data.commonWindows, []);
});

test('removes source-defined launch and home display layers while preserving business cards', () => {
  const start = runJson('start', { images: [{ ad: true }], showTimesDaily: 3, extra: 'keep' });
  assert.deepEqual(start, { images: [], showTimesDaily: 0, extra: 'keep' });

  const home = runJson('welcomeHome', {
    floorList: [
      { type: 'bottomXview' },
      { type: 'float' },
      { type: 'recommend', goods: [1] },
      { type: 'business', service: '订单' },
    ],
    webViewFloorList: [{ type: 'ad' }],
  });
  assert.deepEqual(home.floorList, [
    { type: 'recommend', goods: [1] },
    { type: 'business', service: '订单' },
  ]);
  assert.deepEqual(home.webViewFloorList, []);
});

test('only suppresses queryPagePopWindow when the response asks to display a popup', () => {
  const normal = runJson('queryPagePopWindow', {
    activityId: 'page-activity',
    channelPoint: { pageId: '1' },
  });
  assert.deepEqual(normal, {
    activityId: 'page-activity',
    channelPoint: { pageId: '1' },
  });

  const popup = runPostJson('queryPagePopWindow', {
    isShow: '1',
    activityId: 'popup-activity',
    channelPoint: { pageId: '1' },
    normalField: 'keep',
  });
  assert.deepEqual(popup, {
    isShow: '1',
    activityId: '',
    channelPoint: [],
    normalField: 'keep',
  });

  const popupArray = runJson('queryPagePopWindow', {
    show: true,
    activityId: 'popup-activity',
    channelPoint: [{ pageId: '1' }],
  });
  assert.deepEqual(popupArray, {
    show: true,
    activityId: '',
    channelPoint: [],
  });
});

test('passes malformed, unknown and already-clean responses through unchanged', () => {
  assert.equal(JSON.stringify(runScript('unknownApi', { data: { keep: true } })), '{}');
  assert.equal(JSON.stringify(runScript('basicConfig', '{invalid-json')), '{}');
  assert.equal(JSON.stringify(runScript('start', { images: [], showTimesDaily: 0 })), '{}');
});

test('documents the Raw module and one-click Surge import', () => {
  assert.match(readmeText, /Module\/JingdongAds\.sgmodule/);
  assert.match(
    readmeText,
    /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJingdongAds\.sgmodule/
  );
});

test('replays current HAR evidence without reading or asserting request credentials', { skip: !harPath }, () => {
  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const entries = har.log.entries;
  const imageUrls = new Set(entries
    .map((entry) => entry.request && entry.request.url)
    .filter((url) => /^https:\/\/m\.360buyimg\.com\/mobilecms\/s1125x2436_jfs\//.test(url || '')));
  assert.ok(imageUrls.size >= 3, 'HAR must contain the observed three full-screen launch materials');

  const basicConfig = entries.find((entry) => /[?&]functionId=basicConfig(?:&|$)/.test(entry.request && entry.request.url || ''));
  assert.ok(basicConfig && basicConfig.response && basicConfig.response.content && basicConfig.response.content.text);
  const basicResult = runScript('basicConfig', basicConfig.response.content.text, {
    url: basicConfig.request.url,
  });
  const basicOutput = basicResult.body ? JSON.parse(basicResult.body) : JSON.parse(basicConfig.response.content.text);
  assert.equal(basicOutput.data.JDMessage.socketmonitor.isSocketEstablishedAhead, 0);
  assert.equal(basicOutput.data.JDMessage.socketmonitor.isSocketReport, 0);
  assert.equal(basicOutput.data.JDHttpToolKit.httpdns.httpdns, 0);
  assert.equal(basicOutput.data.JDAdsCore.adDegradationConfig.degraded, '1');
  assert.equal(basicOutput.data.JDUniformRecommend.JDUniformRecommendmMyJdCache.JDUniformRecommendmMyJdCache, '0');
  assert.equal(basicOutput.data.JDUniformRecommend.uniformRecommendCache.uniformRecommendCache, '0');
  assert.equal(basicOutput.data.JDFinderCache.productRecommendXJ.enable, '0');
  assert.equal(basicOutput.data.JDFinderCache.personCenterDrawerXJ.enable, '0');

  const popup = entries.find((entry) => /[?&]functionId=queryPagePopWindow(?:&|$)/.test(entry.request && entry.request.url || '') && entry.response && entry.response.content && entry.response.content.text);
  if (popup) {
    assert.equal(JSON.stringify(runScript('queryPagePopWindow', popup.response.content.text, { url: popup.request.url })), '{}');
  }
});
