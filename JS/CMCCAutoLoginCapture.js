/* Captures a successful China Mobile autoLogin response and sends it to a private Tailnet receiver. */

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
  // Do not rely on URL: Surge's JSC runtime is narrower than a browser runtime.
  return typeof value === 'string'
    && /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/cmcc-autologin$/i.test(value);
}

function validCapture(value) {
  return typeof value === 'string' && value.length >= 256 && value.length <= 4096 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? value.join('; ') : String(value || '');
}

function validEncryptedResponse(value) {
  return typeof value === 'string' && value.length >= 32 && value.length <= 16384 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

(() => {
  const configuredReceiver = argumentValue('receiver_url');
  const receiverUrl = configuredReceiver === undefined || configuredReceiver === ''
    ? DEFAULT_RECEIVER_URL
    : configuredReceiver;
  const body = $request && $request.body;
  const responseBody = typeof $response !== 'undefined' && $response ? $response.body : '';
  const responseStatus = typeof $response !== 'undefined' && $response ? Number($response.status || $response.statusCode || 0) : 0;
  const setCookie = typeof $response !== 'undefined' && $response ? headerValue($response.headers, 'set-cookie') : '';
  if (!validReceiver(receiverUrl) || !validCapture(body) || responseStatus !== 200
      || !setCookie || !validEncryptedResponse(responseBody) || typeof $httpClient === 'undefined') {
    $done({});
    return;
  }
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, response: { status: responseStatus, body: responseBody, setCookie } }),
    timeout: 3,
    policy: 'Tailnet',
  }, () => $done({}));
})();
