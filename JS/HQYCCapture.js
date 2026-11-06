// 环球运营球票据抓取 —— Surge http-response 补丁
// 命中 ubr/user/login 时把响应体回传 Mac 接收器，写青龙 env hqyc_accs。
// 注意：只上报，不改响应，永远 $done({}) 原样放行。
const RECEIVER = "https://hynmac-mini.taila66285.ts.net/hqyc-capture";

(function () {
  try {
    const body = (typeof $response !== "undefined" && $response && $response.body) || "";
    const url = (typeof $request !== "undefined" && $request && $request.url) || "";
    if (body) {
      const payload = JSON.stringify({ url: url, body: body });
      if (typeof $httpClient !== "undefined" && $httpClient.post) {
        $httpClient.post(
          { url: RECEIVER, headers: { "content-type": "application/json" }, body: payload },
          function () { $done({}); }
        );
        return;
      }
      if (typeof $task !== "undefined" && $task.fetch) {
        $task.fetch({ url: RECEIVER, method: "POST", headers: { "content-type": "application/json" }, body: payload })
          .then(function () { $done({}); }, function () { $done({}); });
        return;
      }
    }
  } catch (e) {}
  $done({});
})();
