/* Relays China Mobile wmhnewcenter applet login envelopes to a private Mac Tailnet receiver. */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/cmcc-jwt';

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

function postReceiver(receiverUrl, payload) {
  if (typeof $httpClient === 'undefined') return;
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 3,
    policy: 'Tailnet',
  }, () => {});
}

(() => {
  const configuredReceiver = argumentValue('receiver_url');
  const receiverUrl = configuredReceiver === undefined || configuredReceiver === ''
    ? DEFAULT_RECEIVER_URL
    : configuredReceiver;
  if (!validReceiver(receiverUrl)) { $done({}); return; }

  const request = $request;
  const response = $response;
  if (!request || !request.url) { $done({}); return; }

  // 只在 login 上取票：响应体里同时带着 sessionId 与 telephone。
  if (String(request.url).toLowerCase().indexOf('/login') < 0) { $done({}); return; }

  const end = detectEnd(request.url);
  if (!end) { $done({}); return; }

  if (!response || !response.body) { $done({}); return; }
  if (typeof response.body !== 'string') { $done({}); return; }

  // Surge 的 JSC 引擎没有 atob / Buffer，无法在此解密；原样转发密文，
  // 由 Mac 接收器用 Node crypto 解出凭据。与 autoLogin 转发模式一致。
  let envelope;
  try {
    envelope = JSON.parse(response.body);
  } catch (_) {
    $done({});
    return;
  }
  const encryptData = envelope && envelope.encryptData;
  if (typeof encryptData !== 'string' || encryptData.length < 64 || encryptData.length > 131072) {
    $done({});
    return;
  }

  postReceiver(receiverUrl, { end: end, url: String(request.url), encryptData: encryptData });
  $done({});
})();
