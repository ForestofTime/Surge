const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../../Module/PinduoduoNative.sgmodule');
const obsoleteScriptPath = path.resolve(__dirname, '../PinduoduoNative.js');
const subsidyScriptPath = path.resolve(__dirname, '../PinduoduoSubsidy.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const fullMetaHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-100425.har';
const latestV6HarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-111547.har';
const moduleText = fs.readFileSync(modulePath, 'utf8');
const readmeText = fs.readFileSync(readmePath, 'utf8');

function section(name, nextName) {
  const start = `[${name}]\n`;
  const end = `\n[${nextName}]`;
  assert.ok(moduleText.includes(start), `missing [${name}]`);
  return moduleText.split(start, 2)[1].split(end, 1)[0].trim() + '\n';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('uses QingRex native rules and restores its last pre-meta-block behavior', () => {
  assert.match(moduleText, /^#!name=拼多多去广告（QingRex 原生兼容）$/m);
  assert.match(moduleText, /完整保留 QingRex 原生净化；恢复其历史版本中 meta 配置可达行为。v7/);

  // These hashes are the current QingRex upstream Body Rewrite and Map Local sections.
  assert.equal(
    sha256(section('Body Rewrite', 'Map Local')),
    '4d2a8f0357468223975ff3a4ca596d2cc2fdca74c0948e5021d087db48aa0f16'
  );
  assert.equal(
    sha256(section('Map Local', 'MITM')),
    '702c9419ae77b78002485f01f0ebaf561f54a072a430095611e78659093d8ce1'
  );
});

test('keeps QingRex ad blocks but leaves meta fully reachable like the July 2025 history', () => {
  for (const host of [
    'titan.pinduoduo.com',
    'xg.pinduoduo.com',
    'cdl-1.pddpic.com',
    'cdl-p2.pddpic.com',
    'cd-1.pddpic.com',
    'apm.pinduoduo.com',
    'th-b.pinduoduo.com',
    'ta.pinduoduo.com',
    'th.pinduoduo.com',
    'th-a.pinduoduo.com',
    'ta-a.pinduoduo.com',
    'apm-a.pinduoduo.com',
  ]) {
    assert.ok(moduleText.includes(`DOMAIN,${host},REJECT`), `${host} must stay blocked`);
  }
  assert.equal(moduleText.includes('DOMAIN,meta.pinduoduo.com,REJECT'), false);
  assert.equal(moduleText.includes('[URL Rewrite]'), false);
  assert.match(moduleText, /^hostname = %APPEND% api\.pinduoduo\.com$/m);
});

test('removes the custom meta filter and homepage ordering script', () => {
  assert.equal(moduleText.includes('[Script]'), false);
  assert.equal(moduleText.includes('type=http-response'), false);
  assert.equal(fs.existsSync(subsidyScriptPath), false);
  assert.equal(fs.existsSync(obsoleteScriptPath), false);
});

test('latest v6 HAR proves the filtered meta response still failed on device', {
  skip: !fs.existsSync(latestV6HarPath),
}, () => {
  const har = JSON.parse(fs.readFileSync(latestV6HarPath, 'utf8'));
  const abtests = har.log.entries.filter((entry) =>
    entry.request.url.includes('/api/app/v2/abtest')
  );
  assert.ok(abtests.length > 0);
  assert.ok(abtests.every((entry) =>
    !entry.response && String(entry.comment).includes('Matched URL rewrite rule')
  ));

  const experiments = har.log.entries.filter((entry) =>
    entry.response && entry.request.url.includes('/api/app/v2/experiment')
  );
  assert.ok(experiments.length > 0);
  assert.ok(experiments.every((entry) =>
    Object.keys(JSON.parse(entry.response.content.text).ks).length === 2 &&
    String(entry.comment).includes('Response is modified by script')
  ));
});

test('keeps current Pinduoduo HTTPDNS endpoints from bypassing named-host rewrites', () => {
  assert.match(moduleText, /\\\/\(\?:d\\d\?\|v3\\\/d\)/);
  assert.match(moduleText, /PROTOCOL,QUIC/);
});

test('full-meta HAR proves both config families and the subsidy card were delivered together', {
  skip: !fs.existsSync(fullMetaHarPath),
}, () => {
  const har = JSON.parse(fs.readFileSync(fullMetaHarPath, 'utf8'));
  const entries = har.log.entries;
  const experiments = entries.filter((entry) =>
    /^https:\/\/meta\.pinduoduo\.com\/api\/app\/v2\/(?:abtest|experiment)/.test(entry.request.url)
  );
  assert.equal(experiments.length, 2);
  assert.ok(experiments.every((entry) => entry.response.status === 200));
  assert.ok(experiments.reduce((sum, entry) => sum + entry.response.content.text.length, 0) > 700000);

  const homepage = entries.find((entry) => entry.request.url.includes('/api/alexa/homepage/hub?'));
  assert.ok(homepage);
  const payload = JSON.parse(homepage.response.content.text);
  assert.equal(
    payload.result.dy_module.billion_subsidy_entrance_dy.data.data.title,
    '官方补贴'
  );
  assert.ok(payload.result.dy_module.billion_subsidy_entrance_dy.data.data.goods_list.length > 0);
});

test('documents only the current Pinduoduo module', () => {
  assert.match(readmeText, /`Module\/PinduoduoNative\.sgmodule` \| AdBlock \|/);
  assert.equal(readmeText.includes('Module/PinduoduoAds.sgmodule'), false);
});
