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
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    console: { log() {} },
    $done: (value) => results.push(value),
  }, { timeout: 3000 });
  assert.equal(results.length, 1, '$done must be called exactly once');
  return JSON.parse(JSON.stringify(results[0]));
}

for (const [format, fixture] of [['JPEG', jpegHeader], ['PNG', pngHeader]]) {
  test(`${format} 1125x2082 splash header becomes a tiny GIF`, () => {
    const result = run(fixture(1125, 2082).toString('base64'));
    assert.equal(result.headers['Content-Type'], 'image/gif');
    const gif = Buffer.from(result.body, 'binary');
    assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
    assert.equal(gif.length, 42);
  });
  for (const [width, height] of [[670, 200], [319, 184], [1005, 231], [323, 382]]) {
    test(`${format} ${width}x${height} business image passes unchanged`, () => {
      assert.deepEqual(run(fixture(width, height).toString('base64')), {});
    });
  }
}

test('non-material host passes even with splash dimensions', () => {
  assert.deepEqual(run(jpegHeader(1125, 2082).toString('base64'),
    'https://mb.cdn-static.abchina.com.cn/product/image'), {});
});

test('missing, malformed and truncated image bodies pass unchanged', () => {
  for (const body of [undefined, '', 'not an image', Buffer.alloc(40).toString('base64'),
    jpegHeader(1125, 2082).subarray(0, 10).toString('base64'),
    pngHeader(1125, 2082).subarray(0, 20).toString('base64')]) {
    assert.deepEqual(run(body), {});
  }
});
