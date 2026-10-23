const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('AMDC reproduces Loon empty 404 for AMap and leaves other clients alone',()=>{
 for(const ua of ['AMapiPhone/17.02','Cainiao/1','Safari']){
 const calls=[];vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../AmapAmdc.js'),'utf8'),{$request:{url:'http://amdc.m.taobao.com/amdc/mobileDispatch?x=1',headers:{'User-Agent':ua}},$done:v=>calls.push(v)});
 assert.equal(calls.length,1);if(ua.startsWith('AMap')){assert.equal(calls[0].response.status,404);assert.equal(calls[0].response.body,'');}else assert.equal(calls[0].response,undefined);
 }
});
test('scene response is field-filtered rather than replaced by a map-local empty object',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../../Module/AmapAds.sgmodule'),'utf8');
 assert.ok(!text.split('\n').some(l=>l.includes('data-type=')&&l.includes('scene')));
 const calls=[];vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../AmapMerged.js'),'utf8'),{$request:{url:'https://m5.amap.com/ws/shield/scene/recommend?ent=2'},$response:{body:JSON.stringify({code:1,data:{toolsRecommend:{data:{default:[{id:102}]}},wordInbox:{fixture:true}}})},$done:v=>calls.push(v)});
 const result=JSON.parse(calls[0].body);assert.equal(result.code,1);assert.deepEqual(result.data.toolsRecommend.data.default,[]);assert.equal(result.data.wordInbox.fixture,true);
});
