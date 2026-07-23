const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../../Module/PuPuSupermarket.sgmodule');
const moduleText = fs.readFileSync(modulePath, 'utf8');

const memberDaySplashRule =
  '^https:\\/\\/product-files\\.pupumall\\.com\\/STORE_PRODUCT\\/0876bb9f23bd4d2789adae816be7cdcd\\/310f\\/37704a60ca16a6741da4db6d4df9184e\\.jpg(\\?.*)? - reject';

const greatSummerSplashRule =
  '^https:\\/\\/product-files\\.pupumall\\.com\\/STORE_PRODUCT\\/7edc759f51f8452db7a8432387b3b214\\/0ed5\\/92bd7b325d08448a225231962b32a780\\.jpg(\\?.*)? - reject';

const misidentifiedLandscapeVideoRule =
  '^https:\\/\\/product-files\\.pupumall\\.com\\/STORE_PRODUCT\\/7edc759f51f8452db7a8432387b3b214\\/1129\\/1eb887ee920b0eceb646b517582fea86\\.mp4(\\?.*)? - reject';

test('rejects both HAR-confirmed 1080x2240 splash images', () => {
  assert.ok(
    moduleText.includes(memberDaySplashRule),
    'the member-day splash image must be rejected'
  );
  assert.ok(
    moduleText.includes(greatSummerSplashRule),
    'the great-summer splash image must be rejected'
  );
});

test('does not block the misidentified landscape video or all product videos', () => {
  assert.ok(
    !moduleText.includes(misidentifiedLandscapeVideoRule),
    'the landscape campaign video is not the reported splash creative'
  );
  assert.ok(
    !moduleText.includes('STORE_PRODUCT\\/.*\\.mp4'),
    'a broad product video rule would also block legitimate product media'
  );
});

test('enables MITM for the splash video host', () => {
  const mitmLine = moduleText
    .split('\n')
    .find((line) => line.startsWith('hostname ='));

  assert.ok(mitmLine, 'the module must declare an MITM hostname list');
  assert.match(mitmLine, /(?:^|, )product-files\.pupumall\.com(?:,|$)/);
});
