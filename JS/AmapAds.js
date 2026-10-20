// 高德附件可见页面规则的 Surge JS 实现。两份复杂 JQ 的实现分置独立脚本。
(function () {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => object(value) && Object.prototype.hasOwnProperty.call(value, key);
  const at = (value, keys) => keys.reduce((parent, key) => object(parent) ? parent[key] : undefined, value);
  function remove(value, keys) {
    const parent = at(value, keys.slice(0, -1));
    if (object(parent)) delete parent[keys[keys.length - 1]];
  }
  try {
    const match = String($request.url || '').match(/^https:\/\/([^/?]+)(\/[^?]*)\?/i);
    if (!match) return $done({});
    const key = match[1].toLowerCase() + match[2].toLowerCase();
    const allowed = new Set([
      'm5.amap.com/ws/shield/dsp/profile/index/nodefaasv3',
      'm5.amap.com/ws/shield/scene/recommend',
      'sns.amap.com/ws/opc/tools/list',
      'info.amap.com/ws/c3frontend/af-search/search',
      'm5-zb.amap.com/ws/boss/car/order/content_info',
      'm5-zb.amap.com/ws/amap/hitch/passenger/content_info',
      'center.amap.com/ws/amc/server/conv/raise_list',
      'info.amap.com/ws/shield/search_business/process/middlelayer/sug',
      'm5.amap.com/ws/smartui/near_recommend',
    ]);
    if (!allowed.has(key) || typeof $response.body !== 'string') return $done({});
    const payload = JSON.parse($response.body);
    if (!object(payload)) return $done({});
    const before = JSON.stringify(payload);
    const data = payload.data;
    if (key.endsWith('/nodefaasv3')) {
      if (object(data) && Array.isArray(data.cardList)) {
        delete data.tipData; delete data.wallet;
        data.cardList = data.cardList.filter(item => object(item) && ['MineNewFootprintCard', 'MineNewBEntranceCardV4'].includes(item.dataKey));
        for (const card of data.cardList) {
          if (card.dataKey !== 'MineNewBEntranceCardV4' || !object(card.content)) continue;
          for (const [name, ids] of [['entranceList_1', [7, 8, 10, 17]], ['entranceList_2', [32, 4, 9, 16, 14]]]) {
            if (Array.isArray(card.content[name])) card.content[name] = card.content[name].filter(item => object(item) && ids.includes(item.id));
          }
        }
      }
    } else if (key.endsWith('/scene/recommend')) {
      // 源规则先删除 shadingWords，后续对此字段的筛选已无效果。
      if (object(data)) delete data.shadingWords;
      const tools = at(data, ['toolsRecommend', 'data']);
      if (object(tools) && Array.isArray(tools.default)) tools.default = tools.default.filter(item => object(item) && [102, 103, 106, 151].includes(item.id));
    } else if (key.endsWith('/opc/tools/list')) {
      if (object(data) && Array.isArray(data.category)) {
        for (const category of data.category) {
          if (!object(category) || !Array.isArray(category.tools)) continue;
          category.tools = category.tools.filter(item => !object(item) || (item.id !== 547 && item.id !== '547'));
          for (const item of category.tools) if (object(item)) delete item.tips;
        }
      }
    } else if (key.endsWith('/af-search/search')) {
      const items = at(data, ['modules', 'quickLink', 'data', 'list']);
      if (Array.isArray(items)) for (const item of items) if (object(item) && own(item.badge, 'text')) item.badge.text = '';
    } else if (key.endsWith('/car/order/content_info')) {
      const luban = at(data, ['lubanData']);
      if (object(luban)) {
        for (const name of ['skin', 'kingToolBoxBubble', 'popup']) delete luban[name];
        const ids = ['dache_toolbox_GDIntercity', 'dache_toolbox_hitch', 'dache_toolbox_chauffeur', 'dache_toolbox_quality', 'dache_toolbox_charterCar'];
        const sort = at(luban, ['kingToolSort', 'dataList']);
        if (Array.isArray(sort)) for (const item of sort) {
          if (object(item) && object(item.biz) && Array.isArray(item.biz.kingToolIdList)) item.biz.kingToolIdList = item.biz.kingToolIdList.filter(id => ids.includes(id));
        }
        const box = luban.kingToolBox;
        if (object(box) && Array.isArray(box.dataList)) box.dataList = box.dataList.filter(item => object(item) && object(item.biz) && ids.includes(item.biz.id));
      }
    } else if (key.endsWith('/hitch/passenger/content_info')) {
      remove(payload, ['data', 'lubanData', 'banner']);
    } else if (key.endsWith('/conv/raise_list')) {
      if (object(data) && Array.isArray(data.dataList)) data.dataList = data.dataList.filter(item => object(item) && (own(item, 'categoryId') || (object(item.data) && item.data.id === 'M_100007')));
    } else if (key.endsWith('/middlelayer/sug')) {
      if (Array.isArray(payload.tip_list)) payload.tip_list = payload.tip_list.filter(item => object(item) && object(item.tip) && ['common_content_general', 'sp'].includes(item.tip.task_tag));
    } else if (key.endsWith('/smartui/near_recommend')) {
      if (object(data)) delete data.operation_activity;
    }
    const body = JSON.stringify(payload);
    return $done(body === before ? {} : { body });
  } catch (_) { return $done({}); }
}());
