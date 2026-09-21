/* Relays China Mobile wmhnewcenter applet login (支付宝/微信小程序) to a private Mac Tailnet receiver. */

var DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/cmcc-jwt';

// 与 wmhsso / login 响应体同族的 AES 参数（h5HexKey / h5HexIv）。
var H5_KEY = '1234123412ABCDEF';
var H5_IV = 'ABCDEF1234123412';

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

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToString(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('utf8');
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(out));
}

/**
 * 解密 login / wmhsso 的 encryptData。
 * 结构与服务端一致：base64(base64(AES-CBC(plain)))，密钥为 h5HexKey / h5HexIv。
 */
function decryptEnvelope(encryptData) {
  const outer = String(encryptData || '').trim();
  if (!outer) return null;
  const inner = bytesToString(base64ToBytes(outer)).trim();
  if (!inner) return null;
  const encrypted = base64ToBytes(inner);
  const key = [];
  for (let i = 0; i < H5_KEY.length; i += 1) key.push(H5_KEY.charCodeAt(i) & 0xff);
  const iv = [];
  for (let i = 0; i < H5_IV.length; i += 1) iv.push(H5_IV.charCodeAt(i) & 0xff);

  if (typeof $crypto !== 'undefined' && $crypto.decrypt) {
    const plain = $crypto.decrypt(Array.from(encrypted), { algorithm: 'AES-CBC', key: Array.from(key), iv: Array.from(iv) });
    if (!plain) return null;
    try {
      return JSON.parse(bytesToString(new Uint8Array(plain)));
    } catch (_) {
      return null;
    }
  }

  if (typeof require !== 'undefined') {
    try {
      const nodeCrypto = require('crypto');
      const decipher = nodeCrypto.createDecipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv));
      const plain = Buffer.concat([decipher.update(Buffer.from(encrypted)), decipher.final()]).toString('utf8');
      return JSON.parse(plain);
    } catch (_) {
      return null;
    }
  }
  return null;
}

/** 判定端类型：只看 URL 的 applet 段，不依赖 UA。 */
function detectEnd(url) {
  const path = String(url || '').toLowerCase();
  if (path.indexOf('/alipay-applet/') >= 0) return 'alipay';
  if (path.indexOf('/wechat86-applet/') >= 0) return 'wx';
  return '';
}

/** JWT 形态：url-safe base64，长度 40~512，无填充无空白。 */
function validJwt(value) {
  const jwt = String(value || '');
  if (jwt.length < 40 || jwt.length > 512) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(jwt)) return '';
  return jwt;
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

  const response = $response;
  const request = $request;
  if (!request || !request.url) { $done({}); return; }

  // 只在 login 上取票：响应同时给出 sessionId（=wmhsso 的 JWT）和 telephone。
  const path = String(request.url).toLowerCase();
  if (path.indexOf('/login') < 0) { $done({}); return; }

  const end = detectEnd(request.url);
  if (!end) { $done({}); return; }

  if (!response || !response.body) { $done({}); return; }

  let envelope;
  try {
    envelope = JSON.parse(typeof response.body === 'string' ? response.body : bytesToString(new Uint8Array(response.body)));
  } catch (_) {
    $done({});
    return;
  }

  const decoded = decryptEnvelope(envelope && envelope.encryptData);
  if (!decoded) { $done({}); return; }
  const object = decoded.object || {};
  const jwt = validJwt(object.sessionId);
  const phone = String(object.telephone || '').replace(/\D/g, '');
  if (!jwt || !/^1\d{10}$/.test(phone)) { $done({}); return; }

  postReceiver(receiverUrl, { end: end, jwt: jwt, phone: phone });
  $done({});
})();
