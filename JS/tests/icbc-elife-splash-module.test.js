const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appModulePath = path.resolve(__dirname, '../../Module/ICBCLife.sgmodule');
const miniModulePath = path.resolve(__dirname, '../../Module/ICBCLifeMiniProgram.sgmodule');
const miniScriptPath = path.resolve(__dirname, '../ICBCLifeMiniSplash.js');
const appScriptPath = path.resolve(__dirname, '../ICBCLifeAppSplashImage.js');
const appModuleText = fs.existsSync(appModulePath) ? fs.readFileSync(appModulePath, 'utf8') : '';
const miniModuleText = fs.existsSync(miniModulePath) ? fs.readFileSync(miniModulePath, 'utf8') : '';
const miniScriptText = fs.existsSync(miniScriptPath) ? fs.readFileSync(miniScriptPath, 'utf8') : '';
const appScriptText = fs.existsSync(appScriptPath) ? fs.readFileSync(appScriptPath, 'utf8') : '';

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

function runResponseScript(scriptText, filename, headers, body) {
  let completion;
  const context = {
    $request: { headers },
    $response: { body },
    $done: (value) => {
      assert.equal(completion, undefined, 'the response script must call $done once');
      completion = value;
    },
  };

  vm.runInNewContext(scriptText, context, { filename });
  assert.notEqual(completion, undefined, 'the response script must finish');
  return completion;
}

function runMiniScript(headers, body) {
  return runResponseScript(miniScriptText, 'ICBCLifeMiniSplash.js', headers, body);
}

function runAppScript({ phase, url, headers, body, store = {} }) {
  let completion;
  const context = {
    $request: { url, headers },
    $persistentStore: {
      read: (key) => store[key] ?? null,
      write: (value, key) => {
        store[key] = value;
        return true;
      },
    },
    $done: (value) => {
      assert.equal(completion, undefined, 'the App script must call $done once');
      completion = value;
    },
  };
  if (phase === 'response') {
    context.$response = { body };
  }

  vm.runInNewContext(appScriptText, context, { filename: 'ICBCLifeAppSplashImage.js' });
  assert.notEqual(completion, undefined, 'the App script must finish');
  return { result: completion, store };
}

function makeJpeg(width, height) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0,
    0x00, 0x11,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

test('declares a v7 App-safe module at the existing subscription URL', () => {
  assert.match(appModuleText, /^#!name=工银e生活 App 去开屏广告$/m);
  assert.match(appModuleText, /^#!desc=.*学习工银e生活全屏开屏素材.*后续请求直接跳过.*v7$/m);
  assert.match(
    appModuleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/ICBCLife\.sgmodule$/m
  );
});

test('the App module learns splash canvases and short-circuits known requests on image hosts', () => {
  const script = sectionLines(appModuleText, 'Script');
  assert.equal(script.length, 2);
  const requestScript = script.find((line) => line.includes('type=http-request'));
  const responseScript = script.find((line) => line.includes('type=http-response'));
  assert.ok(requestScript);
  assert.ok(responseScript);
  for (const line of script) {
    assert.ok(line.includes('image[1-4]\\.elife\\.icbc\\.com\\.cn'));
    assert.ok(line.includes('/JS/ICBCLifeAppSplashImage.js?v=7'));
  }
  assert.ok(responseScript.includes('requires-body=true'));
  assert.ok(responseScript.includes('binary-body-mode=true'));
  assert.doesNotMatch(requestScript, /requires-body=true|binary-body-mode=true/);
  assert.deepEqual(sectionLines(appModuleText, 'MITM'), [
    'hostname = %APPEND% image1.elife.icbc.com.cn, image2.elife.icbc.com.cn, image3.elife.icbc.com.cn, image4.elife.icbc.com.cn',
  ]);
  assert.doesNotMatch(appModuleText, /^\[Map Local\]$/m);
  assert.doesNotMatch(appModuleText, /getStartupMantleFlatingFloor|getStartupPages|getMantlePages/);
  assert.doesNotMatch(appModuleText, /pv\.elife\.icbc\.com\.cn/);
  assert.doesNotMatch(appModuleText, /hostname\s*=.*(?:^|,\s*)elife\.icbc\.com\.cn(?:,|$)/m);
});

test('moves the exact business-domain MITM into an explicitly separate mini-program module', () => {
  assert.match(miniModuleText, /^#!name=工银e生活微信小程序去开屏$/m);
  assert.match(miniModuleText, /^#!desc=.*微信小程序开屏.*与原生 App 模块互斥.*v1$/m);
  assert.match(
    miniModuleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/ICBCLifeMiniProgram\.sgmodule$/m
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
  const result = runMiniScript(
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
      runMiniScript(
        { 'User-Agent': 'eLife/7.3.6 (iPhone; iOS 27.0; Scale/3.00)' },
        nativeBody
      )
    ),
    '{}'
  );
  assert.equal(
    JSON.stringify(runMiniScript({ 'User-Agent': 'MicroMessenger/8.0.75' }, '{not json')),
    '{}'
  );
  assert.equal(
    JSON.stringify(
      runMiniScript(
        { 'User-Agent': 'MicroMessenger/8.0.75' },
        JSON.stringify({ data: [{ floorId: 'normal', startupDto: [] }] })
      )
    ),
    '{}'
  );
});

test('learns a HAR-confirmed splash canvas and replaces its first response with a tiny GIF', () => {
  const url = 'https://image3.elife.icbc.com.cn/filepath/elife/2026/08/10/08/creative.jpg';
  const store = {};
  const { result } = runAppScript({
    phase: 'response',
    url,
    headers: { 'User-Agent': 'eLife/7.3.6 (iPhone; iOS 27.0; Scale/3.00)' },
    body: makeJpeg(1125, 2436),
    store,
  });

  assert.equal(result.status, undefined);
  assert.equal(Buffer.from(result.body).subarray(0, 6).toString('ascii'), 'GIF89a');
  assert.deepEqual(JSON.parse(store['icbc-elife-app-splash-urls-v7']), [url]);
});

test('returns a direct 204 response for a learned splash request', () => {
  const url = 'https://image3.elife.icbc.com.cn/filepath/elife/2026/08/10/08/creative.jpg';
  const store = { 'icbc-elife-app-splash-urls-v7': JSON.stringify([url]) };
  const { result } = runAppScript({
    phase: 'request',
    url,
    headers: { 'User-Agent': 'eLife/7.3.6 (iPhone; iOS 27.0; Scale/3.00)' },
    store,
  });

  assert.equal(JSON.stringify(result), JSON.stringify({ response: { status: 204 } }));
});

test('passes ordinary images, non-App traffic, and malformed bodies through', () => {
  const appHeaders = { 'User-Agent': 'eLife/7.3.6 (iPhone; iOS 27.0; Scale/3.00)' };
  const url = 'https://image1.elife.icbc.com.cn/filepath/elife/normal.jpg';
  assert.equal(
    JSON.stringify(runAppScript({ phase: 'response', url, headers: appHeaders, body: makeJpeg(1125, 1410) }).result),
    '{}'
  );
  assert.equal(
    JSON.stringify(runAppScript({ phase: 'response', url, headers: appHeaders, body: makeJpeg(702, 240) }).result),
    '{}'
  );
  assert.equal(
    JSON.stringify(runAppScript({ phase: 'response', url, headers: { 'User-Agent': 'MicroMessenger/8.0.75' }, body: makeJpeg(1125, 2436) }).result),
    '{}'
  );
  assert.equal(
    JSON.stringify(runAppScript({ phase: 'response', url, headers: appHeaders, body: Uint8Array.from([1, 2, 3]) }).result),
    '{}'
  );
  assert.equal(
    JSON.stringify(runAppScript({ phase: 'request', url, headers: appHeaders, store: {} }).result),
    '{}'
  );
});

test('keeps native App and mini-program interception scopes separate', () => {
  assert.doesNotMatch(miniModuleText, /ICBCLifeSplashImage|binary-body-mode=true|filepath\/elife/);
  assert.doesNotMatch(miniScriptText, /image[1-4]|filepath\/elife|status-code/);
  assert.doesNotMatch(appScriptText, /getStartupMantleFlatingFloor|startupDto|MicroMessenger/);
});
