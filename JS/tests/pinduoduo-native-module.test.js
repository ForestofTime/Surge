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
const latestChatHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-122121.har';
const latestPersonalHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-140744.har';
const latestV9RegressionHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-143611.har';
const latestV10RegressionHarPath =
  '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-13-145210.har';
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

test('uses QingRex native rules and fully passes through homepage hub in v11', () => {
  assert.match(moduleText, /^#!name=拼多多去广告（QingRex 原生兼容）$/m);
  assert.match(moduleText, /首页 homepage\/hub 完全透传，保留业务入口与百亿补贴；清理聊天与个人中心商品流。v11/);

  // Excluding the scoped cells rule and removed homepage rewrites, all other v10 rewrites stay byte-identical.
  const unchangedBodyRewrite = section('Body Rewrite', 'Map Local')
    .split('\n')
    .filter((line) =>
      !line.includes('8.20.0 HAR') &&
      !line.includes('api\\/alexa\\/cells\\/hub\\/v3') &&
      !line.includes('api\\/alexa\\/homepage\\/hub')
    )
    .join('\n');
  assert.equal(
    sha256(unchangedBodyRewrite),
    'ee9a62070e611a19a1110d44533f1f19a049d43e2284547e6eef14fcfb9f02fc'
  );
  assert.equal(
    sha256(section('Map Local', 'MITM')),
    '702c9419ae77b78002485f01f0ebaf561f54a072a430095611e78659093d8ce1'
  );
});

test('has zero homepage hub rewrites', () => {
  const homepageRules = section('Body Rewrite', 'Map Local')
    .split('\n')
    .filter((line) => line.includes('api\\/alexa\\/homepage\\/hub'));

  assert.deepEqual(homepageRules, []);
});

test('v11 fully passes through homepage hub after v10 still modified complete payloads', {
  skip: !fs.existsSync(latestV10RegressionHarPath),
}, () => {
  const homepageRules = section('Body Rewrite', 'Map Local')
    .split('\n')
    .filter((line) => line.includes('api\\/alexa\\/homepage\\/hub'));
  assert.deepEqual(homepageRules, []);

  const har = JSON.parse(fs.readFileSync(latestV10RegressionHarPath, 'utf8'));
  const homepages = har.log.entries.filter((entry) =>
    entry.response?.status === 200 && entry.request.url.includes('/api/alexa/homepage/hub?')
  );
  assert.equal(homepages.length, 4);

  for (const entry of homepages) {
    const payload = JSON.parse(entry.response.content.text);
    assert.equal(payload.result.icon_set.length, 18);
    assert.ok(payload.result.icon_fold_zone);
    assert.equal(
      payload.result.dy_module.billion_subsidy_entrance_dy.data.data.goods_list.length,
      4
    );
    assert.ok(payload.result.module_order.some(({ module_name }) => module_name === 'icon_set'));
    assert.ok(payload.result.module_order.some(
      ({ module_name }) => module_name === 'billion_subsidy_entrance_dy'
    ));
    assert.equal(
      String(entry.comment).match(/Response body is modified by body rewrite rule/g)?.length,
      4
    );
  }

  const httpDns = har.log.entries.filter((entry) =>
    /^http:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\])\/(?:d\d?|v[23]\/d)(?:\?|$)/
      .test(entry.request.url) &&
    entry.request.headers?.some(({ name, value }) =>
      name.toLowerCase() === 'user-agent' && value.includes('com.xunmeng.pinduoduo')
    )
  );
  assert.equal(httpDns.length, 224);
  assert.ok(httpDns.every((entry) => entry.response === undefined));
  assert.ok(httpDns.every((entry) =>
    String(entry.comment).includes('拼多多去广告（QingRex 原生兼容）')
  ));
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
  assert.match(moduleText, /\\\/\(\?:d\\d\?\|v\[23\]\\\/d\)/);
  assert.match(moduleText, /PROTOCOL,QUIC/);

  const ipv4Rule = moduleText.split('\n').find((line) =>
    line.includes('URL-REGEX') && line.includes('25[0-5]')
  );
  assert.ok(ipv4Rule);
  const patternText = ipv4Rule.match(/URL-REGEX,"([^"]+)"/)[1].replaceAll('\\/', '/');
  const pattern = new RegExp(patternText);
  assert.equal(pattern.test('http://114.110.96.26/v2/d?id=45237&type=addrs'), true);
  assert.equal(pattern.test('http://101.35.212.35/v3/d?type=addrs&id=1'), true);
  assert.equal(pattern.test('http://81.69.130.131/d4?type=ADDRS'), true);
  assert.equal(pattern.test('http://114.110.96.26/v4/d?id=45237&type=addrs'), false);
});

test('latest HAR proves v8 leaked the Pinduoduo v2 HTTPDNS endpoint', {
  skip: !fs.existsSync(latestChatHarPath) || !fs.existsSync(latestPersonalHarPath),
}, () => {
  const expectedV2DnsCounts = new Map([
    ['2026-08-13-122121.har', 12],
    ['2026-08-13-140744.har', 8],
  ]);
  for (const harPath of [latestChatHarPath, latestPersonalHarPath]) {
    const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
    const entries = har.log.entries;
    const v2Dns = entries.filter((entry) =>
      /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}\/v2\/d\?/.test(entry.request.url) &&
      entry.request.headers?.some(({ name, value }) =>
        name.toLowerCase() === 'user-agent' && value.includes('com.xunmeng.pinduoduo')
      )
    );
    assert.equal(v2Dns.length, expectedV2DnsCounts.get(path.basename(harPath)));
    assert.ok(v2Dns.every((entry) => entry.response?.status === 200));
    assert.ok(v2Dns.every((entry) =>
      !String(entry.comment).includes('拼多多去广告（QingRex 原生兼容）')
    ));

    const scopedPageFeeds = entries.filter((entry) => {
      if (!entry.request.url.includes('/api/alexa/cells/hub/v3?')) return false;
      const source = new URL(entry.request.url).searchParams.get('refer_page_sn');
      return source === '10001' || source === '10031';
    });
    assert.equal(scopedPageFeeds.length, 0,
      `${path.basename(harPath)} cannot prove the scoped feed rewrite ran`);
  }
});

test('latest v9 HAR proves the homepage regression and the retained v9 protections', {
  skip: !fs.existsSync(latestV9RegressionHarPath),
}, () => {
  const har = JSON.parse(fs.readFileSync(latestV9RegressionHarPath, 'utf8'));
  const homepages = har.log.entries.filter((entry) =>
    entry.response?.status === 200 && entry.request.url.includes('/api/alexa/homepage/hub?')
  );
  assert.ok(homepages.length > 0);

  for (const entry of homepages) {
    const payload = JSON.parse(entry.response.content.text);
    assert.equal(Object.hasOwn(payload.result, 'icon_set'), false);
    assert.equal(Object.hasOwn(payload.result, 'icon_fold_zone'), true);
    assert.equal(
      payload.result.dy_module.billion_subsidy_entrance_dy.data.data.title,
      '官方补贴'
    );
    assert.ok(
      payload.result.dy_module.billion_subsidy_entrance_dy.data.data.goods_list.length > 0
    );
  }

  const httpDns = har.log.entries.filter((entry) =>
    /^http:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\])\/(?:d\d?|v[23]\/d)(?:\?|$)/
      .test(entry.request.url) &&
    entry.request.headers?.some(({ name, value }) =>
      name.toLowerCase() === 'user-agent' && value.includes('com.xunmeng.pinduoduo')
    )
  );
  assert.equal(httpDns.length, 424);
  assert.deepEqual(
    Object.fromEntries(Object.entries(httpDns.reduce((counts, entry) => {
      const requestPath = new URL(entry.request.url).pathname;
      counts[requestPath] = (counts[requestPath] || 0) + 1;
      return counts;
    }, {})).sort()),
    { '/d4': 31, '/v2/d': 83, '/v3/d': 310 }
  );
  assert.ok(httpDns.every((entry) => entry.response === undefined));
  assert.ok(httpDns.every((entry) =>
    String(entry.comment).includes('拼多多去广告（QingRex 原生兼容）')
  ));

  const personalFeeds = har.log.entries.filter((entry) =>
    entry.response?.status === 200 &&
    entry.request.url.includes('/api/alexa/cells/hub/v3?') &&
    new URL(entry.request.url).searchParams.get('refer_page_sn') === '10001'
  );
  assert.equal(personalFeeds.length, 2);
  for (const entry of personalFeeds) {
    const payload = JSON.parse(entry.response.content.text);
    assert.equal(payload.has_more, false);
    assert.deepEqual(payload.data.goods_list, []);
    assert.ok(String(entry.comment).includes('Response body is modified by body rewrite rule'));
  }
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
