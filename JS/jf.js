const urlReg = /^https?:\/\/api\.m\.jd\.com\/\?functionId=union_exhibition_bff&client=apple&clientVer/i;

(function () {
  if (!urlReg.test(String($request && $request.url || ''))) {
    $done({});
    return;
  }

  const body = $response && $response.body;
  if (typeof body !== 'string' || body.length === 0) {
    $done({});
    return;
  }

  let obj;
  try {
    obj = JSON.parse(body);
  } catch (_) {
    $done({});
    return;
  }

  if (!Array.isArray(obj && obj.result)) {
    $done({});
    return;
  }

  // 沿用既有规则，只移除带广告落地字段的条目，其余响应字段保持原样。
  obj.result = obj.result.filter((item) => {
    if (!item || typeof item !== 'object') return true;
    return !(
      item.url ||
      (Array.isArray(item.urlList) && item.urlList.length > 0) ||
      item.pcLandUrl ||
      item.landUrl
    );
  });
  obj.hasNext = false;
  obj.totalNum = obj.result.length;

  $done({ body: JSON.stringify(obj) });
})();
