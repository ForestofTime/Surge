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
  var userAgent = requestHeader($request && $request.headers, 'user-agent');
  if (!validReceiver(receiver) || !validCookie(cookie) || typeof $httpClient === 'undefined') {
    $done({});
    return;
  }

function notifyCapture(title, subtitle, body) {
  try {
    // Surge/QX 通知都是 (title, subtitle, body) 三参；缺参渲染成 "undefined"
    const args = [title, subtitle, body];
    for (let i = 0; i < 3; i++) args[i] = args[i] == null ? '' : String(args[i]);
    if (typeof $notification !== 'undefined' && $notification && $notification.post) $notification.post.apply($notification, args);
    else if (typeof $notify !== 'undefined') $notify.apply(null, args);
  } catch (_) { }
}

  let settled = false;
  const finish = function () { if (!settled) { settled = true; try { $done({}); } catch (_) {} } };
  setTimeout(finish, 1200);
  $httpClient.post({
    url: receiver,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie: cookie, userAgent: userAgent }),
    timeout: 8,
    policy: 'Tailnet',
  }, function (error, response) {
    const status = response && (response.status || response.statusCode);
    if (error || !(status >= 200 && status < 300)) {
      notifyCapture('什么值得买 Cookie 同步失败', '', 'receiver HTTP=' + (status || 'ERR') + (error ? ' ' + String(error).slice(0, 80) : ''));
    } else {
      notifyCapture('什么值得买 Cookie 已同步', '', '凭据已上报 Mac receiver → 青龙');
    }
    finish();
  });
}());
