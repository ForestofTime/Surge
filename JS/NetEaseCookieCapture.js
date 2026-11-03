/**
 * NetEaseCookieCapture.js —— 网易云 MUSIC_U 抓取 · Surge 版 v1
 *
 * 约定：设备端只做「截到 → 原样传 Mac」，不解析、不去重、不判断。
 * 幂等、校验、落库全部在 Mac 的 netease-cookie-receiver.js。
 */

(function () {
  var DEFAULT_PHONE = '';
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

  function cookieOf(h) {
    for (var k in h) {
      if (String(k).toLowerCase() === 'cookie') return String(h[k]);
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

  // 只在 music.163.com / interface.music.163.com 上取 Cookie
  if (!/\/\/(?:[\w-]+\.)?music\.163\.com\//.test(url)) {
    $done({});
    return;
  }

  var ck = cookieOf(headers);
  if (ck && /MUSIC_U=[^;]{40,}/.test(ck)) {
    forward({ type: 'cookie', cookie: ck.slice(0, 8000), url: url.slice(0, 300), phone: DEFAULT_PHONE });
  } else {
    try { console.log('[NetEaseCap] 无 MUSIC_U，跳过 ' + url.slice(0, 80)); } catch (e) {}
  }

  $done({});
})();
