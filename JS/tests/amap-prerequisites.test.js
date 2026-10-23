const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const text=fs.readFileSync(path.join(__dirname,'../../Module/AmapAds.sgmodule'),'utf8');
test('shared prerequisite blocks require the observed Amap UA and avoid global IP rejection',()=>{
 const rules=text.split('\n').filter(l=>l.startsWith('AND,'));
 assert.equal(rules.length,2);
 for(const rule of rules)assert.match(rule,/\(USER-AGENT,AMapiPhone\*\)/);
 assert.match(text,/atoken\.m\.taobao\.com/);assert.match(text,/qchannel01\.cn/);
 assert.match(text,/httpdns-api\.aliyuncs\.com/);
 assert.doesNotMatch(text,/^IP-CIDR|^DOMAIN-KEYWORD/m);
 assert.doesNotMatch(rules.join('\n'),/mobileDispatch/);
 assert.match(text,/高德-墨鱼完整补充/);
});
