const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
test('17.02 layout flags are preserved without deleting versions or unrelated experiments',()=>{
const input={code:1,data:{redesign_user:{status:1,version:'fixture-a',value:'{"redesign_user":1,"other":7}'},redesign_ab:{status:1,version:'fixture-b',value:'{"redesign_new":1,"ccard_nofaas":0}'},navigation:{value:'{"keep":true}'}}};
const calls=[];vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../AmapMerged.js'),'utf8'),{$request:{url:'https://m5.amap.com/ws/shield/frogserver/aocs/updatable/1'},$response:{body:JSON.stringify(input)},$done:r=>calls.push(r)});
assert.equal(calls.length,1);const out=JSON.parse(calls[0].body);assert.deepEqual(JSON.parse(out.data.redesign_user.value),{redesign_user:1,other:7});assert.deepEqual(JSON.parse(out.data.redesign_ab.value),{redesign_new:1,ccard_nofaas:0});assert.equal(out.data.redesign_user.version,'fixture-a');assert.deepEqual(out.data.navigation,input.data.navigation);
});
