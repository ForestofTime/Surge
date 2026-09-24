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

/**
 * RCS 票抽取：接受裸票（含 |1|RCS|）或 Basic 包裹（解 base64 取末段）。
 * 与 cmcc_ydyp.js ydypHandleRewrite 的抽取规则一致。
 */
function extractRcsTicket(rawAuth) {
  const raw = String(rawAuth || '').trim();
  if (!raw) return '';
  if (raw.indexOf('|1|RCS|') > 0) return raw;
  let t = raw.replace(/^Basic\s+/i, '');
  try {
    const decoded = atob(t);
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
    const decoded = atob(raw);
    const seg = decoded.split(':');
    if (seg.length >= 3 && /^1\d{10}$/.test(seg[1])) return seg[1];
  } catch (_) { /* 非 base64 */ }
  return '';
}

function postReceiver(receiverUrl, payload) {
  if (typeof $httpClient === 'undefined') {
    log('失败: 宿主没有 $httpClient，无法上报');
    return;
  }
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 3,
    policy: 'Tailnet',
  }, (error, response) => {
    if (error) {
      log('上报失败: ' + String(error));
      return;
    }
    const status = response && (response.status || response.statusCode);
    log('上报完成 HTTP=' + status + ' kind=' + (payload.kind || '?') + ' → ' + receiverUrl);
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
  let phone = extractPhoneFromBasic(authorization);
  if (!phone && appNumber) {
    try {
      const decoded = atob(String(appNumber).replace(/^Basic\s+/i, ''));
      if (/^1\d{10}$/.test(decoded)) phone = decoded;
    } catch (_) { /* 非 base64 */ }
  }

  // ② 市场域 JWT：Cookie 里的 jwtToken
  const jwt = extractJwt(cookie);

  if (ticket) {
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

  if (jwt && jwt.length <= 4096) {
    log('捕获 jwtToken (' + jwt.length + '位)');
    postReceiver(receiverUrl, { kind: 'jwt', jwt: jwt, url: url.slice(0, 256) });
  }

  if (!ticket && !jwt) log('本请求无可捕获凭据: ' + url.slice(0, 120));
  return $done({});
})();
