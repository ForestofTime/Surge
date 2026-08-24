const requestUrl = String(($request && $request.url) || '');
let result = {};

try {
  if (/^https:\/\/h\.meituan\.com\/horn_ios\/mergeRequest(?:\?|$)/i.test(requestUrl)) {
    const payload = JSON.parse(String($request.body || ''));
    const current = payload && payload.recommend_platform_config;

    if (!current || current.query !== '' || current.etag !== '') {
      payload.recommend_platform_config = { query: '', etag: '' };
      const body = JSON.stringify(payload);
      const headers = Object.assign({}, $request.headers || {});
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-length') delete headers[key];
      }
      headers['Content-Length'] = String(utf8ByteLength(body));
      result = { headers, body };
    }
  }
} catch (_) {
  result = {};
}

$done(result);

function utf8ByteLength(value) {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      length += 1;
    } else if (code <= 0x7ff) {
      length += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        length += 4;
        index += 1;
      } else {
        length += 3;
      }
    } else {
      length += 3;
    }
  }
  return length;
}
