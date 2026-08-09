const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const modulePath = path.resolve(__dirname, '../../Module/ICBCLife.sgmodule');
const moduleText = fs.existsSync(modulePath)
  ? fs.readFileSync(modulePath, 'utf8')
  : '';
const imageScriptPath = path.resolve(__dirname, '../ICBCLifeSplashImage.js');
const imageScriptText = fs.existsSync(imageScriptPath)
  ? fs.readFileSync(imageScriptPath, 'utf8')
  : '';
const surgeImageScript =
  'https://raw.githubusercontent.com/ForestofTime/Surge/agent/icbc-elife-splash-20260809/JS/ICBCLifeSplashImage.js?v=2';

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

function splashFilter() {
  const rule = sectionLines('Body Rewrite').find((line) =>
    line.includes('getStartupMantleFlatingFloor')
  );

  assert.ok(rule, 'the HAR-confirmed mini-program splash endpoint must be filtered');
  const firstQuote = rule.indexOf("'");
  const lastQuote = rule.lastIndexOf("'");
  assert.ok(firstQuote > 0 && lastQuote > firstQuote, `invalid jq rule: ${rule}`);
  return rule.slice(firstQuote + 1, lastQuote);
}

function runSplashFilter(value) {
  const result = spawnSync('jq', ['-c', splashFilter()], {
    encoding: 'utf8',
    input: JSON.stringify(value),
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('declares a dedicated v2 ICBC eLife splash module', () => {
  assert.match(moduleText, /^#!name=工银e生活去开屏广告$/m);
  assert.match(moduleText, /^#!desc=.*v2$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/agent\/icbc-elife-splash-20260809\/Module\/ICBCLife\.sgmodule$/m
  );
});

test('clears only the HAR-confirmed qdp startup items and preserves other floors', () => {
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

  const rewritten = runSplashFilter(source);

  assert.deepEqual(rewritten, {
    ...source,
    data: [
      { ...source.data[0], startupDto: [] },
      source.data[1],
      source.data[2],
    ],
  });
});

test('also handles a startup floor whose stable name remains when its id changes', () => {
  const rewritten = runSplashFilter({
    data: [
      { floorId: 'future-startup-id', floorName: '启动屏', startupDto: [{ imageId: 'new' }] },
      { floorId: 'normal', floorName: '普通楼层', startupDto: [{ imageId: 'keep' }] },
    ],
  });

  assert.deepEqual(rewritten, {
    data: [
      { floorId: 'future-startup-id', floorName: '启动屏', startupDto: [] },
      { floorId: 'normal', floorName: '普通楼层', startupDto: [{ imageId: 'keep' }] },
    ],
  });
});

test('leaves malformed and non-startup responses unchanged', () => {
  assert.deepEqual(runSplashFilter({ res: '0', data: null }), { res: '0', data: null });
  assert.deepEqual(runSplashFilter({ res: '0', data: { floorId: 'qdp' } }), {
    res: '0',
    data: { floorId: 'qdp' },
  });
  assert.deepEqual(runSplashFilter({ res: '0', data: [{ floorId: 'normal', startupDto: [] }] }), {
    res: '0',
    data: [{ floorId: 'normal', startupDto: [] }],
  });
});

test('limits rewriting and native handling to known configuration and asset hosts', () => {
  const rewrite = sectionLines('Body Rewrite');
  assert.equal(rewrite.length, 1);
  assert.ok(
    rewrite[0].startsWith(
      'http-response-jq ^https:\\/\\/elife\\.icbc\\.com\\.cn\\/OFSTNEWBASE\\/floorinfo\\/getStartupMantleFlatingFloor\\.do(?:\\?|$)'
    )
  );
  assert.deepEqual(sectionLines('Map Local'), [
    '^https?:\\/\\/pv\\.elife\\.icbc\\.com\\.cn\\/OFSTPV\\/utm\\.gif(?:\\?|$) data-type=text data=" " status-code=200',
  ]);
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% elife.icbc.com.cn, pv.elife.icbc.com.cn, image1.elife.icbc.com.cn, image2.elife.icbc.com.cn, image3.elife.icbc.com.cn, image4.elife.icbc.com.cn',
  ]);
  assert.doesNotMatch(moduleText, /getMantlePages/);
  assert.doesNotMatch(moduleText, /url reject|data=""/);
});

test('adds a generic native cached-splash image fallback without creative ids', () => {
  const imageLine = sectionLines('Script').find((line) =>
    line.includes('image[1-4]\\.elife\\.icbc\\.com\\.cn')
  );

  assert.ok(imageLine, 'the HAR-confirmed eLife asset hosts must be covered');
  assert.ok(imageLine.includes('jpe?g'));
  assert.ok(imageLine.includes(`script-path=${surgeImageScript}`));
  assert.ok(imageLine.includes('requires-body=true'));
  assert.ok(imageLine.includes('binary-body-mode=true'));
  assert.ok(imageLine.includes('max-size=4194304'));
  assert.doesNotMatch(moduleText + imageScriptText, /1e3176fa5ab74c48a4599c9c4971fc7e/);
});

function makeJpeg(width, height, marker = 0xc0) {
  const bytes = Buffer.alloc(23);
  bytes.writeUInt16BE(0xffd8, 0);
  bytes[2] = 0xff;
  bytes[3] = marker;
  bytes.writeUInt16BE(17, 4);
  bytes[6] = 8;
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  bytes[11] = 3;
  bytes.set([1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0], 12);
  bytes.writeUInt16BE(0xffd9, 21);
  return new Uint8Array(bytes);
}

function runImageBody(body) {
  const vm = require('node:vm');
  const doneCalls = [];

  vm.runInNewContext(
    imageScriptText,
    {
      $request: {
        url: 'https://image1.elife.icbc.com.cn/filepath/elife/current/campaign.jpg',
      },
      $response: { body },
      $done: (value) => doneCalls.push(value),
      Uint8Array,
      ArrayBuffer,
      console: { log() {} },
    },
    { filename: imageScriptPath }
  );

  assert.equal(doneCalls.length, 1, 'a binary response script must finish once');
  return doneCalls[0];
}

function runImageScript(width, height, marker) {
  return runImageBody(makeJpeg(width, height, marker));
}

test('blocks the HAR-confirmed full-canvas native splash dimensions generically', () => {
  const result = runImageScript(1125, 2436);

  assert.equal(result.status, 404);
  assert.equal(result.body.length, 0);
});

test('passes through ordinary eLife image dimensions', () => {
  assert.deepEqual(Object.keys(runImageScript(340, 454)), []);
  assert.deepEqual(Object.keys(runImageScript(1125, 1410)), []);
});

test('fails open for non-splash, malformed, and non-JPEG image bodies', () => {
  assert.deepEqual(Object.keys(runImageBody(new Uint8Array([0, 1, 2]))), []);
  assert.deepEqual(
    Object.keys(runImageBody(makeJpeg(1125, 2436, 0xc5))),
    ['status', 'body']
  );
  assert.deepEqual(
    Object.keys(runImageBody(makeJpeg(1125, 2436, 0xc9))),
    ['status', 'body']
  );
  assert.deepEqual(
    Object.keys(runImageBody(makeJpeg(1125, 2436, 0xcd))),
    ['status', 'body']
  );
  assert.deepEqual(
    Object.keys(runImageBody(new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0]))),
    []
  );
  assert.deepEqual(
    Object.keys(runImageBody(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1]))),
    []
  );
  assert.deepEqual(
    Object.keys(runImageBody(new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xe0, 0]))),
    []
  );
  assert.deepEqual(
    Object.keys(runImageBody(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 4, 0, 0]))),
    []
  );
  assert.deepEqual(Object.keys(runImageBody(Symbol('invalid'))), []);
});
