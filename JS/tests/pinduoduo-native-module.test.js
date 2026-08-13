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
const pageFeedsHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-104410.har';
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

test('uses QingRex native rules and keeps the v7 homepage behavior in v8', () => {
  assert.match(moduleText, /^#!name=拼多多去广告（QingRex 原生兼容）$/m);
  assert.match(moduleText, /首页保持 v7 行为；仅清理聊天与个人中心商品流。v8/);

  // Excluding the new page-scoped feed rule, the v7 homepage rules stay byte-identical.
  const unchangedBodyRewrite = section('Body Rewrite', 'Map Local')
    .split('\n')
    .filter((line) => !line.includes('8.20.0 HAR') && !line.includes('api\\/alexa\\/cells\\/hub\\/v3'))
    .join('\n');
  assert.equal(
    sha256(unchangedBodyRewrite),
    '4d2a8f0357468223975ff3a4ca596d2cc2fdca74c0948e5021d087db48aa0f16'
  );
  assert.equal(
    sha256(section('Map Local', 'MITM')),
    '702c9419ae77b78002485f01f0ebaf561f54a072a430095611e78659093d8ce1'
  );
});

test('clears only chat and personal cells feeds while leaving homepage cells untouched', () => {
  const scopedRule = moduleText.split('\n').find((line) =>
    line.includes('api\\/alexa\\/cells\\/hub\\/v3')
  );
  assert.ok(scopedRule, 'missing scoped cells feed body rewrite');
  assert.match(scopedRule, /refer_page_sn=\(\?:10001\|10031\)/);
  assert.match(scopedRule, /\.has_more = false \| \.data\.goods_list = \[\]/);

  const patternText = scopedRule.split(" '", 1)[0]
    .replace(/^http-response-jq /, '')
    .replaceAll('\\/', '/');
  const pattern = new RegExp(patternText);

  assert.equal(pattern.test(
    'https://api.pinduoduo.com/api/alexa/cells/hub/v3?count=20&refer_page_sn=10001&page_sn=10002'
  ), true);
  assert.equal(pattern.test(
    'https://api.pinduoduo.com/api/alexa/cells/hub/v3?refer_page_sn=10031&count=20'
  ), true);
  assert.equal(pattern.test(
    'https://api.pinduoduo.com/api/alexa/cells/hub/v3?scene=homegoods_dy_tpl&page_sn=10002'
  ), false);
});

test('HAR identifies the shared feed by page source instead of product content', {
  skip: !fs.existsSync(pageFeedsHarPath),
}, () => {
  const har = JSON.parse(fs.readFileSync(pageFeedsHarPath, 'utf8'));
  const feeds = har.log.entries.filter((entry) =>
    entry.request.url.includes('/api/alexa/cells/hub/v3?')
  );
  const personal = feeds.filter((entry) =>
    new URL(entry.request.url).searchParams.get('refer_page_sn') === '10001'
  );
  const chat = feeds.filter((entry) =>
    new URL(entry.request.url).searchParams.get('refer_page_sn') === '10031'
  );
  const homepage = feeds.filter((entry) =>
    !new URL(entry.request.url).searchParams.has('refer_page_sn')
  );

  assert.ok(personal.length > 0);
  assert.ok(chat.length > 0);
  assert.ok(homepage.length > 0);
  for (const entry of [...personal, ...chat]) {
    const body = JSON.parse(entry.response.content.text);
    assert.ok(body.data.goods_list.length > 0);
  }
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
