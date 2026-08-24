const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const modulePath = path.join(repoRoot, 'Module/MeituanAds.sgmodule');
const scriptPath = path.join(repoRoot, 'JS/MeituanAds.js');
const readIfPresent = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const moduleText = readIfPresent(modulePath);
const scriptText = readIfPresent(scriptPath);
const readmeText = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const indexText = fs.readFileSync(path.join(repoRoot, 'docs/repo-file-index.md'), 'utf8');

function runScript({ url, body }) {
  let result;
  vm.runInNewContext(scriptText, {
    $request: { url },
    $response: { body },
    $done(value) {
      result = value;
    },
    URL,
    console: { log() {} },
  });
  return result;
}

test('publishes a bounded repository-native Meituan module', () => {
  assert.ok(moduleText, 'Module/MeituanAds.sgmodule must exist');
  assert.ok(scriptText, 'JS/MeituanAds.js must exist');
  assert.match(moduleText, /^#!name=美团去广告$/m);
  assert.match(moduleText, /^#!desc=.*v1$/m);
  assert.match(moduleText, /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/MeituanAds\.sgmodule$/m);
  assert.match(moduleText, /script-path=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/JS\/MeituanAds\.js\?v=1/);
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /max-size=1048576/);
  assert.doesNotMatch(moduleText, /script\.hub|script-path=.*(?:MeChenCC|fmz200|blackmatrix7|zirawell)/i);
});

test('keeps only precise ad resources and current response filtering', () => {
  assert.match(moduleText, /wmapi\\\.meituan\\\.com.*loadInfo\|openscreen\|startpicture/);
  assert.match(moduleText, /img\\\.meituan\\\.net\\\/bizad\\\/bizad_brandCpt_/);
  assert.match(moduleText, /img\\\.meituan\\\.net\\\/goodsawardpic\\\//);
  assert.match(moduleText, /blk_conf_73\\\.json/);
  assert.match(moduleText, /apimobile\\\.meituan\\\.com\\\/group\\\/v4\\\/recommend\\\/home\\\/startPageChannel/);
  assert.match(moduleText, /h\\\.meituan\\\.com\\\/horn_ios\\\/mergeRequest/);
  assert.doesNotMatch(moduleText, /blk_conf_\\(?:d|d\+|\\d|\\d\+)/);
});

test('does not reject shared business, layout, HTTPDNS, or image delivery', () => {
  assert.doesNotMatch(moduleText, /DOMAIN-SUFFIX,d\.meituan\.net/);
  assert.doesNotMatch(moduleText, /httpdns|httpdnsmultiapi|59\.82\.113\.10|103\.37\.152\./i);
  assert.doesNotMatch(moduleText, /(?:DOMAIN|hostname =).*p\d\.meituan\.net/);
  assert.doesNotMatch(moduleText, /gaea\\\.meituan\\\.com|maplocatesdksnapshot|metrics-picture/);
  assert.doesNotMatch(moduleText, /horn_ios\\\/mergeRequest[^\n]*data-type=(?:text|json)/);
});

test('disables only the two advertising push switches found in the latest HAR', () => {
  const source = {
    launch_protect: { enabled: true },
    pikeConfig: {
      data: {
        customer: {
          sharkpush_marketing_dsp_pop: true,
          sharkpush_meishi_float_picasso: true,
          sharkpush_order_used_alert: true,
          transport_config: { retry: 3 },
        },
        keep: 'pike-data',
      },
      keep: 'pike',
    },
    traceId: 'keep',
  };

  const result = runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest?app=group',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);
  const customer = output.pikeConfig.data.customer;
  assert.equal(customer.sharkpush_marketing_dsp_pop, false);
  assert.equal(customer.sharkpush_meishi_float_picasso, false);
  assert.equal(customer.sharkpush_order_used_alert, true);
  assert.deepEqual(customer.transport_config, source.pikeConfig.data.customer.transport_config);
  assert.equal(output.launch_protect.enabled, true);
  assert.equal(output.pikeConfig.data.keep, 'pike-data');
  assert.equal(output.pikeConfig.keep, 'pike');
  assert.equal(output.traceId, 'keep');
});

test('passes unrelated, missing-field, and malformed responses through', () => {
  assert.equal(JSON.stringify(runScript({
    url: 'https://h.meituan.com/api/app-aggregation/request',
    body: JSON.stringify({ data: { keep: true } }),
  })), '{}');
  assert.equal(JSON.stringify(runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: JSON.stringify({ pikeConfig: { data: { customer: { keep: true } } } }),
  })), '{}');
  assert.equal(JSON.stringify(runScript({
    url: 'https://h.meituan.com/horn_ios/mergeRequest',
    body: '{invalid-json',
  })), '{}');
});

test('indexes the published module and its local maintenance files', () => {
  assert.match(readmeText, /Module\/MeituanAds\.sgmodule/);
  assert.match(readmeText, /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FMeituanAds\.sgmodule/);
  assert.match(indexText, /### `JS\/MeituanAds\.js`/);
  assert.match(indexText, /### `JS\/tests\/meituan-ads-module\.test\.js`/);
  assert.match(indexText, /### `Module\/MeituanAds\.sgmodule`/);
});
