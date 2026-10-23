const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('v4 receives raw TLS and removes profile promotions while retaining orders',()=>{
 const module=fs.readFileSync(path.join(__dirname,'../../Module/AmapAds.sgmodule'),'utf8');
 assert.match(module,/tcp-connection = true/);
 const calls=[];
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../AmapAds.js'),'utf8'),{$request:{url:'https://m5.amap.com/ws/shield/dsp/profile/index/nodefaasv3'},$response:{body:JSON.stringify({data:{memberInfo:{},topMixedCard:{},cardList:[{dataKey:'MyOrderCard',count:3},{dataKey:'MineNewFootprintCard'},{dataKey:'promotion'}],user:{name:'fixture'}}})},$done:r=>calls.push(r)});
 assert.equal(calls.length,1);
 const d=JSON.parse(calls[0].body).data;
 assert.equal(d.memberInfo,undefined);assert.equal(d.topMixedCard,undefined);
 assert.equal(d.cardList[0].count,3);assert.equal(d.cardList.length,2);assert.equal(d.user.name,'fixture');
});
