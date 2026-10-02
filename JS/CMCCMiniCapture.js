/**
 * 心愿金凭据抓取 — Surge 版 v2（Tailnet receiver 落库）
 *   命中 wmhnewcenter wmhsso 请求 → 取 JWT → 本机完成三步识别链
 *   → POST Mac Tailnet receiver → receiver 按 openid 合并写青龙 env cmcc_mini
 *
 * 三步链（与 QX 版逐字节同源）：
 *   ① wmhsso   : 带 JWT 换 token
 *   ② qwhdmark : 用 token 换 QWHD_SESSION_TOKEN（票下发在中间的 302 里，必须禁自动跟随）
 *   ③ user/info: 取 openid / nickName
 *
 * 落库：receiver（cmcc-mini-receiver.js，hynmac-mini Tailnet）是唯一基准；
 *   receiver 按 openid 去重合并 → 青龙 env cmcc_mini（cmcc_mini.py 直接消费）。
 *   同 JWT 重复上报由 receiver 去重，重复开心愿金小程序无副作用。
 *
 * Surge 模块（CMCCMiniCapture.sgmodule）：
 *   [Script] 中国移动-心愿金凭据捕获 = type=http-request,
 *     pattern=^https?:\/\/wx\.online-cmcc\.cn\/wmhnewcenter\/(?:alipay-applet|wechat86-applet)\/wmhsso,
 *     script-path=<仓库raw>, timeout=60, engine=jsc,
 *     script-arguments="receiver_url=https://hynmac-mini.taila66285.ts.net/cmcc-mini"
 *   [MITM] hostname = %APPEND% wx.online-cmcc.cn
 *
 * receiver 地址三源：模块参数 receiver_url > $persistentStore 键 Mini_Receiver_URL > 内置默认
 *   （默认 https://hynmac-mini.taila66285.ts.net/cmcc-mini，一般无需配置）
 *
 * 落库：Mac receiver（cmcc-mini-receiver.js）按 openid 去重合并 → 青龙 env cmcc_mini；
 *   同 JWT 重复上报被 receiver 二层去重，重复开心愿金小程序无副作用
 */

// ==================== 配置（取自 cmcc_xyj.js，行号已标注） ====================
const ACTIVITY_ID = '1021122301';                       // L304
const WMHS_LRSB = 'ZS93dUFVa2kzaEpQSjM0SG55MUFDdz09';  // L197
const ALI_YS = '11002zfbswssrk0000630';                 // L429
const WX_YX = 'JHT042591F0005';                         // L418
const WX_TOUCH_ID = '26-05-10005-2007-A01';             // L417
const UA_ALI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20F66 ChannelId(0) Ariver/1.1.0 AliApp(AP/12.12.26.6000) Nebula AlipayDefined(ac:T) AlipayClient/12.12.26.6000 Language/zh-Hans NebulaX/1.0.0 XRiver/10.2.58.1 DTN/2.0';  // L199
const UA_WX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.78(0x18004e27) NetType/WIFI Language/zh_CN';  // L198
const ASK_ALI = 'rechargeUrl,broadband,noReal,noPuk,callBalance,fareLink,recommendCard,showGrayUI,aliCommodityDisableProvince,netAge,wmhHideDetail,wmhHideDetailMarket,domainNameSelection,hideStarProvince';  // L227
const ASK_WX = 'feeCard,callBalance,broadband,noReal,noPuk,fareLink,recommendCard,xmeFloatBar,showGrayUI,NBEJXHSN,commodityDisableProvince,netAge,oneKeyLogin,miniSubscribePopup,wmhHideDetail,wmhHideDetailMarket,domainNameSelection,wmhHideDetailWeChat,hideStarProvince';  // L228
const STORE_KEY = 'cmcc_mini';
const DEFAULT_RECEIVER_URL = 'https://hynmac-mini.taila66285.ts.net/cmcc-mini';
const RECEIVER_URL_KEY = 'Mini_Receiver_URL';
const LOCAL_BACKUP_KEY = 'cmcc_mini_local';
const FIELDS = ['cmcc_ali_session_id', 'cmcc_wx_login_session_id', 'cmcc_qwhd_ali', 'nickName'];
const TIMEOUT_RETRY = 3;

// ==================== 平台层（Surge / Quantumult X 自适应） ====================

/** 解析脚本参数（Surge [Argument] 经 script 行 argument= 传入，URL 编码 k=v&k=v） */
function argMap() {
  const out = {};
  try {
    const raw = typeof $argument === 'string' ? $argument.trim() : '';
    if (!raw) return out;
    for (const pair of raw.split('&')) {
      const i = pair.indexOf('=');
      if (i < 0) continue;
      const k = pair.slice(0, i).trim();
      let v = pair.slice(i + 1).trim();
      try { v = decodeURIComponent(v); } catch (e) { }
      if (k && v) out[k] = v;
    }
  } catch (e) { }
  return out;
}

/** 持久化读取（Surge: $persistentStore / QX: $prefs）；无值返回 def */
function getVal(key, def) {
  try {
    if (typeof $persistentStore !== 'undefined') {
      const v = $persistentStore.read(key);
      if (v != null) return v;
    } else if (typeof $prefs !== 'undefined') {
      const v = $prefs.valueForKey(key);
      if (v != null) return v;
    }
  } catch (e) { }
  return def;
}

/** 持久化写入（Surge: $persistentStore / QX: $prefs）；成功返回 true */
function setVal(val, key) {
  try {
    if (typeof $persistentStore !== 'undefined') return $persistentStore.write(String(val), key) === true;
    if (typeof $prefs !== 'undefined') { $prefs.setValueForKey(String(val), key); return true; }
  } catch (e) { }
  return false;
}

/**
 * HTTP 层（Surge: $httpClient 回调 / QX: $task.fetch Promise），重试语义与原版一致。
 * Surge 要点：
 *   - 'auto-redirect': false 时 30x 原样返回（QWHD 票在中间 302 的 Set-Cookie 里，必须禁跟随）
 *   - 'auto-cookie': false 保证 Set-Cookie 以普通字段透出、手动 Cookie 头不被会话池改写
 *   - Content-Length 由 Surge 按分帧自动计算，手写值会被剥掉
 */
function req(method, url, headers, body, retries, noRedirect) {
  const once = () => new Promise(res => {
    const done = (st, b, hd) => res({ status: parseInt(st, 10) || 0, body: b || '', headers: hd || {} });
    if (typeof $httpClient !== 'undefined') {
      const h = {};
      for (const k of Object.keys(headers || {})) {
        if (k.toLowerCase() === 'content-length') continue;
        h[k] = headers[k];
      }
      const o = { url: url, headers: h, 'auto-redirect': !noRedirect, 'auto-cookie': false, timeout: 20 };
      if (body != null) o.body = body;
      const c = $httpClient;
      const m = String(method || 'GET').toUpperCase();
      const fn = m === 'POST' ? c.post : (m === 'PUT' ? c.put : (m === 'DELETE' ? c.delete : (m === 'HEAD' ? c.head : (m === 'PATCH' ? c.patch : c.get))));
      fn.call(c, o, (err, resp, data) => {
        if (err || !resp) return done(0, '', {});
        done(resp.status, data || '', resp.headers || {});
      });
      return;
    }
    // QX 路径：UA 统一走小写 user-agent 键
    let ua = 'ChinaMobile/12.1.3 (iPhone; iOS 16.6.1; Scale/3.00)';
    const h = {};
    for (const k of Object.keys(headers || {})) {
      if (k.toLowerCase() === 'user-agent') ua = headers[k];
      else h[k] = headers[k];
    }
    h['user-agent'] = ua;
    const o = { url: url, method: method, headers: h };
    if (body != null) o.body = body;
    if (noRedirect) o.opts = { redirection: false };
    $task.fetch(o).then(r => done(r.statusCode || r.status, r.body, r.headers), () => done(0, '', {}));
  });
  return (async () => {
    const n = retries || 1;
    let r = { status: 0, body: '', headers: {} };
    for (let i = 0; i < n; i++) {
      r = await once();
      if (r.status >= 200 && r.status < 400) return r;
      if (r.status >= 400 && r.status < 500) return r;  // 4xx 不重试
      if (i < n - 1) await new Promise(s => setTimeout(s, 1000 * (i + 1)));  // 5xx / 网络错误重试
    }
    return r;
  })();
}

/** 取响应里的 Set-Cookie（可能是数组），并抽取指定 cookie 值 */
function getCookie(headers, name) {
  let sc = '';
  for (const k of Object.keys(headers || {})) {
    if (k.toLowerCase() === 'set-cookie') {
      const v = headers[k];
      sc += (sc ? '; ' : '') + (Array.isArray(v) ? v.join('; ') : String(v));
    }
  }
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(sc.replace(/,\s*/g, '; '));
  return m ? m[1] : '';
}

function log(s) { try { console.log('[cmcc_mini] ' + s); } catch (e) { } }

// ==================== Mac receiver 上报（落库唯一出口） ====================

/** receiver 地址：模块参数 receiver_url > $persistentStore Mini_Receiver_URL > 内置默认 */
function receiverUrl() {
  const a = argMap();
  if (a['receiver_url']) return String(a['receiver_url']).replace(/\/+$/, '');
  const stored = getVal(RECEIVER_URL_KEY, '');
  if (stored) return String(stored).replace(/\/+$/, '');
  return DEFAULT_RECEIVER_URL;
}

/** 识别链结果上报 Tailnet receiver；成功返回 {ok, action, accounts}，失败 {ok:false, err} */
function reportReceiver(payload) {
  return new Promise(resolve => {
    const url = receiverUrl();
    const body = JSON.stringify(payload);
    req('POST', url, { 'content-type': 'application/json', 'content-length': String(body.length) }, body, 2, false)
      .then(r => {
        if (r.status < 200 || r.status >= 300) {
          resolve({ ok: false, err: 'HTTP ' + r.status + (r.body ? ' ' + String(r.body).slice(0, 120) : '') });
          return;
        }
        try { resolve(JSON.parse(r.body)); } catch (e) { resolve({ ok: r.status === 200, action: 'unknown', accounts: 0 }); }
      });
  });
}

/** 解析账号库文本（云端与本地的存储格式一致） */
function parseStore(text) {
  try {
    const arr = JSON.parse(String(text == null ? '' : text) || '[]');
    return Array.isArray(arr) ? arr.filter(x => x && x.openid) : [];
  } catch (e) { return []; }
}

// ==================== 编解码与 AES（原脚本第 261/264/265 行，原文照搬） ====================
const Utf8 = { encode: s => unescape(encodeURIComponent(s)), decode: b => { let s = ""; for (let i = 0; i < b.length; i++)s += String.fromCharCode(b[i]); return decodeURIComponent(escape(s)) } }, B64 = { _map: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", encode: b => { let o = "", m = B64._map; for (let i = 0; i < b.length; i += 3) { const b0 = b[i], b1 = i + 1 < b.length ? b[i + 1] : 0, b2 = i + 2 < b.length ? b[i + 2] : 0; o += m[b0 >> 2] + m[((b0 & 3) << 4) | (b1 >> 4)] + (i + 1 < b.length ? m[((b1 & 15) << 2) | (b2 >> 6)] : "=") + (i + 2 < b.length ? m[b2 & 63] : "=") } return o }, decode: s => { const str = s.replace(/[^A-Za-z0-9+/=]/g, ""), o = []; for (let i = 0; i < str.length; i += 4) { const c0 = B64._map.indexOf(str[i]), c1 = B64._map.indexOf(str[i + 1]), c2 = B64._map.indexOf(str[i + 2]), c3 = B64._map.indexOf(str[i + 3]); o.push((c0 << 2) | (c1 >> 4)); if (str[i + 2] !== "=") o.push(((c1 & 15) << 4) | (c2 >> 2)); if (str[i + 3] !== "=") o.push(((c2 & 3) << 6) | c3) } return o } }, strToBytes = s => { if (Array.isArray(s)) return s; const u = Utf8.encode(s), b = new Array(u.length); for (let i = 0; i < u.length; i++)b[i] = u.charCodeAt(i) & 255; return b }, bytesToStr = b => Utf8.decode(b), b64ToBytes = s => B64.decode(s), bytesToB64 = b => B64.encode(b), hexToBytes = h => { const b = new Array(h.length >> 1); for (let i = 0; i < b.length; i++)b[i] = parseInt(h.substr(i * 2, 2), 16); return b }, bytesToHex = b => { let h = ""; for (let i = 0; i < b.length; i++)h += ("0" + b[i].toString(16)).slice(-2); return h };
const AES = (function () { const SBOX = [0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76, 0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0, 0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15, 0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75, 0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84, 0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf, 0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8, 0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2, 0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73, 0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb, 0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79, 0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08, 0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a, 0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e, 0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf, 0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16], RSBOX = [0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb, 0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb, 0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e, 0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25, 0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92, 0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84, 0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06, 0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b, 0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73, 0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e, 0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b, 0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4, 0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f, 0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef, 0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61, 0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d], RCON = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54], xtime = a => ((a << 1) ^ ((a & 128) ? 283 : 0)) & 255; function expandKey(k) { const Nk = k.length >> 2, Nr = Nk + 6, w = new Array(4 * (Nr + 1)); for (let i = 0; i < Nk * 4; i++)w[i] = k[i]; for (let i = Nk; i < 4 * (Nr + 1); i++) { let t = [w[4 * i - 4], w[4 * i - 3], w[4 * i - 2], w[4 * i - 1]]; if (i % Nk === 0) { const tmp = t[0]; t[0] = SBOX[t[1]] ^ RCON[(i / Nk) - 1]; t[1] = SBOX[t[2]]; t[2] = SBOX[t[3]]; t[3] = SBOX[tmp] } else if (Nk > 6 && (i % Nk === 4)) { t[0] = SBOX[t[0]]; t[1] = SBOX[t[1]]; t[2] = SBOX[t[2]]; t[3] = SBOX[t[3]] } for (let j = 0; j < 4; j++)w[4 * i + j] = w[4 * (i - Nk) + j] ^ t[j] } return { w, Nr } } function ark(s, w, r) { for (let i = 0; i < 16; i++)s[i] ^= w[4 * (4 * r + Math.floor(i / 4)) + (i % 4)] } function sub(s) { for (let i = 0; i < 16; i++)s[i] = SBOX[s[i]] } function isub(s) { for (let i = 0; i < 16; i++)s[i] = RSBOX[s[i]] } function srow(s) { const t = [s[0], s[5], s[10], s[15], s[4], s[9], s[14], s[3], s[8], s[13], s[2], s[7], s[12], s[1], s[6], s[11]]; for (let i = 0; i < 16; i++)s[i] = t[i] } function isrow(s) { const t = [s[0], s[13], s[10], s[7], s[4], s[1], s[14], s[11], s[8], s[5], s[2], s[15], s[12], s[9], s[6], s[3]]; for (let i = 0; i < 16; i++)s[i] = t[i] } function mcol(s) { for (let c = 0; c < 16; c += 4) { const a = s[c], b = s[c + 1], d = s[c + 2], e = s[c + 3]; s[c] = xtime(a) ^ xtime(b) ^ b ^ d ^ e; s[c + 1] = a ^ xtime(b) ^ xtime(d) ^ d ^ e; s[c + 2] = a ^ b ^ xtime(d) ^ xtime(e) ^ e; s[c + 3] = xtime(a) ^ a ^ b ^ d ^ xtime(e) } } function imcol(s) { const m9 = x => xtime(xtime(xtime(x))) ^ x, m11 = x => xtime(xtime(xtime(x))) ^ xtime(x) ^ x, m13 = x => xtime(xtime(xtime(x))) ^ xtime(xtime(x)) ^ x, m14 = x => xtime(xtime(xtime(x))) ^ xtime(xtime(x)) ^ xtime(x); for (let c = 0; c < 16; c += 4) { const a = s[c], b = s[c + 1], d = s[c + 2], e = s[c + 3]; s[c] = m14(a) ^ m11(b) ^ m13(d) ^ m9(e); s[c + 1] = m9(a) ^ m14(b) ^ m11(d) ^ m13(e); s[c + 2] = m13(a) ^ m9(b) ^ m14(d) ^ m11(e); s[c + 3] = m11(a) ^ m13(b) ^ m9(d) ^ m14(e) } } function encB(w, Nr, i) { let s = i.slice(); ark(s, w, 0); for (let r = 1; r < Nr; r++) { sub(s); srow(s); mcol(s); ark(s, w, r) } sub(s); srow(s); ark(s, w, Nr); return s } function decB(w, Nr, i) { let s = i.slice(); ark(s, w, Nr); for (let r = Nr - 1; r >= 1; r--) { isrow(s); isub(s); ark(s, w, r); imcol(s) } isrow(s); isub(s); ark(s, w, 0); return s } function pad(b) { const n = 16 - (b.length % 16), o = b.slice(); for (let i = 0; i < n; i++)o.push(n); return o } function unpad(b) { const n = b[b.length - 1]; if (!n || n > 16 || n > b.length) return b; return b.slice(0, b.length - n) } function cbc(kb, ib, inp, dec) { const { w, Nr } = expandKey(kb), out = []; let p = ib; if (!dec) { for (let i = 0; i < inp.length; i += 16) { const blk = inp.slice(i, i + 16), x = blk.map((v, j) => v ^ p[j]), e = encB(w, Nr, x); out.push.apply(out, e); p = e } return out } for (let i = 0; i < inp.length; i += 16) { const blk = inp.slice(i, i + 16), d = decB(w, Nr, blk); for (let j = 0; j < 16; j++)out.push(d[j] ^ p[j]); p = blk } return out } return { encrypt: (k, i, t) => cbc(k, i, pad(strToBytes(t)), !1), decrypt: (k, i, c) => { try { return bytesToStr(unpad(cbc(k, i, c, !0))) } catch (e) { return null } } } })();
const KEYS = { payloadKey: b64ToBytes("dFZrZGFSV1JZMFprVjFWcg=="), payloadIv: b64ToBytes("VmpGU1ExWnRWa1F4UlRsUQ=="), hdrKey: b64ToBytes("YkFJZ3Z3QXVBNHRiRHI5ZA=="), hdrIv: b64ToBytes("OTc5MTAyNzM0MTcxMTgxOQ=="), resKey: hexToBytes("52595630684356316c5632354b59564a"), resIv: b64ToBytes("VmpXWUEXFyoRGj4ZISEPMg=="), resAutoIv: b64ToBytes("VmpGU1ExWnRWa1F4UlRsUQ=="), h5HexKey: strToBytes("1234123412ABCDEF"), h5HexIv: strToBytes("ABCDEF1234123412"), nrKey: strToBytes("03054BD8937F62FA8FE72F00012B9658"), nrIv: strToBytes("82787D91132E6AE5") };

// ==================== wmhsso 响应解密（两层 base64 + AES-128-CBC/PKCS#7） ====================
function wmhssoDecrypt(enc) {
  try {
    const inner = bytesToStr(b64ToBytes(String(enc || '').trim())).trim();
    if (!inner) return null;
    const plain = AES.decrypt(KEYS.h5HexKey, KEYS.h5HexIv, b64ToBytes(inner));
    return plain ? JSON.parse(String(plain).trim()) : null;
  } catch (e) { return null; }
}

// ==================== 识别链 ====================
/** 用 JWT 换出 {openid, nickName, qwhdAli}；任一步失败返回 null */
async function identify(jwt, end) {
  const isAli = end !== 'wxmini' && end !== 'wxgzh';
  const applet = isAli ? 'alipay-applet' : 'wechat86-applet';
  const jwtKey = isAli ? 'X-ALIPAY-APPLET-JWT' : 'X-WECHAT86-APPLET-JWT';
  const ua = isAli ? UA_ALI : UA_WX;
  const referer = isAli
    ? 'https://2018112062226732.hybrid.alipay-eco.com/2018112062226732/0.2.2609141635.11/index.html#subPackages/aliWeblink/index'
    : 'https://servicewechat.com/wx43aab19a93a3a6f2/528/page-frame.html';

  // ① wmhsso → token
  const h1 = {
    'Host': 'wx.online-cmcc.cn', 'Content-Length': '0',
    'content-type': 'application/x-www-form-urlencoded',
    'X-EMERGENCY-NEW': 'yes', 'X-EMERGENCY-PROVINCE': '200',
    'User-Agent': ua, 'Referer': referer,
    'Lrsbhbg8': WMHS_LRSB, 'X-CORE-APPLET-TOKEN': jwt,
    'X-APPLET-ASK-CONFIG': isAli ? ASK_ALI : ASK_WX,
  };
  h1[jwtKey] = jwt;
  const r1 = await req('POST', 'https://wx.online-cmcc.cn/wmhnewcenter/' + applet + '/wmhsso?redirectSource=SSO_YQS', h1, '', TIMEOUT_RETRY);
  let token = '';
  try {
    const dec = wmhssoDecrypt(JSON.parse(r1.body).encryptData || '');
    if (dec) token = dec.token || (dec.bean || {}).token || (dec.object || {}).token || (dec.data || {}).token || '';
  } catch (e) { }
  log(`① wmhsso status=${r1.status} token=${token ? token.slice(0, 16) + '...' : '空'}`);
  if (!token) return null;

  // ② qwhdmark → QWHD_SESSION_TOKEN
  // ⚠ 必须禁止自动跟随跳转：QWHD_SESSION_TOKEN 下发在中间的 302 响应里，
  //   让客户端自动跳转会把该响应吃掉。原脚本同样是 noRedirect + 自己循环处理。
  const markUrl = 'https://wx.10086.cn/qwhdhub/qwhdmark/' + ACTIVITY_ID + (isAli
    ? '?webView=true&ys=' + encodeURIComponent(ALI_YS)
    : '?ys=&yx=' + encodeURIComponent(WX_YX) + '&touch_id=' + WX_TOUCH_ID)
    + '&wmhToken=' + encodeURIComponent(token);
  const h2 = {
    'Host': 'wx.10086.cn', 'User-Agent': ua, 'Accept': 'text/html',
    'Referer': referer, 'Cookie': 'qwhd_center_router=hua',
  };
  let sid = '', cur = markUrl;
  for (let hop = 0; hop < 6 && !sid; hop++) {
    const r2 = await req('GET', cur, h2, null, 1, true);
    sid = getCookie(r2.headers, 'QWHD_SESSION_TOKEN');
    log(`② qwhdmark hop${hop} status=${r2.status} sid=${sid || '空'}`);
    if (sid) break;
    if (r2.status >= 300 && r2.status < 400) {
      const loc = r2.headers['Location'] || r2.headers['location'] || '';
      if (!loc) break;
      cur = /^https?:\/\//i.test(loc) ? loc : (cur.replace(/[?#].*$/, '') + loc);
    } else break;
  }
  if (!sid) return null;

  // ③ user/info → 仅取 openid / nickName；QWHD 票直接使用②所得 sid
  const r3 = await req('POST', 'https://wx.10086.cn/qwhdhub/api/mark/user/info', {
    'Host': 'wx.10086.cn', 'User-Agent': ua,
    'Content-Type': 'application/json;charset=UTF-8',
    'Origin': 'https://wx.10086.cn', 'Referer': markUrl,
    'login-check': '1', 'Accept': 'application/json, text/plain, */*',
    'Cookie': 'qwhd_center_router=hua; QWHD_SESSION_TOKEN=' + sid,
  }, '{"appVersion":"","miniVersion":""}', 2);
  try {
    const d = JSON.parse(r3.body).data || {};
    log(`③ user/info status=${r3.status} openid=${d.openid || '空'}`);
    if (!d.openid) return null;
    return { openid: String(d.openid), nickName: d.nickName || '', qwhdAli: String(sid).trim() };
  } catch (e) {
    log(`③ user/info 解析失败: ${e.message}`);
    return null;
  }
}

// ==================== 落库 ====================
function upsert(store, openid, fields) {
  const i = store.findIndex(x => String(x.openid) === String(openid));
  if (i >= 0) {
    for (const k of Object.keys(fields)) if (fields[k]) store[i][k] = fields[k];
    return { action: '更新', rec: store[i] };
  }
  const rec = { openid: String(openid) };
  for (const k of FIELDS) rec[k] = '';
  for (const k of Object.keys(fields)) if (fields[k]) rec[k] = fields[k];
  store.push(rec);
  return { action: '新增', rec: rec };
}

// ==================== 业务编排 ====================
function readCapture() {
  const url = (typeof $request !== 'undefined' && $request && $request.url) || '';
  const headers = {};
  const raw = (typeof $request !== 'undefined' && $request && $request.headers) || {};
  for (const k of Object.keys(raw)) headers[k.toLowerCase()] = String(raw[k] || '');
  const jwt = (headers['x-alipay-applet-jwt'] || headers['x-wechat86-applet-jwt'] || headers['x-core-applet-token'] || '').trim();
  const end = headers['x-alipay-applet-jwt'] ? 'alipay' : (url.indexOf('alipay-applet') >= 0 ? 'alipay' : 'wxmini');
  return { url, jwt, end };
}

function writeLocalBackup(text) {
  const result = setVal(text, STORE_KEY);
  if (result === false) return false;
  return typeof result !== 'undefined' || getVal(STORE_KEY, '') === text;
}

/** 通知（Surge: $notification.post / QX: $notify） */
function notify() {
  try {
    const args = Array.prototype.slice.call(arguments);
    // Surge/QX 通知都是 (title, subtitle, body) 三参；不足三参时第三行会渲染成 "undefined"
    while (args.length < 3) args.push('');
    for (let i = 0; i < 3; i++) args[i] = args[i] == null ? '' : String(args[i]);
    if (typeof $notification !== 'undefined' && $notification && $notification.post) $notification.post.apply($notification, args);
    else if (typeof $notify !== 'undefined') $notify.apply(null, args);
  } catch (e) { }
}

async function syncCapture(capture) {
  const { url, jwt, end } = capture;
  if (url.indexOf('/wmhnewcenter/') < 0 || !jwt || jwt.length <= 10) {
    log('未命中或请求头无 JWT，跳过');
    return;
  }

  // 本地缓存挡重复：同一 JWT 已报过就不再打识别链（receiver 侧也有一层按 openid+JWT 去重）
  const seen = parseStore(getVal(LOCAL_BACKUP_KEY, ''));
  const dupLocal = seen.find(x => x.cmcc_ali_session_id === jwt || x.cmcc_wx_login_session_id === jwt);
  if (dupLocal) {
    log(`JWT 已上报过（本地 openid=${dupLocal.openid}），跳过`);
    return;
  }

  const id = await identify(jwt, end);
  if (!id) {
    log('❌ 识别失败，未上报');
    notify('心愿金凭据', '❌ 识别失败', 'JWT 可能已过期，请重开心愿金小程序');
    return;
  }

  // 上报 Mac receiver（唯一落库出口）：receiver 按 openid 合并写青龙 env cmcc_mini
  const rep = await reportReceiver({
    openid: id.openid,
    nickName: id.nickName,
    jwt: jwt,
    qwhd: id.qwhdAli,
    end: end,
  });
  if (!rep.ok) {
    log(`❌ ${id.nickName} 上报 receiver 失败: ${rep.err || '未知'}`);
    notify('中国移动 Mini 获取Cookie失败', `[${id.nickName}] ❌ receiver 上报失败\n${rep.err || ''}`);
    return;
  }

  // 本地备份（仅缓存用途；真值在青龙 env cmcc_mini）
  const store = parseStore(getVal(LOCAL_BACKUP_KEY, ''));
  upsert(store, id.openid, {
    nickName: id.nickName,
    cmcc_ali_session_id: end === 'alipay' ? jwt : '',
    cmcc_wx_login_session_id: end === 'wxmini' ? jwt : '',
    cmcc_qwhd_ali: id.qwhdAli,
  });
  const localOk = setVal(JSON.stringify(store), LOCAL_BACKUP_KEY);

  log(`✅ ${rep.action || 'ok'} openid=${id.openid} nick=${id.nickName} | receiver 已入库（库内${rep.accounts}个）| 本地缓存: ${localOk ? '成功' : '失败'}`);
  notify('中国移动 Mini 获取Cookie成功',
    `[${id.nickName}] ✅ ${rep.action === 'created' ? '新增' : rep.action === 'updated' ? '更新' : '已存在'}，青龙库内${rep.accounts}个账号`);
}

// ==================== 入口 ====================
(async () => {
  const capture = readCapture();
  try {
    await syncCapture(capture);
  } catch (e) {
    log('异常: ' + (e && e.message ? e.message : e));
  }
  // ⚠ 必须在识别与落库完成之后才 $done()
  try { if (typeof $done !== 'undefined') $done({}); } catch (e) { }
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { identify, parseStore, upsert, wmhssoDecrypt, reportReceiver, receiverUrl, argMap, getVal, setVal, req };;
}
