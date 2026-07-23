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
  'https://raw.githubusercontent.com/ForestofTime/Surge/main/JS/PuPuSupermarket.js?v=17';
const surgeSplashScript =
  'https://raw.githubusercontent.com/ForestofTime/Surge/main/JS/PuPuSplashImage.js?v=17';

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
  assert.doesNotMatch(moduleText, /92bd7b325d08448a225231962b32a780/);
  assert.doesNotMatch(moduleText, /37704a60ca16a6741da4db6d4df9184e/);
  assert.doesNotMatch(moduleText, /0876bb9f23bd4d2789adae816be7cdcd/);
  assert.doesNotMatch(moduleText, /7edc759f51f8452db7a8432387b3b214/);
});

test('converts all QX response mutations to version-compatible Surge scripts', () => {
  const scriptLines = sectionLines('Script');
  const expectedJsonPatterns = [
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/notification\\/message_center\\/unread_number',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/search\\/hot_keywords\\/v3',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/app_resource\\/resource_preload\\/list_h5_resource',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/marketing\\/advertisement\\/v1',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/marketing\\/banner\\/v\\d+\\?position',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/search\\/hub\\/search_box\\/products\\/v6',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/order_settlement\\/detail',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/order\\/orders\\/list\\/v4',
  ];

  assert.equal(scriptLines.length, expectedJsonPatterns.length + 1);

  const names = scriptLines.map((line) => line.split('=')[0].trim());
  assert.equal(new Set(names).size, names.length, 'Surge script names must be unique');

  for (const pattern of expectedJsonPatterns) {
    const matchingLines = scriptLines.filter((line) =>
      line.includes(`pattern=${pattern},`)
    );

    assert.equal(matchingLines.length, 1, `${pattern} must be converted exactly once`);
    assert.ok(matchingLines[0].includes(`script-path=${surgeScript}`));
    assert.ok(matchingLines[0].includes('requires-body=true'));
    assert.ok(matchingLines[0].includes('max-size=1048576'));
  }

  assert.doesNotMatch(moduleText, /\[Body Rewrite\]/);
  assert.doesNotMatch(moduleText, /http-response-jq/);
});

test('adds a generic cached-splash fallback without asset hashes', () => {
  const splashLine = sectionLines('Script').find((line) =>
    line.includes('product-files\\.pupumall\\.com\\/STORE_PRODUCT')
  );

  assert.ok(splashLine, 'the current cached splash delivery host must be covered');
  assert.ok(splashLine.includes('(?:jpe?g|png)'));
  assert.ok(splashLine.includes(`script-path=${surgeSplashScript}`));
  assert.ok(splashLine.includes('requires-body=true'));
  assert.ok(splashLine.includes('binary-body-mode=true'));
  assert.ok(splashLine.includes('max-size=1048576'));
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

test('limits MITM to the API and generic splash delivery hosts', () => {
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% j1.pupuapi.com, product-files.pupumall.com',
  ]);
});

function runScript(url, body) {
  const doneCalls = [];

  vm.runInNewContext(
    scriptText,
    {
      $request: { url },
      $response: { body: JSON.stringify(body) },
      $done: (value) => doneCalls.push(value),
      console: { log() {} },
    },
    { filename: scriptPath }
  );

  assert.equal(doneCalls.length, 1, 'a Surge response script must finish once');
  return JSON.parse(doneCalls[0].body);
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

function runSplashScript(width, height, format = 'VP8') {
  const doneCalls = [];
  const body =
    format === 'VP8X'
      ? makeWebpVp8x(width, height)
      : makeWebpVp8(width, height);

  vm.runInNewContext(
    splashScriptText,
    {
      $request: {
        url: 'https://product-files.pupumall.com/STORE_PRODUCT/campaign/path/creative.jpg?x-oss-process=image/format,webp',
      },
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
  const result = runSplashScript(1080, 2240, 'VP8');

  assert.equal(result.status, 404);
  assert.equal(result.body.length, 0);

  const vp8xResult = runSplashScript(1080, 2240, 'VP8X');
  assert.equal(vp8xResult.status, 404);
});

test('passes through ordinary product image dimensions', () => {
  assert.equal(Object.keys(runSplashScript(800, 800)).length, 0);
  assert.equal(Object.keys(runSplashScript(1242, 900)).length, 0);
});
