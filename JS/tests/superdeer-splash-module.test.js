const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('SuperDeer recovery stops modifying startup data and stops adding MITM',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../../Module/SuperDeer.sgmodule'),'utf8');
 assert.match(text,/#!desc=.*v2/);
 const active=text.split('\n').filter(l=>l.trim()&&!l.startsWith('#')).join('\n');
 assert.equal(active,'');
});
