const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const modulePath = path.join(repoRoot, 'Module/TaobaoAds.sgmodule');
const scriptPath = path.join(repoRoot, 'JS/TaobaoAds.js');
const readmePath = path.join(repoRoot, 'README.md');
const moduleText = fs.existsSync(modulePath) ? fs.readFileSync(modulePath, 'utf8') : '';
const scriptText = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';
const readmeText = fs.readFileSync(readmePath, 'utf8');

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

function runScript({ url, body }) {
  const doneCalls = [];
  vm.runInNewContext(
    scriptText,
    {
      $request: { url, headers: {} },
      $response: { body },
      $done: (value) => doneCalls.push(value),
    },
    { filename: scriptPath }
  );
  assert.equal(doneCalls.length, 1, 'the response script must call $done once');
  return doneCalls[0];
}

test('declares a repository-native Taobao v1 module', () => {
  assert.notEqual(moduleText, '', 'Module/TaobaoAds.sgmodule must exist');
  assert.match(moduleText, /^#!name=淘宝广告净化$/m);
  assert.match(moduleText, /^#!desc=.*开屏.*Tanx.*v1$/m);
  assert.match(moduleText, /^#!category=AdBlock$/m);
  assert.match(moduleText, /^#!homepage=https:\/\/github\.com\/ForestofTime\/Surge$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/TaobaoAds\.sgmodule$/m
  );
  assert.doesNotMatch(moduleText, /script\.hub|Kelee\/Tool|zirawell\/R-Store\/main\/Res\/Scripts/);
});

test('blocks only the captured Tanx endpoints and two established telemetry hosts', () => {
  assert.deepEqual(sectionLines('Rule'), [
    'DOMAIN,df.tanx.com,REJECT,extended-matching,pre-matching',
    'DOMAIN,bdlog.tanx.com,REJECT,extended-matching,pre-matching',
    'DOMAIN,adashx.m.taobao.com,REJECT,extended-matching,pre-matching',
    'DOMAIN,h-adashx.ut.taobao.com,REJECT,extended-matching,pre-matching',
  ]);
  assert.doesNotMatch(moduleText, /DOMAIN(?:-SUFFIX)?,(?:heic|gw)\.alicdn\.com,REJECT/);
  assert.doesNotMatch(moduleText, /DOMAIN(?:-SUFFIX)?,(?:acs|guide-acs)\.m\.taobao\.com,REJECT/);
  assert.doesNotMatch(moduleText, /DOMAIN-SUFFIX,taobao\.com,REJECT/);
});

test('ports the QX splash asset rejects as path-scoped empty JSON responses', () => {
  const mapLocal = sectionLines('Map Local');
  assert.equal(mapLocal.length, 4);
  assert.ok(mapLocal.every((line) => line.includes('data="{}" status-code=200')));
  assert.ok(mapLocal.every((line) => line.includes('Content-Type:application/json')));
  assert.equal(mapLocal.filter((line) => line.startsWith(String.raw`^https:\/\/heic\.alicdn\.com`)).length, 3);
  assert.equal(mapLocal.filter((line) => line.startsWith(String.raw`^https?:\/\/gw\.alicdn\.com`)).length, 1);
  assert.doesNotMatch(moduleText, /mtop\.taobao\.cloudvideo\.video\.query/);
  assert.doesNotMatch(moduleText, /mtop\.taobao\.wireless\.home\.newface\.awesome\.get/);
});

test('uses unique bounded response rules and the minimum MITM host set', () => {
  const scripts = sectionLines('Script');
  assert.equal(scripts.length, 2);
  const names = scripts.map((line) => line.slice(0, line.indexOf('=')).trim());
  assert.deepEqual(names, ['淘宝-开屏配置净化', '淘宝-PopLayer净化']);
  assert.equal(new Set(names).size, names.length);
  for (const line of scripts) {
    assert.ok(line.includes('/JS/TaobaoAds.js?v=1'));
    assert.ok(line.includes('type=http-response'));
    assert.ok(line.includes('requires-body=true'));
    assert.doesNotMatch(line, /max-size=(?:0|-1)/);
  }
  assert.match(scripts[0], /wireless\\\.home\\\.splash\\\.awesome\\\.get/);
  assert.match(scripts[1], /poplayer\\\.template\\\.alibaba\\\.com\\\/popcdn\\\/2\\\/config\\\.json/);
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% heic.alicdn.com, gw.alicdn.com, guide-acs.m.taobao.com, poplayer.template.alibaba.com',
  ]);
  assert.doesNotMatch(moduleText, /mobileDispatch|<ip-address>|tcp-connection\s*=\s*true/);
});

test('removes the Taobao splash payload while preserving sibling home data', () => {
  const source = {
    data: {
      containers: {
        splash_home_base: {
          base: {
            sections: [
              {
                id: 'mixed',
                bizData: {
                  'taobao-splash': { data: [{ imgUrl: 'https://example.invalid/ad.jpg' }] },
                  navigation: { tabs: ['首页', '购物车'] },
                },
              },
              { id: 'splash-only', bizData: { 'taobao-splash': { data: [{ videoUrl: 'ad.mp4' }] } } },
              { id: 'functional', bizData: { recommendations: [{ itemId: '1' }] } },
            ],
          },
        },
        home: { keep: true },
      },
    },
    ret: ['SUCCESS::调用成功'],
  };
  const result = runScript({
    url: 'https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get/1.0/',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);

  assert.deepEqual(output.data.containers.splash_home_base.base.sections, [
    { id: 'mixed', bizData: { navigation: { tabs: ['首页', '购物车'] } } },
    { id: 'functional', bizData: { recommendations: [{ itemId: '1' }] } },
  ]);
  assert.deepEqual(output.data.containers.home, { keep: true });
  assert.deepEqual(output.ret, source.ret);
});

test('disables only the observed PopLayer configuration resources', () => {
  const source = {
    enable: true,
    res: { images: ['ad.png'], videos: ['ad.mp4'], fonts: ['keep.woff'] },
    mainRes: { images: ['cover.png'], css: ['keep.css'] },
    props: [{ name: 'advertisement' }],
    configData: {
      pages: [{ id: 'splash' }],
      env: { bgAlpha: '0.8', displayDelayMs: 1000, autoCloseDelayMs: 5000, keep: true },
    },
    version: 2,
  };
  const result = runScript({
    url: 'https://poplayer.template.alibaba.com/popcdn/2/config.json',
    body: JSON.stringify(source),
  });
  const output = JSON.parse(result.body);

  assert.equal(output.enable, false);
  assert.deepEqual(output.res, { images: [], videos: [], fonts: ['keep.woff'] });
  assert.deepEqual(output.mainRes, { images: [], css: ['keep.css'] });
  assert.deepEqual(output.props, []);
  assert.deepEqual(output.configData.pages, []);
  assert.deepEqual(output.configData.env, {
    bgAlpha: '0', displayDelayMs: 0, autoCloseDelayMs: 0, keep: true,
  });
  assert.equal(output.version, 2);
});

test('passes malformed, unrelated, and no-op responses through unchanged', () => {
  const cases = [
    {
      url: 'https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get/1.0/',
      body: 'not-json',
    },
    {
      url: 'https://guide-acs.m.taobao.com/gw/mtop.taobao.cloudvideo.video.query/1.0/',
      body: JSON.stringify({ data: { duration: '30', resources: ['product-video.mp4'] } }),
    },
    {
      url: 'https://guide-acs.m.taobao.com/gw/mtop.taobao.wireless.home.splash.awesome.get/1.0/',
      body: JSON.stringify({ data: { containers: { home: { keep: true } } } }),
    },
  ];
  for (const input of cases) assert.equal(JSON.stringify(runScript(input)), '{}');
});

test('README publishes the module with the official Surge one-click import', () => {
  assert.match(
    readmeText,
    /`Module\/TaobaoAds\.sgmodule` \| AdBlock \| 淘宝开屏、PopLayer 与 Tanx 广告净化/
  );
  assert.match(
    readmeText,
    /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FTaobaoAds\.sgmodule/
  );
  const row = readmeText.split('\n').find((line) => line.includes('`Module/TaobaoAds.sgmodule`')) || '';
  assert.doesNotMatch(row, /api\.boxjs\.app/);
});
