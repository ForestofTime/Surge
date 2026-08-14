const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const readmeText = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const indexText = fs.readFileSync(path.join(repoRoot, 'docs/repo-file-index.md'), 'utf8');

test('removes the superseded JD splash module and stale documentation references', () => {
  for (const obsoletePath of [
    'Module/jdad.sgmodule',
    'JS/JingdongAds.js',
    'JS/PuPuSplashBlocker.js',
    'JS/didi_carowner.js',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, obsoletePath)), false, obsoletePath);
  }
  assert.doesNotMatch(readmeText, /Module\/jdad\.sgmodule/);
  assert.doesNotMatch(indexText, /Module\/jdad\.sgmodule/);
  assert.doesNotMatch(indexText, /JS\/JingdongAds\.js|JS\/didi_carowner\.js/);
});
