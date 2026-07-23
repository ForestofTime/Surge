const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/PuPuSupermarket.sgmodule');
const moduleText = fs.readFileSync(modulePath, 'utf8');
const scriptPath = path.resolve(__dirname, '../PuPuSupermarket.js');
const scriptText = fs.readFileSync(scriptPath, 'utf8');
const splashScriptPath = path.resolve(__dirname, '../PuPuSplashImage.js');
const splashScriptText = fs.existsSync(splashScriptPath)
  ? fs.readFileSync(splashScriptPath, 'utf8')
  : '';
const surgeScript =
  'https://raw.githubusercontent.com/ForestofTime/Surge/main/JS/PuPuSupermarket.js?v=21';
const surgeSplashScript =
  'https://raw.githubusercontent.com/ForestofTime/Surge/main/JS/PuPuSplashImage.js?v=21';

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

test('contains no concrete PuPu creative identifiers', () => {
  const sourceText = moduleText + scriptText + splashScriptText;

  assert.doesNotMatch(sourceText, /92bd7b325d08448a225231962b32a780/);
  assert.doesNotMatch(sourceText, /37704a60ca16a6741da4db6d4df9184e/);
  assert.doesNotMatch(sourceText, /0876bb9f23bd4d2789adae816be7cdcd/);
  assert.doesNotMatch(sourceText, /7edc759f51f8452db7a8432387b3b214/);
});

test('declares the v21 QX conversion with a cached-layout fallback', () => {
  assert.match(moduleText, /^#!desc=.*v21$/m);
});

test('routes every QX response mutation through one Surge response script', () => {
  const scriptLines = sectionLines('Script');
  const apiLines = scriptLines.filter((line) =>
    line.includes(`script-path=${surgeScript}`)
  );

  assert.equal(scriptLines.length, 3);
  assert.equal(apiLines.length, 1);
  assert.ok(apiLines[0].includes('type=http-response'));
  assert.ok(
    apiLines[0].includes(
      'pattern=^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/'
    )
  );
  assert.ok(apiLines[0].includes('requires-body=true'));
  assert.ok(apiLines[0].includes('max-size=1048576'));

  assert.doesNotMatch(moduleText, /type=http-request/);
  assert.doesNotMatch(moduleText, /PuPuPersonalPage/);
  assert.doesNotMatch(moduleText, /\[Body Rewrite\]/);
  assert.doesNotMatch(moduleText, /http-response-jq/);
});

test('adds a generic cached-splash fallback without asset hashes', () => {
  const splashLine = sectionLines('Script').find((line) =>
    line.includes('product-files\\.pupumall\\.com\\/STORE_PRODUCT')
  );

  assert.ok(splashLine, 'the current cached splash delivery host must be covered');
  assert.ok(splashLine.includes('jpe?g'));
  assert.doesNotMatch(splashLine, /\|png/);
  assert.ok(splashLine.includes(`script-path=${surgeSplashScript}`));
  assert.ok(splashLine.includes('requires-body=true'));
  assert.ok(splashLine.includes('binary-body-mode=true'));
  assert.ok(splashLine.includes('max-size=1048576'));
});

test('adds a category-level personal-ad fallback without creative paths', () => {
  const personalAdLine = sectionLines('Script').find((line) =>
    line.includes(
      'banner-files\\.pupumall\\.com\\/ADVERTISING_INTERNAL\\/'
    )
  );

  assert.ok(personalAdLine, 'the cached personal-ad category must be covered');
  assert.ok(personalAdLine.includes(`script-path=${surgeSplashScript}`));
  assert.ok(personalAdLine.includes('requires-body=true'));
  assert.ok(personalAdLine.includes('binary-body-mode=true'));
  assert.ok(personalAdLine.includes('max-size=1048576'));
});

test('converts QX reject and reject-dict rules without omissions', () => {
  assert.deepEqual(sectionLines('URL Rewrite'), [
    '^http:\\/\\/139\\.196\\.12\\.179:8053\\/httpdns\\/ _ reject',
    '^http:\\/\\/106\\.55\\.220\\.18:8053\\/httpdns\\/ _ reject',
    '^http:\\/\\/54\\.222\\.159\\.138:8053\\/httpdns\\/ _ reject',
    '^http:\\/\\/101\\.42\\.130\\.147\\/httpdns\\/resolve\\/ _ reject',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/member_card\\/index\\/my _ reject',
  ]);

  assert.deepEqual(sectionLines('Map Local'), [
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/marketing\\/advertisement\\/search_input_ranking data-type=text data="{}" status-code=200 header="Content-Type:application/json"',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/assets\\/discount\\/order data-type=text data="{}" status-code=200 header="Content-Type:application/json"',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/marketing\\/channel\\/global_redeem\\/top_tip\\/v2 data-type=text data="{}" status-code=200 header="Content-Type:application/json"',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/recommendation\\/hub\\/interests\\/products\\/v2 data-type=text data="{}" status-code=200 header="Content-Type:application/json"',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/member_card\\/premium\\/user_center data-type=text data="{}" status-code=200 header="Content-Type:application/json"',
  ]);

});

test('limits MITM to the API and generic filtered asset hosts', () => {
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% j1.pupuapi.com, product-files.pupumall.com, banner-files.pupumall.com',
  ]);
});

function runScript(url, body, headers = {}) {
  const doneCalls = [];

  vm.runInNewContext(
    scriptText,
    {
      $request: { url, headers },
      $response: { body: JSON.stringify(body) },
      $done: (value) => doneCalls.push(value),
      console: { log() {} },
    },
    { filename: scriptPath }
  );

  assert.equal(doneCalls.length, 1, 'a Surge response script must finish once');
  return doneCalls[0].body
    ? JSON.parse(doneCalls[0].body)
    : body;
}

test('ports the QX source-level advertisement filters exactly', () => {
  const result = runScript(
    'https://j1.pupuapi.com/client/marketing/advertisement/v1',
    {
      data: [
        { region_code: 30, positions: [] },
        {
          region_code: 2,
          positions: [
            { component_code: 890 },
            { component_code: 60 },
            { component_code: 999 },
          ],
        },
        { region_code: 7, positions: [] },
      ],
    }
  );

  assert.deepEqual(result, {
    data: [
      { region_code: 2, positions: [{ component_code: 999 }] },
      { region_code: 7, positions: [] },
    ],
  });
});

test('preserves QX functional personal-page regions while removing ad regions', () => {
  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/marketing/advertisement/v1',
      {
        errcode: 0,
        errmsg: '',
        data: [
          { region_code: 30, positions: [{ component_code: 30 }] },
          { region_code: 2400, positions: [{ component_code: 2400 }] },
          {
            region_code: 2,
            positions: [
              { component_code: 60 },
              { component_code: 560 },
            ],
          },
        ],
      },
      {
        'pp-page-name': 'personal_page',
      }
    ),
    {
      errcode: 0,
      errmsg: '',
      data: [
        { region_code: 2400, positions: [{ component_code: 2400 }] },
        { region_code: 2, positions: [{ component_code: 560 }] },
      ],
    }
  );
});

test('restores the legacy QX banner source filter', () => {
  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/marketing/banner/v7?position_types=2%2C50&store_id=test',
      {
        data: {
          splash: { position_type: 50 },
          home: { position_type: 320 },
          legacy: { position_type: 710 },
          keep: { position_type: 2 },
        },
      }
    ),
    { data: [{ position_type: 2 }] }
  );
});

test('ports the remaining QX response mutations exactly', () => {
  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/notification/message_center/unread_number',
      { data: [{ id: 1 }] }
    ),
    { data: [] }
  );

  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/search/hot_keywords/v3',
      { data: [{ id: 1 }] }
    ),
    { data: [] }
  );

  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/app_resource/resource_preload/list_h5_resource',
      {
        data: [
          { filename: 'RecommendProduct.29e31893.js' },
          { filename: 'keep.js' },
        ],
      }
    ),
    { data: [{ filename: 'keep.js' }] }
  );

  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/search/hub/search_box/products/v6',
      { data: { feed_banner_cards: [{ id: 1 }], keep: true } }
    ),
    { data: { feed_banner_cards: [], keep: true } }
  );

  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/order_settlement/detail',
      { data: { member_card_v2: { id: 1 }, keep: true } }
    ),
    { data: { member_card_v2: {}, keep: true } }
  );

  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/order/orders/list/v4',
      { data: [{ just_in_time_comment: { id: 1 }, keep: true }] }
    ),
    { data: [{ keep: true }] }
  );
});

test('passes unhandled client responses through unchanged', () => {
  assert.deepEqual(
    runScript(
      'https://j1.pupuapi.com/client/bv/c/v3',
      { errcode: 0, errmsg: '', data: { keep: true } }
    ),
    { errcode: 0, errmsg: '', data: { keep: true } }
  );
});

function makeWebpVp8x(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return new Uint8Array(bytes);
}

function makeWebpVp8(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8 ', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.set([0, 0, 0, 0x9d, 0x01, 0x2a], 20);
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return new Uint8Array(bytes);
}

function runImageScript(url, width, height, format = 'VP8') {
  const doneCalls = [];
  const body =
    format === 'VP8X'
      ? makeWebpVp8x(width, height)
      : makeWebpVp8(width, height);

  vm.runInNewContext(
    splashScriptText,
    {
      $request: { url },
      $response: { body },
      $done: (value) => doneCalls.push(value),
      Uint8Array,
      console: { log() {} },
    },
    { filename: splashScriptPath }
  );

  assert.equal(doneCalls.length, 1, 'the binary response script must finish once');
  return doneCalls[0];
}

test('blocks the HAR-confirmed 1080x2240 splash dimensions generically', () => {
  const url =
    'https://product-files.pupumall.com/STORE_PRODUCT/campaign/path/creative.jpg?x-oss-process=image/format,webp';
  const result = runImageScript(url, 1080, 2240, 'VP8');

  assert.equal(result.status, 404);
  assert.equal(result.body.length, 0);

  const vp8xResult = runImageScript(url, 1080, 2240, 'VP8X');
  assert.equal(vp8xResult.status, 404);
});

test('passes through ordinary product image dimensions', () => {
  const url =
    'https://product-files.pupumall.com/STORE_PRODUCT/catalog/path/product.jpg?x-oss-process=image/format,webp';

  assert.equal(Object.keys(runImageScript(url, 800, 800)).length, 0);
  assert.equal(Object.keys(runImageScript(url, 1242, 900)).length, 0);
});

test('blocks the cached personal-ad category while preserving QX live entry', () => {
  const url =
    'https://banner-files.pupumall.com/ADVERTISING_INTERNAL/campaign/path/creative.png?x-oss-process=image/format,webp';

  assert.equal(runImageScript(url, 90, 60).status, 404);
  assert.equal(runImageScript(url, 375, 200, 'VP8X').status, 404);
  assert.equal(Object.keys(runImageScript(url, 228, 228)).length, 0);
  assert.equal(
    Object.keys(runImageScript(url, 228, 228, 'VP8X')).length,
    0
  );
});
