const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');

const moduleText = fs.readFileSync(path.join(__dirname, '../../Module/AmapAds.sgmodule'), 'utf8');
const scripts = moduleText.split('\n').filter(line => line.includes(' = type=http-response,')).map(line => {
  const match = line.match(/pattern=(.*?), script-path=.*\/JS\/([^/?]+)\.js\?v=7/);
  assert.ok(match);
  return { pattern: match[1], file: match[2] + '.js' };
});
function regex(pattern) {
  return new RegExp(pattern.replace(/^\(\?i\)/, ''), pattern.startsWith('(?i)') ? 'i' : '');
}
function run(expression, input) {
  return JSON.parse(execFileSync('/usr/bin/jq', ['-c', expression], { input: JSON.stringify(input), encoding: 'utf8' }));
}
function rewrite(host, pathname, input) {
  const url = `https://${host}${pathname}?fixture=1`;
  const rules = scripts.filter(rule => regex(rule.pattern).test(url));
  assert.equal(rules.length, 1, `Exactly one response script for ${pathname}`);
  const calls = [];
  // 单元测试原生处理器；合并流水线另见 amap-full-merge.test.js。
  const file=pathname.includes('updatable')?'AmapUpdatable.js':pathname.includes('/poi/detail')?'AmapPoiDetail.js':'AmapAds.js';
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    $request: { url }, $response: { body: JSON.stringify(input) }, $done: value => calls.push(value),
  }, { filename: path.join(__dirname, '..', rules[0].file) });
  assert.equal(calls.length, 1);
  return calls[0].body === undefined ? input : JSON.parse(calls[0].body);
}

test('module uses disjoint native script entries without inline JQ', () => {
  assert.equal(scripts.length, 5);
  assert.doesNotMatch(moduleText, /\[Body Rewrite\]|http-response-jq|jq_file/);
  assert.deepEqual(rewrite('m5.amap.com', '/ws/shield/scene/recommend', {}), {});
  for (const name of ['AmapUpdatable', 'AmapPoiDetail']) {
    const source = fs.readFileSync(path.join(__dirname, '..', name + '.jq'), 'utf8');
    assert.deepEqual(run(source, {}), {});
  }
});

test('profile preserves footprint and explicit order/tool IDs, removes other cards', () => {
  const result = rewrite('m5.amap.com', '/ws/shield/dsp/profile/index/nodefaasv3', {
    status: 1, data: { orders: 8, tipData: {}, wallet: {}, cardList: [
      { dataKey: 'MineNewFootprintCard', content: { history: [1] } },
      { dataKey: 'marketing' },
      { dataKey: 'MineNewBEntranceCardV4', content: {
        entranceList_1: [7, 8, 10, 17, 999].map(id => ({ id })),
        entranceList_2: [32, 4, 9, 16, 14, 999].map(id => ({ id })),
      } },
    ] },
  });
  assert.equal(result.status, 1);
  assert.equal(result.data.orders, 8);
  assert.equal(result.data.wallet, undefined);
  assert.equal(result.data.tipData, undefined);
  assert.deepEqual(result.data.cardList.map(card => card.dataKey), ['MineNewFootprintCard', 'MineNewBEntranceCardV4']);
  assert.deepEqual(result.data.cardList[1].content.entranceList_1.map(item => item.id), [7, 8, 10, 17]);
  assert.deepEqual(result.data.cardList[1].content.entranceList_2.map(item => item.id), [32, 4, 9, 16, 14]);
});

test('scene operations retain default tools whitelist and delete shading words in source order', () => {
  const result = rewrite('m5.amap.com', '/ws/shield/scene/recommend', { data: {
    history: ['retained'], shadingWords: { data: { regions: { content: ['quickLink', 'advert'] }, modules: { searchFind: {}, advert: {} } } },
    toolsRecommend: { data: { default: [102, 103, 106, 151, 999].map(id => ({ id })) } },
  } });
  assert.deepEqual(result.data.history, ['retained']);
  assert.equal(result.data.shadingWords, undefined);
  assert.deepEqual(result.data.toolsRecommend.data.default, []);
});

test('SNS removes numeric/string 547 and tips but preserves unrelated fields and tools', () => {
  const result = rewrite('sns.amap.com', '/ws/opc/tools/list', { data: { category: [{ name: 'tools', tools: [
    { id: 547, tips: 'ad' }, { id: '547' }, { id: 7, tips: 'badge', name: 'keep' }, 'unchanged',
  ] }] } });
  assert.deepEqual(result.data.category, [{ name: 'tools', tools: [{ id: 7, name: 'keep' }, 'unchanged'] }]);
});

test('car tools whitelist preserves business siblings and removes marketing fields only', () => {
  const allowed = ['dache_toolbox_GDIntercity', 'dache_toolbox_hitch', 'dache_toolbox_chauffeur', 'dache_toolbox_quality', 'dache_toolbox_charterCar'];
  const result = rewrite('m5-zb.amap.com', '/ws/boss/car/order/content_info', { data: {
    order: { number: 'fixture-order' }, lubanData: { skin: {}, kingToolBoxBubble: {}, popup: {}, route: 'keep',
      kingToolSort: { sibling: 1, dataList: [{ biz: { kingToolIdList: [...allowed, 'advert'], title: 'keep' } }] },
      kingToolBox: { dataList: [...allowed, 'advert'].map(id => ({ biz: { id, label: 'keep' } })) },
    },
  } });
  assert.deepEqual(result.data.order, { number: 'fixture-order' });
  assert.equal(result.data.lubanData.route, 'keep');
  for (const key of ['skin', 'kingToolBoxBubble', 'popup']) assert.equal(result.data.lubanData[key], undefined);
  assert.deepEqual(result.data.lubanData.kingToolSort.dataList[0].biz.kingToolIdList, allowed);
  assert.equal(result.data.lubanData.kingToolSort.sibling, 1);
  assert.deepEqual(result.data.lubanData.kingToolBox.dataList.map(item => item.biz.id), allowed);
});

test('map-local rules target dedicated endpoints, mixed resources use response scripts', () => {
  const patterns = moduleText.split('\n').filter(line => line.includes(' data-type=')).map(line => {
    const match = line.match(/^(\S+) data-type=/);
    assert.ok(match, `Unrecognized Map Local rule: ${line}`);
    return regex(match[1].replace(/^"|"$/g, ''));
  });
  assert.equal(patterns.length, 8);
  const blocked = [
    ['m5.amap.com', '/ws/faas/amap-navigation/main-page-assets'],
    ['m5.amap.com', '/ws/faas/amap-navigation/main-page-aiqs'],
    ['ai.amap.com', '/v1/ai_rec/home_qs'],
    ['m5.amap.com', '/ws/aos/alimama/splash_screen'],
    ['m5.amap.com', '/ws/info_bff/rankingCard'],
  ];
  for (const [host, pathname] of blocked) assert.ok(patterns.some(rule => rule.test(`https://${host}${pathname}?a=1`)));
  for (const [host, pathname] of [['m5-zb.amap.com', '/ws/promotion-web/resource/home'], ['m5.amap.com', '/ws/shield/search_business/process/marketingOperationStructured']]) {
    assert.ok(!patterns.some(rule => rule.test(`https://${host}${pathname}?a=1`)));
  }
  for (const pathname of ['/ws/navigation/route', '/ws/shield/search/poi/detail', '/ws/boss/car/order/content_info', '/ws/search/keyword']) {
    assert.ok(!patterns.some(rule => rule.test(`https://m5.amap.com${pathname}?a=1`)));
  }
});

test('both JQ sources have separate maintained JS implementations', () => {
  assert.doesNotMatch(moduleText, /https:\/\/kelee\.one\/Resource\/JQLang\//);
  assert.equal(scripts.filter(rule => rule.pattern.includes('updatable')).length, 2);
  assert.equal(scripts.filter(rule => rule.pattern.includes('poi')).length, 1);
});

test('updatable JS removes nested splash and ETC promotions while retaining navigation configuration', () => {
  const data = Object.fromEntries(['his_input_tip', 'detail_config', 'navi_cloud', 'taxi', 'favorites_info', 'container_isolation', 'nore_rec', 'engine_eyrie'].map(key => [key, { value: '{}' }]));
  data.amap_basemap_config = { value: JSON.stringify({ splash: { url: 'ad' }, ai_splash: {}, mapTheme: 'normal' }) };
  data.navi_cloud.value = JSON.stringify({ end_auto_foot_explore: 1, ETCGuide: 'ad', etc_banner: 'ad', navigation: { voice: true } });
  data.taxi.value = JSON.stringify({ denghuo_ad: 'ad', route: { toll: 5 } });
  const result = rewrite('m5.amap.com', '/ws/shield/frogserver/aocs/updatable/1', { code: 1, data });
  assert.deepEqual(JSON.parse(result.data.amap_basemap_config.value), { mapTheme: 'normal' });
  const navigation = JSON.parse(result.data.navi_cloud.value);
  assert.equal(navigation.end_auto_foot_explore, 0);
  assert.equal(navigation.ETCGuide, undefined);
  assert.equal(navigation.etc_banner, undefined);
  assert.deepEqual(navigation.navigation, { voice: true });
  const taxi = JSON.parse(result.data.taxi.value);
  assert.equal(taxi.denghuo_ad, undefined);
  assert.deepEqual(taxi.route, { toll: 5 });
  assert.equal(result.code, 1);
});

test('POI JS keeps booking and review modules and their batch-independent references', () => {
  const result = rewrite('info.amap.com', '/ws/shield/search/poi/detail', { code: 1, data: {
    modules: {
      baseInfo: { data: { name: 'fixture-place', user: { userLocRgeo: 'private', homeInfo: {}, companyInfo: {}, public: true } } },
      poiDetailBottomBar: { data: { navigation: true } },
      combineReviews: { data: { write_comment: { title: 'ad', btnRightTag: {}, normal: true } } },
      hotelRooms: { data: { available: true } },
      CouponBanner: { data: {} },
      anchor: { data: { items: [{ anchor: ['hotelRooms'], title: 'booking' }, { anchor: ['CouponBanner'] }, { anchor: ['scenic_ticket'], title: 'future batch' }] } },
      poiDetailCommonConfig: { data: { swipeUpPanelConfig: { swipeUpPanelTextList: [{ modulesMap: ['hotelRooms'] }, { modulesMap: ['CouponBanner'] }, { modulesMap: ['scenic_ticket'] }] } } },
    },
    regions: { content: ['baseInfo', 'CouponBanner', 'hotelRooms', 'scenic_ticket'] },
    meta: { half_hidden_modules: ['CouponBanner', 'combineReviews', 'scenic_ticket'] },
  } });
  const modules = result.data.modules;
  for (const key of ['baseInfo', 'poiDetailBottomBar', 'combineReviews', 'hotelRooms']) assert.ok(modules[key]);
  assert.equal(modules.CouponBanner, undefined);
  assert.deepEqual(modules.baseInfo.data.user, { public: true });
  assert.deepEqual(modules.combineReviews.data.write_comment, { normal: true });
  assert.deepEqual(result.data.regions.content, ['baseInfo', 'hotelRooms', 'scenic_ticket']);
  assert.deepEqual(result.data.meta.half_hidden_modules, ['combineReviews', 'scenic_ticket']);
  assert.deepEqual(modules.anchor.data.items.map(item => item.anchor), [['hotelRooms'], ['scenic_ticket']]);
  assert.deepEqual(modules.poiDetailCommonConfig.data.swipeUpPanelConfig.swipeUpPanelTextList.map(item => item.modulesMap), [['hotelRooms'], ['scenic_ticket']]);
  assert.equal(result.code, 1);
});
