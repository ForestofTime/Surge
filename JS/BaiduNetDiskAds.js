/**
 * 百度网盘首页广告卡片过滤
 * 仅处理 feed/cardinfos 的 data.cards，保留同级业务字段。
 */

(() => {
  try {
    const url = $request?.url || '';
    if (!/^https:\/\/pan\.baidu\.com\/feed\/cardinfos(?:[/?]|$)/.test(url)) {
      $done({});
      return;
    }

    const payload = JSON.parse($response.body);
    if (!payload?.data || !Array.isArray(payload.data.cards) || payload.data.cards.length === 0) {
      $done({});
      return;
    }

    payload.data.cards = [];
    $done({ body: JSON.stringify(payload) });
  } catch {
    $done({});
  }
})();
