/**
 * 朴朴超市去广告
 *
 * 将 fmz200/wool_scripts 的 Quantumult X 响应改写逻辑等价移植到 Surge。
 * 每次响应只调用一次 $done，解析失败时保持原响应。
 */

const url = $request.url;
const handledPaths = [
  '/notification/message_center/unread_number',
  '/search/hot_keywords',
  '/resource_preload/list_h5_resource',
  '/marketing/advertisement/v1',
  '/marketing/banner/',
  '/search_box/products',
  '/order_settlement/detail',
  '/orders/list',
];
const shouldHandle = handledPaths.some((path) => url.includes(path));

if (!shouldHandle) {
  $done({});
} else {
  try {
    const payload = JSON.parse($response.body);

    if (
      url.includes('/notification/message_center/unread_number') ||
      url.includes('/search/hot_keywords')
    ) {
      payload.data = [];
    } else if (url.includes('/resource_preload/list_h5_resource')) {
      if (Array.isArray(payload.data)) {
        payload.data = payload.data.filter(
          (item) => item.filename !== 'RecommendProduct.29e31893.js'
        );
      }
    } else if (/\/marketing\/banner\/v\d+\?position/.test(url)) {
      if (payload.data) {
        payload.data = Object.values(payload.data).filter(
          (item) => ![50, 320, 710].includes(item.position_type)
        );
      }
    } else if (url.includes('/marketing/advertisement/v1')) {
      if (Array.isArray(payload.data)) {
        payload.data = payload.data
          .filter(
            (item) =>
              ![30, 50, 90, 320, 100, 770].includes(item.region_code)
          )
          .map((item) => {
            if (item.region_code === 2 && Array.isArray(item.positions)) {
              item.positions = item.positions.filter(
                (position) =>
                  ![890, 60, 2, 240, 2503].includes(position.component_code)
              );
            }
            return item;
          });
      }
    } else if (url.includes('/search_box/products')) {
      if (payload.data) {
        payload.data.feed_banner_cards = [];
      }
    } else if (url.includes('/order_settlement/detail')) {
      if (payload.data) {
        payload.data.member_card_v2 = {};
      }
    } else if (url.includes('/orders/list') && Array.isArray(payload.data)) {
      payload.data.forEach((item) => {
        if (item) {
          delete item.just_in_time_comment;
        }
      });
    }

    $done({ body: JSON.stringify(payload) });
  } catch (error) {
    console.log(`PuPuSupermarket: ${error}`);
    $done({});
  }
}
