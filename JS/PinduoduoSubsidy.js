/*
 * 拼多多首页百亿补贴最小实验配置
 *
 * QingRex 原模块会拒绝 meta.pinduoduo.com。这里仅对 experiment 接口
 * 保留两个由 8.20.0 HAR 证实的首页百亿补贴键，其他实验继续丢弃。
 */

(function () {
  const url = String(($request && $request.url) || '');
  const bodyText = $response && $response.body;
  const expectedUrl = /^https:\/\/meta\.pinduoduo\.com\/api\/app\/v2\/experiment(?:\?|$)/;

  if (!expectedUrl.test(url) || typeof bodyText !== 'string' || bodyText.length === 0) {
    $done({});
    return;
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_) {
    $done({});
    return;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !body.ks || typeof body.ks !== 'object' || Array.isArray(body.ks)) {
    $done({});
    return;
  }

  const allowedKeys = [
    'index_pdd_home_billion_subsidy_entry_pdd_lego_reportm1_6900',
    'pdd_home_shorter_billion_5300',
  ];
  const filtered = {};

  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body.ks, key)) {
      filtered[key] = body.ks[key];
    }
  }

  body.ks = filtered;
  $done({ body: JSON.stringify(body) });
})();
