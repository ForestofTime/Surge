const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/JingdongAds.sgmodule');
const scriptPath = path.resolve(__dirname, '../JingdongSplash.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const splashHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-12-081629.har';
const latestVideoSplashHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-17-090751.har';
const cachedVideoSplashHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-20-142415.har';
const latestLiveSplashHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-20-144156.har';

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

function runRequest(url, headers) {
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
  return JSON.parse(JSON.stringify(doneCalls[0]));
}

test('publishes a splash-only native Surge module', () => {
  assert.match(moduleText, /^#!name=京东去开屏$/m);
  assert.match(moduleText, /仅拦截京东开屏图片和启动媒体，保留页面业务/);
  assert.match(moduleText, /v15$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/JingdongAds\.sgmodule$/m
  );

  for (const removed of [
    'api.m.jd.com',
    'JingdongAds.js',
    'client.action',
    'functionId',
    'jddebug.com',
    'uniformRecommend',
    'personinfoBusiness',
    'cartCouponRecommendGoods',
  ]) {
    assert.equal(moduleText.includes(removed), false, removed + ' must not remain in the splash-only module');
  }

  assert.match(moduleText, /^京东-主页面启动视频跳过 = type=http-request,/m);
  assert.match(
    moduleText,
    /pattern=\^https\?:\\\/\\\/vod\\\.300hu\\\.com\\\/\\d\+\\\/\.\*\\\.mp4\(\?:\\\?\.\*\)\?\$/
  );
  assert.match(moduleText, /\/JS\/JingdongSplash\.js\?v=15/);
  assert.match(moduleText, /^京东-主页面启动流跳过 = type=http-request,/m);
  assert.match(
    moduleText,
    /pattern=\^https\?:\\\/\\\/discover\\\.300hu\\\.com\\\/\.\*\\\.\(\?:m3u8\|ts\)\(\?:\\\?\.\*\)\?\$/
  );
});

test('keeps only the three QUIC fallbacks required by the confirmed splash paths', () => {
  assert.deepEqual(sectionLines(moduleText, 'Rule'), [
    'AND, ((PROTOCOL, UDP), (DOMAIN, m.360buyimg.com)), REJECT',
    'AND, ((PROTOCOL, UDP), (DOMAIN, vod.300hu.com)), REJECT',
    'AND, ((PROTOCOL, UDP), (DOMAIN, discover.300hu.com)), REJECT',
  ]);
});

test('maps only the HAR-confirmed full-screen canvas class', () => {
  assert.deepEqual(sectionLines(moduleText, 'Map Local'), [
    '^https?:\\/\\/m\\.360buyimg\\.com\\/mobilecms\\/s1125x2436_jfs(?:\\/|$) data-type=text data=" " status-code=200',
  ]);
});

test('limits MITM to the three confirmed splash delivery hosts', () => {
  assert.deepEqual(sectionLines(moduleText, 'MITM'), [
    'hostname = %APPEND% m.360buyimg.com, vod.300hu.com, discover.300hu.com',
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

test('the newest cleared-cache HAR exposes an unhandled launch-only discover stream fallback', { skip: !fs.existsSync(latestLiveSplashHarPath) }, () => {
  const har = JSON.parse(fs.readFileSync(latestLiveSplashHarPath, 'utf8'));
  const requestHeaders = (entry) =>
    Object.fromEntries(
      (entry.request && entry.request.headers || []).map((header) => [String(header.name).toLowerCase(), header.value])
    );
  const entries = har.log.entries.filter((entry) => {
    const headers = requestHeaders(entry);
    return (
      /^https:\/\/discover\.300hu\.com\/.*\.(?:m3u8|ts)(?:\?|$)/i.test(entry.request && entry.request.url || '') &&
      /^ffmpeg\/[^;]+;jdmall;(?:iphone|ipad);/i.test(headers['user-agent'] || '') &&
      /^play:ijkplayerSH_JDMainPageViewController_/i.test(headers.referer || '')
    );
  });

  assert.equal(entries.length, 6, 'the HAR must contain the six launch stream fallback requests');
  assert.equal(
    entries.reduce((total, entry) => total + Number(entry.response.content && entry.response.content.size || 0), 0),
    1566150,
    'the fallback must account for the observed 1,566,150 response bytes'
  );
  assert.ok(entries.every((entry) => !/HTTP request script found: 京东-主页面启动视频跳过/.test(entry.comment || '')));
  for (const entry of entries) {
    assert.deepEqual(runRequest(entry.request.url, requestHeaders(entry)), { response: { status: 204 } });
  }
});

test('the newest JD HAR proves the visible launch video was served from local cache', { skip: !fs.existsSync(cachedVideoSplashHarPath) }, () => {
  const har = JSON.parse(fs.readFileSync(cachedVideoSplashHarPath, 'utf8'));
  assert.deepEqual(har.log.creator, { version: '5.102.0', name: 'Surge iOS' });
  assert.ok(
    har.log.entries.some((entry) =>
      (entry.request && entry.request.headers || []).some((header) =>
        /JD4iPhone\/15\.10\.0|jdmall;iphone;version\/15\.10\.0/.test(String(header.value || ''))
      )
    ),
    'the HAR must identify JD 15.10.0 traffic'
  );

  const videoEntries = har.log.entries.filter((entry) => {
    const url = entry.request && entry.request.url || '';
    const mimeType = entry.response && entry.response.content && entry.response.content.mimeType || '';
    return /\.(?:mp4|m3u8|ts|flv)(?:\?|$)/i.test(url) || /^video\//i.test(mimeType);
  });
  assert.equal(videoEntries.length, 0, 'the visible launch video made no network media request');
  assert.equal(
    har.log.entries.filter((entry) => /\(京东去开屏\)|京东-主页面启动视频跳过/.test(entry.comment || '')).length,
    0,
    'v13 had no request opportunity while the cached video was playing'
  );
  assert.ok(
    har.log.entries.some((entry) => /Handled by VIF/.test(entry.comment || '')),
    'the capture must contain VIF-handled JD traffic'
  );
});

test('the latest HAR proves the AVPlayer launch video bypasses v12 while the old IJK path is blocked', { skip: !fs.existsSync(latestVideoSplashHarPath) }, () => {
  const har = JSON.parse(fs.readFileSync(latestVideoSplashHarPath, 'utf8'));
  const requestHeaders = (entry) =>
    Object.fromEntries(
      (entry.request && entry.request.headers || []).map((header) => [String(header.name).toLowerCase(), header.value])
    );
  const newLaunchVideo = har.log.entries.find((entry) => {
    const headers = requestHeaders(entry);
    return (
      /^https:\/\/vod\.300hu\.com\/\d+\/.*\.mp4(?:\?|$)/.test(entry.request && entry.request.url || '') &&
      /^CFNetwork;jdmall;(?:iphone|ipad);/i.test(headers['user-agent'] || '') &&
      /^play:avplayerSH_JDMainPageViewController_61_/i.test(headers.referer || '')
    );
  });
  assert.ok(newLaunchVideo, 'the latest HAR must contain the new AVPlayer launch video');
  assert.equal(newLaunchVideo.response.status, 200);
  assert.equal(newLaunchVideo.response.content.mimeType, 'video/mp4');
  assert.doesNotMatch(newLaunchVideo.comment || '', /HTTP request script found: 京东-主页面启动视频跳过/);
  assert.deepEqual(runRequest(newLaunchVideo.request.url, requestHeaders(newLaunchVideo)), {
    response: { status: 204 },
  });

  const oldLaunchVideo = har.log.entries.find((entry) =>
    /^https:\/\/vod\.300hu\.com\/1030\/.*\.mp4(?:\?|$)/.test(entry.request && entry.request.url || '')
  );
  assert.ok(oldLaunchVideo, 'the latest HAR must retain the old launch-video regression sample');
  assert.equal(oldLaunchVideo.response.status, 204);
  assert.match(oldLaunchVideo.comment || '', /HTTP request script found: 京东-主页面启动视频跳过/);
});

test('the latest device HAR proves both splash paths and the image rule result', { skip: !fs.existsSync(splashHarPath) }, () => {
  const har = JSON.parse(fs.readFileSync(splashHarPath, 'utf8'));
  const imageEntries = har.log.entries.filter((entry) =>
    /^https:\/\/m\.360buyimg\.com\/mobilecms\/s1125x2436_jfs\//.test(entry.request && entry.request.url || '')
  );
  assert.ok(imageEntries.length >= 2, 'the HAR must contain the observed full-screen launch images');
  assert.ok(
    imageEntries.every((entry) => entry.response.content.mimeType === 'text/plain' && entry.response.content.size === 1),
    'the image fallback must be observed as the one-byte Map Local response'
  );

  const videoEntries = har.log.entries.filter((entry) => {
    const headers = entry.request && entry.request.headers || [];
    const referer = headers.find((header) => String(header.name).toLowerCase() === 'referer');
    return (
      /^https:\/\/vod\.300hu\.com\/1030\/.*\.mp4(?:\?|$)/.test(entry.request && entry.request.url || '') &&
      /play:ijkplayerSH_JDMainPageViewController_999_161_130000-/.test(referer && referer.value || '')
    );
  });
  assert.ok(videoEntries.length >= 1, 'the HAR must contain the remaining launch-player video request');
});

test('README describes the reduced scope and keeps the one-click import link', () => {
  assert.match(
    readmeText,
    /`Module\/JingdongAds\.sgmodule` \| 京东去开屏 \| AdBlock \| 仅拦截京东开屏图片和启动媒体/
  );
  assert.match(
    readmeText,
    /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJingdongAds\.sgmodule/
  );
});
