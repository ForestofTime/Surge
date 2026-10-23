const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../../Module/AmapAds.sgmodule'),'utf8');
const re=x=>new RegExp(x.replace(/^\(\?i\)/,''),'i');
const scripts=s.split('\n').filter(l=>l.includes('type=http-response')).map(l=>re(l.match(/pattern=(.*?), script-path=/)[1]));
const rewrites=s.split('\n').filter(l=>l.startsWith('(?i)')&&(l.includes(' data-type=')||l.includes(' - reject'))).map(l=>re(l.split(' ')[0]));
test('all 18 upstream URL rule families have a native Surge route',()=>{
 const paths=['/ws/aos/alimama/splash_screen_rt','/v1/ai_rec/home_qs','/ws/message/notice/list','/ws/faas/amap-navigation/card-service-route-plan','/ws/shield/frogserver/aocs/updatable/1','/ws/shield/search/nearbyrec_smart','/ws/promotion-web/resource','/ws/boss/order_web/friendly_information','/ws/faas/amap-navigation/main-page','/ws/asa/ads_attribution','/ws/valueadded/alimama/splash_screen','/ws/msgbox/pull','/ws/shield/dsp/profile/index/nodefaas','/ws/shield/search/new_hotword','/ws/shield/scene/recommend','/uploadimg/test.gif','/ws/valueadded/weather'];
 for(const p of paths){const u='https://m5.amap.com'+p+'?fixture=1';assert.ok([...scripts,...rewrites].some(r=>r.test(u)),p);if(!rewrites.some(r=>r.test(u)))assert.equal(scripts.filter(r=>r.test(u)).length,1,p);}
 assert.match(s,/高德-AMDC对齐Loon = type=http-request/);
 assert.match(s,/DOMAIN-SUFFIX,optimus-ads\.amap\.com,DIRECT/);
});
