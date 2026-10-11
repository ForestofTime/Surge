/*
 * 渝卡通城市漫步 token 自动捕获 + 上报 Mac Tailnet receiver
 * 抓 ggfw.rlsbj.cq.gov.cn 的 wxOneClickLogin 响应, 取 token, 上报青龙写 ykt_data.
 * 复用 CMCCJwtCapture 的 postReceiver 模式。
 */

const KEY = 'ykt_data';
const RECEIVER = 'https://hynmac-mini.taila66285.ts.net/ykt-capture';

function log(...a) { try { console.log('[ykt] ' + a.join(' ')); } catch (_) {} }
function notify(title, body) {
  try {
    if (typeof $notification !== 'undefined' && $notification && $notification.post) { $notification.post(title, '', body); return; }
    if (typeof $notify !== 'undefined') { $notify(title, '', body); return; }
  } catch (_) {}
}

function postReceiver(tel, token) {
  if (typeof $httpClient === 'undefined') {
    log('宿主无 $httpClient, 跳过上报');
    return;
  }
  let settled = false;
  const finish = () => { if (!settled) { settled = true; try { $done({}); } catch (_) {} } };
  setTimeout(finish, 3000); // 上报再慢也不能拖住原请求
  $httpClient.post({
    url: RECEIVER,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tel: tel, token: token }),
    timeout: 8,
    policy: 'Tailnet',
  }, (error, response, data) => {
    const status = response && (response.status || response.statusCode);
    if (error) {
      log('上报失败: ' + String(error).slice(0, 100));
      notify('渝卡通 token 同步失败', String(error).slice(0, 60));
      finish();
      return;
    }
    if (status >= 200 && status < 300) {
      log('上报成功 HTTP=' + status);
    } else {
      log('上报失败 HTTP=' + status + ' ' + String(data).slice(0, 100));
      notify('渝卡通 token 同步失败', 'HTTP=' + status);
    }
    finish();
  });
}

function main() {
  // 只在 wxOneClickLogin 响应里抓
  const url = typeof $request !== 'undefined' && $request ? $request.url : '';
  if (!/wxOneClickLogin/.test(url)) {
    if (typeof $done === 'function') $done({});
    return;
  }
  let token = '', tel = '';
  if (typeof $response !== 'undefined' && $response && $response.body) {
    try {
      const body = JSON.parse($response.body);
      token = body.token || (body.data && body.data.token) || '';
    } catch (e) {}
  }
  if (!token) {
    log('未在响应体取到 token');
    if (typeof $done === 'function') $done({});
    return;
  }
  // tel 从 token 里解 (JWT payload.mobile/userName) 或留空由 receiver 处理
  try {
    const seg = String(token).split('.');
    if (seg.length >= 2) {
      const b64 = seg[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
      const payload = JSON.parse(atob(pad));
      tel = payload.mobile || payload.phone || payload.tel || payload.userName || '';
    }
  } catch (e) {}
  log('抓到 token, tel=' + (tel || '(待定)') + ' token前10=' + token.slice(0, 10));
  notify('渝卡通 token 已捕获', tel ? ('账号 ' + tel) : 'token 已捕获');
  postReceiver(tel, token);
}

main();
