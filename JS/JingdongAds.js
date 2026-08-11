/*
 * 京东广告响应净化
 *
 * 来源规则：RuCu6 / Kelee 的 JD_remove_ads.js 及 QingRex 京东模块。
 * 先按明确列出的 functionId 分派；新版页面改名时，仅按已确认的广告字段清理，
 * 其余接口及字段保持原样。
 */

(function () {
  const originalBody = $response && $response.body;
  if (typeof originalBody !== 'string' || originalBody.length === 0) {
    $done({});
    return;
  }

  const functionId = requestFunctionId($request && $request.url, $request && $request.body);
  if (isEmptyResponseFunction(functionId)) {
    $done({ body: '{}' });
    return;
  }

  let response;
  try {
    response = JSON.parse(originalBody);
  } catch (_) {
    $done({});
    return;
  }

  let changed = false;

  switch (functionId) {
    case 'deliverLayer':
    case 'orderTrackBusiness':
      changed = cleanDelivery(response);
      break;
    case 'getTabHomeInfo':
      changed = cleanTabHome(response);
      break;
    case 'myOrderInfo':
      changed = cleanOrder(response);
      break;
    case 'personinfoBusiness':
      changed = cleanProfile(response);
      break;
    case 'start':
      changed = cleanStart(response);
      break;
    case 'welcomeHome':
      changed = cleanWelcomeHome(response);
      break;
    case 'basicConfig':
      changed = cleanBasicConfig(response);
      break;
    case 'queryPagePopWindow':
      changed = cleanPagePopup(response);
      break;
    case 'cart':
      changed = cleanCart(response);
      break;
    default:
      break;
  }

  // 当前 GitHub 规则把“我的”和购物车处理绑定在旧 functionId 上。
  // 新版 App 若只替换接口名，仍仅依据原规则已确认的广告结构处理。
  changed = cleanKnownPageSurfaces(response) || changed;

  $done(changed ? { body: JSON.stringify(response) } : {});
})();

function requestFunctionId(url, body) {
  const match = String(url || '').match(/[?&]functionId=([^&#]+)/i) ||
    String(body || '').match(/(?:^|&)functionId=([^&#]+)/i);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

function isEmptyResponseFunction(functionId) {
  return new Set([
    'cartCouponRecommendGoods',
    'recommendShop',
    'searchBoxWord',
    'stationPullService',
    'uniformRecommend',
    'uniformRecommend0',
    'uniformRecommend6',
  ]).has(functionId);
}

function cleanDelivery(response) {
  let changed = false;
  if (hasOwn(response, 'bannerInfo')) {
    delete response.bannerInfo;
    changed = true;
  }
  return filterFloors(response, new Set(['banner', 'jdDeliveryBanner'])) || changed;
}

function cleanTabHome(response) {
  const result = response && response.result;
  if (!isObject(result)) return false;
  let changed = false;
  for (const key of ['iconInfo', 'roofTop']) {
    if (!hasOwn(result, key)) continue;
    delete result[key];
    changed = true;
  }
  return changed;
}

function cleanOrder(response) {
  let changed = filterFloors(response, new Set(['bannerFloor', 'bpDynamicFloor', 'plusFloor']));
  if (!Array.isArray(response && response.floors)) return changed;

  for (const floor of response.floors) {
    if (!isObject(floor)) continue;
    if (floor.mId === 'virtualServiceCenter') {
      changed = cleanVirtualServiceCenter(floor) || changed;
    }
    if (floor.mId === 'customerServiceFloor' && isObject(floor.data) && hasOwn(floor.data, 'moreText')) {
      delete floor.data.moreIcon;
      delete floor.data.moreIcon_dark;
      floor.data.moreText = ' ';
      changed = true;
    }
  }
  return changed;
}

function cleanVirtualServiceCenter(floor) {
  const centers = floor && floor.data && floor.data.virtualServiceCenters;
  if (!Array.isArray(centers)) return false;
  let changed = false;
  for (const center of centers) {
    if (!isObject(center) || !Array.isArray(center.serviceList)) continue;
    const before = center.serviceList.length;
    center.serviceList = center.serviceList.filter((card) => card && card.serviceTitle !== '精选特惠');
    changed = changed || before !== center.serviceList.length;
  }
  return changed;
}

function cleanProfile(response) {
  let changed = cleanProfileFloors(response && response.floors);
  if (isObject(response && response.others)) {
    changed = cleanProfileFloors(response.others.floors) || changed;
  }
  return changed;
}

function cleanProfileFloors(floors) {
  if (!Array.isArray(floors)) return false;
  const removeIds = new Set([
    'bigSaleFloor',
    'buyOften',
    'newAttentionCard',
    'newBigSaleFloor',
    'newStyleAttentionCard',
    'newsFloor',
    'noticeFloor',
    'recommendfloor',
  ]);
  const before = floors.length;
  const retained = floors.filter((floor) => !floor || !removeIds.has(floor.mId));
  let changed = before !== retained.length;

  for (const floor of retained) {
    if (!isObject(floor) || !isObject(floor.data)) continue;
    if (floor.mId === 'basefloorinfo') {
      for (const key of ['commonPopup', 'commonPopup_dynamic', 'floatLayer']) {
        if (!hasOwn(floor.data, key)) continue;
        delete floor.data[key];
        changed = true;
      }
      for (const key of ['commonTips', 'commonWindows']) {
        if (!Array.isArray(floor.data[key]) || floor.data[key].length === 0) continue;
        floor.data[key] = [];
        changed = true;
      }
    }
    if (floor.mId === 'orderIdFloor' && floor.data.commentRemindInfo && Array.isArray(floor.data.commentRemindInfo.infos) && floor.data.commentRemindInfo.infos.length > 0) {
      floor.data.commentRemindInfo.infos = [];
      changed = true;
    }
    if (floor.mId === 'userinfo' && hasOwn(floor.data, 'newPlusBlackCard')) {
      delete floor.data.newPlusBlackCard;
      changed = true;
    }
  }

  if (changed) {
    floors.splice(0, floors.length, ...retained);
  }
  return changed;
}

function cleanStart(response) {
  let changed = false;
  if (Array.isArray(response && response.images) && response.images.length > 0) {
    response.images = [];
    changed = true;
  }
  if (response && response.showTimesDaily && response.showTimesDaily !== 0) {
    response.showTimesDaily = 0;
    changed = true;
  }
  return changed;
}

function cleanWelcomeHome(response) {
  let changed = false;
  if (Array.isArray(response && response.floorList)) {
    const removeTypes = new Set([
      'bottomXview',
      'float',
      'photoCeiling',
      'ruleFloat',
      'searchIcon',
      'topRotate',
      'tabBarAtmosphere',
    ]);
    const before = response.floorList.length;
    response.floorList = response.floorList.filter((floor) => !floor || !removeTypes.has(floor.type));
    changed = before !== response.floorList.length;
  }
  if (Array.isArray(response && response.webViewFloorList) && response.webViewFloorList.length > 0) {
    response.webViewFloorList = [];
    changed = true;
  }
  return changed;
}

function cleanBasicConfig(response) {
  const data = response && response.data;
  if (!isObject(data)) return false;
  let changed = false;
  const socketMonitor = data.JDMessage && data.JDMessage.socketmonitor;
  if (isObject(socketMonitor)) {
    for (const key of ['isSocketEstablishedAhead', 'isSocketReport']) {
      if (!hasOwn(socketMonitor, key) || socketMonitor[key] === 0) continue;
      socketMonitor[key] = 0;
      changed = true;
    }
  }
  const httpDns = data.JDHttpToolKit && data.JDHttpToolKit.httpdns;
  if (isObject(httpDns) && hasOwn(httpDns, 'httpdns') && httpDns.httpdns !== 0) {
    httpDns.httpdns = 0;
    changed = true;
  }

  // HAR 2026-08-11 已确认：这些开关直接控制广告降级与“我的”推荐缓存。
  // 仅在服务端原本下发该字段时改写，避免向未知版本注入新配置。
  for (const [path, value] of [
    [['JDAdsCore', 'adDegradationConfig', 'degraded'], '1'],
    [['JDUniformRecommend', 'JDUniformRecommendmMyJdCache', 'JDUniformRecommendmMyJdCache'], '0'],
    [['JDUniformRecommend', 'uniformRecommendCache', 'uniformRecommendCache'], '0'],
    [['JDFinderCache', 'productRecommendXJ', 'enable'], '0'],
    [['JDFinderCache', 'personCenterDrawerXJ', 'enable'], '0'],
  ]) {
    changed = setExistingValue(data, path, value) || changed;
  }
  return changed;
}

function setExistingValue(root, path, value) {
  let parent = root;
  for (const key of path.slice(0, -1)) {
    if (!isObject(parent[key])) return false;
    parent = parent[key];
  }
  const key = path.at(-1);
  if (!hasOwn(parent, key) || parent[key] === value) return false;
  parent[key] = value;
  return true;
}

function cleanPagePopup(response) {
  if (!hasPopupDisplaySignal(response)) return false;
  let changed = false;
  if (hasOwn(response, 'activityId') && response.activityId !== '') {
    response.activityId = '';
    changed = true;
  }
  if (hasOwn(response, 'channelPoint') && (!Array.isArray(response.channelPoint) || response.channelPoint.length > 0)) {
    response.channelPoint = [];
    changed = true;
  }
  return changed;
}

function cleanCart(response) {
  let changed = false;
  if (isObject(response.cartLocationMap) && hasOwn(response.cartLocationMap, 'loc_emptyCartFloor2')) {
    delete response.cartLocationMap.loc_emptyCartFloor2;
    changed = true;
  }
  if (hasOwn(response, 'emptyCartRecommendFloor')) {
    delete response.emptyCartRecommendFloor;
    changed = true;
  }
  return changed;
}

function cleanKnownPageSurfaces(response) {
  let changed = false;
  for (const candidate of [response, response && response.data]) {
    if (!isObject(candidate)) continue;
    changed = cleanCart(candidate) || changed;
    changed = cleanProfile(candidate) || changed;
  }
  return changed;
}

function hasPopupDisplaySignal(response) {
  const candidates = [response, response && response.data];
  for (const item of candidates) {
    if (!isObject(item)) continue;
    for (const key of ['isShow', 'show', 'needShow', 'shouldShow', 'display']) {
      if (isTruthyDisplayValue(item[key])) return true;
    }
    for (const key of ['popup', 'popWindow', 'popupInfo', 'popupData']) {
      if (isObject(item[key]) || (Array.isArray(item[key]) && item[key].length > 0)) return true;
    }
  }
  return false;
}

function isTruthyDisplayValue(value) {
  return value === true || value === 1 || /^(?:1|true|yes|on)$/i.test(String(value || ''));
}

function filterFloors(response, removeIds) {
  if (!Array.isArray(response && response.floors)) return false;
  const before = response.floors.length;
  response.floors = response.floors.filter((floor) => !floor || !removeIds.has(floor.mId));
  return before !== response.floors.length;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}
