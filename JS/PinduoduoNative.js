/*
 * 拼多多原生 Surge 响应净化
 *
 * 将 QingRex 模块的 http-response-jq 逐条改写为 Surge JavaScript。
 * 首页底栏保留：首页、百亿补贴、聊天、个人中心。
 */

(function () {
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function requestPath() {
    return String(($request && $request.url) || '')
      .replace(/^https?:\/\/[^/]+/i, '')
      .split('?')[0];
  }

  function candidates(root) {
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

  function isAllowedBottomTab(tab) {
    if (!isObject(tab)) return false;
    const title = String(tab.title || '');
    const link = String(tab.link || '');
    if (['index.html', 'chat_list.html', 'personal.html'].includes(link)) return true;
    return title.includes('百亿补贴') || /(?:brand_activity_)?subsidy\.html(?:\?|$)/i.test(link);
  }

  function filterBottomTabs(target, key) {
    if (!Array.isArray(target[key])) return false;
    const filtered = target[key].filter(isAllowedBottomTab);
    if (filtered.length === target[key].length) return false;
    target[key] = filtered;
    return true;
  }

  function stripOrderGrowthTips(value) {
    if (Array.isArray(value)) {
      let changed = false;
      for (const item of value) changed = stripOrderGrowthTips(item) || changed;
      return changed;
    }
    if (!isObject(value)) return false;
    let changed = deleteKeys(value, ['order_growth_tip']);
    for (const child of Object.values(value)) changed = stripOrderGrowthTips(child) || changed;
    return changed;
  }

  const bodyText = $response && $response.body;
  if (typeof bodyText !== 'string' || bodyText.length === 0) {
    $done({});
    return;
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_) {
    $done({});
    return;
  }

  const path = requestPath();
  const roots = candidates(body);
  let changed = false;

  if (path === '/api/alexa/homepage/hub') {
    for (const target of roots) {
      changed = deleteKeys(target, ['icon_set', 'search_bar_hot_query']) || changed;
      if (isObject(target.dy_module)) {
        changed = deleteKeys(target.dy_module, ['irregular_banner_dy']) || changed;
      }
      changed = filterBottomTabs(target, 'bottom_tabs') || changed;
      changed = filterBottomTabs(target, 'buffer_bottom_tabs') || changed;
      if (Array.isArray(target.all_top_opts)) {
        for (const option of target.all_top_opts) {
          if (isObject(option)) {
            changed = deleteKeys(option, ['selected_image', 'image', 'height', 'width']) || changed;
          }
        }
      }
    }
  }

  if (path === '/search') {
    for (const target of roots) changed = deleteKeys(target, ['expansion']) || changed;
  }

  if (path === '/api/philo/personal/hub') {
    for (const target of roots) {
      changed = deleteKeys(target, ['monthly_card_entrance', 'personal_center_style_v2_vo']) || changed;
      if (isObject(target.icon_set)) {
        changed = deleteKeys(target.icon_set, ['icons', 'top_personal_icons']) || changed;
      }
    }
  }

  if (path === '/api/oak/integration/render') {
    for (const target of roots) {
      changed = deleteKeys(target, ['bottom_section_list']) || changed;
      if (isObject(target.ui)) {
        changed = deleteKeys(target.ui, ['bottom_section']) || changed;
        if (isObject(target.ui.live_section)) {
          changed = deleteKeys(target.ui.live_section, ['float_info']) || changed;
        }
      }
    }
  }

  if (path === '/api/caterham/v3/query/order_detail_group') {
    for (const target of roots) {
      if (isObject(target.data)) changed = deleteKeys(target.data, ['goods_list']) || changed;
    }
  }

  if (path.startsWith('/order/')) {
    for (const target of roots) {
      changed = deleteKeys(target, ['marketing_banner_vo']) || changed;
      if (isObject(target.shipping)) {
        changed = deleteKeys(target.shipping, ['banner_above_recommend']) || changed;
      }
    }
  }

  if (path === '/api/aristotle/order_list_v4') {
    changed = stripOrderGrowthTips(body) || changed;
  }

  $done(changed ? { body: JSON.stringify(body) } : {});
})();
