const requestUrl = String(($request && $request.url) || '');
const payloadBody = String((typeof $response === 'object' && $response && $response.body) || '');
let result = {};

try {
  const payload = JSON.parse(payloadBody);
  let changed = false;

  if (/^https:\/\/h\.meituan\.com\/horn_ios\/mergeRequest(?:\?|$)/i.test(requestUrl)) {
    changed = cleanHorn(payload);
  } else if (/^https?:\/\/gaea\.meituan\.com\/mapi\/usercenter(?:\?|$)/i.test(requestUrl)) {
    changed = cleanMine(payload);
  } else if (/^https:\/\/apimobile\.meituan\.com\/group\/v1\/recommend\/unity\/recommends(?:\?|$)/i.test(requestUrl)) {
    changed = cleanCart(payload);
  }

  if (changed) result = { body: JSON.stringify(payload) };
} catch (_) {
  result = {};
}

$done(result);

function disableExistingSwitch(container, key) {
  if (!Object.prototype.hasOwnProperty.call(container, key) || container[key] === false) return false;
  container[key] = false;
  return true;
}

function cleanHorn(payload) {
  let changed = blacklistPersonalCenterRecommendation(payload);
  const customer = payload &&
    payload.pikeConfig &&
    payload.pikeConfig.data &&
    payload.pikeConfig.data.customer;

  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) return changed;
  changed = disableExistingSwitch(customer, 'sharkpush_marketing_dsp_pop') || changed;
  changed = disableExistingSwitch(customer, 'sharkpush_meishi_float_picasso') || changed;
  return changed;
}

function blacklistPersonalCenterRecommendation(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

  const scene = 'personalcenter_2154';
  let target = payload.recommend_platform_config;
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    payload.recommend_platform_config = createRecommendationPlatformConfig(scene);
    return true;
  }

  if (!target.data || typeof target.data !== 'object' || Array.isArray(target.data)) {
    target.data = createRecommendationPlatformConfig(scene).data;
    return true;
  }

  let changed = false;
  if (!target.data.customer || typeof target.data.customer !== 'object' || Array.isArray(target.data.customer)) {
    target.data.customer = createRecommendationCustomer(scene);
    return true;
  }

  for (const key of ['blackList', 'cacheBlackList']) {
    const current = Array.isArray(target.data.customer[key]) ? target.data.customer[key] : [];
    if (!Array.isArray(target.data.customer[key])) {
      target.data.customer[key] = current;
      changed = true;
    }
    if (!current.includes(scene)) {
      current.push(scene);
      changed = true;
    }
  }
  return changed;
}

function createRecommendationCustomer(scene) {
  return {
    enabled: true,
    blackList: [scene],
    feedbackEnabled: true,
    feedbackBlackList: [],
    cacheEnabled: true,
    cacheBlackList: [scene],
    blackStyleList: [],
    showCacheWhenRequestError: true,
    showCacheWhenRequestErrorWhiteList: [],
  };
}

function createRecommendationPlatformConfig(scene) {
  return {
    data: {
      customer: createRecommendationCustomer(scene),
      horn: {
        cacheDuration: 10,
        cleanCacheForUpgrade: false,
        overTime: false,
        pollDuration: 10,
        pollPeriod: ['00:01', '23:59'],
        rateLimit: 0,
        time: 'N/A',
        url: 'N/A',
        version: 1341225,
      },
    },
    etag: 'W/"surge-personalcenter-2154"',
  };
}

function cleanMine(payload) {
  const areas = payload && payload.data && payload.data.areas;
  if (!Array.isArray(areas)) return false;

  const filtered = areas.filter((area) => !(
    area &&
    area.areaName === 'mine_cross_recommend' &&
    area.areaData &&
    typeof area.areaData === 'object' &&
    Object.prototype.hasOwnProperty.call(area.areaData, 'feed')
  ));
  if (filtered.length === areas.length) return false;
  payload.data.areas = filtered;
  return true;
}

function cleanCart(payload) {
  if (!payload || !Array.isArray(payload.data) || payload.data.length === 0) return false;
  payload.data = [];
  return true;
}
