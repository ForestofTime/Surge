const requestUrl = String(($request && $request.url) || '');
let result = {};

try {
  if (/^https:\/\/h\.meituan\.com\/horn_ios\/mergeRequest(?:\?|$)/i.test(requestUrl)) {
    const inputBody = $request.body;
    const binaryBody = typeof inputBody !== 'string';
    const payload = JSON.parse(binaryBody ? decodeUtf8(inputBody) : String(inputBody || ''));
    const platformConfig = payload && payload.recommend_platform_config;
    const userConfig = payload && payload.user_config;

    if (!platformConfig || platformConfig.query !== '' || platformConfig.etag !== '' ||
        !userConfig || userConfig.query !== '' || userConfig.etag !== '') {
      payload.recommend_platform_config = { query: '', etag: '' };
      payload.user_config = { query: '', etag: '' };
      const text = JSON.stringify(payload);
      const body = binaryBody ? encodeUtf8(text) : text;
      const headers = Object.assign({}, $request.headers || {});
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-length') delete headers[key];
      }
      headers['Content-Length'] = String(binaryBody ? body.length : utf8ByteLength(body));
      result = { headers, body };
    }
  }
} catch (_) {
  result = {};
}

$done(result);

function decodeUtf8(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return '';
  let output = '';
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++];
    if (first < 0x80) {
      output += String.fromCharCode(first);
    } else if (first < 0xe0) {
      const second = bytes[index++] & 0x3f;
      output += String.fromCharCode(((first & 0x1f) << 6) | second);
    } else if (first < 0xf0) {
      const second = bytes[index++] & 0x3f;
      const third = bytes[index++] & 0x3f;
      output += String.fromCharCode(((first & 0x0f) << 12) | (second << 6) | third);
    } else {
      const second = bytes[index++] & 0x3f;
      const third = bytes[index++] & 0x3f;
      const fourth = bytes[index++] & 0x3f;
      let code = ((first & 0x07) << 18) | (second << 12) | (third << 6) | fourth;
      code -= 0x10000;
      output += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    }
  }
  return output;
}

function encodeUtf8(value) {
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff);
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
        index += 1;
      } else {
        bytes.push(0xef, 0xbf, 0xbd);
      }
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

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
