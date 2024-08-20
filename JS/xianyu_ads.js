/**
 * 闲鱼 去广告+净化
 * 2024-08-20
 */
const url = $request.url;
if (!$response.body) $done({});
let obj = JSON.parse($response.body);

// 首页 nextfresh 去广告
if (url.includes("/gw/mtop.taobao.idlehome.home.nextfresh")) {
  // 可能存在的首页标签
  delete obj.data.widgetReturnDO;
  
  // 过滤首页信息流广告
  if (obj.data?.sections) {
    obj.data.sections = obj.data.sections.filter(section => {
      return !(section.data && (section.data.bizType === "AD" || section.data.bizType === "homepage"));
    });

    let excludeNames = ['fish_home_yunying_card_d3', 'idlefish_seafood_market', 'fish_home_chat_room'];
    obj.data.sections = obj.data.sections.filter(function(section) {  
      return !excludeNames.includes(section.template.name);  
    });
  }

  // 移除广告图片 coverImage
  if (obj.data?.coverImage && obj.data.coverImage.url?.includes("gw.alicdn.com/imgextra")) {
    delete obj.data.coverImage;
  }
}

// 本地推荐页面去广告
if (url.includes("/gw/mtop.taobao.idle.local.home")) {
  if (obj.data?.sections) {
    obj.data.sections = obj.data.sections.filter(section => {
      return !(section.data && section.data.bizType === "AD");
    });
  }
}

// 模块去广告
if (url.includes("/gw/mtop.taobao.idle.home.whale.modulet")) {
  delete obj.data.container.sections;
}

// 搜索遮罩和策略列表去广告
if (url.includes("/gw/mtop.taobao.idlemtopsearch.search.shade") || url.includes("/gw/mtop.taobao.idle.user.strategy.list")) {
  delete obj.data;
}

$done({body: JSON.stringify(obj)});
