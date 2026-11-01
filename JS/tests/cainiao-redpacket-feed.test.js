const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourcePath = path.resolve(__dirname, '../CainiaoMiniProgram.js');
const modulePath = path.resolve(__dirname, '../../Module/CainiaoMiniProgram.sgmodule');
const host = 'https://guide-acs4miniapp-inner.m.taobao.com/gw/';
const copper = 'mtop.taote.interaction.ifgateway.copper/1.0/';
const feed = 'mtop.tmall.kangaroo.core.service.route.aldlampservicefixedresv2/1.0/';
const reward = { bizCode: 'dailyRedPacket', bizType: 'dailyRedPacket', models: JSON.stringify([{ assetType: 'biz-cainiaoMiniQuery', subType: 'default' }]) };
const goods = { bizId: '20240729', resId: '38684820', pageNum: 0, pageSize: 10 };
function url(api, data) { return host + api + '?type=json&data=' + encodeURIComponent(JSON.stringify(data)); }
function run(urlValue, data, headers = { 'x-appkey': '21380790' }) {
  let calls = [];
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), { $request: { url: urlValue, headers }, $response: { body: JSON.stringify(data) }, $done: value => calls.push(value) }, { filename: sourcePath });
  assert.equal(calls.length, 1); return calls[0].body ? JSON.parse(calls[0].body) : null;
}
test('removes only the Cainiao daily red packet model and retains other models', () => {
  const data = { api: 'mtop.taote.interaction.ifgateway.copper', ret: ['SUCCESS::调用成功'], data: { models: [
    { assetType: 'biz-cainiaoMiniQuery', success: 'true', data: { awardBOList: [{ amount: 2 }], jamAmount: '0' } },
    { assetType: 'otherBusiness', data: { orderCount: 4 } },
  ], sibling: 42 } };
  const out = run(url(copper, reward), data);
  assert.deepEqual(out, { ...data, data: { ...data.data, models: [data.data.models[1]] } });
  assert.equal(run(url(copper, { ...reward, bizCode: 'other' }), data), null);
  assert.equal(run(url(copper, reward), data, { 'x-appkey': 'other' }), null);
  assert.equal(run(url(copper, reward), { data: { models: [{ assetType: 'biz-cainiaoMiniQuery', data: { packageCount: 4 } }] } }), null);
});
test('empties only confirmed feed and marks it exhausted without touching business siblings', () => {
  const data = { api: 'mtop.tmall.kangaroo.core.service.route.aldlampservicefixedresv2', ret: ['SUCCESS::调用成功'], data: { resultValue: {
    '38684820': { bottom: 'false', data: [{ commonChannelFeeds: { name: 'commonChannelFeeds', itemList: [{ itemTitle: 'ad 1' }, { itemTitle: 'ad 2' }] }, globalConfig: { bizScene: 'keep' } }] },
    other: { data: [{ packages: [{ status: 'received' }] }] },
  }, traceId: 'synthetic' } };
  const expected = structuredClone(data); expected.data.resultValue['38684820'].data[0].commonChannelFeeds.itemList = []; expected.data.resultValue['38684820'].bottom = 'true';
  assert.deepEqual(run(url(feed, goods), data), expected);
  assert.equal(run(url(feed, { ...goods, resId: 'other' }), data), null);
  assert.equal(run(url(feed, { ...goods, bizId: 'other' }), data), null);
  assert.equal(run(url(feed, goods), data, {}), null);
  assert.equal(run(url(feed, goods).replace('guide-acs4miniapp-inner.m.taobao.com', 'example.test'), data), null);
});
test('module dispatches both routes with response bodies', () => {
  const module = fs.readFileSync(modulePath, 'utf8');
  const line = module.split('\n').find(s => s.startsWith('菜鸟小程序-红包商品流过滤 ='));
  assert.ok(line); assert.match(line, /requires-body=true/);
  const pattern = new RegExp(line.match(/pattern=(.*?), script-path=/)[1]);
  assert.equal(pattern.test(url(copper, reward)), true); assert.equal(pattern.test(url(feed, goods)), true);
});
