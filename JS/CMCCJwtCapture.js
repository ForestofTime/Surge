/* Relays China Mobile wmhnewcenter applet login envelopes to a private Mac Tailnet receiver. */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/cmcc-jwt';
var LOG_TAG = '[CMCCJWT]';

// Surge 的脚本日志（脚本 → 日志）里能看到每一步走向，便于自查捕获是否触发。
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
    && /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/cmcc-jwt$/i.test(value);
}

/**
 * 判定端类型：只看 URL 的 applet 段，不依赖 UA（换机型/换版本不影响）。
 */
function detectEnd(url) {
  const path = String(url || '').toLowerCase();
  if (path.indexOf('/alipay-applet/') >= 0) return 'alipay';
  if (path.indexOf('/wechat86-applet/') >= 0) return 'wx';
  return '';
}

// 只转发复现登录所需的非敏感请求头。Cookie、Authorization 等即使存在也会丢弃。
function selectRequestHeaders(headers) {
  const allowed = {
    'user-agent': true,
    referer: true,
    'x-applet-ask-config': true,
    lrsbhbg8: true,
    'x-emergency-new': true,
    'x-emergency-province': true,
    'content-type': true,
    'accept-language': true,
  };
  const selected = {};
  if (!headers || typeof headers !== 'object') return selected;
  for (const key of Object.keys(headers)) {
    const lower = String(key).toLowerCase();
    if (!allowed[lower]) continue;
    const value = headers[key];
    if (typeof value === 'string' && value.length <= 4096) selected[lower] = value;
  }
  return selected;
}

function postReceiver(receiverUrl, payload, end) {
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
  }, (error, response, data) => {
    if (error) {
      log('上报失败 ' + end + ': ' + String(error));
      return;
    }
    const status = response && (response.status || response.statusCode);
    log('上报完成 ' + end + ' HTTP=' + status + ' → ' + receiverUrl);
  });
}

(() => {
  const configuredReceiver = argumentValue('receiver_url');
  const receiverUrl = configuredReceiver === undefined || configuredReceiver === ''
    ? DEFAULT_RECEIVER_URL
    : configuredReceiver;
  if (!validReceiver(receiverUrl)) {
    log('跳过: receiver_url 不合法 (' + String(receiverUrl) + ')');
    $done({});
    return;
  }

  const request = $request;
  const response = $response;
  if (!request || !request.url) {
    log('跳过: 无 $request.url（可能被非重写方式触发）');
    $done({});
    return;
  }

  const url = String(request.url);
  log('命中 ' + url.split('?')[0]);

  // 只在 login 上取票：响应体里同时带着 sessionId 与 telephone。
  if (url.toLowerCase().indexOf('/login') < 0) {
    log('跳过: URL 不含 /login');
    $done({});
    return;
  }

  const end = detectEnd(url);
  if (!end) {
    log('跳过: 无法判定端类型（URL 里既无 /alipay-applet/ 也无 /wechat86-applet/）');
    $done({});
    return;
  }

  if (!response || !response.body) {
    log('跳过 ' + end + ': 响应体为空（requires-body 未生效或响应无 body）');
    $done({});
    return;
  }
  if (typeof response.body !== 'string') {
    log('跳过 ' + end + ': 响应体不是字符串');
    $done({});
    return;
  }

  // Surge 的 JSC 引擎没有 atob / Buffer，无法在此解密；原样转发密文，
  // 由 Mac 接收器用 Node crypto 解出凭据。与 autoLogin 转发模式一致。
  let envelope;
  try {
    envelope = JSON.parse(response.body);
  } catch (_) {
    log('跳过 ' + end + ': 响应体不是 JSON（前 60 字符: ' + response.body.slice(0, 60) + '）');
    $done({});
    return;
  }
  const encryptData = envelope && envelope.encryptData;
  if (typeof encryptData !== 'string' || encryptData.length < 64 || encryptData.length > 131072) {
    log('跳过 ' + end + ': 响应里没有可用的 encryptData（长度 '
      + (typeof encryptData === 'string' ? encryptData.length : '无') + '）');
    $done({});
    return;
  }

  log('取到 encryptData 长度=' + encryptData.length + '，准备上报 ' + end);
  postReceiver(receiverUrl, {
    end: end,
    url: url,
    method: String(request.method || 'GET').toUpperCase(),
    headers: selectRequestHeaders(request.headers),
    encryptData: encryptData,
  }, end);
  $done({});
})();
