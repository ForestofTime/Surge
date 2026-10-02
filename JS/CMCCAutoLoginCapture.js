/* Relays China Mobile autoLogin request/response events to a private Mac Tailnet receiver.
   v8: local Surge-script logging via console.log (visible in Surge → Script log) for on-device diagnosis. */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/cmcc-autologin';

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
    && /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/cmcc-autologin$/i.test(value);
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
  if (typeof $httpClient === 'undefined') {
    console.log('[cmcc-capture] ERROR: $httpClient unavailable (not in Surge engine?)');
    $done({});
    return;
  }
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 3,
    policy: 'Tailnet',
  }, (error, response, data) => {
    const status = response && (response.status || response.statusCode);
    if (error) {
      console.log('[cmcc-capture] POST failed: ' + JSON.stringify(error).slice(0, 200));
      notifyCapture('移动自动登录抓包失败', 'phase=' + (payload.phase || '?'), 'receiver 不可达: ' + String(error).slice(0, 80));
    } else {
      console.log('[cmcc-capture] POST ' + receiverUrl + ' → HTTP ' + (response ? response.status : '?'));
      if (!(status >= 200 && status < 300)) {
        notifyCapture('移动自动登录抓包异常', 'phase=' + (payload.phase || '?'), 'receiver HTTP=' + status);
      }
      // 2xx 静默：双相位高频上报，成功不打扰
    }
    $done({});
  });
}

(() => {
  console.log('[cmcc-capture] script fired: ' + String($request && $request.url || 'no-request').slice(0, 120));

  const configuredReceiver = argumentValue('receiver_url');
  const receiverUrl = configuredReceiver === undefined || configuredReceiver === ''
    ? DEFAULT_RECEIVER_URL
    : configuredReceiver;
  if (!validReceiver(receiverUrl) || !$request) {
    console.log('[cmcc-capture] SKIP: invalid receiver_url or no $request (url=' + String(receiverUrl).slice(0, 60) + ')');
    $done({});
    return;
  }

  const bodyLen = typeof $request.body === 'string' ? $request.body.length : 0;
  const common = {
    requestId: String($request.id || ''),
    url: String($request.url || ''),
  };
  console.log('[cmcc-capture] phase=request bodyLen=' + bodyLen + ' → ' + receiverUrl);
  if (typeof $response === 'undefined' || !$response) {
    postReceiver(receiverUrl, {
      phase: 'request',
      ...common,
      method: String($request.method || 'POST'),
      body: typeof $request.body === 'string' ? $request.body : '',
    });
    return;
  }

  const respLen = typeof $response.body === 'string' ? $response.body.length : 0;
  console.log('[cmcc-capture] phase=response status=' + ($response.status || $response.statusCode || 0) + ' respLen=' + respLen);
  postReceiver(receiverUrl, {
    phase: 'response',
    ...common,
    status: Number($response.status || $response.statusCode || 0),
    headers: $response.headers || {},
    body: typeof $response.body === 'string' ? $response.body : '',
  });
})();
