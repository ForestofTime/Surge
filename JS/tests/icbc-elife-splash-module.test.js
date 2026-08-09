const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/ICBCLife.sgmodule');
const scriptPath = path.resolve(__dirname, '../ICBCLifeMiniSplash.js');
const moduleText = fs.existsSync(modulePath)
  ? fs.readFileSync(modulePath, 'utf8')
  : '';
const scriptText = fs.existsSync(scriptPath)
  ? fs.readFileSync(scriptPath, 'utf8')
  : '';

function sectionLines(sectionName) {
  const section = moduleText.match(
    new RegExp(`\\[${sectionName}\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)`)
  );

  assert.ok(section, `[${sectionName}] section must exist`);
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

test('declares a dedicated v4 mini-program-only ICBC eLife splash module', () => {
  assert.match(moduleText, /^#!name=工银e生活去开屏广告$/m);
  assert.match(moduleText, /^#!desc=.*v4$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/agent\/icbc-elife-splash-20260809\/Module\/ICBCLife\.sgmodule$/m
  );
  assert.ok(fs.existsSync(scriptPath), 'the mini-program response script must exist');
});

test('clears only the HAR-confirmed qdp startup items for the ICBC WeChat mini-program', () => {
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
      Referer: 'https://servicewechat.com/wx6f17e7e23765ca30/108/page-frame.html',
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

test('also handles a startup floor whose stable name remains when its id changes', () => {
  const source = {
    data: [
      { floorId: 'future-startup-id', floorName: '启动屏', startupDto: [{ imageId: 'new' }] },
      { floorId: 'normal', floorName: '普通楼层', startupDto: [{ imageId: 'keep' }] },
    ],
  };
  const result = runResponseScript({ 'user-agent': 'MicroMessenger/8.0.75' }, JSON.stringify(source));

  assert.deepEqual(JSON.parse(result.body), {
    data: [
      { floorId: 'future-startup-id', floorName: '启动屏', startupDto: [] },
      { floorId: 'normal', floorName: '普通楼层', startupDto: [{ imageId: 'keep' }] },
    ],
  });
});

test('passes the native App response through without changing its body', () => {
  const source = {
    data: [{ floorId: 'qdp', floorName: '启动屏', startupDto: [{ imageId: 'native-creative' }] }],
  };

  assert.equal(
    JSON.stringify(
      runResponseScript(
        { 'User-Agent': 'ICBC/10.2 CFNetwork/3860.0.1 Darwin/25.0.0' },
        JSON.stringify(source)
      )
    ),
    '{}'
  );
});

test('passes malformed and non-startup mini-program responses through', () => {
  assert.equal(
    JSON.stringify(runResponseScript({ 'User-Agent': 'MicroMessenger/8.0.75' }, '{not json')),
    '{}'
  );
  assert.equal(
    JSON.stringify(
      runResponseScript(
        { 'User-Agent': 'MicroMessenger/8.0.75' },
        JSON.stringify({ res: '0', data: [{ floorId: 'normal', startupDto: [] }] })
      )
    ),
    '{}'
  );
});

test('retains only the mini-program configuration endpoint and removes App-facing hooks', () => {
  const rawScript = 'https://raw.githubusercontent.com/ForestofTime/Surge/agent/icbc-elife-splash-20260809/JS/ICBCLifeMiniSplash.js?v=4';
  const script = sectionLines('Script');
  assert.equal(script.length, 1);
  assert.ok(script[0].startsWith('工银e生活小程序开屏配置过滤 = type=http-response, pattern='));
  assert.ok(script[0].includes('getStartupMantleFlatingFloor'));
  assert.ok(script[0].includes('script-path=' + rawScript));
  assert.ok(script[0].endsWith('requires-body=true, max-size=1048576, timeout=10'));
  assert.deepEqual(sectionLines('MITM'), ['hostname = %APPEND% elife.icbc.com.cn']);
  assert.doesNotMatch(moduleText, /^\[Map Local\]$/m);
  assert.doesNotMatch(moduleText, /^\[Body Rewrite\]$/m);
  assert.doesNotMatch(moduleText, /pv\.elife\.icbc\.com\.cn/);
  assert.doesNotMatch(moduleText, /image[1-4]\.elife\.icbc\.com\.cn/);
  assert.doesNotMatch(moduleText, /ICBCLifeSplashImage/);
  assert.doesNotMatch(scriptText, /image[1-4]|filepath\/elife|status-code/);
});
