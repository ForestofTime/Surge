/* Relays China Mobile cloud-disk (移动云盘) auth artifacts to a private Mac Tailnet receiver.
 *
 * 捕获两类凭据（与 cmcc_ydyp.js 的槽位一一对应）：
 *   1. rcs    —— RCS 票（Authorization: Basic base64("mobile:<手机号>:<票>")，票内含 |1|RCS|<时间戳>|）
 *                来源：任意 *.yun.139.com / mcloud.139.com 业务请求的 authorization / app_auth 头
 *   2. jwt    —— 云盘市场域 JWT（Cookie: jwtToken=<jwt>）
 *                来源：m.mcloud.139.com / caiyun.feixin.10086.cn 请求的 Cookie 头
 * 一律只转发值本身，解密/校验/入库全在 Mac 接收器做（Surge JSC 无 Buffer/atob）。
 */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/cmcc-ydyp';
var LOG_TAG = '[CMCCYDYP]';
// v3 内存治理：同值凭据在冷却窗口内只上报一次，避免 App 内连点海量重复 POST 堆积爆内存。
var COOLDOWN_SECONDS = 60;
var STORE_KEY_PREFIX = 'cmcc_ydyp_dedup_';

function log(message) {
  try { console.log(LOG_TAG + ' ' + message); } catch (_) { /* 无 console 时忽略 */ }
}

function argumentValue(name) {
  if (typeof $argument === 'object' && $argument !== null) return $argument[name];
  if (typeof $argument !== 'string') return undefined;
  for (const part of $argument.split('&')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1));
  }
  return undefined;
}

function validReceiver(value) {
  return typeof value === 'string'
    && /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/cmcc-ydyp$/i.test(value);
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const lower = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === lower) return String(headers[key] || '');
  }
  return '';
}

/** 持久化读（Surge $persistentStore / QX $prefs 兜底）。 */
function storeGet(key) {
  try {
    if (typeof $persistentStore !== 'undefined' && $persistentStore && $persistentStore.read) {
      return $persistentStore.read(key) || '';
    }
    if (typeof $prefs !== 'undefined' && $prefs && $prefs.valueForKey) {
      return $prefs.valueForKey(key) || '';
    }
  } catch (_) { }
  return '';
}

/** 持久化写（Surge $persistentStore / QX $prefs 兜底）。 */
function storeSet(key, value) {
  try {
    if (typeof $persistentStore !== 'undefined' && $persistentStore && $persistentStore.write) {
      return $persistentStore.write(value, key);
    }
    if (typeof $prefs !== 'undefined' && $prefs && $prefs.setValueForKey) {
      return $prefs.setValueForKey(value, key);
    }
  } catch (_) { }
  return false;
}

/** djb2 指纹（仅去重，非加密）。 */
function fingerprint(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return 'f' + h.toString(36);
}

/** 去重+节流：同 kind+指纹在 COOLDOWN_SECONDS 内只允许一次，返回是否放行（并记录时间戳）。 */
function shouldReport(kind, value) {
  if (!value) return false;
  const key = STORE_KEY_PREFIX + kind + '_' + fingerprint(value);
  const now = Math.floor(Date.now() / 1000);
  const prev = parseInt(storeGet(key) || '0', 10) || 0;
  if (now - prev < COOLDOWN_SECONDS) return false;
  storeSet(key, String(now));
  return true;
}

/**
 * RCS 票抽取：接受裸票（含 |1|RCS|）或 Basic 包裹（解 base64 取末段）。
 * 与 cmcc_ydyp.js ydypHandleRewrite 的抽取规则一致。
 */
function decodeBase64(value) {
  const text = String(value).replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.replace(/=+$/, '').length % 4 === 1
      || (text.includes('=') && text.length % 4 !== 0)) throw new Error('Invalid base64');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0, buffer = 0, output = '';
  for (const char of text.replace(/=+$/, '')) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 255);
    }
  }
  return output;
}

function extractRcsTicket(rawAuth) {
  const raw = String(rawAuth || '').trim();
  if (!raw) return '';
  if (raw.indexOf('|1|RCS|') > 0) return raw;
  let t = raw.replace(/^Basic\s+/i, '');
  try {
    const decoded = decodeBase64(t);
    if (decoded && decoded.indexOf(':') > 0) {
      const seg = decoded.split(':');
      t = seg[seg.length - 1];
    }
  } catch (_) { /* 非 base64，按原样处理 */ }
  if (t && t.indexOf('|1|RCS|') > 0) return t;
  return '';
}

/** 从 Cookie 头取 jwtToken（取最新未过期的由接收器校验，这里只取值）。 */
function extractJwt(rawCookie) {
  const match = /(?:^|;\s*)jwtToken=([^;]+)/i.exec(String(rawCookie || ''));
  if (!match) return '';
  try { return decodeURIComponent(match[1]).trim(); } catch (_) { return match[1].trim(); }
}

/** Basic 内层的手机号（mobile:<手机号>:<票> 的第二段）。 */
function extractPhoneFromBasic(rawAuth) {
  const raw = String(rawAuth || '').trim().replace(/^Basic\s+/i, '');
  if (!raw) return '';
  try {
    const decoded = decodeBase64(raw);
    const seg = decoded.split(':');
    if (seg.length >= 3 && /^1\d{10}$/.test(seg[1])) return seg[1];
  } catch (_) { /* 非 base64 */ }
  return '';
}

function notifyCapture(title, subtitle, body) {
  try {
    const args = [title, subtitle, body];
    for (let i = 0; i < 3; i++) args[i] = args[i] == null ? '' : String(args[i]);
    if (typeof $notification !== 'undefined' && $notification && $notification.post) $notification.post.apply($notification, args);
    else if (typeof $notify !== 'undefined') $notify.apply(null, args);
  } catch (_) { }
}

function postReceiver(receiverUrl, payload) {
  let settled = false;
  const finish = () => { if (settled) return; settled = true; };
  // 兜底: 上报再慢也不能拖住原请求放行 (tailnet 冷启动握手可超 3s)
  setTimeout(finish, 1200);
  if (typeof $httpClient === 'undefined') {
    log('失败: 宿主没有 $httpClient，无法上报');
    return;
  }
  // v2: 不再显式指定 policy —— 手机配置里若不存在同名策略组会导致上报静默失败。
  // taila66285.ts.net 已由 Surge Tailscale 集成的 MagicDNS 分流规则兜底。
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 8,
  }, (error, response) => {
    const status = response && (response.status || response.statusCode);
    const kind = payload.kind === 'rcs' ? '云盘 RCS 票' : '云盘 JWT';
    if (error) {
      log('上报失败: ' + String(error));
      notifyCapture('移动云盘凭据同步失败', kind, 'receiver 不可达: ' + String(error).slice(0, 80));
      return;
    }
    const ok = status >= 200 && status < 300;
    log('上报完成 HTTP=' + status + ' kind=' + (payload.kind || '?') + ' → ' + receiverUrl);
    notifyCapture(ok ? '移动云盘凭据已同步' : '移动云盘凭据同步失败', kind,
      ok ? '凭据已上报 Mac receiver → 青龙' : 'receiver HTTP=' + status);
    finish();
  });
}

(() => {
  const configuredReceiver = argumentValue('receiver_url');
  const receiverUrl = validReceiver(configuredReceiver) ? configuredReceiver : DEFAULT_RECEIVER_URL;
  if (!validReceiver(receiverUrl)) {
    log('跳过: receiver_url 不合法 (' + String(receiverUrl) + ')');
    return $done({});
  }

  const url = String(($request && $request.url) || '');
  if (!url) return $done({});

  const headers = ($request && $request.headers) || {};
  const authorization = headerValue(headers, 'authorization');
  const appAuth = headerValue(headers, 'app_auth') || headerValue(headers, 'app-auth');
  const cookie = headerValue(headers, 'cookie');
  const appNumber = headerValue(headers, 'app_number') || headerValue(headers, 'app-number');

  // ① RCS 票：authorization 优先，app_auth 兜底（便签域同型）
  let ticket = extractRcsTicket(authorization) || extractRcsTicket(appAuth);
  let phone = extractPhoneFromBasic(authorization) || extractPhoneFromBasic(appAuth);
  if (!phone && appNumber) {
    try {
      const decoded = decodeBase64(String(appNumber).replace(/^Basic\s+/i, ''));
      if (/^1\d{10}$/.test(decoded)) phone = decoded;
    } catch (_) { /* 非 base64 */ }
  }

  // ② 市场域 JWT：Cookie 里的 jwtToken
  const jwt = extractJwt(cookie);

  // v3 去重+节流：同值凭据在冷却窗口内不再上报（App 内连点不再海量重复 POST）
  const rcsOk = ticket && shouldReport('rcs', ticket);
  const jwtOk = jwt && shouldReport('jwt', jwt);

  if (rcsOk) {
    const payload = { kind: 'rcs', ticket: ticket, url: url.slice(0, 256) };
    if (phone) payload.phone = phone;
    if (payload.ticket.length <= 4096) {
      log('捕获 RCS 票 ' + payload.ticket.slice(0, 8) + '...' + payload.ticket.slice(-4)
        + ' (' + payload.ticket.length + '位)' + (phone ? ' phone=' + phone.slice(0, 3) + '****' + phone.slice(-4) : ''));
      postReceiver(receiverUrl, payload);
    } else {
      log('跳过: 票长度异常 ' + payload.ticket.length);
    }
  }

  if (jwtOk && jwt.length <= 4096) {
    log('捕获 jwtToken (' + jwt.length + '位)');
    postReceiver(receiverUrl, { kind: 'jwt', jwt: jwt, url: url.slice(0, 256) });
  }

  if ((ticket || jwt) && !rcsOk && !jwtOk) {
    // 有凭据但被冷却节流：静默跳过（不刷日志，避免连点时日志也堆积）
  } else if (!ticket && !jwt) {
    log('本请求无可捕获凭据: ' + url.slice(0, 120));
  }

  // 立即放行原请求（上报异步，不阻塞）
  return $done({});
})();
