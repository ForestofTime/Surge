'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const adModule = fs.readFileSync(path.join(root, 'Module/QuarkAdSdkRetryStormBlock.sgmodule'), 'utf8');
const cookieModule = fs.readFileSync(path.join(root, 'Module/QuarkCookieCapture.sgmodule'), 'utf8');

const hosts = [
  'api-access.pangolin-sdk-toutiao.com',
  'api-access.pangolin-sdk-toutiao1.com',
  'api-access.pangolin-sdk-toutiao-b.com',
  'mobads.baidu.com',
  'mi.gdt.qq.com',
  'open.e.kuaishou.com',
  'et.tanx.com',
  'opehs.tanx.com',
];

test('standalone module contains only exact observed ad SDK pre-match rules', () => {
  for (const host of hosts) {
    assert.ok(adModule.split('\n').includes(`DOMAIN,${host},REJECT,pre-matching`), host);
  }
  assert.doesNotMatch(adModule, /^DOMAIN-SUFFIX,/m);
  assert.doesNotMatch(adModule, /\[Script\]|\[MITM\]/);
  assert.doesNotMatch(adModule, /coral2\.quark\.cn|broccoli\.uc\.cn/);
});

test('cookie sync module no longer owns ad SDK rules', () => {
  assert.doesNotMatch(cookieModule, /^\[Rule\]$/m);
  for (const host of hosts) assert.doesNotMatch(cookieModule, new RegExp(`^DOMAIN,${host.replaceAll('.', '\\.')},`,'m'));
  assert.match(cookieModule, /^\[Script\]$/m);
  assert.match(cookieModule, /^\[MITM\]$/m);
});
