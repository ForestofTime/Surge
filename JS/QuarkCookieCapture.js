/* Relays a narrowly matched Quark App Cookie to the private Mac Tailnet receiver. */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/quark-cookie';

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
    && /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/quark-cookie$/i.test(value);
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] || '') : '';
}

function validTarget(value) {
  return /^https?:\/\/(?:coral2\.quark|broccoli\.uc)\.cn\//i.test(String(value || ''));
}

function validCookie(value) {
  return typeof value === 'string' && value.length >= 24 && value.length <= 24000
    && !/[\r\n]/.test(value) && /(?:^|;\s*)kps=[^;]+/.test(value);
}

function safeQueryValue(url, names) {
  try {
    const parsed = new URL(url);
    for (const name of names) {
      const value = String(parsed.searchParams.get(name) || '').trim();
      if (value && value.length <= 8192 && !/[;\r\n]/.test(value)) return value;
    }
  } catch (_) {}
  return '';
}

function normalizeCookie(url, rawCookie) {
  let cookie = typeof rawCookie === 'string' && !/[\r\n]/.test(rawCookie) ? rawCookie.trim() : '';
  if (!/(?:^|;\s*)kps=[^;]+/.test(cookie)) {
    const kps = safeQueryValue(url, ['kps']);
    if (kps) cookie = `${cookie ? `${cookie.replace(/;?\s*$/, '')}; ` : ''}kps=${kps};`;
  }
  if (!/(?:^|;\s*)(?:broccoli-user-id|ut)=[^;]+/.test(cookie)) {
    const ut = safeQueryValue(url, ['ut', 'broccoli-user-id']);
    if (ut) cookie = `${cookie ? `${cookie.replace(/;?\s*$/, '')}; ` : ''}ut=${ut};`;
  }
  return cookie;
}

function sanitizedCaptureUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch (_) { return ''; }
}

(() => {
  const configured = argumentValue('receiver_url');
  const receiverUrl = configured === undefined || configured === '' ? DEFAULT_RECEIVER_URL : configured;
  const url = typeof $request !== 'undefined' && $request ? String($request.url || '') : '';
  const rawCookie = typeof $request !== 'undefined' && $request ? headerValue($request.headers, 'cookie') : '';
  const cookie = normalizeCookie(url, rawCookie);
  const captureUrl = sanitizedCaptureUrl(url);
  if (!validReceiver(receiverUrl) || !validTarget(url) || !validCookie(cookie) || typeof $httpClient === 'undefined') {
    $done({});
    return;
  }
  $httpClient.post({
    url: receiverUrl,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: captureUrl, cookie }),
    timeout: 3,
    policy: 'Tailnet',
  }, () => $done({}));
})();
