/**
 * NetEaseCookieCapture.js —— 网易云 MUSIC_U / antiCheatToken / UA 抓取 · Surge 版 v4
 *
 * 约定：设备端只做「截到 → 原样传 Mac」，不解析、不去重、不判断。
 * 幂等、校验、落库全部在 Mac 的 netease-cookie-receiver.js。
 *
 * v4：除 Cookie 外一并回传 X-antiCheatToken 与 User-Agent。
 *     ncmm 的 xeapi 类任务（红包雨 / 看视频赚云贝 / 每日推歌）必须要移动端
 *     token + 匹配 UA，缺了就会报 "xeapi public key response missing sk"。
 */

(function () {
  var ARGS = {};
  var argStr = (typeof $argument !== 'undefined' && $argument) ? String($argument) : '';
  if (argStr) {
    argStr.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) ARGS[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
  }

  var RECEIVER = ARGS.receiver_url || 'https://hynmac-mini.taila66285.ts.net/netease-cookie';

  var REQ = (typeof $request !== 'undefined' && $request) ? $request : null;
  var url = (REQ && REQ.url) ? String(REQ.url) : '';
  var headers = (REQ && REQ.headers) ? REQ.headers : {};

  function headerOf(h, name) {
    for (var k in h) {
      if (String(k).toLowerCase() === name) return String(h[k]);
    }
    return '';
  }

  function forward(payload) {
    $httpClient.post(
      { url: RECEIVER, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      function (err) {
        try { console.log('[NetEaseCap] ' + (err ? '失败:' + err : '已转发')); } catch (e) {}
      }
    );
  }

  // 覆盖 music/interface(+数字后缀).163.com 及其三级域
  if (!/\/\/(?:[A-Za-z0-9-]+\.)*(?:music|interface)\d*\.163\.com/.test(url)) {
    $done({});
    return;
  }

  var ck = headerOf(headers, 'cookie');
  var ac = headerOf(headers, 'x-anticheattoken');
  var ua = headerOf(headers, 'user-agent');

  var payload = { type: 'cookie', url: url.slice(0, 300) };
  var has = false;

  // ── 取证：xeapi / 广告 / 任务类请求，把完整 body 与关键头原样回传 ──
  // 目的：真机「看视频赚云贝」那 15 阶段走的 xeapi 加密体，脚本侧复刻需要真样本。
  if (/\/(xeapi|api)\/.*(ad\/power\/yunbei|usertool\/task|incentive|reward|watch)/i.test(url)) {
    // 头全量（白名单会漏掉真实头名，v6 就因为只挑固定几个而看不到 antiCheat）
    var h2 = {};
    for (var hn in headers) {
      var hv = String(headers[hn]);
      h2[String(hn).toLowerCase()] = hv.length > 600 ? hv.slice(0, 600) + '…' : hv;
    }
    $httpClient.post(
      { url: RECEIVER, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'xeapi-probe',
          url: url.slice(0, 400),
          method: String((REQ && REQ.method) || 'POST'),
          body: String((REQ && (REQ.body || REQ.bodyBytes)) || '').slice(0, 8000),
          headers: h2,
          ua: ua.slice(0, 400),
        }) },
      function () {}
    );
  }

  if (ck && /MUSIC_U=[^;]{40,}/.test(ck)) { payload.cookie = ck.slice(0, 8000); has = true; }
  // 抗作弊 token 的头名各家版本不一，逐个兜
  if (!ac) {
    ['x-anticheattoken', 'anti-cheat-token', 'anticheattoken', 'x-anti-cheat-token', 'x-ac-token'].some(function (n) {
      var v = headerOf(headers, n);
      if (v && v.length > 8) { ac = v; return true; }
      return false;
    });
  }
  if (ac && ac.length > 8) { payload.antiCheat = ac.slice(0, 600); has = true; }
  else { payload.hdrKeys = Object.keys(headers).join(',').slice(0, 600); }
  if (ua && /neteasemusic|NeteaseMusic/i.test(ua)) { payload.ua = ua.slice(0, 400); has = true; }

  if (has) {
    forward(payload);
  } else {
    try { console.log('[NetEaseCap] 无 MUSIC_U/antiCheat/UA，跳过 ' + url.slice(0, 80)); } catch (e) {}
  }

  $done({});
})();
