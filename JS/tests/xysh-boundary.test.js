const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rules=fs.readFileSync(path.join(__dirname,'../../Module/xysh.sgmodule'),'utf8').split('\n').filter(x=>x.startsWith('^')).map(x=>new RegExp(x.split(' ')[0]));
test('CIB ad rules preserve address and query/foreign-host lookalikes',()=>{
 for(const url of ['https://app.cib.com.cn/api/address','https://app.cib.com.cn/api/addCard','https://app.cib.com.cn/api/advice','https://evil.example/?next=https://app.cib.com.cn/api/ad','https://app.cib.com.cn/api/order?redirect=/ad']) assert.ok(!rules.some(r=>r.test(url)),url);
 for(const name of ['ad','splash','banner','advert','advertisement']) assert.ok(rules.some(r=>r.test('https://app.cib.com.cn/api/'+name+'?v=1')),name);
});
