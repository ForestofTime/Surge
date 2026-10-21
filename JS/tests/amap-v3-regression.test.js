const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const moduleText = fs.readFileSync(path.join(__dirname, '../../Module/AmapAds.sgmodule'), 'utf8');
const regex = pattern => new RegExp(pattern.replace(/^\(\?i\)/, ''), pattern.startsWith('(?i)') ? 'i' : '');
const scripts = moduleText.split('\n').filter(line => line.includes(' = type=http-response,')).map(line => {
  const match = line.match(/pattern=(.*?), script-path=https:\/\/[^ ]+\/JS\/([^/?]+\.js)(?:\?[^,]*)?,/);
  assert.ok(match, `Unrecognized response rule: ${line}`);
  return { pattern: regex(match[1]), file: match[2] };
});
function rewrite(url, input, expectedMatches = 1) {
  const matches = scripts.filter(rule => rule.pattern.test(url));
  assert.equal(matches.length, expectedMatches, `Response rule count for ${url}`);
  if (!matches.length) return input;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', matches[0].file), 'utf8'), {
    $request: { url }, $response: { body: JSON.stringify(input) }, $done: value => calls.push(value),
  }, { filename: path.join(__dirname, '..', matches[0].file) });
  assert.equal(calls.length, 1);
  return calls[0].body === undefined ? input : JSON.parse(calls[0].body);
}

test('v3 marketing operations remove known slots and preserve business siblings', () => {
  const input = { code: 1, data: { commonMaterial: { ad: true }, tipsOperationLocation: [], resourcePlacement: {}, route: { destination: 'fixture' }, unknownBusiness: [1] } };
  const url = 'https://m5.amap.com/ws/shield/search_business/process/marketingOperationStructured';
  for (const suffix of ['', '?fixture=1']) {
    assert.deepEqual(rewrite(url + suffix, input), { code: 1, data: { route: { destination: 'fixture' }, unknownBusiness: [1] } });
  }
});

test('v3 promotion resource removes only known marketing keys on both endpoint variants', () => {
  const names = ['alpha', 'banner', 'bravo', 'bubble', 'charlie', 'icon', 'other', 'popup', 'push', 'tips'];
  const input = { success: true, data: { ...Object.fromEntries(names.map(name => [name, { ad: true }])), businessResource: { value: 7 }, unknown: ['preserved'] } };
  for (const end of ['', '/home']) for (const suffix of ['', '?fixture=1']) {
    assert.deepEqual(rewrite(`https://m5-zb.amap.com/ws/promotion-web/resource${end}${suffix}`, input), { success: true, data: { businessResource: { value: 7 }, unknown: ['preserved'] } });
  }
});

test('v3 profile retains orders and handles numeric string entrance IDs without coercing output', () => {
  const order = { dataKey: 'MyOrderCard', content: { count: 3, orderList: [{ status: 'pending' }] } };
  const entrance = { dataKey: 'MineNewBEntranceCardV4', content: { entranceList_1: [{ id: '7' }, { id: 8 }, { id: '999' }], entranceList_2: [{ id: '32' }, { id: 4 }, { id: 999 }] } };
  const input = { data: { cardList: [order, entrance, { dataKey: 'marketing' }], business: 'keep' } };
  const result = rewrite('https://m5.amap.com/ws/shield/dsp/profile/index/nodefaasv3', input);
  assert.deepEqual(result.data.cardList, [order, { ...entrance, content: { entranceList_1: [{ id: '7' }, { id: 8 }], entranceList_2: [{ id: '32' }, { id: 4 }] } }]);
  assert.equal(result.data.business, 'keep');
});

test('v3 scene tools retain numeric string business IDs', () => {
  const input = { data: { toolsRecommend: { data: { default: [{ id: '102' }, { id: 103 }, { id: '999' }] } }, history: ['keep'] } };
  assert.deepEqual(rewrite('https://m5.amap.com/ws/shield/scene/recommend', input), { data: { toolsRecommend: { data: { default: [{ id: '102' }, { id: 103 }] } }, history: ['keep'] } });
});

test('v3 response rules do not match appended paths or host suffixes', () => {
  const input = { data: { commonMaterial: { untouched: true } } };
  const url = 'https://m5.amap.com/ws/shield/search_business/process/marketingOperationStructured';
  for (const target of [url + '/more?fixture=1', url.replace('m5.amap.com', 'm5.amap.com.evil.example') + '?fixture=1']) assert.deepEqual(rewrite(target, input, 0), input);
});

test('v3 route responses filter only exact numeric advertising dynamic IDs in known containers', () => {
  const entries = [{ dynamic_id_s: 'ads-123', value: 'remove' }, { dynamic_id_s: 'ads-0' }, { dynamic_id_s: 'ads-route', value: 'keep' }, { dynamic_id_s: 'route', event: 'navigation' }, { dynamic_id_s: 'ads-12-extra' }, { voice: true }, null, 5];
  const expected = entries.slice(2);
  const input = { code: 1, data: { tbt: { event: entries, route: { id: 'keep' } }, front_end: { download: entries, voice: { id: 'keep' } }, unknown: { event: entries }, event: entries } };
  for (const endpoint of ['routeInfo', 'routePlan']) for (const suffix of ['', '?fixture=1']) {
    const result = rewrite(`https://m5.amap.com/ws/perception/drive/${endpoint}${suffix}`, input);
    assert.deepEqual(result, { code: 1, data: { tbt: { event: expected, route: { id: 'keep' } }, front_end: { download: expected, voice: { id: 'keep' } }, unknown: { event: entries }, event: entries } });
  }
});

test('v3 route responses preserve malformed containers and reject adjacent endpoints', () => {
  const input = { data: { tbt: { event: { dynamic_id_s: 'ads-123' } }, front_end: { download: null }, voice: 'keep' } };
  for (const endpoint of ['routeInfo', 'routePlan']) {
    const url = `https://m5.amap.com/ws/perception/drive/${endpoint}`;
    assert.deepEqual(rewrite(url, input), input);
    assert.deepEqual(rewrite(url + '/other?x=1', input, 0), input);
    assert.deepEqual(rewrite(url.replace('m5.amap.com', 'm5.amap.com.evil.example') + '?x=1', input, 0), input);
  }
});

test('v3 legacy aos splash is intercepted with exact path and optional query', () => {
  const mapRules = moduleText.split('\n').filter(line => line.includes(' data-type=')).map(line => regex(line.split(' ')[0]));
  const url = 'https://m5.amap.com/ws/aos/alimama/splash_screen';
  for (const suffix of ['', '?fixture=1']) assert.equal(mapRules.filter(rule => rule.test(url + suffix)).length, 1);
  for (const target of [url + '/more?fixture=1', url.replace('m5.amap.com', 'm5.amap.com.evil.example') + '?fixture=1']) assert.equal(mapRules.filter(rule => rule.test(target)).length, 0);
});

test('existing field-only handlers retain siblings with optional query', () => {
  const cases = [
    ['info.amap.com/ws/c3frontend/af-search/search', { data: { modules: { quickLink: { data: { list: [{ badge: { text: 'promo', color: 'keep' } }, null] } } } } }, { data: { modules: { quickLink: { data: { list: [{ badge: { text: '', color: 'keep' } }, null] } } } } }],
    ['m5-zb.amap.com/ws/amap/hitch/passenger/content_info', { data: { lubanData: { banner: {}, order: 1 } } }, { data: { lubanData: { order: 1 } } }],
    ['center.amap.com/ws/amc/server/conv/raise_list', { data: { dataList: [{ categoryId: 0 }, { data: { id: 'M_100007' } }, { data: { id: 'advert' } }] } }, { data: { dataList: [{ categoryId: 0 }, { data: { id: 'M_100007' } }] } }],
    ['info.amap.com/ws/shield/search_business/process/middleLayer/sug', { tip_list: [{ tip: { task_tag: 'common_content_general' } }, { tip: { task_tag: 'sp' } }, { tip: { task_tag: 'ad' } }] }, { tip_list: [{ tip: { task_tag: 'common_content_general' } }, { tip: { task_tag: 'sp' } }] }],
    ['m5.amap.com/ws/smartui/near_recommend', { data: { operation_activity: {}, location: 1 } }, { data: { location: 1 } }],
  ];
  for (const [endpoint, input, expected] of cases) assert.deepEqual(rewrite(`https://${endpoint}`, input), expected);
});

test('page script fails open on invalid bodies, foreign endpoints and missing data', () => {
  const source = fs.readFileSync(path.join(__dirname, '../AmapAds.js'), 'utf8');
  for (const [url, body] of [
    ['https://other.example/path', '{}'], ['http://m5.amap.com/ws/smartui/near_recommend', '{}'],
    ['https://m5.amap.com/ws/smartui/near_recommend', 'invalid'],
    ['https://m5.amap.com/ws/smartui/near_recommend', '[]'],
    ['https://m5.amap.com/ws/smartui/near_recommend', undefined],
    ['https://m5.amap.com/ws/amap/unknown', '{}'],
  ]) {
    const calls = [];
    vm.runInNewContext(source, { $request: { url }, $response: { body }, $done: value => calls.push(value) }, { filename: path.join(__dirname, '../AmapAds.js') });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body, undefined);
  }
});
