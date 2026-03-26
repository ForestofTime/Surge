// Surge script: 清理美柚 feed/list 接口内的广告字段
// 兼容 JSON 响应，若未发现广告字段则透传

const AD_KEYS = ['ad', 'ads', 'advert', 'ad_list', 'creative', 'banners', 'slots'];

function stripAdsDeep(node) {
  if (!node) return false;

  let touched = false;

  if (Array.isArray(node)) {
    node.forEach((item) => {
      if (stripAdsDeep(item)) touched = true;
    });
    return touched;
  }

  if (typeof node === 'object') {
    Object.keys(node).forEach((key) => {
      const value = node[key];
      if (AD_KEYS.includes(key) && Array.isArray(value)) {
        node[key] = [];
        touched = true;
        return;
      }
      if (stripAdsDeep(value)) touched = true;
    });
  }

  return touched;
}

try {
  const body = $response.body || '';
  const json = JSON.parse(body);
  const changed = stripAdsDeep(json);
  if (changed) {
    $done({ body: JSON.stringify(json) });
  } else {
    $done({});
  }
} catch (e) {
  $done({});
}
