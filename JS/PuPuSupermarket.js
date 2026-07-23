/**
 * @author 树先生(原) / WorkBuddy 修正 2026-07-21, 2026-07-23 采用社区方案增强
 * @function 朴朴超市 去广告(响应体改写版)
 *
 * 2026-07-23 重大策略修正(参考社区 mieqq / ddgksf2013 的朴朴去广告脚本)：
 *   放弃「拦截 CDN 图片」思路——那种做法会误伤首页 banner(同一批图开屏与首页共用)，
 *   导致主页留白。改为从【接口响应体源头】改写，让 app 自己决定不渲染广告：
 *
 *   1) /marketing/advertisement  (开屏广告配置)
 *      - 把 launch_time_close 推到过去(1660716799999 ≈ 2022-08)，app 判定活动已结束 -> 跳过开屏。
 *        用正则直接改整段响应体，不依赖具体 JSON 结构，比按 region_code 过滤更稳。
 *      - 同时保留原来的 region_code / component_code 过滤，覆盖其它广告位。
 *
 *   2) /marketing/banner/v\d?position  (首页 banner 配置)
 *      - 过滤 position_type 为 320 / 710 / 50 的广告位(社区验证值)，去掉首页 banner。
 *
 * 这两个接口都需要 MITM，模块 MITM 段已包含 j1.pupuapi.com。
 * 出错时 $done({}) 透传原响应，保证 app 不崩。
 */
try {
  let url = $request.url;
  let body = $response.body;

  const search_hot = "/search/hot_keywords";
  const recommend = "/resource_preload/list_h5_resource";
  const adv = "/advertisement";
  const banner = "/marketing/banner";
  const search_box = "/search_box/products";
  const order_detail = "/order_settlement/detail";
  const orders_list = "/orders/list";

  // 开屏广告：把 launch_time_close 推到过去，app 判定活动已结束 -> 跳过开屏
  if (url.indexOf(adv) != -1) {
    body = body.replace(/"launch_time_close"\s*:\s*\d+/g, '"launch_time_close":1660716799999');
  }

  let obj = JSON.parse(body);

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

  // 首页 banner：过滤 position_type 320/710/50（社区验证的开屏/广告位标识）
  if (url.indexOf(banner) != -1) {
    if (obj.data) {
      obj.data = Object.values(obj.data).filter(o => !(320 === o.position_type || 710 === o.position_type || 50 === o.position_type));
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
