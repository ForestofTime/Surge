/* Captures a 什么值得买 App Cookie and sends it only to the private Tailnet receiver. */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/smzdm-cookie';

function argumentValue(name) {
  if (typeof $argument === 'object' && $argument !== null) return $argument[name];
  if (typeof $argument !== 'string') return undefined;
  for (var i = 0; i < $argument.split('&').length; i += 1) {
    var item = $argument.split('&')[i];
    var index = item.indexOf('=');
    if (index > 0 && item.slice(0, index) === name) return decodeURIComponent(item.slice(index + 1));
  }
  return undefined;
}

function requestHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  var expected = String(name).toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i += 1) {
    if (String(keys[i]).toLowerCase() === expected) return String(headers[keys[i]] || '');
  }
  return '';
}

function validReceiver(value) {
  // Avoid the URL global: Surge JSC is intentionally narrower than browser JS.
  return typeof value === 'string'
    && /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/smzdm-cookie$/i.test(value);
}

function validCookie(value) {
  return typeof value === 'string'
    && value.length >= 12
    && value.length <= 12000
    && !/[\r\n]/.test(value)
    && /(?:^|;)\s*sess=[^;]+/i.test(value)
    && /(?:^|;)\s*smzdm_id=\d+/i.test(value);
}

(function () {
  var configured = argumentValue('receiver_url');
  var receiver = configured === undefined || configured === '' ? DEFAULT_RECEIVER_URL : configured;
  var cookie = requestHeader($request && $request.headers, 'cookie');
  if (!validReceiver(receiver) || !validCookie(cookie) || typeof $httpClient === 'undefined') {
    $done({});
    return;
  }
  $httpClient.post({
    url: receiver,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie: cookie }),
    timeout: 3,
    policy: 'Tailnet',
  }, function () { $done({}); });
}());
