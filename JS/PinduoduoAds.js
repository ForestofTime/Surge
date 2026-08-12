/*
 * 拼多多广告净化
 *
 * 基于公开 QX/Surge 规则的共同接口实现。按功能域处理字段，所有参数可关闭；
 * 不包含硬编码 IP、未知统计域名或全局 DNS 拦截，避免影响登录、下单和支付。
 */

(function () {
  const defaults = {
    splash: true,
    home: true,
    personal: true,
    orders: true,
    search: true,
    chat: true,
    fresh: false,
    detail: false,
  };

  const requestRoutes = [
    ['/api/cappuccino/splash', 'splash'],
    ['/api/aquarius/hungary/global/homepage', 'home'],
    ['/search_hotquery', 'search'],
    ['/api/zaire_biz/chat/resource/get_list_data', 'chat'],
    ['/api/caterham/v3/query/new_chat_group', 'chat'],
    ['/api/caterham/v3/query/personal', 'personal'],
    ['/api/caterham/v3/query/likes', 'personal'],
    ['/api/alexa/goods/back_up', 'personal'],
    ['/api/caterham/v3/query/my_order_group', 'orders'],
    ['/api/caterham/v3/query/order_express_group', 'orders'],
    ['/api/aristotle/unrated_order_for_unreceived_tab', 'orders'],
    ['/api/aristotle/query_order_list_tabs_element', 'orders'],
    ['/api/brand-olay/goods_detail/bybt_guide', 'detail'],
    ['/api/engels/reviews/require/append', 'detail'],
  ];

  function argumentValue(name) {
    if (typeof $argument === 'object' && $argument !== null) return $argument[name];
    if (typeof $argument !== 'string') return undefined;
    for (const pair of $argument.split('&')) {
      const index = pair.indexOf('=');
      if (index > -1 && pair.slice(0, index) === name) return decodeURIComponent(pair.slice(index + 1));
    }
    return undefined;
  }

  function enabled(name) {
    const value = argumentValue(name);
    if (value === undefined || value === null || value === '') return defaults[name];
    return /^(?:1|true|yes|on)$/i.test(String(value).trim());
  }

  function requestPath() {
    return String(($request && $request.url) || '').replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function candidateObjects(root) {
    return [root, root && root.result, root && root.data].filter(isObject);
  }

  function deleteKeys(target, keys) {
    let changed = false;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        delete target[key];
        changed = true;
      }
    }
    return changed;
  }

  function removeOrderGrowthTips(value) {
    if (!isObject(value) && !Array.isArray(value)) return false;
    let changed = false;
    if (Array.isArray(value)) {
      for (const item of value) changed = removeOrderGrowthTips(item) || changed;
      return changed;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'order_growth_tip')) {
      delete value.order_growth_tip;
      changed = true;
    }
    for (const key of Object.keys(value)) {
      if (key !== 'order_growth_tip') changed = removeOrderGrowthTips(value[key]) || changed;
    }
    return changed;
  }

  function emptyJson() {
    return {
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    };
  }

  const path = requestPath();
  const responseBody = typeof $response !== 'undefined' && $response ? $response.body : undefined;

  if (responseBody === undefined) {
    const route = requestRoutes.find(([prefix]) => path === prefix);
    $done(route && enabled(route[1]) ? emptyJson() : {});
    return;
  }

  if (typeof responseBody !== 'string' || responseBody.length === 0) {
    $done({});
    return;
  }

  let body;
  try {
    body = JSON.parse(responseBody);
  } catch (_) {
    $done({});
    return;
  }

  let changed = false;
  const candidates = candidateObjects(body);

  if (path === '/api/alexa/homepage/hub' && enabled('home')) {
    for (const target of candidates) {
      changed = deleteKeys(target, ['icon_set', 'search_bar_hot_query']) || changed;
      if (isObject(target.dy_module)) {
        changed = deleteKeys(target.dy_module, ['irregular_banner_dy', 'irregular_banner', 'ad_module']) || changed;
      }
      if (Array.isArray(target.bottom_tabs)) {
        const before = target.bottom_tabs.length;
        target.bottom_tabs = target.bottom_tabs.filter((tab) => !['多多视频', '大促会场', '搜索', '直播'].includes(tab && tab.title));
        changed = changed || before !== target.bottom_tabs.length;
      }
      if (Array.isArray(target.buffer_bottom_tabs)) {
        const before = target.buffer_bottom_tabs.length;
        target.buffer_bottom_tabs = target.buffer_bottom_tabs.filter((tab) => !['多多视频', '大促会场', '搜索', '直播'].includes(tab && tab.title));
        changed = changed || before !== target.buffer_bottom_tabs.length;
      }
      if (Array.isArray(target.module_order)) {
        const before = target.module_order.length;
        target.module_order = target.module_order.filter((item) => !['irregular_banner_dy', 'irregular_banner', 'ad_module', 'timeline'].includes(item && item.module_name));
        changed = changed || before !== target.module_order.length;
      }
    }
  }

  if (path === '/api/alexa/homepage/hub' && enabled('fresh')) {
    for (const target of candidates) changed = deleteKeys(target, ['recommend_fresh_info', 'recommend_fresh_info_lite']) || changed;
  }

  if (path === '/search' && enabled('search')) {
    for (const target of candidates) changed = deleteKeys(target, ['expansion']) || changed;
  }

  if (path === '/api/philo/personal/hub' && enabled('personal')) {
    for (const target of candidates) {
      changed = deleteKeys(target, ['monthly_card_entrance', 'personal_center_style_v2_vo']) || changed;
      if (isObject(target.icon_set)) changed = deleteKeys(target.icon_set, ['icons', 'top_personal_icons']) || changed;
    }
  }

  if (path === '/api/oak/integration/render' && enabled('home')) {
    for (const target of candidates) {
      changed = deleteKeys(target, ['bottom_section_list']) || changed;
      if (isObject(target.ui)) {
        changed = deleteKeys(target.ui, ['bottom_section']) || changed;
        if (isObject(target.ui.live_section)) changed = deleteKeys(target.ui.live_section, ['float_info']) || changed;
      }
    }
  }

  if (path === '/api/caterham/v3/query/order_detail_group' && enabled('orders')) {
    for (const target of candidates) {
      if (isObject(target.data)) changed = deleteKeys(target.data, ['goods_list']) || changed;
      changed = deleteKeys(target, ['goods_list']) || changed;
    }
  }

  if (/^\/order\//.test(path) && enabled('orders')) {
    for (const target of candidates) {
      changed = deleteKeys(target, ['marketing_banner_vo']) || changed;
      if (isObject(target.shipping)) changed = deleteKeys(target.shipping, ['banner_above_recommend']) || changed;
    }
  }

  if (path === '/api/aristotle/order_list_v4' && enabled('orders')) changed = removeOrderGrowthTips(body) || changed;

  if (path === '/api/growth/nagato/app/index/gather' && enabled('home')) {
    for (const target of candidates) {
      if (isObject(target.newer_index_banner)) changed = deleteKeys(target.newer_index_banner, ['data']) || changed;
    }
  }

  if (path === '/proxy/api/api/express/post/waybill/red_packet/goods_list' && enabled('fresh')) {
    for (const target of candidates) {
      if (Array.isArray(target.list)) {
        target.list = [];
        changed = true;
      }
    }
  }

  $done(changed ? { body: JSON.stringify(body) } : {});
})();
