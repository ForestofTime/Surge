/**
 * 中国移动广东 ECOP 会话抓取 — Surge 版 v1（Tailnet receiver 落库）
 *
 * 背景：转盘/秒杀等广东活动的业务口 `/ecop/app/act/*` 硬要求一份 **ECOP 会话**
 *   （Cookie 里带 `token=…; JSESSIONID=…; appId=…`）。而铸这份会话的唯一入口
 *   `/ecop/common/sso/groupAppTokenLogin` 自 2026-09-27 起对所有脚本侧输入
 *   一律回「单点登录异常」—— 换端工具箱这条路被服务端关死了。
 *   唯一还活着的来源：真机 App 里打开一次活动页，让 App 自己走完登录，
 *   它拿到的那份会话是有效的。本模块就是把它捞出来。
 *
 * 两个捕获点（互补，命中任一即可）：
 *   ① http-request  ^/ech/ecop/app/act/         —— 业务请求自带的 Cookie（活会话，最直接）
 *   ② http-response ^/ech/ecop/common/sso/groupAppTokenLogin —— 登录响应的 Set-Cookie（会话刚铸好）
 *   两处都要求 Cookie/Set-Cookie 里出现 `token=`，否则不报（避免上报半截挑战 cookie）。
 *
 * 落库：POST Mac Tailnet receiver（cmcc-ecop-receiver.js，/cmcc-ecop）
 *   → receiver 写青龙 env `cmcc_ck` + 同步 preload/env.sh + 即时触发转盘 cron
 *   （ECOP 会话是短效的，必须当场消费，不能等定时）
 *
 * receiver 地址三源：模块参数 receiver_url > $persistentStore 键 Ecop_Receiver_URL > 内置默认
 *
 * 隐私：本脚本不含任何凭据；会话只在运行时经 Tailnet 送往本机 receiver，不进仓库/日志。
 */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/cmcc-ecop';

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
    && /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/cmcc-ecop$/i.test(value);
}

function notifyCapture(title, subtitle, body) {
  try {
    const args = [title, subtitle, body];
    for (let i = 0; i < 3; i++) args[i] = args[i] == null ? '' : String(args[i]);
    if (typeof $notification !== 'undefined' && $notification && $notification.post) $notification.post.apply($notification, args);
    else if (typeof $notify !== 'undefined') $notify.apply(null, args);
  } catch (_) { }
}

function log(line) { try { console.log('[cmcc-ecop] ' + line); } catch (_) { } }

/** 从 Set-Cookie 头（可能是数组）里拼出 cookie 串 */
function setCookieText(headers) {
  let sc = '';
  for (const k of Object.keys(headers || {})) {
    if (k.toLowerCase() !== 'set-cookie') continue;
    const v = headers[k];
    sc += (sc ? '; ' : '') + (Array.isArray(v) ? v.join('; ') : String(v));
  }
  return sc;
}

/** 抽指定 cookie 值 */
function cookieValue(text, name) {
  const m = new RegExp('(?:^|[;,]\\s*)' + name + '=([^;,]*)').exec(String(text || ''));
  return m ? m[1] : '';
}

/**
 * 从 ECOP cookie 串里抠手机号。
 * 会话里的 UC 字段形如 `…&…&…&<11位号码>`，exchange() 取的就是 split('&')[3]。
 */
function phoneFromCookie(text) {
  const uc = cookieValue(text, 'UC');
  if (!uc) return '';
  const seg = uc.split('&')[3] || '';
  const digits = String(seg).replace(/\D/g, '');
  return /^1\d{10}$/.test(digits) ? digits : '';
}

/** 把 cookie 串规整成脚本 buildCookieString 认的形态（只保留有值的键） */
function normalizeCookie(text) {
  const out = [];
  const seen = {};
  for (const part of String(text || '').split(/[;,]/)) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || !v) continue;
    // 丢掉带属性的杂项（Path/Expires/Domain/HttpOnly/Secure/SameSite/Max-Age）
    if (/^(path|expires|domain|httponly|secure|samesite|max-age|comment)$/i.test(k)) continue;
    if (seen[k]) continue;
    seen[k] = 1;
    out.push(k + '=' + v);
  }
  return out.join('; ');
}

function postReceiver(receiverUrl, payload) {
  let settled = false;
  const finish = () => { if (!settled) { settled = true; try { $done({}); } catch (_) { } } };
  // 兜底：上报再慢也不能拖住原请求放行（tailnet 冷启动握手可超 3s）
  setTimeout(finish, 1200);
  if (typeof $httpClient === 'undefined') {
    log('ERROR: $httpClient unavailable (not in Surge engine?)');
    finish();
    return;
  }
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 8,
    policy: 'Tailnet',
  }, (error, response, data) => {
    const status = response && (response.status || response.statusCode);
    if (error) {
      log('POST failed: ' + JSON.stringify(error).slice(0, 200));
      notifyCapture('移动 ECOP 会话抓取失败', 'phase=' + (payload.phase || '?'), 'receiver 不可达: ' + String(error).slice(0, 80));
    } else {
      log('POST ' + receiverUrl + ' → HTTP ' + (response ? response.status : '?'));
      if (!(status >= 200 && status < 300)) {
        notifyCapture('移动 ECOP 会话抓取异常', 'phase=' + (payload.phase || '?'), 'receiver HTTP=' + status);
      } else {
        let tail = '';
        try { tail = (JSON.parse(String(data || '{}')).tail) || ''; } catch (_) { }
        notifyCapture('移动 ECOP 会话已同步', tail ? ('[尾号' + tail + '] ✅ 转盘已触发') : '✅ 已写入青龙');
      }
    }
    finish();
  });
}

(() => {
  const url = String(($request && $request.url) || '');
  log('script fired: ' + url.slice(0, 140));

  const configuredReceiver = argumentValue('receiver_url');
  const receiverUrl = configuredReceiver === undefined || configuredReceiver === ''
    ? DEFAULT_RECEIVER_URL
    : configuredReceiver;
  if (!validReceiver(receiverUrl) || !url) {
    log('SKIP: invalid receiver_url or no request url');
    $done({});
    return;
  }

  // 判定相位：有 $response 就是响应相位
  const isResponse = typeof $response !== 'undefined' && $response !== null;

  let phase = '';
  let cookieText = '';
  let path = '';
  let host = '';

  try {
    const m = /^https?:\/\/([^/?#]+)([^?#]*)/.exec(url) || [];
    host = String(m[1] || '').replace(/:\d+$/, '');
    path = String(m[2] || '');
  } catch (_) { }

  // 主机白名单：模块 pattern 已限定，这里再挡一层（receiver 信任上报内容）
  if (host !== 'wap.gd.10086.cn') {
    log('SKIP: host not wap.gd.10086.cn (' + host + ')');
    $done({});
    return;
  }

  if (isResponse) {
    // ② 登录响应的 Set-Cookie
    if (!/\/ecop\/common\/sso\/groupAppTokenLogin$/.test(path)) { log('SKIP: response not groupAppTokenLogin'); $done({}); return; }
    phase = 'login-response';
    cookieText = setCookieText(($response && $response.headers) || {});
  } else {
    // ① 业务请求自带的 Cookie
    if (!/\/ecop\/app\/act\//.test(path)) { log('SKIP: request not ecop app/act'); $done({}); return; }
    phase = 'biz-request';
    const hdrs = ($request && $request.headers) || {};
    for (const k of Object.keys(hdrs)) {
      if (k.toLowerCase() === 'cookie') { cookieText += (cookieText ? '; ' : '') + String(hdrs[k] || ''); }
    }
  }

  const cookie = normalizeCookie(cookieText);
  if (!/token=/.test(cookie)) {
    log('SKIP: 无 token= (' + phase + ', len=' + cookie.length + ')');
    $done({});
    return;
  }

  const phone = phoneFromCookie(cookie);
  const masked = phone ? (phone.slice(0, 3) + '****' + phone.slice(-4)) : '(无号码)';
  log('命中 ' + phase + ' cookie=' + cookie.length + ' 字符 ' + masked + ' → ' + receiverUrl);

  postReceiver(receiverUrl, {
    phase: phase,
    ck: cookie,
    phone: phone,
    url: url.slice(0, 300),
  });
})();
