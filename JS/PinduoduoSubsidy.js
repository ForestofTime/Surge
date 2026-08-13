/*
 * 拼多多首页百亿补贴最小渲染修复
 *
 * 1. experiment 仅保留两个由 8.20.0 HAR 证实的百亿补贴键。
 * 2. homepage 只收敛 module_order 与 dy_module，避免客户端先遇到
 *    QingRex 已删除载荷的模块后停止渲染。
 */

(function () {
  const url = String(($request && $request.url) || '');
  const bodyText = $response && $response.body;
  const experimentUrl = /^https:\/\/meta\.pinduoduo\.com\/api\/app\/v2\/experiment(?:\?|$)/;
  const homepageUrl = /^https:\/\/api\.pinduoduo\.com\/api\/alexa\/homepage\/hub(?:\?|$)/;

  if ((!experimentUrl.test(url) && !homepageUrl.test(url)) ||
      typeof bodyText !== 'string' || bodyText.length === 0) {
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

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    $done({});
    return;
  }

  if (homepageUrl.test(url)) {
    const result = body.result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      $done({});
      return;
    }

    const allowedModules = new Set([
      'billion_subsidy_entrance',
      'billion_subsidy_entrance_dy',
      'billion_subsidy_entrance_lite',
    ]);

    if (Array.isArray(result.module_order)) {
      result.module_order = result.module_order.filter((item) =>
        item && typeof item === 'object' && !Array.isArray(item) &&
        allowedModules.has(String(item.module_name || ''))
      );
    }

    if (result.dy_module && typeof result.dy_module === 'object' &&
        !Array.isArray(result.dy_module)) {
      for (const key of Object.keys(result.dy_module)) {
        if (key !== 'billion_subsidy_entrance_dy') delete result.dy_module[key];
      }
    }

    $done({ body: JSON.stringify(body) });
    return;
  }

  if (!body.ks || typeof body.ks !== 'object' || Array.isArray(body.ks)) {
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
