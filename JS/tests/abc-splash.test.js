#!/usr/bin/env node
// 合成图片头只验证尺寸过滤逻辑，不代表真机或完整图片解码验收。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '../ABCSplash.js'), 'utf8');
const materialUrl = 'https://midc.cdn-static.abchina.com.cn/distributecenterimg/file/download/0123456789abcdef0123456789abcdef';

function jpegHeader(width, height) {
  const bytes = Buffer.alloc(40);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function run(body, url = materialUrl) {
  const results = [];
  vm.runInNewContext(source, {
    $request: { url }, $response: { body },
    console: { log() {} },
    $done: (value) => results.push(value),
  }, { timeout: 3000 });
  assert.equal(results.length, 1, '$done must be called exactly once');
  return results[0];
}

function assertPassthrough(result) {
  assert.deepEqual(Object.keys(result), []);
}

for (const [format, fixture] of [['JPEG', jpegHeader], ['PNG', pngHeader]]) {
  test(`${format} 1125x2082 splash header becomes a tiny GIF`, () => {
    const result = run(new Uint8Array(fixture(1125, 2082)));
    assert.equal(result.headers['Content-Type'], 'image/gif');
    assert.equal(Object.prototype.toString.call(result.body), '[object Uint8Array]');
    const gif = Buffer.from(result.body);
    assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
    assert.equal(gif.length, 42);
  });
  for (const [width, height] of [[670, 200], [319, 184], [1005, 231], [323, 382]]) {
    test(`${format} ${width}x${height} business image passes unchanged`, () => {
      assertPassthrough(run(new Uint8Array(fixture(width, height))));
    });
  }
}

test('non-material host passes even with splash dimensions', () => {
  assertPassthrough(run(new Uint8Array(jpegHeader(1125, 2082)),
    'https://mb.cdn-static.abchina.com.cn/product/image'));
});

test('missing, malformed and truncated image bodies pass unchanged', () => {
  for (const body of [undefined, '', 'not an image', new Uint8Array(40),
    new Uint8Array(jpegHeader(1125, 2082).subarray(0, 10)),
    new Uint8Array(pngHeader(1125, 2082).subarray(0, 20))]) {
    assertPassthrough(run(body));
  }
});

test('fake PNG prefix does not count as a PNG signature', () => {
  const bytes = pngHeader(1125, 2082);
  bytes.fill(0, 2, 8);
  assertPassthrough(run(new Uint8Array(bytes)));
});

test('PNG without IHDR passes unchanged', () => {
  const bytes = pngHeader(1125, 2082);
  bytes.write('IDAT', 12, 'ascii');
  assertPassthrough(run(new Uint8Array(bytes)));
});

test('JPEG with missing or truncated segment passes unchanged', () => {
  const missing = jpegHeader(1125, 2082);
  missing[4] = 0;
  missing[5] = 1;
  const truncated = jpegHeader(1125, 2082);
  truncated[4] = 1;
  truncated[5] = 0;
  for (const bytes of [missing, truncated]) assertPassthrough(run(new Uint8Array(bytes)));
});

test('module uses one binary response script and exact MITM host', () => {
  const module = fs.readFileSync(path.resolve(__dirname, '../../Module/ABCSplash.sgmodule'), 'utf8');
  assert.match(module, /#!desc=.*v2/);
  const scripts = module.split(/\r?\n/).filter((line) => /type=http-response/.test(line));
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /binary-body-mode=true/);
  assert.match(scripts[0], /max-size=1048576/);
  assert.match(module, /^hostname = %APPEND% midc\.cdn-static\.abchina\.com\.cn$/m);
  assert.match(module, /\[Map Local\]/);
  assert.match(module, /ed64/);
  assert.match(module, /74b5/);
  assert.match(module, /data-type=tiny-gif/);
});

test('legacy duplicate module and README install entry are removed', () => {
  assert.equal(fs.existsSync(path.resolve(__dirname, '../../Module/nyyh.sgmodule')), false);
  const readme = fs.readFileSync(path.resolve(__dirname, '../../README.md'), 'utf8');
  assert.doesNotMatch(readme, /Module(?:\/|%2F)nyyh\.sgmodule/);
});
