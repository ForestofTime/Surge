const requestUrl = String(($request && $request.url) || '');
const responseBody = String(($response && $response.body) || '');
let result = {};

try {
  const payload = JSON.parse(responseBody);
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
  const customer = payload &&
    payload.pikeConfig &&
    payload.pikeConfig.data &&
    payload.pikeConfig.data.customer;

  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) return false;
  let changed = false;
  changed = disableExistingSwitch(customer, 'sharkpush_marketing_dsp_pop') || changed;
  changed = disableExistingSwitch(customer, 'sharkpush_meishi_float_picasso') || changed;
  return changed;
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
