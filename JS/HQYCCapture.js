// 环球运营球票据抓取 —— Surge http-request 补丁
// 真机的票据在请求头 ArrowAuthorization + userId 上（login 响应 entity 是空的），
// 所以拦「所有发往该活动网关的请求」，把头部回传 Mac 写青龙 env hqyc_accs。
// 只上报，不改请求，永远 $done({}) 原样放行。
const RECEIVER = "https://hynmac-mini.taila66285.ts.net/hqyc-capture";

function send(payload) {
  if (typeof $httpClient !== "undefined" && $httpClient.post) {
    $httpClient.post({ url: RECEIVER, headers: { "content-type": "application/json" }, body: payload },
      function () { $done({}); });
    return;
  }
  if (typeof $task !== "undefined" && $task.fetch) {
    $task.fetch({ url: RECEIVER, method: "POST", headers: { "content-type": "application/json" }, body: payload })
      .then(function () { $done({}); }, function () { $done({}); });
    return;
  }
  $done({});
}

(function () {
  try {
    const url = (typeof $request !== "undefined" && $request && $request.url) || "";
    const headers = (typeof $request !== "undefined" && $request && $request.headers) || {};
    const pick = {};
    Object.keys(headers).forEach(function (k) {
      if (/^arrow|^userid$|^x-date$|^digest$/i.test(k)) pick[k] = headers[k];
    });
    if (Object.keys(pick).length) {
      return send(JSON.stringify({ url: url, headers: pick, body: "" }));
    }
    // 兜底：响应体里有 entity 时也上报（登录可能走另一条接口）
    if (typeof $response !== "undefined" && $response && $response.body) {
      return send(JSON.stringify({ url: url, headers: {}, body: $response.body }));
    }
  } catch (e) {}
  $done({});
})();
