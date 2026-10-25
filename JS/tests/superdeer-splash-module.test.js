const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('SuperDeer clears only existing splash arrays and preserves startup siblings',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../../Module/SuperDeer.sgmodule'),'utf8');
 assert.match(text,/#!desc=.*v3/);
 const expr=text.match(/http-response-jq .* '(.*)'/)[1];
 const run=v=>JSON.parse(require('node:child_process').execFileSync('jq',['-c',expr],{input:JSON.stringify(v),encoding:'utf8'}));
 assert.deepEqual(run({code:'1',data:{splashes:[{images:'fixture'}],business:7}}),{code:'1',data:{splashes:[],business:7}});
 for(const v of [{code:'1',data:{}},{code:'1',data:null},{code:'0'},{data:{splashes:{unexpected:1}}}])assert.deepEqual(run(v),v);
 assert.match(text,/hostname = %APPEND% app\.chaolu\.com\.cn/);
});
