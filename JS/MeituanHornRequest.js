const requestUrl = String(($request && $request.url) || '');
let result = {};

try {
  if (/^https:\/\/h\.meituan\.com\/horn_ios\/mergeRequest(?:\?|$)/i.test(requestUrl)) {
    const payload = JSON.parse(String($request.body || ''));
    const current = payload && payload.recommend_platform_config;

    if (!current || current.query !== '' || current.etag !== '') {
      payload.recommend_platform_config = { query: '', etag: '' };
      result = { body: JSON.stringify(payload) };
    }
  }
} catch (_) {
  result = {};
}

$done(result);
