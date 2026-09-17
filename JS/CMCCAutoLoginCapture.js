/* Relays China Mobile autoLogin request/response events to a private Mac Tailnet receiver. */

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

function postReceiver(receiverUrl, payload) {
  if (typeof $httpClient === 'undefined') {
    $done({});
    return;
  }
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 3,
    policy: 'Tailnet',
  }, () => $done({}));
}

(() => {
  const configuredReceiver = argumentValue('receiver_url');
  const receiverUrl = configuredReceiver === undefined || configuredReceiver === ''
    ? DEFAULT_RECEIVER_URL
    : configuredReceiver;
  if (!validReceiver(receiverUrl) || !$request) {
    $done({});
    return;
  }

  const common = {
    requestId: String($request.id || ''),
    url: String($request.url || ''),
  };
  if (typeof $response === 'undefined' || !$response) {
    postReceiver(receiverUrl, {
      phase: 'request',
      ...common,
      method: String($request.method || 'POST'),
      body: typeof $request.body === 'string' ? $request.body : '',
    });
    return;
  }

  postReceiver(receiverUrl, {
    phase: 'response',
    ...common,
    status: Number($response.status || $response.statusCode || 0),
    headers: $response.headers || {},
    body: typeof $response.body === 'string' ? $response.body : '',
  });
})();
