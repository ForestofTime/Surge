const TARGET_DNS_HOSTS = new Set([
  'guide-acs.m.taobao.com',
  'acs4miniapp-inner.m.taobao.com',
  'guide-acs4miniapp-inner.m.taobao.com',
  'netflow-mtop.cainiao.com',
]);
const TARGET_AD_IDS = new Set(['1308', '205', '1381', '2018']);
const AD_ID_FIELDS = ['id', 'positionId', 'adId', 'slotId', 'pitId'];
const requestUrl = String(($request && $request.url) || '');
const requestHeaders = ($request && $request.headers) || {};
const userAgent = String(requestHeaders['User-Agent'] || requestHeaders['user-agent'] || '');
let result = {};

try {
  if (isAmdcRequest(requestUrl) && isTaobaoUserAgent(userAgent)) {
    result = cleanAmdcResponse(String($response.body || ''));
  } else if (isAdvertisementRequest(requestUrl)) {
    result = cleanMshowResponse(String($response.body || ''));
  }
} catch (_) {
  result = {};
}

$done(result);

function isAmdcRequest(url) {
  return /\/amdc\/mobileDispatch(?:\?|$)/i.test(url) && /[?&]appkey=21380790(?:&|$)/.test(url);
}

function isTaobaoUserAgent(ua) {
  return /(?:淘宝|%E6%B7%98%E5%AE%9D)\//i.test(ua);
}

function isAdvertisementRequest(url) {
  return /\/gw\/mtop\.cainiao\.guoguo\.nbnetflow\.ads\.(?:mshow(?:\.cn)?|show(?:\.login)?)(?:\/|\?|$)/i.test(url);
}

function cleanAmdcResponse(body) {
  const decoded = decodeJsonBody(body);
  if (!removeTargetDnsEntries(decoded.value)) return {};

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

function removeTargetDnsEntries(payload) {
  if (!payload || typeof payload !== 'object' || !payload.dns) return false;

  if (Array.isArray(payload.dns)) {
    const filtered = payload.dns.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      const host = entry.host || entry.domain || entry.hostname;
      return !TARGET_DNS_HOSTS.has(String(host || '').toLowerCase());
    });
    if (filtered.length === payload.dns.length) return false;
    payload.dns = filtered;
    return true;
  }

  if (typeof payload.dns === 'object') {
    let changed = false;
    for (const key of Object.keys(payload.dns)) {
      if (!TARGET_DNS_HOSTS.has(key.toLowerCase())) continue;
      delete payload.dns[key];
      changed = true;
    }
    return changed;
  }

  return false;
}

function cleanMshowResponse(body) {
  const payload = JSON.parse(body);
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    return {};
  }

  let changed = false;
  const presentTargetIds = Array.from(TARGET_AD_IDS).filter((id) => {
    return Object.prototype.hasOwnProperty.call(payload.data, id);
  });
  payload.data = cleanAdArrays(payload.data, () => {
    changed = true;
  });
  for (const id of presentTargetIds) {
    if (!Array.isArray(payload.data[id]) || payload.data[id].length !== 0) {
      payload.data[id] = [];
      changed = true;
    }
  }
  return changed ? { body: JSON.stringify(payload) } : {};
}

function cleanAdArrays(value, markChanged) {
  if (Array.isArray(value)) {
    const output = [];
    for (const item of value) {
      if (hasTargetAdId(item)) {
        markChanged();
        continue;
      }
      output.push(cleanAdArrays(item, markChanged));
    }
    return output;
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (TARGET_AD_IDS.has(key)) {
        delete value[key];
        markChanged();
        continue;
      }
      value[key] = cleanAdArrays(value[key], markChanged);
    }
  }
  return value;
}

function hasTargetAdId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return AD_ID_FIELDS.some((field) => {
    return Object.prototype.hasOwnProperty.call(value, field) &&
      TARGET_AD_IDS.has(String(value[field]));
  });
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
  let binary = encoded.replace(/%([0-9A-F]{2})/gi, (_, value) => {
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
