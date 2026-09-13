/* Captures only the China Mobile autoLogin request body and sends it to a private Tailnet receiver. */

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
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /\.ts\.net$/i.test(url.hostname) && url.pathname === '/cmcc-autologin';
  } catch (_) {
    return false;
  }
}

function validCapture(value) {
  return typeof value === 'string' && value.length >= 256 && value.length <= 4096 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

(() => {
  const receiverUrl = argumentValue('receiver_url');
  const body = $request && $request.body;
  if (!validReceiver(receiverUrl) || !validCapture(body) || typeof $httpClient === 'undefined') {
    $done({});
    return;
  }
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
    timeout: 3,
  }, () => $done({}));
})();
