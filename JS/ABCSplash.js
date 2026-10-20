// 农业银行 midc 开屏尺寸过滤 v2。使用 Surge 二进制响应，不依赖 atob/Buffer。
(function () {
  function dimensions(bytes) {
    if (bytes.length < 32) return null;
    if ([137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) {
      if (bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13
        || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
      const uint32 = i => bytes[i] * 16777216 + bytes[i+1] * 65536 + bytes[i+2] * 256 + bytes[i+3];
      return { w: uint32(16), h: uint32(20) };
    }
    if (bytes[0] !== 255 || bytes[1] !== 216) return null;
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 255) return null;
      const marker = bytes[i + 1];
      if (marker === 255) { i++; continue; }
      if (marker === 218 || marker === 217) return null;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) { i += 2; continue; }
      const length = bytes[i + 2] * 256 + bytes[i + 3];
      if (length < 2 || i + 2 + length > bytes.length) return null;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        if (length < 8) return null;
        return { h: bytes[i+5] * 256 + bytes[i+6], w: bytes[i+7] * 256 + bytes[i+8] };
      }
      i += 2 + length;
    }
    return null;
  }
  try {
    if (!/^https?:\/\/midc\.cdn-static\.abchina\.com\.cn\/distributecenterimg\/file\/download\/[0-9a-f]{32,}(?:\?|$)/i.test(String($request.url || ''))) return $done({});
    // binary-body-mode=true 下只接受真实字节，文本和无法识别的数据保守透传。
    const body = $response.body;
    if (!body || typeof body === 'string') return $done({});
    const bytes = new Uint8Array(body);
    const dim = dimensions(bytes);
    if (!dim || dim.w < 1000 || dim.h / dim.w < 1.7) return $done({});
    return $done({
      body: new Uint8Array([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,1,68,0,59]),
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
    });
  } catch (_) { return $done({}); }
}());
