const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '../XimalayaAds.js'), 'utf8');
const moduleText = fs.readFileSync(path.resolve(__dirname, '../../Module/XimalayaAds.sgmodule'), 'utf8');

function run(payload, pathname = '/discovery-feed/v3/mix/ts', host = 'mobile.ximalaya.com') {
  const calls = [];
  vm.runInNewContext(source, {
    $request: { url: `https://${host}${pathname}` },
    $response: { body: typeof payload === 'string' ? payload : JSON.stringify(payload) },
    $done: value => calls.push(value), console: { log() {} },
  }, { timeout: 1000, filename: path.resolve(__dirname, '../XimalayaAds.js') });
  assert.equal(calls.length, 1, '$done called exactly once');
  return calls[0].body === undefined ? null : JSON.parse(calls[0].body);
}

test('feed removes explicit ad cards while retaining normal big cards and coin business', () => {
  const keep = [{ displayClass: 'bigCard', id: 'album' }, { moduleType: 'coin', reward: 5 }, { id: 'plain' }];
  const actual = run({ body: [...keep, { item: { adInfo: { id: 1 } } }, { item: { moduleType: 'mix_ad' } }, { isAd: true }, { isAd: 1 }], code: 0 });
  assert.deepEqual(actual, { body: keep, code: 0 });
});

test('focus keeps ordinary links and removes only explicitly marked ad images', () => {
  const normal = [{ link: 'https://www.ximalaya.com/album/1', id: 1 }, { link: 'iting://coin', isAd: false }];
  assert.deepEqual(run({ focusImages: { data: [...normal, { isAd: true }, { isAd: 1 }], extra: 1 } }, '/discovery-category/v2/category'),
    { focusImages: { data: normal, extra: 1 } });
});

test('home page preserves wallet and coin entries and removes freeListenV2 alone', () => {
  const keep = { serviceModule: { entrances: [{ title: '金币', id: 'coin' }, { title: '钱包', id: 'wallet' }, { id: 'unknown' }] }, business: 1 };
  assert.deepEqual(run({ data: { ...keep, freeListenV2: { banner: 1 } }, ret: 0 }, '/mobile-user/v2/homePage'), { data: keep, ret: 0 });
});

test('focusPic removes explicit ads inside header blocks while retaining coin links', () => {
  const keep = [{ link: 'iting://coin', id: 1 }, { link: 'https://www.ximalaya.com/album/1' }];
  const root = { header: [{ item: { list: [{ data: [...keep, { isAd: true }, { isAd: 1 }] }] } }], business: 1 };
  assert.deepEqual(run(root, '/focus-mobile/focusPic'), { header: [{ item: { list: [{ data: keep }] } }], business: 1 });
});

test('custom categories removes live category only and retains future and coin entries', () => {
  const keep = [{ categoryId: 123, title: '金币' }, { categoryId: 9999, title: '新入口' }];
  assert.deepEqual(run({ customCategoryList: [...keep, { categoryId: 1005 }], defaultTabList: [...keep, { categoryId: 1005 }] }, '/discovery-category/customCategories'), { customCategoryList: keep, defaultTabList: keep });
});

test('all three intended hosts support versioned feed paths', () => {
  for (const host of ['mobile.ximalaya.com', 'mobilehera.ximalaya.com', 'mobwsa.ximalaya.com']) {
    assert.deepEqual(run({ body: [{ isAd: true }, { id: 1 }] }, '/discovery-feed/v9/mix', host), { body: [{ id: 1 }] });
  }
});

test('malformed JSON and unknown scope pass through without modifying business responses', () => {
  assert.equal(run('{bad json'), null);
  for (const host of ['evil.ximalaya.com', 'mobile.ximalaya.com.evil.test']) assert.equal(run({ body: [{ isAd: true }] }, '/discovery-feed/v3/mix', host), null);
  for (const p of ['/coin/v1/home', '/signIn', '/discovery-feed/v3/mixOther', '/mobile-user/v2/homePageOther']) assert.equal(run({ body: [{ isAd: true }] }, p), null);
});

test('splash loading and preload empty creatives and bidding while preserving successful envelope', () => {
  for (const host of ['adse.ximalaya.com', 'adse.wsa.ximalaya.com']) {
    for (const endpoint of ['loading', 'preload', 'screen']) {
      const root = { ret: 0, responseId: 7, data: [{ cover: 'creative' }], bidSlotList: { sdk: ['bid'] }, adTypes: [1], adIds: [7], landingPageResDatas: [{}], dataForVirtualAd: [{}], totalPageCount: 1, currentPage: 1, business: 'keep' };
      assert.deepEqual(run(root, `/ting/${endpoint}/ts-123?q=1`, host), { ...root, data: [], bidSlotList: {}, adTypes: [], adIds: [], landingPageResDatas: [], dataForVirtualAd: [], totalPageCount: 0 });
    }
  }
});

test('splash guards pass through coins rewarded ads errors unknown schema and lookalikes', () => {
  const root = { ret: 0, data: [{ reward: 5 }], slotAds: [{ ads: [{}] }] };
  for (const endpoint of ['/incentive/ting/currentDuration/ts-1', '/incentive/ting/welfare/queryListenTime/ts-1', '/adx/ad?slotId=1', '/adx/adPreInfo', '/ting/loadingOther', '/ting/home/ts-1']) {
    assert.equal(run(root, endpoint, 'adse.ximalaya.com'), null);
  }
  for (const host of ['evil.ximalaya.com', 'adse.ximalaya.com.evil.test']) assert.equal(run(root, '/ting/loading/ts-1', host), null);
  for (const payload of ['{broken', [], { ret: 1, data: [{}] }, { ret: 0, data: { unknown: true } }, { ret: 0, data: null }]) {
    assert.equal(run(payload, '/ting/loading/ts-1', 'adse.ximalaya.com'), null);
  }
});

test('module avoids rejects and shared scheduling or coin routes', () => {
  assert.doesNotMatch(moduleText, /^\[(?:Map Local|URL Rewrite)\]/m);
  const routes=moduleText.split('\n').filter(line=>line.startsWith('DOMAIN,'));
  assert.deepEqual(routes,['DOMAIN,adse.ximalaya.com,DIRECT,extended-matching','DOMAIN,adse.wsa.ximalaya.com,DIRECT,extended-matching']);
  assert.doesNotMatch(moduleText,/,REJECT|DOMAIN-SUFFIX/);
  const scripts = moduleText.split(/\r?\n/).filter(line => /type=http-response/.test(line));
  assert.ok(scripts.length > 0);
  for (const line of scripts) {
    assert.match(line, /requires-body=true/);
    assert.match(line, /max-size=\d+/);
    assert.doesNotMatch(line, /gslb|incentive|coin|signIn|adx/i);
  }
  const mitm = moduleText.match(/^hostname\s*=\s*%APPEND%\s*(.*)$/m);
  assert.ok(mitm);
  assert.deepEqual(mitm[1].split(',').map(x => x.trim()).sort(), ['mobile.ximalaya.com', 'mobilehera.ximalaya.com', 'mobwsa.ximalaya.com', 'adse.ximalaya.com', 'adse.wsa.ximalaya.com'].sort());
});
