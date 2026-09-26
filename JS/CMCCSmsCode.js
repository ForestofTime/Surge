/* Relays a China Mobile SMS verification code from the phone into the headless QingLong task.
 *
 * 手机侧：快捷指令 / 浏览器把 6 位码发到 http://example.com/c（?code= 或 POST body 均可）。
 * 本脚本：抠码 → ① 写本机 $persistentStore（手动兜底）② 推到 ntfy 主题（青龙任务轮询接住）。
 * 青龙侧：cmcc_100dh.js 的 waitCode() 每 1s 拉一次 ntfy，接住码后带码重打抢兑。
 *
 * 隐私说明：ntfy.sh 是公开服务，知道主题的人可读该主题消息；码 5 分钟有效、价值低。
 * 如不希望上云，把 ntfy_topic 换成自建实例，或改用 Mac 内网接收器。
 */

var DEFAULT_NTFY_TOPIC = 'CHANGE_ME_SET_VIA_ARGUMENT';
var STORE_CODE = 'cmcc_sms_code';
var STORE_AT = 'cmcc_sms_at';
var LOG_TAG = '[CMCCSMS]';

function log(message) {
  try { console.log(LOG_TAG + ' ' + message); } catch (_) { /* 无 console 时忽略 */ }
}

function argumentValue(name) {
  if (typeof $argument === 'object' && $argument !== null) return $argument[name];
  if (typeof $argument !== 'string') return undefined;
  var parts = $argument.split('&');
  for (var i = 0; i < parts.length; i++) {
    var index = parts[i].indexOf('=');
    if (index > 0 && parts[i].slice(0, index) === name) return decodeURIComponent(parts[i].slice(index + 1));
  }
  return undefined;
}

function extractCode(body, url) {
  var m = /(\d{4,8})/.exec(body || '');
  if (m) return m[1];
  var decoded = '';
  try { decoded = decodeURIComponent(url || ''); } catch (_) { decoded = String(url || ''); }
  m = /(\d{4,8})/.exec(decoded);
  return m ? m[1] : '';
}

(function () {
  var body = ($request && $request.body) ? String($request.body) : '';
  var url = ($request && $request.url) ? String($request.url) : '';
  var code = extractCode(body, url);

  if (!code) {
    log('没抠到码 body=' + body.slice(0, 60) + ' url=' + url.slice(0, 80));
    $done({ response: { status: 200, body: 'no-code' } });
    return;
  }

  try {
    $persistentStore.write(code, STORE_CODE);
    $persistentStore.write(String(Date.now()), STORE_AT);
  } catch (_) { /* 存储不可用时仍继续推送 */ }
  log('落码 ' + code);

  var topic = argumentValue('ntfy_topic') || DEFAULT_NTFY_TOPIC;
  var finished = false;
  var finish = function (note) {
    if (finished) return;
    finished = true;
    if (note) log(note);
    $done({ response: { status: 200, body: 'ok ' + code } });
  };

  try {
    $httpClient.post({
      url: 'https://ntfy.sh/' + topic,
      body: code,
      headers: { 'Title': 'cmcc_sms_code' }
    }, function (error) {
      finish(error ? ('ntfy 推送失败: ' + error) : ('已推 ntfy/' + topic));
    });
    setTimeout(function () { finish('ntfy 回调超时（码已本地落库）'); }, 4000);
  } catch (e) {
    finish('ntfy 异常: ' + e);
  }
})();
