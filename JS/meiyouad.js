/**************************************
 * 美柚广告净化 Ultimate
 **************************************/

let body = $response.body;

if (!body) $done({});

let obj;
try {
  obj = JSON.parse(body);
} catch (e) {
  $done({});
}

/*************** 通用过滤器 ***************/
function isAd(item) {
  if (!item || typeof item !== "object") return false;

  return (
    item.ad ||
    item.ad_id ||
    item.is_ad === 1 ||
    item.type === "ad" ||
    item.type === "advertisement" ||
    item.card_type === "ad" ||
    item.material ||
    item.banner ||
    item.biz_type === "ad" ||
    item.tag === "广告" ||
    item.title?.includes("广告")
  );
}

function cleanList(list) {
  if (!Array.isArray(list)) return list;
  return list.filter(i => !isAd(i));
}

/*************** 深度清理 ***************/
function deepClean(obj) {
  if (!obj || typeof obj !== "object") return obj;

  for (let key in obj) {
    let val = obj[key];

    if (Array.isArray(val)) {
      obj[key] = cleanList(val).map(i => deepClean(i));
    } else if (typeof val === "object") {
      obj[key] = deepClean(val);
    }
  }

  return obj;
}

/*************** 特殊处理 ***************/

// 1. 开屏广告（直接清空）
if (obj.data?.start_ad || obj.data?.launch_ad) {
  obj.data.start_ad = null;
  obj.data.launch_ad = null;
}

// 2. 配置广告关闭
if (obj.data?.configs) {
  obj.data.configs = {};
}

// 3. 信息流核心结构
if (obj.data) {
  obj.data = deepClean(obj.data);
}

// 4. 顶层兜底
obj = deepClean(obj);

$done({ body: JSON.stringify(obj) });
