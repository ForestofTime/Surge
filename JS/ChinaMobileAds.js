/*
 * 中国移动 App 响应净化
 * 仅处理模块声明的六个加密接口；解密、结构或加密异常时原样放行。
 */

const DEFAULT_KEY = 'UVic06tpXgMNiApm';
const MODE_2_KEY = 'GS7velkJl5YT1uwQ';
const AES_IV = '9791027341711819';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getHeader(headers, name) {
  const wanted = name.toLowerCase();
  if (Array.isArray(headers)) {
    const entry = headers.find((item) => String(item.field || item.name || '').toLowerCase() === wanted);
    return entry && entry.value;
  }
  const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === wanted);
  return key ? headers[key] : undefined;
}

function getMode(headerName) {
  const value = Number(getHeader($response.headers, headerName));
  return Number.isFinite(value) ? value : 2;
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function importAesKey(mode) {
  const key = mode === 2 ? MODE_2_KEY : DEFAULT_KEY;
  return crypto.subtle.importKey('raw', encoder.encode(key), { name: 'AES-CBC' }, false, [
    'decrypt',
    'encrypt',
  ]);
}

async function decryptResponse(mode) {
  let ciphertext = $response.body;
  if (mode === 1) {
    ciphertext = JSON.parse(ciphertext).body;
  }
  if (typeof ciphertext !== 'string' || !ciphertext) {
    throw new Error('empty ciphertext');
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: encoder.encode(AES_IV) },
    await importAesKey(mode),
    decodeBase64(ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}

async function encryptResponse(payload, mode) {
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: encoder.encode(AES_IV) },
    await importAesKey(mode),
    encoder.encode(JSON.stringify(payload)),
  );
  const body = encodeBase64(new Uint8Array(ciphertext));
  return mode === 1 ? JSON.stringify({ body }) : body;
}

function cleanStartInit(payload) {
  const body = payload && payload.rspBody;
  if (!body || typeof body !== 'object') return false;
  body.startImgurl = '';
  body.actionUrl = '';
  body.riskSwitch = '1';
  body.mZoneSwitchState = '0';
  body.appletLogSwitch = '0';
  body.gsmIsShow = '0';
  body.sdkAdWaitTime = -1;
  return true;
}

function clearList(payload, field) {
  const body = payload && payload.rspBody;
  if (!body || typeof body !== 'object') return false;
  body[field] = [];
  return true;
}

function cleanHomeArea(payload) {
  const areaList = payload && payload.rspBody && payload.rspBody.areaList;
  if (!Array.isArray(areaList)) return false;
  const blockedAreaIds = new Set(['20230710006', '20230710018', '20230710032', '20230710102']);
  for (const area of areaList) {
    if (!area || typeof area !== 'object') continue;
    if (blockedAreaIds.has(String(area.areaId))) {
      area.moduleList = [];
      continue;
    }
    if (Array.isArray(area.moduleList)) {
      area.moduleList = area.moduleList.filter((item) => String(item && item.moduleId) !== '1');
    }
  }
  return true;
}

function cleanNavigation(payload) {
  const list = payload && payload.rspBody && payload.rspBody.classificationList;
  if (!Array.isArray(list)) return false;
  for (const item of list) {
    if (item && typeof item === 'object') item.bannerList = [];
  }
  return true;
}

function cleanPayload(payload, pathname) {
  if (pathname.endsWith('/init/startInit')) return cleanStartInit(payload);
  if (pathname.endsWith('/newTopPullSecond/getNewTopPullList')) return clearList(payload, 'areaList');
  if (pathname.endsWith('/emotionMarket/getEmotionMarketNew')) return clearList(payload, 'pageList');
  if (pathname.endsWith('/homeArea/getTopAreaList')) return cleanHomeArea(payload);
  if (pathname.endsWith('/navigation/getNavigationNewInfo')) return cleanNavigation(payload);
  if (pathname.endsWith('/friendShake/getShakeList')) return clearList(payload, 'friendShakeDbs');
  return false;
}

(async () => {
  try {
    const decryptMode = getMode('x-pen');
    const encryptMode = getMode('r-token');
    const payload = await decryptResponse(decryptMode);
    const pathname = new URL($request.url).pathname;
    if (!cleanPayload(payload, pathname)) {
      $done({});
      return;
    }
    $done({ body: await encryptResponse(payload, encryptMode) });
  } catch (error) {
    console.log(`中国移动去广告：响应透传（${error.message}）`);
    $done({});
  }
})();

