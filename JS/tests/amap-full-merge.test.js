const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../AmapMerged.js'), 'utf8');
function run(endpoint, input, headers = {}) {
  const calls = [];
  vm.runInNewContext(source, {$request:{url:endpoint.startsWith('http') ? endpoint : 'https://m5.amap.com' + endpoint, headers}, $response:{body:typeof input === 'string' ? input : JSON.stringify(input)}, $done:r=>calls.push(r)}, {timeout:1500});
  assert.equal(calls.length, 1);
  return calls[0].body ? JSON.parse(calls[0].body) : calls[0];
}
test('legacy main-page removes promotional cards and keeps frequent locations', () => {
  const out = run('/ws/faas/amap-navigation/main-page', {data:{cardList:[{dataType:'FrequentLocation',name:'home'},{dataType:'Promotion'}]}, business:1});
  assert.deepEqual(out.data.cardList,[{dataType:'FrequentLocation',name:'home'}]);
  assert.equal(out.business,1);
});
test('legacy nodefaas keeps order card including counts', () => {
  const out = run('/ws/shield/dsp/profile/index/nodefaas', {data:{cardList:[{dataKey:'MyOrderCard',count:4},{dataKey:'promotion'}]}});
  assert.deepEqual(out.data.cardList,[{dataKey:'MyOrderCard',count:4}]);
});
test('notice clears notice list', () => assert.deepEqual(run('/ws/message/notice/list',{data:{noticeList:[1],keep:2}}),{data:{noticeList:[],keep:2}}));
test('pull clears top message and pull3 promotions', () => assert.deepEqual(run('/ws/msgbox/pull',{msgs:[1],pull3:{msgs:[2]},keep:3}),{msgs:[],pull3:{msgs:[]},keep:3}));
test('nearby clears scene but preserves unknown business fields', () => assert.deepEqual(run('/ws/shield/search/nearbyrec_smart',{data:{scene:{ad:1},keep:3}}),{data:{keep:3}}));
test('hotword handles valid empty and future response shape', () => assert.deepEqual(run('/ws/shield/search/new_hotword',{data:{unknown:3}}),{data:{unknown:3}}));
test('updatable applies upstream and native processing once', () => {
  const out = run('/ws/shield/frogserver/aocs/updatable/1',{data:{aiNative:{status:1,value:'ad'},adStatementConfig:{status:1,value:'{}'},ordinary:{status:1,value:'{}'}}});
  assert.equal(out.data.aiNative.value,'');
  assert.equal(out.data.ordinary.value,'{}');
});
test('invalid JSON fails open', () => assert.deepEqual(Object.keys(run('/ws/message/notice/list','not json')),[]));
test('non-target hosts fail open', () => assert.deepEqual(Object.keys(run('https://m5.amap.com.evil.test/ws/message/notice/list',{data:{noticeList:[1]}})),[]));
test('AMDC non-AMap clients pass through', () => assert.deepEqual(Object.keys(run('http://amdc.m.taobao.com/amdc/mobileDispatch','raw',{ 'User-Agent':'Cainiao'})),[]));
test('AMDC AMap runs only one done', () => {
  const calls=[];
  vm.runInNewContext(source,{$request:{url:'http://amdc.m.taobao.com/amdc/mobileDispatch',headers:{'User-Agent':'AMap/16'}},$response:{body:'raw'},$done:r=>calls.push(r)}, {timeout:1500});
  assert.equal(calls.length,1);
  assert.equal(calls[0].body,'ddgksf2013');
});
test('rewritten body does not return stale Content-Length or Content-Encoding', () => {
  const calls=[];
  vm.runInNewContext(source,{$request:{url:'https://m5.amap.com/ws/message/notice/list',headers:{}},$response:{body:JSON.stringify({data:{noticeList:[1]}}),headers:{'Content-Length':'1000','Content-Encoding':'gzip'}},$done:r=>calls.push(r)}, {timeout:1500});
  assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(calls[0].body),{data:{noticeList:[]}});
  assert.equal(calls[0].headers,undefined);
});
