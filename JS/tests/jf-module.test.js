const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(repoRoot, 'Module/jf.sgmodule'), 'utf8');
const scriptPath = path.join(repoRoot, 'JS/jf.js');
const scriptText = fs.readFileSync(scriptPath, 'utf8');

function runScript(url, body) {
  const doneCalls = [];
  vm.runInNewContext(
    scriptText,
    {
      $request: { url },
      $response: { body },
      $done: (value) => doneCalls.push(value),
      URL,
    },
    { filename: scriptPath }
  );
  assert.equal(doneCalls.length, 1, 'script must call $done exactly once');
  return JSON.parse(JSON.stringify(doneCalls[0]));
}

test('uses current repository metadata and a bounded response script', () => {
  assert.match(moduleText, /^#!name=京粉去广告$/m);
  assert.match(moduleText, /^#!desc=.*开屏.*首页横幅.*v2$/m);
  assert.match(moduleText, /^#!category=AdBlock$/m);
  assert.match(moduleText, /^#!homepage=https:\/\/github\.com\/ForestofTime\/Surge$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/jf\.sgmodule$/m
  );
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /max-size=1048576/);
  assert.match(moduleText, /\/JS\/jf\.js\?v=2/);
  assert.doesNotMatch(moduleText, /#!update=/);
});

test('maps only the dedicated splash request to an explicit empty JSON response', () => {
  assert.ok(
    moduleText.split('\n').includes(
      '^https:\\/\\/api\\.m\\.jd\\.com\\/api\\?functionId=union_exhibition_bff data-type=text data="{}" status-code=200 header="Content-Type:application/json"'
    )
  );
});

test('filters the existing advertisement fields while preserving functional siblings', () => {
  const input = {
    code: 200,
    message: 'success',
    result: [
      { id: 'keep', title: '功能入口' },
      { id: 'url', url: 'https://ad.example/' },
      { id: 'list', urlList: ['https://ad.example/image'] },
      { id: 'pc', pcLandUrl: 'https://ad.example/pc' },
      { id: 'land', landUrl: 'https://ad.example/land' },
    ],
    untouched: { enabled: true },
  };
  const result = runScript(
    'https://api.m.jd.com/?functionId=union_exhibition_bff&client=apple&clientVer=1',
    JSON.stringify(input)
  );
  const output = JSON.parse(result.body);
  assert.deepEqual(output.result, [{ id: 'keep', title: '功能入口' }]);
  assert.deepEqual(output.untouched, { enabled: true });
});

test('passes malformed and unrelated responses through without throwing', () => {
  assert.deepEqual(
    runScript(
      'https://api.m.jd.com/?functionId=union_exhibition_bff&client=apple&clientVer=1',
      '<html>upstream error</html>'
    ),
    {}
  );
  assert.deepEqual(
    runScript('https://api.m.jd.com/?functionId=other', JSON.stringify({ result: [] })),
    {}
  );
});
