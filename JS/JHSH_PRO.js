/*
建行生活净化（整合版 + 本地优惠开关）
*/

/* ========= 用户配置 ========= */

/*
true  = 屏蔽本地优惠
false = 保留本地优惠
*/

const BLOCK_LOCAL_BENEFIT = true;


/* ========= 脚本主体 ========= */

(function () {

const body = $response.body || "";

if (!(body.startsWith("{") || body.startsWith("["))) {
return $done({ body });
}

const KEEP_KEYS = new Set([
"FUNCTIONAL_AREA_AD_INFO",
"WINNOW_V3_MEB_GIFT",
"NOTICE_AD_INFO"
]);

const DELETE_EXACT_KEYS = new Set([
"WINNOW_V3_FESTIVAL",
"HPBANNER_AD_INFO_SECOND",
"HPBANNER_AD_INFO",
"HPBANNER_AD_INFO_FIRST",
"HPBANNER_AD_INFO_THIRD",
"TAG_AD_INFO",
"TAG_AD_INFO0",
"TAG_AD_INFO1",
"TAG_AD_INFO2",
"MYSELF_ENTRANCE_AD",
"MEBCT_AD_INFO",
"THROUGH_COLUMN_INFO"
]);

const BAN_STOREY_NAME_PAT = /(种草推荐|小编推荐|分期好生活)/;
const BAN_LOCAL_STOREY_TYPES = new Set(["273",273]);


/* ========= 判断广告字段 ========= */

function shouldDeleteKeyByName(k){

const key = String(k).toUpperCase();

if (key.startsWith("DAY_BEST_")) return true;
if (key.startsWith("HPBANNER")) return true;
if (key.includes("PREFERENCE_AD")) return true;

if (
key.includes("LOCAL_BENEFIT") ||
key.includes("NEARBY_BENEFIT") ||
key.startsWith("LOCAL_") ||
key.startsWith("NEARBY_") ||
key.startsWith("AROUND_")
){
return true;
}

return false;
}


/* ========= 深度删除广告对象 ========= */

function stripAdObjectsDeep(node){

if (!node) return node;

if (Array.isArray(node)){

return node
.map(stripAdObjectsDeep)
.filter(item => {

if (!item || typeof item !== "object") return true;

const keys = Object.keys(item).map(x=>x.toUpperCase());

const looksAd =
keys.includes("AD_URL") ||
keys.includes("AD_IMG") ||
keys.includes("AD_ID") ||
keys.includes("SECOND_AD_TYPE");

return !looksAd;

});

}

if (typeof node === "object"){

const out = {};

for (const [k,v] of Object.entries(node)){
out[k] = stripAdObjectsDeep(v);
}

return out;

}

return node;

}


/* ========= 本地优惠过滤 ========= */

function removeLocalBenefitDeep(node){

if(!BLOCK_LOCAL_BENEFIT) return node;

if(!node) return node;

if(Array.isArray(node)){

return node.filter(it => {

if(!it || typeof it !== "object") return true;

if(BAN_LOCAL_STOREY_TYPES.has(it.STOREY_TYPE)) return false;

const hit =
String(it.STOREY_NM || "").includes("本地优惠") ||
String(it.STOREY_TITLE || "").includes("本地优惠") ||
String(it.AD_NAME || "").includes("本地优惠");

return !hit;

});

}

if(typeof node === "object"){

for(const k of Object.keys(node)){
node[k] = removeLocalBenefitDeep(node[k]);
}

return node;

}

return node;

}


try{

const obj = JSON.parse(body);

const data = obj?.data;

if(!data) return $done({ body });


/* ===== jhsh.js 功能 ===== */

if(data?.data?.recList) data.data.recList = [];

if(data?.data?.insGroup?.topList) data.data.insGroup.topList = [];

if(data?.data?.insGroup?.floorList) data.data.insGroup.floorList = [];

if(data?.data){
data.data = {
code:0,
msg:"success",
data:{}
};
}


/* ===== 楼层过滤 ===== */

if(Array.isArray(data.STOREY_DISPLAY_INFO)){

data.STOREY_DISPLAY_INFO =
data.STOREY_DISPLAY_INFO.filter(it=>{

const nm = String(it?.STOREY_NM || it?.STOREY_TITLE || "");

if(BAN_STOREY_NAME_PAT.test(nm)) return false;

if(BLOCK_LOCAL_BENEFIT){
if(BAN_LOCAL_STOREY_TYPES.has(it?.STOREY_TYPE)) return false;
}

return true;

});

}


/* ===== 删除广告字段 ===== */

for(const k of Object.keys(data)){

if(KEEP_KEYS.has(k)) continue;

if(DELETE_EXACT_KEYS.has(k)){
delete data[k];
continue;
}

if(shouldDeleteKeyByName(k)){
delete data[k];
}

}


/* ===== 深度清理 ===== */

for(const k of Object.keys(data)){

if(KEEP_KEYS.has(k)) continue;

data[k] = stripAdObjectsDeep(data[k]);

}


/* ===== 本地优惠清理 ===== */

if(BLOCK_LOCAL_BENEFIT){

for(const k of Object.keys(data)){
data[k] = removeLocalBenefitDeep(data[k]);
}

}

$done({ body: JSON.stringify(obj) });

}catch(e){

console.log("建行生活净化异常",e);

$done({ body });

}

})();