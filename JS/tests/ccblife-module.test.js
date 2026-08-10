const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/CCBLife.sgmodule');
const scriptPath = path.resolve(__dirname, '../CCBLifeAdBlock.js');
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

function runScript(txcode, body, argument = {}) {
  const doneCalls = [];
  vm.runInNewContext(
    scriptText,
    {
      $request: {
        url: `https://yunbusiness.ccb.com/clp_service/txCtrl?txcode=${txcode}`,
      },
      $response: { body: typeof body === 'string' ? body : JSON.stringify(body) },
      $argument: argument,
      $done: (value) => doneCalls.push(value),
      console: { log() {} },
    },
    { filename: scriptPath }
  );

  assert.equal(doneCalls.length, 1, 'the response script must finish once');
  return doneCalls[0]?.body ? JSON.parse(doneCalls[0].body) : body;
}

test('declares a parameterised v1 CCB Life module with splash enabled only', () => {
  assert.match(moduleText, /^#!name=建行生活去广告$/m);
  assert.match(moduleText, /^#!desc=.*默认仅屏蔽开屏.*v1$/m);
  assert.match(
    moduleText,
    /^#!arguments = splash:true,home:false,life:false,finance:false,profile:false,popup:false,recommendation:false,icon_skin:false,newcomer:false$/m
  );
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/CCBLife\.sgmodule$/m
  );
});

test('covers only HAR-confirmed CCB advertisement configuration endpoints', () => {
  const scripts = sectionLines('Script');
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /txcode=A3341\(\?:A009\|AB03\|A120\|A095\|MB22\|A068\|AB04\|AB08\|C147\)/);
  assert.match(scripts[0], /requires-body=true/);
  assert.match(scripts[0], /script-arguments="splash=%splash&home=%home&life=%life&finance=%finance&profile=%profile&popup=%popup&recommendation=%recommendation&icon_skin=%icon_skin&newcomer=%newcomer"/);
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% yunbusiness.ccb.com',
  ]);
  assert.doesNotMatch(moduleText, /res\.yunbusiness\.ccb\.com/);
  assert.doesNotMatch(moduleText, /\[Map Local\]/);
});

test('clears the HAR-confirmed startup source while preserving treaty data by default', () => {
  const result = runScript('A3341A009', {
    errCode: '0',
    data: {
      START_AD_INFO: [{ AD_ID: 'current-campaign', AD_IMG: 'https://example.test/ad.jpg' }],
      TREATY_VERSION: [{ TREATY_TYPE: '01' }],
    },
  });

  assert.deepEqual(result, {
    errCode: '0',
    data: { START_AD_INFO: [], TREATY_VERSION: [{ TREATY_TYPE: '01' }] },
  });
});

test('keeps non-splash page material untouched under the default configuration', () => {
  const response = {
    errCode: '0',
    data: {
      HPBANNER_AD_INFO_SECOND: [{ AD_ID: 'banner' }],
      LIFE_TOP_ROTATION_INFO_V3: [{ AD_ID: 'life' }],
      THROUGH_COLUMN_INFO: [{ AD_ID: 'finance' }],
      MYSELF_ENTRANCE_AD: [{ AD_ID: 'profile' }],
    },
  };

  assert.deepEqual(runScript('A3341AB03', response), response);
});

test('removes selected page fields without changing functional state', () => {
  const result = runScript(
    'A3341AB03',
    {
      errCode: '0',
      data: {
        HPBANNER_AD_INFO_SECOND: [{ AD_ID: 'home' }],
        WINNOW_V3_FESTIVAL: { AD_ID: 'festival' },
        LIFE_TOP_ROTATION_INFO_V3: [{ AD_ID: 'life' }],
        EDITOR_RECOMMEND2_AD: [{ AD_ID: 'editor' }],
        THROUGH_COLUMN_INFO: [{ AD_ID: 'finance' }],
        FINANCE_V3_BORROW_MONEY: { AD_ID: 'loan' },
        MEBCT_AD_INFO: [{ AD_ID: 'profile' }],
        MYSELF_ENTRANCE_AD: [{ AD_ID: 'entrance' }],
        SYSTEM_TIME: 'unchanged',
      },
    },
    { home: 'true', life: 'true', finance: 'true', profile: 'true' }
  );

  assert.deepEqual(result, { errCode: '0', data: { SYSTEM_TIME: 'unchanged' } });
});

test('optionally clears popups, recommendation feeds, icon skins, newcomer data, and matching floors', () => {
  const popup = runScript(
    'A3341A120',
    { data: { CARD_TOP_INFO: { title: 'keep' }, POP_AD_INFO: [{ AD_ID: 'popup' }] } },
    { popup: 'true' }
  );
  assert.deepEqual(popup, {
    data: { CARD_TOP_INFO: { title: 'keep' }, POP_AD_INFO: [] },
  });

  const homeFeed = runScript(
    'A3341A095',
    { data: { data: { recList: [1], insGroup: { topList: [2], floorList: [3] } } } },
    { recommendation: 'true' }
  );
  assert.deepEqual(homeFeed.data.data, {
    recList: [],
    insGroup: { topList: [], floorList: [] },
  });

  const lifeFeed = runScript(
    'A3341MB22',
    { data: { MCT_INFO: [{ AD_ID: 'life' }], CG_INFO: [{ id: 'keep' }] } },
    { recommendation: 'true' }
  );
  assert.deepEqual(lifeFeed.data, { MCT_INFO: [], CG_INFO: [{ id: 'keep' }] });

  const financeFeed = runScript(
    'A3341A068',
    { data: { data: { recList: [1], topList: [2] } } },
    { recommendation: 'true' }
  );
  assert.deepEqual(financeFeed.data.data, { recList: [], topList: [] });

  const iconSkin = runScript(
    'A3341AB04',
    { data: { ENTRY_INFOV2: [{ id: 'keep' }], ICON_SKIN_INFO: [{ AD_ID: 'skin' }] } },
    { icon_skin: 'true' }
  );
  assert.deepEqual(iconSkin.data, { ENTRY_INFOV2: [{ id: 'keep' }] });

  const newcomer = runScript(
    'A3341C147',
    { data: { ENTRY_IMG: 'banner', NOTICE: 'offer' }, errCode: '0' },
    { newcomer: 'true' }
  );
  assert.deepEqual(newcomer, { data: {}, errCode: '0' });

  const floors = runScript(
    'A3341AB08',
    {
      data: {
        STOREY_DISPLAY_INFO: [
          { STOREY_TYPE: '266', IS_DISPLAY: '1' },
          { STOREY_TYPE: '45', IS_DISPLAY: '1' },
          { STOREY_TYPE: '277', IS_DISPLAY: '1' },
        ],
      },
    },
    { home: 'true', profile: 'true' }
  );
  assert.deepEqual(floors.data.STOREY_DISPLAY_INFO, [
    { STOREY_TYPE: '266', IS_DISPLAY: '0' },
    { STOREY_TYPE: '45', IS_DISPLAY: '1' },
    { STOREY_TYPE: '277', IS_DISPLAY: '0' },
  ]);
});

test('passes malformed bodies and unknown transaction responses through unchanged', () => {
  assert.equal(runScript('A3341A009', 'not json'), 'not json');
  assert.deepEqual(
    runScript('A3341UNKNOWN', { data: { START_AD_INFO: [{ AD_ID: 'keep' }] } }),
    { data: { START_AD_INFO: [{ AD_ID: 'keep' }] } }
  );
});
