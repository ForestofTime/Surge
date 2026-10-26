const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/JingdongAds.sgmodule');
const scriptPath = path.resolve(__dirname, '../JingdongSplash.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const moduleText = fs.readFileSync(modulePath, 'utf8');
const scriptText = fs.readFileSync(scriptPath, 'utf8');
const readmeText = fs.readFileSync(readmePath, 'utf8');

function sectionLines(text, sectionName) {
  const section = text.match(
    new RegExp('\\[' + sectionName + '\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)')
  );
  assert.ok(section, '[' + sectionName + '] section must exist');
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function runRawRequest(url, headers) {
  const doneCalls = [];
  vm.runInNewContext(
    scriptText,
    {
      $request: { url, headers },
      $done: (value) => doneCalls.push(value),
    },
    { filename: scriptPath }
  );
  assert.equal(doneCalls.length, 1, 'request script must call $done exactly once');
  return doneCalls[0];
}

function runRequest(url, headers) {
  return JSON.parse(JSON.stringify(runRawRequest(url, headers)));
}

test('October 8 launch MP4 fallback under /vod/numeric is handled while business playback passes', () => {
  // HAR: old /100831 MP4 returned 204, then /vod/24 MP4 returned 206 (3,141,898 bytes).
  const url = 'https://vod.300hu.com/vod/24/example/launch.mp4';
  const headers = {
    'User-Agent': 'ffmpeg/4.0;jdmall;iphone;version/16.0.70;build/171012',
    Referer: 'play:ijkplayerSH_JDMainPageViewController_999_161_130000-163b',
  };
  const rule = sectionLines(moduleText, 'Script').find(line => line.startsWith('京东-主页面启动视频跳过'));
  const pattern = rule.match(/pattern=(.*?), script-path=/)[1];
  assert.equal(new RegExp(pattern).test(url), true, 'module must dispatch the new launch path');
  assert.deepEqual(runRequest(url, headers), { response: { status: 204 } });
  for (const [otherUrl, otherHeaders] of [
    [url, { ...headers, Referer: 'play:ijkplayerProductDetail' }],
    [url, { ...headers, Referer: 'play:ijkplayerSH_DiscoverViewController_24_' }],
    [url, { 'User-Agent': 'JD4iPhone/16.0.70 CFNetwork/3896.200.52 Darwin/27.2.0' }],
    [url.replace('/vod/24/', '/vod/product/'), headers],
    [url.replace('vod.300hu', 'jvod.300hu'), headers],
  ]) {
    assert.deepEqual(runRequest(otherUrl, otherHeaders), {}, 'non-launch context must pass');
  }
});

test('October 26 storage material-video fallback requires the JD launch-player context', () => {
  // 最新 HAR：旧 MP4 已 204，随后 storage 素材视频仍返回 200 / 1,007,862 字节。
  const url = 'https://storage.360buyimg.com/material-video/video/synthetic-launch.mp4';
  const launchHeaders = {
    'User-Agent': 'CFNetwork;jdmall;iphone;version/16.1.0;build/synthetic',
    Referer: 'play:avplayerSH_JDMainPageViewController_20_',
  };
  for (const candidate of [url, url + '?source=synthetic', url.replace('synthetic-launch.mp4', 'nested/rotating-launch.mp4')]) {
    assert.deepEqual(runRequest(candidate, launchHeaders), { response: { status: 204 } }, 'rotating launch material path must be handled');
  }
  for (const [candidate, headers] of [
    [url, { ...launchHeaders, Referer: 'play:avplayerProductDetail' }],
    [url, { ...launchHeaders, Referer: 'play:avplayerSH_DiscoverViewController_20_' }],
    [url, { 'User-Agent': launchHeaders['User-Agent'] }],
    [url, { Referer: launchHeaders.Referer }],
    [url, { ...launchHeaders, 'User-Agent': 'JD4iPhone/16.1.0 CFNetwork/1 Darwin/1' }],
    [url.replace('storage.', 'storage2.'), launchHeaders],
    [url.replace('/material-video/video/', '/material-video/product/'), launchHeaders],
    [url.replace('.mp4', '.m3u8'), launchHeaders],
    [url.replace('.mp4', '.ts'), launchHeaders],
    [url.replace('.mp4', ''), launchHeaders],
    ['https://storage.360buyimg.com/material-video/video/', launchHeaders],
    ['https://storage.360buyimg.com/material-video/video/?source=synthetic', launchHeaders],
    ['https://storage.360buyimg.com.evil.test/material-video/video/launch', launchHeaders],
  ]) assert.deepEqual(runRequest(candidate, headers), {}, 'business playback and unknown contexts must pass');

  const rule = sectionLines(moduleText, 'Script').find(line => line.includes('storage') && !line.includes('AVIF'));
  assert.ok(rule, 'module must dispatch the storage material path');
  const pattern = new RegExp(rule.match(/pattern=(.*?), script-path=/)[1]);
  assert.equal(pattern.test(url), true);
  assert.equal(pattern.test('https://storage.360buyimg.com/material-video/video/'), false);
  assert.equal(pattern.test('https://storage.360buyimg.com/material-video/video/?source=synthetic'), false);
  assert.equal(pattern.test(url.replace('.mp4', '.m3u8')), false);
});

test('AVIF splash bypasses the GIF Map Local and receives actual AVIF bytes', () => {
  // 2026-09-30-104036 HAR: this path class received image/gif, 35 bytes,
  // via Map Local; the AVIF request script did not run.
  const url = 'https://m.360buyimg.com/mobilecms/s1125x2436_jfs/t1/example/launch.jpg.avif';
  const mapPattern = sectionLines(moduleText, 'Map Local').find(line => line.includes('data-type=tiny-gif')).split(' ')[0];
  assert.equal(new RegExp(mapPattern).test(url), false, 'GIF mapping must not shadow AVIF script');
  assert.equal(new RegExp(mapPattern).test(url.replace('.avif', '')), true, 'JPEG mapping must remain');

  const scriptRule = sectionLines(moduleText, 'Script').find(line => line.startsWith('京东-开屏图AVIF跳过'));
  assert.ok(scriptRule);
  assert.match(scriptRule, /binary-body-mode=true/);
  const result = runRawRequest(url, {});
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers['Content-Type'], 'image/avif');
  assert.ok(ArrayBuffer.isView(result.response.body), 'body must be binary, not a data URL string');
  const body = Buffer.from(result.response.body);
  assert.equal(body.toString('ascii', 4, 8), 'ftyp');
  assert.equal(body.toString('ascii', 8, 12), 'avif');
  assert.equal(body.length, 473);
  assert.deepEqual(runRequest(url.replace('s1125x2436', 's240x240'), {}), {}, 'product AVIF must pass');
});

test('publishes a splash-only native Surge module', () => {
  assert.match(moduleText, /^#!name=京东去开屏$/m);
  assert.match(moduleText, /清理京东开屏配置并拦截开屏素材，禁用 HTTPDNS，保留页面业务/);
  assert.match(moduleText, /v22$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/JingdongAds\.sgmodule$/m
  );

  for (const removed of [
    'JingdongAds.js',
    'functionId',
    'jddebug.com',
    'uniformRecommend',
    'personinfoBusiness',
    'cartCouponRecommendGoods',
  ]) {
    assert.equal(moduleText.includes(removed), false, removed + ' must not remain in the splash-only module');
  }

  assert.match(moduleText, /^京东-主页面启动视频跳过 = type=http-request,/m);
  assert.ok(moduleText.includes('pattern=^https?:\\/\\/vod\\.300hu\\.com\\/(?:vod\\/)?\\d+\\/.*\\.mp4(?:\\?.*)?$'));
  assert.match(moduleText, /\/JS\/JingdongSplash\.js\?v=22/);
  assert.match(moduleText, /京东-开屏配置清理 = type=http-response,.*JingdongSplashConfig\.js\?v=22, requires-body=true/);
  assert.match(moduleText, /^京东-主页面启动流跳过 = type=http-request,/m);
  assert.match(
    moduleText,
    /pattern=\^https\?:\\\/\\\/discover\\\.300hu\\\.com\\\/\.\*\\\.\(\?:m3u8\|ts\)\(\?:\\\?\.\*\)\?\$/
  );
});

test('keeps only the QUIC fallbacks required by the confirmed splash paths', () => {
  assert.deepEqual(sectionLines(moduleText, 'Rule'), [
    'AND, ((PROTOCOL, UDP), (DOMAIN, m.360buyimg.com)), REJECT',
    'AND, ((PROTOCOL, UDP), (DOMAIN, m15.360buyimg.com)), REJECT',
    'AND, ((PROTOCOL, UDP), (DOMAIN, vod.300hu.com)), REJECT',
    'AND, ((PROTOCOL, UDP), (DOMAIN, discover.300hu.com)), REJECT',
    'AND, ((PROTOCOL, UDP), (DOMAIN, storage.360buyimg.com)), REJECT',
  ]);
});

test('maps the full-screen canvas class across the rotating image hosts', () => {
  const rules = sectionLines(moduleText, 'Map Local').filter(line => line.includes('data-type=tiny-gif'));
  assert.equal(rules.length, 1, 'exactly one image Map Local rule');
  const [rule] = rules;

  // 尺寸段是稳定的；主机前缀会轮换（m. / m11. / m15. / img30. / storage.）。
  assert.match(rule, /\^https\?:\\\/\\\//, 'anchored pattern');
  assert.match(rule, /\\\.360buyimg\\\.com/, 'matches the 360buyimg host family');
  assert.match(rule, /1125x2436/, 'covers the observed canvas class');
  for (const other of ['1170x2532', '1242x2688', '1284x2778', '1290x2796', '1320x2868']) {
    assert.ok(rule.includes(other), 'covers full-screen canvas class ' + other);
  }
  assert.match(rule, /_jfs\(\?:\\\/\|\$\)/, 'anchors on the jfs path segment');

  // 绝不能退回 data-type=text：1 字节文本喂给图片解码器会失败，
  // App 随即回退到本地缓存的旧开屏图 —— 规则命中但广告照旧显示。
  assert.doesNotMatch(rule, /data-type=text/, 'must not serve text for an image request');
  assert.match(rule, /data-type=tiny-gif/, 'must serve a decodable 1x1 transparent GIF');

  // 方形商品图尺寸不能被卷进来。
  for (const square of ['714x714', '357x357', '240x240', '225x225', '222x222']) {
    assert.ok(!rule.includes(square), 'square product-image class ' + square + ' must stay out');
  }
});

test('HTTPDNS fallback maps only the two HAR-confirmed paths to an empty 404', () => {
  const rules = sectionLines(moduleText, 'Map Local');
  assert.equal(rules.length, 2, 'one HTTPDNS rule and one image rule');
  const rule = rules.find(line => line.includes('dns'));
  assert.ok(rule);
  assert.match(rule, /data-type=text data="" status-code=404$/);
  const pattern = new RegExp(rule.split(' ')[0]);
  for (const url of ['https://dns.jd.com/v6/b', 'https://dns.jd.com/v6/d?synthetic=1']) {
    assert.equal(pattern.test(url), true, 'confirmed HTTPDNS path matches');
  }
  for (const url of [
    'https://dns.jd.com/v6/business',
    'https://dns.jd.com/v6/b/extra',
    'https://dns.jd.com/v7/b',
    'https://dns.jd.com.evil.test/v6/d',
    'https://api.m.jd.com/client.action?functionId=orderDetail',
  ]) assert.equal(pattern.test(url), false, 'unconfirmed business path stays out');
});

test('limits MITM to the confirmed splash delivery hosts', () => {
  assert.deepEqual(sectionLines(moduleText, 'MITM'), [
    'hostname = %APPEND% api.m.jd.com, dns.jd.com, m.360buyimg.com, m15.360buyimg.com, vod.300hu.com, discover.300hu.com, storage.360buyimg.com',
    'tcp-connection = true',
  ]);
});

test('only short-circuits the HAR-confirmed JD main-page launch-player video request', () => {
  const launchHeaders = {
    'User-Agent': 'ffmpeg/4.0;jdmall;iphone;version/15.9.50;build/170632',
    Referer: 'play:ijkplayerSH_JDMainPageViewController_999_161_130000-163b',
  };
  assert.deepEqual(
    runRequest('https://vod.300hu.com/1030/path/creative.mp4?source=1', launchHeaders),
    { response: { status: 204 } }
  );

  for (const [url, headers] of [
    ['https://vod.300hu.com/1030/path/ordinary.mp4', { ...launchHeaders, Referer: 'play:ijkplayerProductDetail' }],
    ['https://vod.300hu.com/record/multibitrate/stream.m3u8', launchHeaders],
    ['https://vod.300hu.com/1030/path/creative.mp4', { Referer: launchHeaders.Referer }],
    ['https://example.com/1030/path/creative.mp4', launchHeaders],
  ]) {
    assert.deepEqual(runRequest(url, headers), {});
  }

  const unreadableHeaders = new Proxy({}, {
    ownKeys() {
      throw new Error('unreadable headers');
    },
  });
  assert.deepEqual(
    runRequest('https://vod.300hu.com/2048/path/launch.mp4', unreadableHeaders),
    {},
    'unexpected request metadata must fail open'
  );
  assert.deepEqual(
    runRequest('https://vod.300hu.com/2048/path/launch.mp4', null),
    {},
    'missing request headers must pass through'
  );
});

test('short-circuits the new AVPlayer main-page launch video without matching product video traffic', () => {
  const launchHeaders = {
    'User-Agent': 'CFNetwork;jdmall;iphone;version/15.10.0;build/170674',
    Referer: 'play:avplayerSH_JDMainPageViewController_61_',
  };
  assert.deepEqual(
    runRequest('https://vod.300hu.com/100831/path/launch.mp4?sign=example', launchHeaders),
    { response: { status: 204 } }
  );

  for (const [url, headers] of [
    ['https://vod.300hu.com/100831/path/product.mp4', { ...launchHeaders, Referer: 'play:avplayerProductDetail' }],
    ['https://jvod.300hu.com/vod/product/path/product.mp4', launchHeaders],
    ['https://vod.300hu.com/100831/path/product.mp4', { Referer: launchHeaders.Referer }],
  ]) {
    assert.deepEqual(runRequest(url, headers), {});
  }
});

test('blocks rotating main-page launch-player suffixes while preserving product videos and live streams', () => {
  const userAgents = [
    'ffmpeg/4.0;jdmall;iphone;version/15.10.0;build/170674',
    'CFNetwork;jdmall;iphone;version/15.10.0;build/170674',
  ];
  const launchReferers = [
    'play:ijkplayerSH_JDMainPageViewController_321_8_5_2',
    'play:avplayerSH_JDMainPageViewController_402_7_3_1',
  ];

  for (let index = 0; index < launchReferers.length; index += 1) {
    assert.deepEqual(
      runRequest('https://vod.300hu.com/2048/path/rotating-launch.mp4', {
        'User-Agent': userAgents[index],
        Referer: launchReferers[index],
      }),
      { response: { status: 204 } }
    );
  }

  const jdVideoHeaders = {
    'User-Agent': userAgents[0],
    Referer: 'play:ijkplayerSH_JDMainPageViewController_140_19_9_1',
  };
  for (const [url, headers] of [
    ['https://vod.300hu.com/2048/path/product.mp4', { ...jdVideoHeaders, Referer: 'play:ijkplayerProductDetail' }],
    ['https://jvod.300hu.com/vod/product/path/product.mp4', jdVideoHeaders],
    ['https://discover.300hu.com/explain-m3u8/live/stream.m3u8', { ...jdVideoHeaders, Referer: 'play:ijkplayerSH_DiscoverViewController_140_19_9_1' }],
    ['https://discover.300hu.com/explain-record/live/segment.ts', { ...jdVideoHeaders, Referer: 'play:ijkplayerSH_DiscoverViewController_140_19_9_1' }],
  ]) {
    assert.deepEqual(runRequest(url, headers), {});
  }
});

test('blocks the launch-only discover stream fallback without blocking other discover playback', () => {
  const launchHeaders = {
    'User-Agent': 'ffmpeg/4.0;jdmall;iphone;version/15.10.0;build/170674',
    Referer: 'play:ijkplayerSH_JDMainPageViewController_140_19_9_1',
  };

  for (const url of [
    'https://discover.300hu.com/explain-m3u8/channel/stream.m3u8?scene=9',
    'https://discover.300hu.com/explain-record/channel/segment.ts',
    'https://discover.300hu.com/record/channel/live/segment.ts',
  ]) {
    assert.deepEqual(runRequest(url, launchHeaders), { response: { status: 204 } });
  }

  for (const [url, headers] of [
    ['https://discover.300hu.com/explain-m3u8/channel/stream.m3u8', { ...launchHeaders, Referer: 'play:ijkplayerSH_DiscoverViewController_140_19_9_1' }],
    ['https://discover.300hu.com/explain-record/channel/segment.ts', { ...launchHeaders, Referer: 'play:ijkplayerProductDetail' }],
    ['https://discover.300hu.com/explain-m3u8/channel/stream.m3u8', { Referer: launchHeaders.Referer }],
    ['https://discover.300hu.com/explain-m3u8/channel/metadata.json', launchHeaders],
  ]) {
    assert.deepEqual(runRequest(url, headers), {});
  }
});

// ── 入库 fixture 回归 ────────────────────────────────────────────────
//
// 原先这四个测试依赖 iCloud 里按日期命名的 HAR，文件离开本机后永久 SKIP ——
// 套件照样绿，覆盖为零。改为读仓库内的小 fixture（只含判定所需字段，~9KB），
// 证据随代码走，不会腐坏。
const fixturePath = path.resolve(__dirname, 'fixtures/jingdong-splash-2026-09-20.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function matchedMapLocal(entry) {
  return /Matched map local rule/.test(entry.comment || '');
}
function matchedRequestScript(entry) {
  return /HTTP request script found/.test(entry.comment || '');
}

test('fixture: the splash image rule actually fired on every full-screen launch image', () => {
  assert.ok(fixture.imageEntries.length >= 2, 'fixture must carry the observed launch images');
  for (const entry of fixture.imageEntries) {
    assert.match(entry.url, /\/mobilecms\/s1125x2436_jfs\//, 'full-screen canvas class');
    assert.equal(entry.status, 200);
    assert.ok(matchedMapLocal(entry), 'the Map Local rule must be recorded as matched: ' + entry.url);
  }
});

test('fixture: the old text stub is the documented cause of the still-visible splash', () => {
  // size=1 + text/plain 正是 data-type=text 的指纹：1 字节文本喂给图片解码器必然失败，
  // App 随即回退到本地缓存的旧开屏图 —— 规则命中，广告照旧显示。
  for (const entry of fixture.imageEntries) {
    assert.equal(entry.mimeType, 'text/plain', 'text stub is what the broken rule served');
    assert.equal(entry.size, 1, 'exactly one byte of text');
  }
  // 新规则必须不再产出这种响应。
  const rules = sectionLines(moduleText, 'Map Local').filter(line => line.includes('360buyimg'));
  assert.ok(rules.every((rule) => !/data-type=text/.test(rule)), 'no text stub may remain');
  assert.ok(rules.every((rule) => /data-type=tiny-gif/.test(rule)), 'decodable image instead');
});

test('fixture: the launch video script fired and product video passed through', () => {
  const blocked = fixture.launchVideoEntries.filter((e) => matchedRequestScript(e));
  const passed = fixture.launchVideoEntries.filter((e) => !matchedRequestScript(e));

  assert.ok(blocked.length >= 1, 'the launch-player video must be recorded as handled');
  for (const entry of blocked) {
    assert.equal(entry.status, 204, 'handled launch video returns 204');
    assert.deepEqual(
      runRequest(entry.url, entry.requestHeaders),
      { response: { status: 204 } },
      'the shipped script must still block this exact request'
    );
  }

  // 放行的那条是京东视频的普通广告片（UA 为 JD4iPhone/*，无启动播放器 Referer），
  // 不是开屏 —— 必须继续放行，否则会误伤商品/内容视频。
  for (const entry of passed) {
    assert.deepEqual(
      runRequest(entry.url, entry.requestHeaders),
      {},
      'non-launch video must stay passthrough: ' + entry.url
    );
  }
});

test('fixture: every blocked launch video carries the launch-player Referer and JD video UA', () => {
  for (const entry of fixture.launchVideoEntries) {
    if (!matchedRequestScript(entry)) continue;
    assert.match(entry.requestHeaders['user-agent'] || '', /jdmall;(?:iphone|ipad);/i);
    assert.match(entry.requestHeaders.referer || '', /^play:(?:ijkplayer|avplayer)SH_JDMainPageViewController_/i);
  }
});

test('README describes the reduced scope and keeps the one-click import link', () => {
  assert.match(
    readmeText,
    /`Module\/JingdongAds\.sgmodule` \| 京东去开屏 \| AdBlock \| 清理京东开屏配置并拦截开屏素材/
  );
  assert.match(
    readmeText,
    /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJingdongAds\.sgmodule/
  );
});
