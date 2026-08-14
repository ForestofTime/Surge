const requestUrl = String(($request && $request.url) || '');
const responseBody = String(($response && $response.body) || '');
let result = {};

try {
  const payload = JSON.parse(responseBody);
  let changed = false;

  if (/\/gw\/mtop\.taobao\.wireless\.home\.splash\.awesome\.get(?:\/|\?|$)/i.test(requestUrl)) {
    changed = cleanSplashSections(payload);
  } else if (/^https:\/\/poplayer\.template\.alibaba\.com\/popcdn\/2\/config\.json(?:\?|$)/i.test(requestUrl)) {
    changed = cleanPopLayerConfig(payload);
  }

  if (changed) result = { body: JSON.stringify(payload) };
} catch (_) {
  result = {};
}

$done(result);

function cleanSplashSections(payload) {
  const sections = payload &&
    payload.data &&
    payload.data.containers &&
    payload.data.containers.splash_home_base &&
    payload.data.containers.splash_home_base.base &&
    payload.data.containers.splash_home_base.base.sections;
  if (!Array.isArray(sections)) return false;

  let changed = false;
  const filtered = [];
  for (const section of sections) {
    const bizData = section && section.bizData;
    if (!bizData || typeof bizData !== 'object' || Array.isArray(bizData) ||
        !Object.prototype.hasOwnProperty.call(bizData, 'taobao-splash')) {
      filtered.push(section);
      continue;
    }

    delete bizData['taobao-splash'];
    changed = true;
    if (Object.keys(bizData).length > 0) filtered.push(section);
  }

  if (changed) payload.data.containers.splash_home_base.base.sections = filtered;
  return changed;
}

function cleanPopLayerConfig(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  let changed = false;

  if (payload.enable !== false) {
    payload.enable = false;
    changed = true;
  }
  changed = clearArray(payload.res, 'images') || changed;
  changed = clearArray(payload.res, 'videos') || changed;
  changed = clearArray(payload.mainRes, 'images') || changed;
  changed = clearArray(payload, 'props') || changed;
  changed = clearArray(payload.configData, 'pages') || changed;

  const env = payload.configData && payload.configData.env;
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    changed = setValue(env, 'bgAlpha', '0') || changed;
    changed = setValue(env, 'displayDelayMs', 0) || changed;
    changed = setValue(env, 'autoCloseDelayMs', 0) || changed;
  }

  return changed;
}

function clearArray(container, key) {
  if (!container || !Array.isArray(container[key]) || container[key].length === 0) return false;
  container[key] = [];
  return true;
}

function setValue(container, key, value) {
  if (!Object.prototype.hasOwnProperty.call(container, key) || container[key] === value) return false;
  container[key] = value;
  return true;
}
