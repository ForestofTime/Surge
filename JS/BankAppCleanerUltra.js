/*
BankAppCleaner Ultra
金融类App通用广告净化引擎
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


/* ===== 白名单模块 ===== */

const KEEP_KEYS = new Set([
"ACCOUNT",
"USER_INFO",
"BALANCE",
"FUNCTION_LIST",
"ICON_NAV",
"COMMON_FUNCTION",
"NOTICE_AD_INFO"
]);


/* ===== 广告字段关键词 ===== */

const AD_KEYWORDS = [
"AD",
"BANNER",
"PROMO",
"MARKET",
"RECOMMEND",
"POP",
"SPLASH",
"LAUNCH",
"GUIDE",
"FLOAT"
];


/* ===== 广告字段 ===== */

const AD_FIELDS = [
"AD_ID",
"AD_URL",
"AD_IMG",
"IMG_URL",
"JUMP_URL",
"CLICK_URL",
"BANNER_ID",
"BANNER_URL",
"OPEN_URL"
];


/* ===== 营销关键词 ===== */

const MARKETING_WORDS = [
"推荐",
"广告",
"活动",
"福利",
"本地优惠",
"热门",
"为你推荐",
"精选",
"限时"
];


/* ===== URL广告识别 ===== */

function isAdUrl(url){

if(!url) return false;

return /ad|advert|promo|market|banner|recommend/i.test(url);

}


/* ===== 判断广告字段 ===== */

function isAdKey(key){

const k = key.toUpperCase();

for(const w of AD_KEYWORDS){

if(k.includes(w)){
return true;
}

}

return false;

}


/* ===== 判断广告对象 ===== */

function isAdObject(obj){

if(!obj || typeof obj !== "object"){
return false;
}

let score = 0;

for(const k of Object.keys(obj)){

const key = k.toUpperCase();

if(AD_FIELDS.includes(key)){
score++;
}

if(isAdUrl(obj[k])){
score++;
}

}

return score >= 2;

}


/* ===== 楼层识别 ===== */

function isMarketingFloor(obj){

const name = String(
obj?.STOREY_NM ||
obj?.STOREY_TITLE ||
obj?.MODULE_NAME ||
obj?.SECTION_NAME ||
obj?.TITLE ||
""
);

for(const w of MARKETING_WORDS){

if(name.includes(w)){
return true;
}

}

return false;

}


/* ===== 深度清理 ===== */

function clean(node){

if(!node) return node;


/* Array */

if(Array.isArray(node)){

const result = [];

for(const item of node){

if(isAdObject(item)) continue;

if(isMarketingFloor(item)) continue;

const cleaned = clean(item);

if(cleaned !== null){
result.push(cleaned);
}

}

return result;

}


/* Object */

if(typeof node === "object"){

for(const key of Object.keys(node)){

if(KEEP_KEYS.has(key)){
continue;
}

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


/* ===== 执行 ===== */

clean(obj);

$done({
body: JSON.stringify(obj)
});

})();