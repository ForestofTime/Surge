const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '../JingdongFullscreenImage.js');
const modulePath = path.resolve(__dirname, '../../Module/JingdongAds.sgmodule');
const mobile = 'https://m15.360buyimg.com/mobilecms/jfs/t1/synthetic/image.png';
const ceco = 'https://img30.360buyimg.com/ceco/s1320x2868_jfs/t1/synthetic/image.jpg!q70.webp';

function png(width, height) {
  const bytes = Buffer.alloc(40);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13]);
  bytes.write('IHDR', 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}
function jpeg(width, height) {
  const bytes = Buffer.alloc(40);
  bytes.set([255,216,255,192,0,17,8]);
  bytes.writeUInt16BE(height, 7); bytes.writeUInt16BE(width, 9);
  return bytes;
}
function run(url, body, status = 200) {
  const source = fs.readFileSync(scriptPath, 'utf8');
  let calls = [];
  vm.runInNewContext(source, { $request: { url }, $response: { status, body, headers: { 'Content-Length': '40', 'Content-Encoding': 'gzip' } }, $done: value => calls.push(value) }, { filename: scriptPath });
  assert.equal(calls.length, 1); return calls[0];
}
test('unlabelled full-screen PNG and JPEG return a valid image placeholder', () => {
  for (const body of [png(1125, 2436), jpeg(1320, 2868)]) {
    const out = run(mobile, new Uint8Array(body));
    assert.equal(out.headers['Content-Type'], 'image/gif');
    assert.equal(Buffer.from(out.body).subarray(0, 6).toString(), 'GIF89a');
    assert.equal(Object.keys(out.headers).some(k => /^content-(?:length|encoding)$/i.test(k)), false);
  }
});
test('ceco explicitly requested full-screen dimensions are replaced even if source is WebP', () => {
  const out = run(ceco, new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]));
  assert.equal(out.headers['Content-Type'], 'image/gif');
});
test('ordinary product thumbnails, other hosts and invalid responses pass', () => {
  for (const [url, body, status] of [
    [mobile, png(714, 714), 200], [mobile, png(1125, 1800), 200],
    [mobile, Buffer.from('not an image'), 200], [mobile, png(1125,2436).subarray(0,20), 200],
    [mobile, png(1125,2436), 206], [mobile.replace('m15.', 'm15.unknown.'), png(1125,2436), 200],
    [ceco.replace('s1320x2868', 's714x714'), png(714,714), 200],
  ]) assert.equal(Object.keys(run(url, new Uint8Array(body), status)).length, 0);
});
test('module dispatches both captured paths with binary response and img30 MITM', () => {
  const module = fs.readFileSync(modulePath, 'utf8');
  const line = module.split('\n').find(s => s.startsWith('京东-屏幕尺寸素材过滤 ='));
  assert.ok(line); assert.match(line, /type=http-response/); assert.match(line, /binary-body-mode=true/);
  const pattern = new RegExp(line.match(/pattern=(.*?), script-path=/)[1]);
  assert.equal(pattern.test(mobile), true); assert.equal(pattern.test(ceco), true);
  assert.match(module, /^hostname = %APPEND% .*img30\.360buyimg\.com/m);
});
