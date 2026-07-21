/**
 * @author 树先生(原) / WorkBuddy 修正 2026-07-21
 * @function 朴朴超市 去广告(加固版)
 * 修正点:
 *  1. adv 匹配从 /advertisement/v1 放宽到 /advertisement, 兼容 app 升级后的版本号
 *  2. 对 obj.data 做类型与存在性校验, 响应结构变化时不再抛错(避免整段脚本崩溃导致广告回滚)
 *  3. 出错时 $done({}) 透传原响应, 保证 app 不崩
 * 注意: region_code / component_code 仍是写死的广告标识, 若朴朴改了这些值需同步更新下方数组
 */
try {
  let url = $request.url;
  let body = $response.body;
  let obj = JSON.parse(body);

  const search_hot = "/search/hot_keywords";
  const recommend = "/resource_preload/list_h5_resource";
  const adv = "/advertisement";
  const search_box = "/search_box/products";
  const order_detail = "/order_settlement/detail";
  const orders_list = "/orders/list";

  if (url.indexOf(search_hot) != -1) {
    if (obj.data) obj.data = [];
    $done({ body: JSON.stringify(obj) });
  }

  if (url.indexOf(recommend) != -1) {
    if (Array.isArray(obj.data)) {
      obj.data = obj.data.filter(item => item.filename !== "RecommendProduct.29e31893.js");
    }
    $done({ body: JSON.stringify(obj) });
  }

  if (url.indexOf(adv) != -1) {
    if (Array.isArray(obj.data)) {
      obj.data = obj.data.filter(item => ![30, 50, 90, 320, 100, 770].includes(item.region_code));
      obj.data = obj.data.map(item => {
        if (item && item.region_code === 2 && Array.isArray(item.positions)) {
          item.positions = item.positions.filter(p => ![890, 60, 2, 240, 2503].includes(p.component_code));
        }
        return item;
      });
    }
    $done({ body: JSON.stringify(obj) });
  }

  if (url.indexOf(search_box) != -1) {
    if (obj.data) obj.data.feed_banner_cards = [];
    $done({ body: JSON.stringify(obj) });
  }

  if (url.indexOf(order_detail) != -1) {
    if (obj.data) obj.data.member_card_v2 = {};
    $done({ body: JSON.stringify(obj) });
  }

  if (url.indexOf(orders_list) != -1) {
    if (Array.isArray(obj.data)) {
      obj.data.forEach(item => { if (item) delete item.just_in_time_comment; });
    }
    $done({ body: JSON.stringify(obj) });
  }

  $done({ body: JSON.stringify(obj) });
} catch (e) {
  $done({});
}
