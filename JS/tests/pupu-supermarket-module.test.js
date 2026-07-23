const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../../Module/PuPuSupermarket.sgmodule');
const moduleText = fs.readFileSync(modulePath, 'utf8');

const capturedSplashVideoRule =
  '^https:\\/\\/product-files\\.pupumall\\.com\\/STORE_PRODUCT\\/7edc759f51f8452db7a8432387b3b214\\/1129\\/1eb887ee920b0eceb646b517582fea86\\.mp4(\\?.*)? - reject';

test('rejects the HAR-confirmed splash video without blocking all product videos', () => {
  assert.ok(
    moduleText.includes(capturedSplashVideoRule),
    'the exact splash video request must be rejected'
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
