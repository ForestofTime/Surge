// 仅处理抓包发现的无尺寸前缀素材及 ceco 全屏路径，可能影响业务大图。
(function () {
  function dimensions(b) {
    if (b.length < 24) return null;
    if ([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].every((v, i) => b[i] === v)) {
      const u32 = i => b[i]*16777216 + b[i+1]*65536 + b[i+2]*256 + b[i+3];
      return [u32(16), u32(20)];
    }
    if (b[0] !== 255 || b[1] !== 216) return null;
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 255) return null;
      const marker = b[i+1];
      if (marker === 255) { i++; continue; }
      if (marker === 218 || marker === 217) return null;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) { i += 2; continue; }
      const length = b[i+2]*256+b[i+3];
      if (length < 2 || i+2+length > b.length) return null;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        if (length < 8) return null;
        return [b[i+7]*256+b[i+8], b[i+5]*256+b[i+6]];
      }
      i += 2+length;
    }
    return null;
  }
  try {
    const url = String($request.url || '');
    const host = '(?:m|m15|img30)\\.360buyimg\\.com';
    const raw = new RegExp('^https?:\\/\\/' + host + '\\/mobilecms\\/jfs\\/[^?]+(?:\\?.*)?$', 'i').test(url);
    const ceco = new RegExp('^https?:\\/\\/' + host + '\\/ceco\\/s(?:1125x2436|1170x2532|1242x2688|1284x2778|1290x2796|1320x2868)_jfs\\/[^?]+(?:\\?.*)?$', 'i').test(url);
    if ((!raw && !ceco) || Number($response.status) !== 200 || !$response.body || typeof $response.body === 'string') return $done({});
    const bytes = new Uint8Array($response.body);
    const dim = dimensions(bytes);
    const known = dim && ['1125x2436','1170x2532','1242x2688','1284x2778','1290x2796','1320x2868'].includes(dim.join('x'));
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!(raw && known) && !(ceco && (known || webp))) return $done({});
    const headers = {};
    for (const [key, value] of Object.entries($response.headers || {})) {
      if (!/^(?:content-type|content-length|content-encoding|content-range|etag|last-modified)$/i.test(key)) headers[key] = value;
    }
    headers['Content-Type'] = 'image/gif';
    headers['Cache-Control'] = 'no-store';
    return $done({ headers, body: new Uint8Array([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,1,68,0,59]) });
  } catch (_) { return $done({}); }
}());
