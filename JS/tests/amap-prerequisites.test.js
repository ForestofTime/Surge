const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const text=fs.readFileSync(path.join(__dirname,'../../Module/AmapAds.sgmodule'),'utf8');
test('shared prerequisite blocks require the observed Amap UA and avoid global IP rejection',()=>{
 const rules=text.split('\n').filter(l=>l.startsWith('AND,'));
 assert.equal(rules.length,3);
 for(const rule of rules)assert.match(rule,/\(USER-AGENT,AMapiPhone\*\)/);
 assert.match(text,/atoken\.m\.taobao\.com/);assert.match(text,/qchannel01\.cn/);
 assert.match(text,/httpdns-api\.aliyuncs\.com/);
 assert.doesNotMatch(text,/^IP-CIDR|^DOMAIN-KEYWORD/m);
 const pattern=rules[0].split('URL-REGEX,')[1].slice(0,-')),REJECT'.length);
 const re=new RegExp(pattern);
 assert.ok(re.test('http://amdc.m.taobao.com/amdc/mobileDispatch?v=1'));
 assert.ok(!re.test('http://example.com/amdc/mobileDispatchBusiness'));
});
