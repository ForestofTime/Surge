const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/PuPuSupermarket.sgmodule');
const moduleText = fs.readFileSync(modulePath, 'utf8');
const scriptPath = path.resolve(__dirname, '../PuPuSupermarket.js');
const scriptText = fs.readFileSync(scriptPath, 'utf8');
const surgeScript =
  'https://raw.githubusercontent.com/ForestofTime/Surge/main/JS/PuPuSupermarket.js';

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

test('contains no concrete PuPu creative or CDN interception', () => {
  assert.doesNotMatch(moduleText, /product-files\.pupumall\.com/);
  assert.doesNotMatch(moduleText, /STORE_PRODUCT/);
  assert.doesNotMatch(moduleText, /\.(?:jpg|jpeg|png|gif|webp|mp4)(?:\\|\?|\s)/i);
});

test('converts all QX response mutations to version-compatible Surge scripts', () => {
  const scriptLines = sectionLines('Script');
  const expectedPatterns = [
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/notification\\/message_center\\/unread_number',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/search\\/hot_keywords\\/v3',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/app_resource\\/resource_preload\\/list_h5_resource',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/marketing\\/advertisement\\/v1',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/search\\/hub\\/search_box\\/products\\/v6',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/order_settlement\\/detail',
    '^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/order\\/orders\\/list\\/v4',
  ];

  assert.equal(scriptLines.length, expectedPatterns.length);

  const names = scriptLines.map((line) => line.split('=')[0].trim());
  assert.equal(new Set(names).size, names.length, 'Surge script names must be unique');

  for (const pattern of expectedPatterns) {
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

test('limits MITM to the QX API hostname', () => {
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% j1.pupuapi.com',
  ]);
});

function runScript(url, body) {
  const doneCalls = [];

  vm.runInNewContext(scriptText, {
    $request: { url },
    $response: { body: JSON.stringify(body) },
    $done: (value) => doneCalls.push(value),
    console: { log() {} },
  });

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
