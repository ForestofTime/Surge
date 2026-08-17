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
  assert.match(moduleText, /仅处理京东 App 开屏图片和启动视频/);
  assert.match(moduleText, /v12$/m);
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
  assert.match(moduleText, /\/JS\/JingdongSplash\.js\?v=12/);
});

test('keeps only the two QUIC fallbacks required by the confirmed splash paths', () => {
  assert.deepEqual(sectionLines(moduleText, 'Rule'), [
    'AND, ((PROTOCOL, UDP), (DOMAIN, m.360buyimg.com)), REJECT',
    'AND, ((PROTOCOL, UDP), (DOMAIN, vod.300hu.com)), REJECT',
  ]);
});

test('maps only the HAR-confirmed full-screen canvas class', () => {
  assert.deepEqual(sectionLines(moduleText, 'Map Local'), [
    '^https?:\\/\\/m\\.360buyimg\\.com\\/mobilecms\\/s1125x2436_jfs(?:\\/|$) data-type=text data=" " status-code=200',
  ]);
});

test('limits MITM to the two confirmed splash delivery hosts', () => {
  assert.deepEqual(sectionLines(moduleText, 'MITM'), [
    'hostname = %APPEND% m.360buyimg.com, vod.300hu.com',
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
    /`Module\/JingdongAds\.sgmodule` \| AdBlock \| 京东仅去开屏/
  );
  assert.match(
    readmeText,
    /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJingdongAds\.sgmodule/
  );
});
