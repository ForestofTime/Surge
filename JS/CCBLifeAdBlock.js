/*
 * 建行生活广告配置过滤
 *
 * 仅处理 HAR 已确认的广告配置接口，所有页面级开关默认关闭。
 * 开屏接口 A3341A009 默认开启，保留 data 的协议与其它必要字段。
 */

(function () {
  const defaults = {
    splash: true,
    home: false,
    life: false,
    finance: false,
    profile: false,
    popup: false,
    recommendation: false,
    icon_skin: false,
    newcomer: false,
  };

  const pageFields = {
    home: [
      'FUNCTIONAL_AREA_AD_INFO',
      'HPBANNER_AD_INFO_SECOND',
      'DAY_BEST_AD_FIRST',
      'DAY_BEST_AD_SECOND',
      'DAY_BEST_AD_THIRD',
      'DAY_BEST_AD_FOURTH',
      'NOTICE_AD_INFO',
      'PREFERENCE_AD_INFO',
      'TAG_AD_INFO',
      'WINNOW_V3_FESTIVAL',
    ],
    life: [
      'DAILY_BLOCKBUSTER_SYSTEM_RECOMMEND',
      'EDITOR_RECOMMEND2_AD',
      'EXCLUSICE_RATES_AD',
      'LIFE_LIST',
      'LIFE_LOCAL_RECOMMEND_ENTER',
      'LIFE_SCENE_INFO',
      'LIFE_TOP_ROTATION_INFO_V3',
      'LIFE_V3_SCENE_AGGREGATION',
    ],
    finance: [
      'FINANCE_V3_ALTERNATIVE_FOUR',
      'FINANCE_V3_ALTERNATIVE_ONE',
      'FINANCE_V3_ALTERNATIVE_TWO',
      'FINANCE_V3_BORROW_MONEY',
      'FINANCE_V3_FITMENT',
      'FINANCE_V3_FLAT_HUNTING',
      'FINANCE_V3_PURCHASE_CAR',
      'FINANCE_V3_SELECT',
      'POPULAR_INFORMATION_INFO',
      'THROUGH_COLUMN_INFO',
      'WEALTH_SELECTION_INFO',
    ],
    profile: ['MEBCT_AD_INFO', 'MYSELF_ENTRANCE_AD', 'TAG_AD_INFO'],
  };

  const pageFloorTypes = {
    home: new Set(['257', '260', '261', '266', '267', '268', '269', '273', '274', '275']),
    life: new Set(['44', '48', '156', '158', '159', '160', '161', '162', '255', '256']),
    finance: new Set([
      '24', '51', '52', '53', '54', '55', '56', '57', '58', '59', '75', '80', '81',
      '197', '198', '199', '200', '201', '202', '203', '205', '206', '207', '208',
      '209', '210', '211', '225', '226', '227',
    ]),
    profile: new Set(['277', '278']),
  };

  function argumentValue(name) {
    if (typeof $argument === 'object' && $argument !== null) {
      return $argument[name];
    }

    if (typeof $argument !== 'string') return undefined;
    const pairs = $argument.split('&');
    for (const pair of pairs) {
      const separator = pair.indexOf('=');
      if (separator > -1 && pair.slice(0, separator) === name) {
        return decodeURIComponent(pair.slice(separator + 1));
      }
    }
    return undefined;
  }

  function enabled(name) {
    const value = argumentValue(name);
    if (value === undefined || value === null || value === '') return defaults[name];
    return /^(?:1|true|yes|on)$/i.test(String(value).trim());
  }

  function transactionCode(url) {
    const match = String(url || '').match(/[?&]txcode=([^&]+)/i);
    return match ? decodeURIComponent(match[1]).toUpperCase() : '';
  }

  function deleteFields(data, fields) {
    for (const field of fields) delete data[field];
  }

  function clearArray(value, key) {
    if (Array.isArray(value[key])) value[key] = [];
  }

  function hideConfiguredFloors(data) {
    if (!Array.isArray(data.STOREY_DISPLAY_INFO)) return;

    const types = new Set();
    for (const page of ['home', 'life', 'finance', 'profile']) {
      if (!enabled(page)) continue;
      for (const type of pageFloorTypes[page]) types.add(type);
    }

    if (types.size === 0) return;
    for (const floor of data.STOREY_DISPLAY_INFO) {
      if (floor && types.has(String(floor.STOREY_TYPE))) floor.IS_DISPLAY = '0';
    }
  }

  const originalBody = $response && $response.body;
  if (typeof originalBody !== 'string' || originalBody.length === 0) {
    $done({});
    return;
  }

  let response;
  try {
    response = JSON.parse(originalBody);
  } catch (_) {
    $done({});
    return;
  }

  const data = response && response.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    $done({});
    return;
  }

  const txcode = transactionCode($request && $request.url);
  let modified = false;

  if (txcode === 'A3341A009' && enabled('splash') && Array.isArray(data.START_AD_INFO)) {
    data.START_AD_INFO = [];
    modified = true;
  }

  if (txcode === 'A3341AB03') {
    for (const page of ['home', 'life', 'finance', 'profile']) {
      if (!enabled(page)) continue;
      const fields = pageFields[page];
      if (fields.some((field) => Object.prototype.hasOwnProperty.call(data, field))) {
        deleteFields(data, fields);
        modified = true;
      }
    }
  }

  if (txcode === 'A3341A120' && enabled('popup') && Array.isArray(data.POP_AD_INFO)) {
    data.POP_AD_INFO = [];
    modified = true;
  }

  if (txcode === 'A3341A095' && enabled('recommendation') && data.data && typeof data.data === 'object') {
    clearArray(data.data, 'recList');
    if (data.data.insGroup && typeof data.data.insGroup === 'object') {
      clearArray(data.data.insGroup, 'topList');
      clearArray(data.data.insGroup, 'floorList');
    }
    modified = true;
  }

  if (txcode === 'A3341MB22' && enabled('recommendation') && Array.isArray(data.MCT_INFO)) {
    data.MCT_INFO = [];
    modified = true;
  }

  if (txcode === 'A3341A068' && enabled('recommendation') && data.data && typeof data.data === 'object') {
    clearArray(data.data, 'recList');
    clearArray(data.data, 'topList');
    modified = true;
  }

  if (txcode === 'A3341AB04' && enabled('icon_skin') && Object.prototype.hasOwnProperty.call(data, 'ICON_SKIN_INFO')) {
    delete data.ICON_SKIN_INFO;
    modified = true;
  }

  if (txcode === 'A3341C147' && enabled('newcomer')) {
    response.data = {};
    modified = true;
  }

  if (txcode === 'A3341AB08') {
    const before = JSON.stringify(data.STOREY_DISPLAY_INFO);
    hideConfiguredFloors(data);
    modified = modified || before !== JSON.stringify(data.STOREY_DISPLAY_INFO);
  }

  $done(modified ? { body: JSON.stringify(response) } : {});
})();
