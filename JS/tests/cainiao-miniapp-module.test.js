const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/CainiaoMiniProgram.sgmodule');
const scriptPath = path.resolve(__dirname, '../CainiaoMiniProgram.js');
const moduleText = fs.existsSync(modulePath) ? fs.readFileSync(modulePath, 'utf8') : '';
const scriptText = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';

function sectionLines(sectionName) {
  const section = moduleText.match(
    new RegExp('\\[' + sectionName + '\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)')
  );

  assert.ok(section, '[' + sectionName + '] section must exist');
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function runScript({ url, headers = {}, body }) {
  const doneCalls = [];

  vm.runInNewContext(
    scriptText,
    {
      $request: { url, headers },
      $response: { body },
      $done: (value) => doneCalls.push(value),
    },
    { filename: scriptPath }
  );

  assert.equal(doneCalls.length, 1, 'the response script must call $done once');
  return doneCalls[0];
}

function base64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function parseBase64Json(value) {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

test('declares a narrowly scoped v1 mini-program module with unique script names', () => {
  assert.match(moduleText, /^#!name=菜鸟淘宝小程序去广告$/m);
  assert.match(moduleText, /^#!desc=.*HTTPDNS.*1308.*205.*1381.*v1$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/CainiaoMiniProgram\.sgmodule$/m
  );

  const scripts = sectionLines('Script');
  assert.equal(scripts.length, 2);
  const names = scripts.map((line) => line.slice(0, line.indexOf('=' )).trim());
  assert.equal(new Set(names).size, names.length, 'Surge Script names must be unique');
  assert.deepEqual(names, ['菜鸟小程序-HTTPDNS清理', '菜鸟小程序-广告位过滤']);
  for (const line of scripts) {
    assert.ok(line.includes('/JS/CainiaoMiniProgram.js?v=1'));
    assert.ok(line.includes('type=http-response'));
    assert.ok(line.includes('requires-body=true'));
  }
});

test('limits AMDC interception to Cainiao appkey and the observed host or IPv4 path', () => {
  const amdc = sectionLines('Script').find((line) => line.startsWith('菜鸟小程序-HTTPDNS清理'));
  assert.ok(amdc);
  assert.match(amdc, /amdc\\\.m\\\.taobao\\\.com/);
  assert.match(amdc, /\(\?:\\d\+\\\.\)\{3\}\\d\+/);
  assert.match(amdc, /amdc\\\/mobileDispatch/);
  assert.match(amdc, /appkey=21380790/);

  assert.doesNotMatch(moduleText, /^\[Map Local\]$/m);
  assert.doesNotMatch(moduleText, /force-http-engine-hosts\s*=.*(?:<ip-address>|0\.0\.0\.0)/);
  assert.doesNotMatch(moduleText, /data-type=text data=""/);
});

test('covers only the three MTop hosts and the exact mshow API', () => {
  const ads = sectionLines('Script').find((line) => line.startsWith('菜鸟小程序-广告位过滤'));
  assert.ok(ads);
  assert.match(ads, /pattern=\^https\?:\\\/\\\//);
  assert.match(ads, /guide-acs\\\.m\\\.taobao\\\.com/);
  assert.match(ads, /acs4miniapp-inner\\\.m\\\.taobao\\\.com/);
  assert.match(ads, /acs\\\.m\\\.taobao\\\.com/);
  assert.match(ads, /mtop\\\.cainiao\\\.guoguo\\\.nbnetflow\\\.ads\\\.mshow/);
  assert.doesNotMatch(ads, /(?:^|\\\/)gw\\\/\.\*|\.\*cainiao/);

  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% guide-acs.m.taobao.com, acs4miniapp-inner.m.taobao.com, acs.m.taobao.com',
    'tcp-connection = true',
  ]);
  assert.doesNotMatch(moduleText, /<ip-address>/);
});

test('removes only the two Cainiao MTop hosts from a Taobao AMDC response', () => {
  const source = {
    dns: [
      { host: 'guide-acs.m.taobao.com', ttl: 300, servers: ['59.82.44.17'] },
      { host: 'acs4miniapp-inner.m.taobao.com', ttl: 300, servers: ['112.48.116.116'] },
      { host: 'acs.m.taobao.com', ttl: 300, servers: ['203.119.238.48'] },
      { host: 'other.m.taobao.com', ttl: 60, servers: ['106.11.1.2'] },
    ],
    config: { keep: true },
  };
  const result = runScript({
    url: 'http://amdc.m.taobao.com/amdc/mobileDispatch?platform=iOS&appkey=21380790&v=1',
    headers: { 'User-Agent': '%E6%B7%98%E5%AE%9D/57035247 CFNetwork/3892.100.1' },
    body: base64Json(source),
  });

  assert.deepEqual(parseBase64Json(result.body), {
    dns: [source.dns[2], source.dns[3]],
    config: { keep: true },
  });
});

test('preserves plain JSON encoding while cleaning an AMDC dns object', () => {
  const source = {
    dns: {
      'guide-acs.m.taobao.com': { ttl: 300, servers: ['59.82.44.17'] },
      'acs4miniapp-inner.m.taobao.com': { ttl: 300, servers: ['112.48.116.116'] },
      'acs.m.taobao.com': { ttl: 300, servers: ['203.119.238.48'] },
    },
  };
  const result = runScript({
    url: 'http://59.82.44.17/amdc/mobileDispatch?appkey=21380790&platform=iOS',
    headers: { 'User-Agent': '淘宝/57035247' },
    body: JSON.stringify(source),
  });

  assert.deepEqual(JSON.parse(result.body), {
    dns: {
      'acs.m.taobao.com': source.dns['acs.m.taobao.com'],
    },
  });
  assert.equal(result.body.trimStart().startsWith('{'), true);
});

test('round-trips a 22KB base64 AMDC response without corrupting Chinese values', () => {
  const source = {
    dns: [
      { host: 'guide-acs.m.taobao.com', ttl: 300, servers: ['59.82.44.17'] },
      { host: 'acs4miniapp-inner.m.taobao.com', ttl: 300, servers: ['112.48.116.116'] },
      ...Array.from({ length: 38 }, (_, index) => ({
        host: `service-${index}.m.taobao.com`,
        ttl: 60,
        servers: [`10.0.0.${index + 1}`],
      })),
    ],
    message: '菜鸟小程序中文完整性验证'.repeat(900),
    config: { title: '保留正常包裹与其它淘宝服务' },
  };
  assert.ok(Buffer.byteLength(JSON.stringify(source), 'utf8') > 22 * 1024);

  const result = runScript({
    url: 'http://amdc.m.taobao.com/amdc/mobileDispatch?appkey=21380790&platform=iOS',
    headers: { 'User-Agent': '%E6%B7%98%E5%AE%9D/57035247 CFNetwork/3892.100.1' },
    body: base64Json(source),
  });
  const output = parseBase64Json(result.body);

  assert.equal(output.dns.length, 38);
  assert.deepEqual(output.dns, source.dns.slice(2));
  assert.equal(output.message, source.message);
  assert.deepEqual(output.config, source.config);
});

test('passes non-Taobao, wrong-appkey, malformed, and unrelated AMDC responses through', () => {
  const valid = base64Json({
    dns: [
      { host: 'guide-acs.m.taobao.com', servers: ['59.82.44.17'] },
      { host: 'other.m.taobao.com', servers: ['106.11.1.2'] },
    ],
  });
  const cases = [
    {
      url: 'http://amdc.m.taobao.com/amdc/mobileDispatch?appkey=21380790',
      headers: { 'User-Agent': 'Cainiao/8.9.0' },
      body: valid,
    },
    {
      url: 'http://amdc.m.taobao.com/amdc/mobileDispatch?appkey=99999999',
      headers: { 'User-Agent': '淘宝/57035247' },
      body: valid,
    },
    {
      url: 'http://amdc.m.taobao.com/amdc/mobileDispatch?appkey=21380790',
      headers: { 'User-Agent': '淘宝/57035247' },
      body: 'not-base64-json',
    },
    {
      url: 'http://amdc.m.taobao.com/amdc/mobileDispatch?appkey=21380790',
      headers: { 'User-Agent': '淘宝/57035247' },
      body: base64Json({ dns: [{ host: 'other.m.taobao.com', servers: ['106.11.1.2'] }] }),
    },
  ];

  for (const input of cases) {
    assert.equal(JSON.stringify(runScript(input)), '{}');
  }
});

test('removes confirmed ad keys and explicit ad elements while preserving real parcels', () => {
  const source = {
    ret: ['SUCCESS::调用成功'],
    data: {
      1308: [{ id: 1308, title: '看视频领金豆' }],
      205: [{ adId: '205', title: '待领取推广' }],
      1381: [{ slotId: 1381, title: '浮动推广' }],
      1275: [{ id: 1275, title: '保留的未确认广告位' }],
      packageList: [
        {
          id: '435299606435615',
          mailNo: '435299606435615',
          status: '派送中',
          company: '韵达快递',
        },
        { positionId: '1308', title: '视频广告' },
        { adId: 205, title: '领取广告' },
        { slotId: '1381', title: '浮层广告' },
        { id: 'normal-service', title: '取包裹' },
      ],
      nested: {
        cards: [
          { id: 1308, title: '嵌套广告' },
          { id: 'real-parcel-card', mailNo: 'YT123456789' },
        ],
        batch: {
          1308: [{ title: '批量包装视频广告' }],
          205: [{ title: '批量包装领取广告' }],
          1381: [{ title: '批量包装浮层广告' }],
          safe: [{ id: 'real-parcel-batch', mailNo: 'SF123456789' }],
        },
      },
    },
  };
  const result = runScript({
    url: 'https://guide-acs.m.taobao.com/gw/mtop.cainiao.guoguo.nbnetflow.ads.mshow/1.0/?appKey=21380790',
    headers: { 'User-Agent': '%E6%B7%98%E5%AE%9D/57035247' },
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);

  assert.equal(output.data['1308'], undefined);
  assert.equal(output.data['205'], undefined);
  assert.equal(output.data['1381'], undefined);
  assert.deepEqual(output.data['1275'], source.data['1275']);
  assert.deepEqual(output.data.packageList, [source.data.packageList[0], source.data.packageList[4]]);
  assert.deepEqual(output.data.nested.cards, [source.data.nested.cards[1]]);
  assert.deepEqual(output.data.nested.batch, { safe: source.data.nested.batch.safe });
  assert.deepEqual(output.ret, source.ret);
});

test('passes malformed and unrelated MTop responses through', () => {
  assert.equal(
    JSON.stringify(
      runScript({
        url: 'https://acs.m.taobao.com/gw/mtop.cainiao.guoguo.nbnetflow.ads.mshow/1.0/',
        body: '{invalid json',
      })
    ),
    '{}'
  );
  assert.equal(
    JSON.stringify(
      runScript({
        url: 'https://acs.m.taobao.com/gw/mtop.common.getTimestamp/1.0/',
        body: JSON.stringify({ data: { 1308: [{ id: 1308 }] } }),
      })
    ),
    '{}'
  );
});
