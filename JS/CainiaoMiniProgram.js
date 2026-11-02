// 菜鸟淘宝小程序去广告：保留业务数据，定向清理红包模型和商品推广流。
const TARGET_DNS_HOSTS = new Set([
  'guide-acs.m.taobao.com',
  'acs4miniapp-inner.m.taobao.com',
  'guide-acs4miniapp-inner.m.taobao.com',
  'netflow-mtop.cainiao.com',
  'netflow-reply-mtop.cainiao.com',
]);
const requestUrl = String(($request && $request.url) || '');
const requestHeaders = ($request && $request.headers) || {};
const userAgent = String(requestHeaders['User-Agent'] || requestHeaders['user-agent'] || '');
const hasResponse = typeof $response !== 'undefined' && $response;
let result = {};

try {
  if (!hasResponse && isCacheSensitiveAdvertisementRequest(requestUrl)) {
    result = buildEmptyAdvertisementResponse(requestUrl);
  } else if (hasResponse && isAmdcRequest(requestUrl) && isTaobaoUserAgent(userAgent)) {
    result = cleanAmdcResponse(String($response.body || ''));
  } else if (hasResponse && isScopedMiniFeedRequest(requestUrl, requestHeaders)) {
    result = cleanMiniFeedResponse(requestUrl, String($response.body || ''));
  } else if (hasResponse && isBatchAdvertisementRequest(requestUrl)) {
    result = cleanBatchShowResponse(String($response.body || ''));
  } else if (hasResponse && isMshowRequest(requestUrl)) {
    result = cleanMshowResponse(String($response.body || ''));
  } else if (hasResponse && isAdvertisementRequest(requestUrl)) {
    result = cleanShowResponse(String($response.body || ''));
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
  return /\/gw\/mtop\.cainiao\.guoguo\.nbnetflow\.ads\.(?:mshow(?:\.cn)?|show(?:\.login)?|batch\.show)(?:\/|\?|$)/i.test(url);
}

function isBatchAdvertisementRequest(url) {
  return /\/gw\/mtop\.cainiao\.guoguo\.nbnetflow\.ads\.batch\.show(?:\/|\?|$)/i.test(url);
}

function isMshowRequest(url) {
  return /\/gw\/mtop\.cainiao\.guoguo\.nbnetflow\.ads\.mshow(?:\.cn)?(?:\/|\?|$)/i.test(url);
}

function isCacheSensitiveAdvertisementRequest(url) {
  return /\/gw\/mtop\.cainiao\.guoguo\.nbnetflow\.ads\.(?:show(?:\.login)?|batch\.show)(?:\/|\?|$)/i.test(url);
}

function buildEmptyAdvertisementResponse(url) {
  const match = url.match(
    /\/gw\/(mtop\.cainiao\.guoguo\.nbnetflow\.ads\.(?:show(?:\.login)?|batch\.show))\/([^/?]+)/i
  );
  if (!match) return {};

  const api = match[1].toLowerCase();
  const data = api.endsWith('.batch.show') ? emptyBatchPlacements(url) : { result: [] };
  return {
    response: {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        api,
        data,
        ret: ['SUCCESS::调用成功'],
        v: match[2],
      }),
    },
  };
}

function emptyBatchPlacements(url) {
  const encodedData = queryParameter(url, 'data');
  if (!encodedData) return {};

  const requestData = JSON.parse(decodeURIComponent(encodedData.replace(/\+/g, '%20')));
  const pitItems = JSON.parse(requestData.pitItemList || '[]');
  const output = {};
  for (const item of pitItems) {
    if (!item || item.pit === undefined || item.pit === null) continue;
    output[String(item.pit)] = [];
  }
  return output;
}

function queryParameter(url, name) {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return '';
  for (const part of url.slice(queryIndex + 1).split('&')) {
    const separator = part.indexOf('=');
    const key = separator < 0 ? part : part.slice(0, separator);
    if (key === name) return separator < 0 ? '' : part.slice(separator + 1);
  }
  return '';
}

function isScopedMiniFeedRequest(url, headers) {
  if (!/^https?:\/\/(?:guide-acs\.m\.taobao\.com|acs4miniapp-inner\.m\.taobao\.com|guide-acs4miniapp-inner\.m\.taobao\.com|acs\.m\.taobao\.com|netflow-mtop\.cainiao\.com|netflow-reply-mtop\.cainiao\.com)\/gw\/(?:mtop\.taote\.interaction\.ifgateway\.copper|mtop\.tmall\.kangaroo\.core\.service\.route\.aldlampservicefixedresv2)\/1\.0\/(?:\?|$)/i.test(url)) return false;
  const key = Object.keys(headers || {}).find(k => k.toLowerCase() === 'x-appkey');
  return !!key && String(headers[key]) === '21380790';
}

function cleanMiniFeedResponse(url, body) {
  const raw = queryParameter(url, 'data');
  if (!raw) return {};
  const request = JSON.parse(decodeURIComponent(raw.replace(/\+/g, '%20')));
  const payload = JSON.parse(body);
  if (!payload || !payload.data || typeof payload.data !== 'object') return {};
  if (/\/mtop\.taote\.interaction\.ifgateway\.copper\//i.test(url)) {
    if (request.bizCode !== 'dailyRedPacket' || request.bizType !== 'dailyRedPacket') return {};
    const models = typeof request.models === 'string' ? JSON.parse(request.models) : request.models;
    if (!Array.isArray(models) || !models.some(item => item && item.assetType === 'biz-cainiaoMiniQuery')) return {};
    if (!Array.isArray(payload.data.models)) return {};
    const filtered = payload.data.models.filter(item => !(item && item.assetType === 'biz-cainiaoMiniQuery' && item.data && Array.isArray(item.data.awardBOList)));
    if (filtered.length === payload.data.models.length) return {};
    payload.data.models = filtered;
    return { body: JSON.stringify(payload) };
  }
  if (String(request.bizId) !== '20240729' || String(request.resId) !== '38684820') return {};
  const slot = payload.data.resultValue && payload.data.resultValue[String(request.resId)];
  if (!slot || !Array.isArray(slot.data)) return {};
  let changed = false;
  for (const item of slot.data) {
    const feed = item && item.commonChannelFeeds;
    if (!feed || feed.name !== 'commonChannelFeeds' || !Array.isArray(feed.itemList) || feed.itemList.length === 0) continue;
    feed.itemList = [];
    changed = true;
  }
  if (!changed) return {};
  if (typeof slot.bottom === 'string') slot.bottom = 'true';
  else if (typeof slot.bottom === 'boolean') slot.bottom = true;
  return { body: JSON.stringify(payload) };
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
      return !TARGET_DNS_HOSTS.has(String(host || '').toLowerCase()) && !isSharedNativeRoute(host, entry);
    });
    if (filtered.length === payload.dns.length) return false;
    payload.dns = filtered;
    return true;
  }

  if (typeof payload.dns === 'object') {
    let changed = false;
    for (const key of Object.keys(payload.dns)) {
      if (!TARGET_DNS_HOSTS.has(key.toLowerCase()) && !isSharedNativeRoute(key, payload.dns[key])) continue;
      delete payload.dns[key];
      changed = true;
    }
    return changed;
  }

  return false;
}

function isSharedNativeRoute(host, entry) {
  if (String(host || '').toLowerCase() !== 'acs.m.taobao.com' || !entry || !Array.isArray(entry.servers)) return false;
  return entry.servers.some(server => Array.isArray(server && server.channels) && server.channels.some(channel =>
    Array.isArray(channel && channel.attributes) && channel.attributes.some(attribute =>
      attribute && (attribute.publickey === 'acs' || /^(?:http3|spdy)$/i.test(String(attribute.protocol || ''))))));
}

function cleanMshowResponse(body) {
  const payload = JSON.parse(body);
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    return {};
  }

  let changed = false;
  for (const key of Object.keys(payload.data)) {
    if (!/^\d+$/.test(key) || !Array.isArray(payload.data[key])) continue;
    for (const item of payload.data[key]) {
      const mapper = item && item.materialContentMapper;
      if (!mapper || typeof mapper !== 'object' || Array.isArray(mapper)) continue;
      const fields = Object.keys(mapper).filter(k => k !== 'advRecGmtModifiedTime');
      if (fields.length !== 1 || fields[0] !== 'visible') continue;
      if (mapper.visible === 'true') { mapper.visible = 'false'; changed = true; }
      else if (mapper.visible === true) { mapper.visible = false; changed = true; }
    }
    const filtered = payload.data[key].filter((item) => !hasPromotionalPresentation(item));
    if (filtered.length === payload.data[key].length) continue;
    payload.data[key] = filtered;
    changed = true;
  }
  return changed ? { body: JSON.stringify(payload) } : {};
}

function hasPromotionalPresentation(item) {
  const mapper = item && item.materialContentMapper;
  if (!mapper || typeof mapper !== 'object' || Array.isArray(mapper)) return false;
  const keys = Object.keys(mapper)
    .map((key) => key.toLowerCase())
    .filter((key) => key !== 'advrecgmtmodifiedtime');
  const keySet = new Set(keys);

  return keys.some((key) => key.startsWith('floatview')) ||
    (keySet.has('image') && keySet.has('link')) ||
    (keySet.has('mainpic') && keySet.has('btnpic') && keySet.has('link')) ||
    (keys.length === 1 && keySet.has('label'));
}

function cleanShowResponse(body) {
  const payload = JSON.parse(body);
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    return {};
  }
  if (!Array.isArray(payload.data.result) || payload.data.result.length === 0) return {};
  payload.data.result = [];
  return { body: JSON.stringify(payload) };
}

function cleanBatchShowResponse(body) {
  const payload = JSON.parse(body);
  if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
    return {};
  }

  let changed = false;
  for (const key of Object.keys(payload.data)) {
    if (!Array.isArray(payload.data[key]) || payload.data[key].length === 0) continue;
    payload.data[key] = [];
    changed = true;
  }
  return changed ? { body: JSON.stringify(payload) } : {};
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
