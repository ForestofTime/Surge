const DEBUG = false;
const HANDLERS = [];

function parseJSON(body) {
  if (typeof body !== 'string') return null;
  try {
    return JSON.parse(body);
  } catch (err) {
    debug('JSON parse failed', err);
    return null;
  }
}

function stringify(data) {
  try {
    return JSON.stringify(data);
  } catch (err) {
    debug('JSON stringify failed', err);
    return null;
  }
}

function debug(...args) {
  if (DEBUG) {
    console.log('[didi_carowner]', ...args);
  }
}

function logWarn(...args) {
  console.log('[didi_carowner:warn]', ...args);
}

function pickById(list, allowed) {
  if (!Array.isArray(list) || !Array.isArray(allowed)) return list;
  return list.filter((item = {}) => {
    const id = item.id ?? item.nav_id ?? item.tab_id;
    return allowed.includes(id);
  });
}

function deleteKeys(obj, keys) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(keys)) return;
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      delete obj[key];
    }
  });
}

function safeDelete(obj, path) {
  if (!obj || !path) return;
  const segments = Array.isArray(path)
    ? [...path]
    : String(path)
        .split('.')
        .map((p) => p.trim())
        .filter(Boolean);
  if (!segments.length) return;
  const lastKey = segments.pop();
  const parent = segments.reduce((acc, key) => {
    if (acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, key)) {
      return acc[key];
    }
    return undefined;
  }, obj);
  if (parent && typeof parent === 'object' && Object.prototype.hasOwnProperty.call(parent, lastKey)) {
    delete parent[lastKey];
  }
}

function handleHomepageCore(body) {
  const parsed = parseJSON(body);
  if (!parsed || !parsed.data) return body;

  const payload = parsed.data;
  const allowedBottomNav = ['home_page', 'user_center'];
  const allowedOrderNav = ['dache_anycar', 'carmate', 'driverservice', 'zhandianbashi', 'special_ride', 'pincheche', 'bike', 'nav_more_v3'];

  const disorderCards = payload.disorder_cards || {};
  deleteKeys(disorderCards, ['super_banner_card', 'marketing_card', 'mult_home_banner', 'communicate_card']);
  const bottomNav = disorderCards.bottom_nav_list;
  if (bottomNav && Array.isArray(bottomNav.data)) {
    bottomNav.data = pickById(bottomNav.data, allowedBottomNav);
  }

  const orderCards = payload.order_cards || {};
  const navListCard = orderCards.nav_list_card;
  if (navListCard && Array.isArray(navListCard.data)) {
    navListCard.data = pickById(navListCard.data, allowedOrderNav);
  }

  return stringify(parsed) || body;
}

function handleHomepageOther(body) {
  const parsed = parseJSON(body);
  if (!parsed || !parsed.data) return body;

  const pathsToDelete = [
    ['data', 'disorder_cards', 'communicate_card'],
    ['data', 'disorder_cards', 'not_login_bottom_bar'],
    ['data', 'disorder_cards', 'riding_code_card'],
    ['data', 'disorder_cards', 'car_owner_widget_card'],
    ['data', 'disorder_cards', 'car_icon', 'data', 'icon_info_new_agreement'],
    ['data', 'order_cards', 'marketing_card'],
    ['data', 'order_cards', 'super_banner_card']
  ];

  pathsToDelete.forEach((path) => safeDelete(parsed, path));
  return stringify(parsed) || body;
}

function handlePorsche(body) {
  const parsed = parseJSON(body);
  if (!parsed || !parsed.data) return body;

  const payload = parsed.data;
  if (Array.isArray(payload.tab_list)) {
    const tabPattern = /^(passenger|car_owner)$/;
    payload.tab_list = payload.tab_list.filter((tab = {}) => tabPattern.test(tab.tab_id));
  }

  const instances = payload.instances;
  if (instances && typeof instances === 'object') {
    const filteredEntries = Object.entries(instances).filter(([key]) =>
      /dache_main_core_icon|order_container_|dache_main_card_/i.test(key)
    );
    payload.instances = Object.fromEntries(filteredEntries);
  }

  return stringify(parsed) || body;
}

function handleUserCenter(body) {
  const parsed = parseJSON(body);
  if (!parsed || !parsed.data || !parsed.data.instances) return body;

  const allowedCards = ['center_base_info_card', 'center_tool_card', 'center_wallet_finance_card', 'center_order_related_card'];
  const instances = parsed.data.instances;
  parsed.data.instances = Object.fromEntries(
    Object.entries(instances).filter(([key]) => allowedCards.includes(key))
  );

  const walletCard = parsed.data.instances.center_wallet_finance_card;
  if (walletCard && walletCard.data && Array.isArray(walletCard.data.view_info)) {
    const allowedWallet = ['优惠卡券', '余额', '福利金'];
    walletCard.data.view_info = walletCard.data.view_info.filter((entry = {}) => allowedWallet.includes(entry.title));
  }

  return stringify(parsed) || body;
}

function handleIntercity(body) {
  const parsed = parseJSON(body);
  if (!parsed || !parsed.data) return body;

  const allowedNames = ['history_order_card', 'inprogress_order_card', 'station_calendar', 'main_card_v2', 'user_history_order'];
  const components = parsed.data.disorder_components;
  if (Array.isArray(components)) {
    parsed.data.disorder_components = components.filter((component = {}) => allowedNames.includes(component.name));
  }

  return stringify(parsed) || body;
}

function handleDaijia(body) {
  const parsed = parseJSON(body);
  if (!parsed || !parsed.data) return body;

  safeDelete(parsed, ['data', 'variantInfo']);
  if (Array.isArray(parsed.data.list)) {
    parsed.data.list = parsed.data.list.filter((item = {}) => {
      const adFlag = Number(item.isAd);
      return Number.isNaN(adFlag) || adFlag !== 1;
    });
  }

  return stringify(parsed) || body;
}

function handleToggles(body) {
  const parsed = parseJSON(body);
  if (!parsed || !Array.isArray(parsed.data)) return body;

  const disabledNames = [
    'daijia_journey_new_tcp_switch',
    'daijia_tcp_init',
    'daijia_tcp_msg_encrypt',
    'daijia_tcp_site_info',
    'daijia_tcp_site_report'
  ];

  parsed.data = parsed.data.map((entry = {}) => {
    if (!entry || typeof entry !== 'object') {
      logWarn('toggle entry is not object, skip override', entry);
      return entry;
    }
    if (disabledNames.includes(entry.name)) {
      return { ...entry, allow: false };
    }
    return entry;
  });

  return stringify(parsed) || body;
}

function registerHandlers() {
  if (HANDLERS.length > 0) return;
  HANDLERS.push({ pattern: /homepage\/v1\/core/, handler: handleHomepageCore });
  HANDLERS.push({ pattern: /homepage\/v1\/(other\/fast|other\/slow)/, handler: handleHomepageOther });
  HANDLERS.push({ pattern: /gulfstream\/porsche\/v1\//, handler: handlePorsche });
  HANDLERS.push({ pattern: /usercenter\/layout/, handler: handleUserCenter });
  HANDLERS.push({ pattern: /intercity\/ticket\/api\/v1\/core\/getFullPageInfoLayout/, handler: handleIntercity });
  HANDLERS.push({ pattern: /(daijia\.kuaidadi\.com|htwkop\.xiaojukeji\.com):443\/gateway/, handler: handleDaijia });
  HANDLERS.push({ pattern: /as\.xiaojukeji\.com\/ep\/as\/toggles/, handler: handleToggles });
}

function dispatch(body, url) {
  if (!url) return body;
  registerHandlers();
  for (const entry of HANDLERS) {
    if (entry.pattern.test(url)) {
      try {
        const output = entry.handler(body, url);
        return output === undefined ? body : output;
      } catch (err) {
        logWarn('handler failed, fallback to raw body', entry.pattern, err && err.message ? err.message : err);
        return body;
      }
    }
  }
  return body;
}

const originalBody = (typeof $response !== 'undefined' && $response.body) || '';
const requestUrl = (typeof $request !== 'undefined' && $request.url) || '';
const processedBody = dispatch(originalBody, requestUrl);
const finalBody = processedBody ?? originalBody;

$done({ body: finalBody });
