const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../../Module/PuPuSupermarket.sgmodule');
const moduleText = fs.readFileSync(modulePath, 'utf8');
const upstreamScript =
  'https://raw.githubusercontent.com/fmz200/wool_scripts/main/Scripts/PupuSplashAds.js';

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

test('converts all six Quantumult X response scripts one-to-one', () => {
  const scriptLines = sectionLines('Script');
  const expectedPatterns = [
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
    assert.ok(matchingLines[0].includes(`script-path=${upstreamScript}`));
    assert.ok(matchingLines[0].includes('requires-body=true'));
    assert.ok(matchingLines[0].includes('max-size=1048576'));
  }
});

test('converts QX reject, reject-dict, and JQ rules without omissions', () => {
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

  assert.deepEqual(sectionLines('Body Rewrite'), [
    "http-response-jq ^https:\\/\\/j1\\.pupuapi\\.com\\/client\\/notification\\/message_center\\/unread_number '.data = []'",
  ]);
});

test('limits MITM to the QX API hostname', () => {
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% j1.pupuapi.com',
  ]);
});
