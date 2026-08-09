const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const modulePath = path.resolve(__dirname, '../../Module/ICBCLife.sgmodule');
const moduleText = fs.existsSync(modulePath)
  ? fs.readFileSync(modulePath, 'utf8')
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

test('declares a dedicated v3 ICBC eLife splash module', () => {
  assert.match(moduleText, /^#!name=工银e生活去开屏广告$/m);
  assert.match(moduleText, /^#!desc=.*v3$/m);
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

test('retains only the HAR-confirmed configuration and exposure hosts', () => {
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
    'hostname = %APPEND% elife.icbc.com.cn, pv.elife.icbc.com.cn',
  ]);
  assert.doesNotMatch(moduleText, /getMantlePages/);
  assert.doesNotMatch(moduleText, /url reject|data=""/);
  assert.doesNotMatch(moduleText, /^\[Script\]$/m);
  assert.doesNotMatch(moduleText, /binary-body-mode=true/);
  assert.doesNotMatch(moduleText, /image[1-4]\.elife\.icbc\.com\.cn/);
  assert.doesNotMatch(moduleText, /ICBCLifeSplashImage/);
});
