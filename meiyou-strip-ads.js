// Surge script: 清理美柚 feed/list 接口内的广告字段
// 兼容 JSON 响应，若未发现广告字段则透传

function strip(obj) {
  const keys = ['ad', 'ads', 'advert', 'ad_list', 'creative', 'banners', 'slots'];
  let touched = false;
  keys.forEach((k) => {
    if (Array.isArray(obj[k])) {
      obj[k] = [];
      touched = true;
    }
    if (obj.data && Array.isArray(obj.data[k])) {
      obj.data[k] = [];
      touched = true;
    }
  });
  return touched;
}

try {
  const body = $response.body || '';
  const json = JSON.parse(body);
  const changed = strip(json);
  if (changed) {
    // 返回 204 以减少客户端广告处理
    $done({ status: 204, body: JSON.stringify(json) });
  } else {
    $done({});
  }
} catch (e) {
  $done({});
}
