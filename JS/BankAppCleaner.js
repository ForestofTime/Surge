/*
BankAppCleaner Ultimate
银行类 App 通用广告净化脚本
*/

(function(){

const body = $response.body;

if(!body || body[0] !== "{"){
    $done({body});
    return;
}

let obj;

try{
    obj = JSON.parse(body);
}catch{
    $done({body});
    return;
}


/* ========= 白名单模块 ========= */

const KEEP_KEYS = new Set([
"FUNCTIONAL_AREA_AD_INFO",
"NOTICE_AD_INFO",
"WINNOW_V3_MEB_GIFT",
"ICON_NAV",
"COMMON_FUNCTION"
]);


/* ========= 广告关键词 ========= */

const AD_KEYWORDS = [
"AD",
"BANNER",
"PROMO",
"MARKET",
"RECOMMEND",
"POP",
"GUIDE",
"SPLASH",
"LAUNCH"
];


/* ========= 广告字段 ========= */

const AD_FIELDS = [
"AD_ID",
"AD_URL",
"AD_IMG",
"IMG_URL",
"JUMP_URL",
"CLICK_URL",
"BANNER_ID",
"BANNER_URL"
];


/* ========= 广告楼层关键词 ========= */

const FLOOR_BAN_WORDS = [
"推荐",
"广告",
"精选",
"活动",
"本地优惠",
"热门活动",
"为你推荐"
];


/* ========= 判断广告字段 ========= */

function isAdKey(key){

const k = key.toUpperCase();

for(const w of AD_KEYWORDS){
if(k.includes(w)) return true;
}

return false;
}


/* ========= 判断广告对象 ========= */

function isAdObject(obj){

if(!obj || typeof obj !== "object") return false;

const keys = Object.keys(obj);

let hit = 0;

for(const k of keys){

const key = k.toUpperCase();

if(AD_FIELDS.includes(key)){
hit++;
}

}

return hit >= 2;
}


/* ========= 楼层过滤 ========= */

function isAdFloor(obj){

const name = String(
obj?.STOREY_NM ||
obj?.STOREY_TITLE ||
obj?.MODULE_NAME ||
obj?.SECTION_NAME ||
""
);

for(const w of FLOOR_BAN_WORDS){

if(name.includes(w)) return true;

}

return false;
}


/* ========= 深度清理 ========= */

function clean(node){

if(!node) return node;


/* ===== Array ===== */

if(Array.isArray(node)){

const result = [];

for(const item of node){

if(isAdObject(item)) continue;

if(isAdFloor(item)) continue;

const cleaned = clean(item);

if(cleaned !== null){
result.push(cleaned);
}

}

return result;
}


/* ===== Object ===== */

if(typeof node === "object"){

for(const key of Object.keys(node)){

if(KEEP_KEYS.has(key)) continue;

if(isAdKey(key)){
delete node[key];
continue;
}

node[key] = clean(node[key]);

}

return node;
}

return node;
}


/* ========= 主流程 ========= */

clean(obj);

$done({
body: JSON.stringify(obj)
});

})();