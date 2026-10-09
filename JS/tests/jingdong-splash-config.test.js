const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '../JingdongSplashConfig.js');

function run(body, url = 'https://api.m.jd.com/client.action?functionId=start', method = 'GET') {
  const calls = [];
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), {
    $request: { url, method, headers: {} },
    $response: { body },
    $done: value => calls.push(value),
    console: { log() {} },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    TextDecoder,
    TextEncoder,
  }, { filename: scriptPath });
  assert.equal(calls.length, 1, '$done must be called exactly once');
  return JSON.parse(JSON.stringify(calls[0]));
}

function cleared(input, expected, url, method) {
  const result = run(JSON.stringify(input), url, method);
  assert.equal(typeof result.body, 'string');
  assert.deepEqual(JSON.parse(result.body), expected);
}

test('known splash functions clear images and daily display count without altering sibling business fields', () => {
  for (const functionId of ['start', 'startup', 'queryMaterialAdverts']) {
    const input = { code: 0, images: [{ imageUrl: 'https://example.test/splash.jpg' }], showTimesDaily: 3, orders: { unpaid: 2 }, token: 'synthetic' };
    cleared(input, { ...input, images: [], showTimesDaily: 0 }, `https://api.m.jd.com/client.action?client=apple&functionId=${functionId}`);
  }
});

test('nested data splash configuration preserves response envelope and unrelated data fields', () => {
  const input = { code: '0', message: '成功', data: { images: [{ videoUrl: 'https://example.test/splash.mp4' }], showTimesDaily: '5', deviceLevel: 4, orderCounts: { receive: 6 } }, metadata: [1, 2] };
  cleared(input, { ...input, data: { ...input.data, images: [], showTimesDaily: 0 } });
});

test('root images are selected even when an unrelated data wrapper also exists', () => {
  const input = { images: [{ url: 'https://example.test/a.jpg' }], data: { deviceLevel: 5 }, showTimesDaily: 2 };
  cleared(input, { ...input, images: [], showTimesDaily: 0 });
});

test('known splash function allows images-only payload without inventing display-count fields', () => {
  const input = { images: ['legacy-image'], preserved: true };
  cleared(input, { ...input, images: [] });
});

test('Base64 JSON retains Base64 encoding and Chinese text after narrow mutation', () => {
  const input = { code: 0, data: { images: [{ imgUrl: 'https://example.test/a.jpg' }], showTimesDaily: 1, title: '京东订单：待收货' }, message: '成功😀' };
  const encoded = Buffer.from(JSON.stringify(input), 'utf8').toString('base64');
  const result = run(encoded);
  assert.equal(typeof result.body, 'string');
  assert.match(result.body, /^[A-Za-z0-9+/]*={0,2}$/);
  assert.deepEqual(JSON.parse(Buffer.from(result.body, 'base64').toString('utf8')), { ...input, data: { ...input.data, images: [], showTimesDaily: 0 } });
});

test('POST mixed entry without URL function requires the full splash structural signature', () => {
  for (const field of ['image', 'imageUrl', 'imgUrl', 'url', 'videoUrl']) {
    const input = { data: { images: [{ [field]: 'https://example.test/a' }], showTimesDaily: 2, orderCounts: { unpaid: 7 } }, code: 0 };
    cleared(input, { ...input, data: { ...input.data, images: [], showTimesDaily: 0 } }, 'https://api.m.jd.com/client.action', 'POST');
  }
  const input = { images: [], showTimesDaily: 5, preserved: true };
  cleared(input, { ...input, showTimesDaily: 0 }, 'https://api.m.jd.com/client.action', 'POST');
});

test('explicit unrelated URL function never mutates business images even with splash-like keys', () => {
  const input = { images: [{ imageUrl: 'https://example.test/product.jpg' }], showTimesDaily: 3, orders: { unpaid: 5 } };
  for (const functionId of ['uniformRecommend', 'personinfoBusiness', 'getPageConfig', 'basicConfig']) {
    assert.deepEqual(run(JSON.stringify(input), `https://api.m.jd.com/client.action?functionId=${functionId}`, 'POST'), {});
  }
});

test('startup device-level payload remains untouched', () => {
  const input = { code: 0, message: '成功', data: { deviceLevel: 5 } };
  assert.deepEqual(run(JSON.stringify(input), 'https://api.m.jd.com/client.action?functionId=startup', 'POST'), {});
});

test('ambiguous mixed business payloads and GET requests pass through', () => {
  for (const input of [
    { images: [{ imageUrl: 'https://example.test/product.jpg' }] },
    { images: ['https://example.test/a.jpg'], showTimesDaily: 2 },
    { images: [{ goodsId: 123 }], showTimesDaily: 2 },
    { images: [{ url: 'https://example.test/a.jpg' }, null], showTimesDaily: 2 },
    { images: {}, showTimesDaily: 2 },
    { data: { images: [{ url: 'https://example.test/a.jpg' }] }, showTimesDaily: 2 },
  ]) {
    assert.deepEqual(run(JSON.stringify(input), 'https://api.m.jd.com/client.action', 'POST'), {});
  }
  assert.deepEqual(run(JSON.stringify({ images: [{ url: 'https://example.test/a.jpg' }], showTimesDaily: 2 }), 'https://api.m.jd.com/client.action', 'GET'), {});
});

test('host and endpoint checks protect other domains and similar paths', () => {
  const body = JSON.stringify({ images: [{ url: 'https://example.test/a.jpg' }], showTimesDaily: 1 });
  for (const url of [
    'https://api.m.jd.com.evil.test/client.action?functionId=start',
    'https://example.test/client.action?functionId=start',
    'https://api.m.jd.com/client.action/extra?functionId=start',
    'https://api.m.jd.com/other.action?functionId=start',
  ]) assert.deepEqual(run(body, url), {});
});

test('malformed JSON, invalid Base64, and nonobject responses fail open', () => {
  for (const body of ['', '{broken', '%%%notbase64', 'eyJpbWFnZXMiOltdfQ==garbage', 'null', '[]', '42', Buffer.from('{broken').toString('base64')]) {
    assert.deepEqual(run(body), {}, body);
  }
});

test('non-array images in known endpoint do not erase fields or disable business displays', () => {
  for (const images of [null, {}, 'https://example.test/a.jpg', 1]) {
    assert.deepEqual(run(JSON.stringify({ images, showTimesDaily: 5, orders: { receive: 2 } })), {});
  }
});
