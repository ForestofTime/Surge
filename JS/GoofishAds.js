const GOOFISH_APP_KEY = '12431167';
const GOOFISH_DNS_HOSTS = new Set([
  'acs.m.goofish.com',
  'g-acs.m.goofish.com',
]);
const requestUrl = String(($request && $request.url) || '');
const requestHeaders = ($request && $request.headers) || {};
const userAgent = String(requestHeaders['User-Agent'] || requestHeaders['user-agent'] || '');
let result = {};

try {
  if (isGoofishAmdcRequest(requestUrl, userAgent)) {
    result = cleanAmdcResponse(String($response.body || ''));
  } else {
    result = cleanApiResponse(requestUrl, String($response.body || ''));
  }
} catch (_) {
  result = {};
}

$done(result);

function isGoofishAmdcRequest(url, ua) {
  return /\/amdc\/mobileDispatch(?:\?|$)/i.test(url) &&
    new RegExp('[?&]appkey=' + GOOFISH_APP_KEY + '(?:&|$)').test(url) &&
    /(?:闲鱼|%E9%97%B2%E9%B1%BC)\//i.test(ua);
}

function cleanAmdcResponse(body) {
  const decoded = decodeJsonBody(body);
  if (!removeGoofishDnsEntries(decoded.value)) return {};

  const json = JSON.stringify(decoded.value);
  return { body: decoded.encoding === 'base64' ? encodeBase64Utf8(json) : json };
}

function decodeJsonBody(body) {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return { encoding: 'plain', value: JSON.parse(body) };
  }
  return { encoding: 'base64', value: JSON.parse(decodeBase64Utf8(trimmed)) };
}

function removeGoofishDnsEntries(payload) {
  if (!payload || typeof payload !== 'object' || !payload.dns) return false;

  if (Array.isArray(payload.dns)) {
    const filtered = payload.dns.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      const host = entry.host || entry.domain || entry.hostname;
      return !GOOFISH_DNS_HOSTS.has(String(host || '').toLowerCase());
    });
    if (filtered.length === payload.dns.length) return false;
    payload.dns = filtered;
    return true;
  }

  if (typeof payload.dns === 'object') {
    let changed = false;
    for (const key of Object.keys(payload.dns)) {
      if (!GOOFISH_DNS_HOSTS.has(key.toLowerCase())) continue;
      delete payload.dns[key];
      changed = true;
    }
    return changed;
  }

  return false;
}

function cleanApiResponse(url, body) {
  const match = url.match(/\/gw\/([^/?]+)(?:\/|\?|$)/i);
  if (!match) return {};

  const payload = JSON.parse(body);
  const data = payload && payload.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  let changed = false;
  switch (match[1].toLowerCase()) {
    case 'mtop.taobao.idle.user.strategy.list':
      data.strategies = [{}];
      changed = true;
      break;
    case 'mtop.taobao.idlehome.home.circle.list':
      changed = filterArray(data, 'circleList', (item) => item && item.bizCode !== 'saveMoney');
      break;
    case 'mtop.taobao.idlehome.home.nextfresh':
      if (Array.isArray(data.homeTopList) && data.homeTopList.length > 1) {
        data.homeTopList = [data.homeTopList[0]];
        changed = true;
      }
      changed = filterArray(data, 'sections', isItemSection) || changed;
      break;
    case 'mtop.taobao.idlemtopsearch.search.shade':
      data.singleShadeWords = [{}];
      changed = true;
      break;
    case 'mtop.taobao.idlemtopsearch.item.search.activate':
      data.cardList = [{}];
      changed = true;
      break;
    case 'mtop.taobao.idlemtopsearch.search.discover':
      if (Object.prototype.hasOwnProperty.call(data, 'resultList')) {
        delete data.resultList;
        changed = true;
      }
      break;
    case 'mtop.idle.user.page.my.adapter':
      data.ability = [];
      changed = true;
      if (data.container && typeof data.container === 'object') {
        changed = filterArray(data.container, 'sections', (item) => {
          return item && /head|user|trade/.test(String(item.sectionBizCode || ''));
        }) || changed;
      }
      break;
    case 'mtop.taobao.idle.item.buy.feeds':
      if (Object.prototype.hasOwnProperty.call(data, 'sections')) {
        delete data.sections;
        changed = true;
      }
      break;
    case 'mtop.taobao.idle.local.home':
      changed = filterArray(data, 'sections', isItemSection);
      break;
    case 'mtop.taobao.idlemtopsearch.search':
      changed = filterArray(data, 'resultList', (item) => {
        return getNested(item, ['data', 'item', 'main', 'clickParam', 'args', 'biz_type']) === 'item';
      });
      break;
    case 'mtop.taobao.idle.item.recommend':
      changed = filterArray(data, 'cardList', (item) => {
        return getNested(item, ['cardData', 'bizType']) !== 'mamaAD';
      });
      break;
    default:
      return {};
  }

  return changed ? { body: JSON.stringify(payload) } : {};
}

function filterArray(container, key, predicate) {
  if (!container || !Array.isArray(container[key])) return false;
  const source = container[key];
  const filtered = source.filter(predicate);
  if (filtered.length === source.length) return false;
  container[key] = filtered;
  return true;
}

function isItemSection(item) {
  return getNested(item, ['data', 'bizType']) === 'item';
}

function getNested(value, keys) {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function decodeBase64Utf8(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = input.replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('invalid base64');
  }

  let binary = '';
  let buffer = 0;
  let bits = 0;
  for (const char of normalized.replace(/=+$/, '')) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('invalid base64');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits < 8) continue;
    bits -= 8;
    binary += String.fromCharCode((buffer >> bits) & 0xff);
  }

  let percentEncoded = '';
  for (let index = 0; index < binary.length; index += 1) {
    percentEncoded += '%' + binary.charCodeAt(index).toString(16).padStart(2, '0');
  }
  return decodeURIComponent(percentEncoded);
}

function encodeBase64Utf8(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const encoded = encodeURIComponent(input);
  const binary = encoded.replace(/%([0-9A-F]{2})/gi, (_, value) => {
    return String.fromCharCode(parseInt(value, 16));
  });
  let output = '';

  for (let index = 0; index < binary.length; index += 3) {
    const a = binary.charCodeAt(index);
    const hasB = index + 1 < binary.length;
    const hasC = index + 2 < binary.length;
    const b = hasB ? binary.charCodeAt(index + 1) : 0;
    const c = hasC ? binary.charCodeAt(index + 2) : 0;
    const value = (a << 16) | (b << 8) | c;

    output += alphabet[(value >> 18) & 63];
    output += alphabet[(value >> 12) & 63];
    output += hasB ? alphabet[(value >> 6) & 63] : '=';
    output += hasC ? alphabet[value & 63] : '=';
  }

  return output;
}
