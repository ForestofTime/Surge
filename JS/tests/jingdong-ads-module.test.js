const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../../Module/JingdongAds.sgmodule');
const readmePath = path.resolve(__dirname, '../../README.md');
const splashHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-11-093154.har';

const moduleText = fs.readFileSync(modulePath, 'utf8');
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

test('publishes a splash-only native Surge module', () => {
  assert.match(moduleText, /^#!name=京东去开屏$/m);
  assert.match(moduleText, /仅处理京东 App 开屏素材/);
  assert.match(moduleText, /v11$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/JingdongAds\.sgmodule$/m
  );

  for (const removed of [
    '[Script]',
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
});

test('keeps only the QUIC fallback rule required by the confirmed splash path', () => {
  assert.deepEqual(sectionLines(moduleText, 'Rule'), [
    'AND, ((PROTOCOL, UDP), (DOMAIN, m.360buyimg.com)), REJECT',
  ]);
});

test('maps only the HAR-confirmed full-screen canvas class', () => {
  assert.deepEqual(sectionLines(moduleText, 'Map Local'), [
    '^https?:\\/\\/m\\.360buyimg\\.com\\/mobilecms\\/s1125x2436_jfs(?:\\/|$) data-type=text data=" " status-code=200',
  ]);
});

test('limits MITM to the splash image host', () => {
  assert.deepEqual(sectionLines(moduleText, 'MITM'), [
    'hostname = %APPEND% m.360buyimg.com',
    'tcp-connection = true',
  ]);
});

test('the historical device HAR contains the stable splash canvas path', { skip: !fs.existsSync(splashHarPath) }, () => {
  const har = JSON.parse(fs.readFileSync(splashHarPath, 'utf8'));
  const splashUrls = new Set(
    har.log.entries
      .map((entry) => entry.request && entry.request.url)
      .filter((url) => /^https:\/\/m\.360buyimg\.com\/mobilecms\/s1125x2436_jfs\//.test(url || ''))
  );
  assert.ok(splashUrls.size >= 3, 'the HAR must contain the observed full-screen launch materials');
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
