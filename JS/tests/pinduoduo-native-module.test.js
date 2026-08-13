const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../../Module/PinduoduoNative.sgmodule');
const obsoleteScriptPath = path.resolve(__dirname, '../PinduoduoNative.js');
const readmePath = path.resolve(__dirname, '../../README.md');
const latestHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-100425.har';
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

function rewritePattern() {
  const line = moduleText.split('\n').find((item) =>
    item.includes('meta\\.pinduoduo\\.com') && item.includes('component') && item.includes(' - reject')
  );
  assert.ok(line, 'missing the narrow meta URL rewrite');
  const pattern = line.slice(0, line.lastIndexOf(' - reject'));
  return new RegExp(pattern);
}

test('uses QingRex native rules as the baseline with only a narrow subsidy renderer exception', () => {
  assert.match(moduleText, /^#!name=拼多多去广告（QingRex 原生兼容）$/m);
  assert.match(moduleText, /完整保留 QingRex 原生净化；仅放行百亿补贴卡片渲染组件。v5/);

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

test('restores every QingRex ad-domain block and keeps meta blocked at HTTP level', () => {
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
  assert.match(moduleText, /^\[URL Rewrite\]$/m);
  assert.match(moduleText, /^hostname = %APPEND% api\.pinduoduo\.com, meta\.pinduoduo\.com$/m);
});

test('allows only component fetch and pull on meta while rejecting experiments and reports', () => {
  const rejected = rewritePattern();
  for (const url of [
    'https://meta.pinduoduo.com/api/app/v2/abtest?pdduid=1',
    'https://meta.pinduoduo.com/api/app/v2/experiment?pdduid=1',
    'https://meta.pinduoduo.com/api/app/v1/component/manual/query?pdduid=1',
    'https://meta.pinduoduo.com/api/lamer/uuid/report?pdduid=1',
    'https://meta.pinduoduo.com/api/app/info/report/wrapper?pdduid=1',
  ]) {
    assert.equal(rejected.test(url), true, `${url} must be rejected`);
  }
  for (const url of [
    'https://meta.pinduoduo.com/api/one-gateway-client/zone/v1/component/fetch?pdduid=1',
    'https://meta.pinduoduo.com/api/one-gateway-client/zone/v1/component/pull?pdduid=1',
  ]) {
    assert.equal(rejected.test(url), false, `${url} must stay reachable`);
  }
});

test('does not retain the previous broad custom response pipeline', () => {
  assert.equal(moduleText.includes('/api/alexa/cells/hub/v3'), false);
  assert.equal(moduleText.includes('.result.module_order? |='), false);
  assert.equal(moduleText.includes('.result.dy_module? |='), false);
  assert.equal(moduleText.includes('api\\/cappuccino\\/splash'), false);
  assert.equal(moduleText.includes('[Script]'), false);
  assert.equal(fs.existsSync(obsoleteScriptPath), false);
});

test('keeps current Pinduoduo HTTPDNS endpoints from bypassing named-host rewrites', () => {
  assert.match(moduleText, /\\\/\(\?:d\\d\?\|v3\\\/d\)/);
  assert.match(moduleText, /PROTOCOL,QUIC/);
});

test('latest HAR proves the previous regression and the homepage still carries the subsidy card', {
  skip: !fs.existsSync(latestHarPath),
}, () => {
  const har = JSON.parse(fs.readFileSync(latestHarPath, 'utf8'));
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
