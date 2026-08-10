const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appModulePath = path.resolve(__dirname, '../../Module/ICBCLife.sgmodule');
const miniModulePath = path.resolve(__dirname, '../../Module/ICBCLifeMiniProgram.sgmodule');
const scriptPath = path.resolve(__dirname, '../ICBCLifeMiniSplash.js');
const appModuleText = fs.existsSync(appModulePath) ? fs.readFileSync(appModulePath, 'utf8') : '';
const miniModuleText = fs.existsSync(miniModulePath) ? fs.readFileSync(miniModulePath, 'utf8') : '';
const scriptText = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';

function sectionLines(moduleText, sectionName) {
  const section = moduleText.match(
    new RegExp('\\[' + sectionName + '\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)')
  );

  assert.ok(section, '[' + sectionName + '] section must exist');
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function runResponseScript(headers, body) {
  let completion;
  const context = {
    $request: { headers },
    $response: { body },
    $done: (value) => {
      assert.equal(completion, undefined, 'the response script must call $done once');
      completion = value;
    },
  };

  vm.runInNewContext(scriptText, context, { filename: 'ICBCLifeMiniSplash.js' });
  assert.notEqual(completion, undefined, 'the response script must finish');
  return completion;
}

test('declares a v5 App-safe module at the existing subscription URL', () => {
  assert.match(appModuleText, /^#!name=工银e生活 App 去开屏广告$/m);
  assert.match(appModuleText, /^#!desc=.*不解密业务域.*v5$/m);
  assert.match(
    appModuleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/agent\/icbc-elife-splash-20260809\/Module\/ICBCLife\.sgmodule$/m
  );
});

test('the App module intercepts only the isolated exposure host', () => {
  assert.deepEqual(sectionLines(appModuleText, 'Map Local'), [
    '^https?:\\/\\/pv\\.elife\\.icbc\\.com\\.cn\\/OFSTPV\\/utm\\.gif(?:\\?|$) data-type=text data=" " status-code=200',
  ]);
  assert.deepEqual(sectionLines(appModuleText, 'MITM'), [
    'hostname = %APPEND% pv.elife.icbc.com.cn',
  ]);
  assert.doesNotMatch(appModuleText, /^\[Script\]$/m);
  assert.doesNotMatch(appModuleText, /getStartupMantleFlatingFloor|getStartupPages|getMantlePages/);
  assert.doesNotMatch(appModuleText, /image[1-4]\.elife\.icbc\.com\.cn/);
  assert.doesNotMatch(appModuleText, /hostname\s*=.*(?:^|,\s*)elife\.icbc\.com\.cn(?:,|$)/m);
});

test('moves the exact business-domain MITM into an explicitly separate mini-program module', () => {
  assert.match(miniModuleText, /^#!name=工银e生活微信小程序去开屏$/m);
  assert.match(miniModuleText, /^#!desc=.*会影响原生 App.*请勿同时启用.*v1$/m);
  assert.match(
    miniModuleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/agent\/icbc-elife-splash-20260809\/Module\/ICBCLifeMiniProgram\.sgmodule$/m
  );
  const script = sectionLines(miniModuleText, 'Script');
  assert.equal(script.length, 1);
  assert.ok(script[0].includes('getStartupMantleFlatingFloor'));
  assert.ok(script[0].includes('/JS/ICBCLifeMiniSplash.js?v=5'));
  assert.deepEqual(sectionLines(miniModuleText, 'MITM'), [
    'hostname = %APPEND% elife.icbc.com.cn',
  ]);
  assert.doesNotMatch(miniModuleText, /pv\.elife\.icbc\.com\.cn/);
});

test('clears only the HAR-confirmed mini-program startup items', () => {
  const source = {
    res: '0',
    errcode: '0',
    errmsg: '请求成功',
    data: [
      {
        floorId: 'qdp',
        floorName: '启动屏',
        startupDto: [{ imageId: 'rotating-creative', actId: 'campaign' }],
        activities: null,
      },
      {
        floorId: 'WXMP01',
        floorName: '蒙屏',
        startupDto: null,
        activities: [{ activityId: 'normal-page-feature' }],
      },
      {
        floorId: 'JX001',
        floorName: '精选页悬浮框',
        startupDto: null,
        activities: [{ activityId: 'selected-page-feature' }],
      },
    ],
  };
  const result = runResponseScript(
    {
      'User-Agent': 'MicroMessenger/8.0.75',
      Referer: 'https://servicewechat.com/wxREDACTEDAPPID/108/page-frame.html',
    },
    JSON.stringify(source)
  );

  assert.deepEqual(JSON.parse(result.body), {
    ...source,
    data: [
      { ...source.data[0], startupDto: [] },
      source.data[1],
      source.data[2],
    ],
  });
});

test('passes native App, malformed, and non-startup responses through', () => {
  const nativeBody = JSON.stringify({
    data: [{ floorId: 'qdp', floorName: '启动屏', startupDto: [{ imageId: 'native' }] }],
  });
  assert.equal(
    JSON.stringify(
      runResponseScript(
        { 'User-Agent': 'eLife/7.3.6 (iPhone; iOS 27.0; Scale/3.00)' },
        nativeBody
      )
    ),
    '{}'
  );
  assert.equal(
    JSON.stringify(runResponseScript({ 'User-Agent': 'MicroMessenger/8.0.75' }, '{not json')),
    '{}'
  );
  assert.equal(
    JSON.stringify(
      runResponseScript(
        { 'User-Agent': 'MicroMessenger/8.0.75' },
        JSON.stringify({ data: [{ floorId: 'normal', startupDto: [] }] })
      )
    ),
    '{}'
  );
});

test('contains no native App image interception fallback', () => {
  assert.doesNotMatch(appModuleText, /ICBCLifeSplashImage|binary-body-mode=true|filepath\/elife/);
  assert.doesNotMatch(miniModuleText, /ICBCLifeSplashImage|binary-body-mode=true|filepath\/elife/);
  assert.doesNotMatch(scriptText, /image[1-4]|filepath\/elife|status-code/);
});
