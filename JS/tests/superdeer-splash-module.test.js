const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const modulePath = path.resolve(__dirname, '../../Module/SuperDeer.sgmodule');
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
    line.includes('app\\.chaolu\\.com\\.cn\\/app\\/getSplashData\\/V2')
  );

  assert.ok(rule, 'the HAR-confirmed splash configuration endpoint must be filtered');
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

test('declares a dedicated v1 Super Deer splash module', () => {
  assert.match(moduleText, /^#!name=超鹿运动去开屏广告$/m);
  assert.match(moduleText, /^#!desc=.*v1$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/codex\/superdeer-splash-20260805\/Module\/SuperDeer\.sgmodule$/m
  );
});

test('clears only the HAR-confirmed splash configuration source', () => {
  const rewritten = runSplashFilter({
    code: '1',
    data: {
      splashes: [
        {
          images: 'https://img.chaolu.com.cn/storeAdmin/teacher/current.png',
          iosImg: 'https://img.chaolu.com.cn/storeAdmin/teacher/current-ios.png',
          countDown: 2,
        },
      ],
      retained: 'required-app-state',
    },
  });

  assert.deepEqual(rewritten, {
    code: '1',
    data: { splashes: [], retained: 'required-app-state' },
  });
});

test('leaves malformed or unrelated response shapes unchanged', () => {
  assert.deepEqual(runSplashFilter({ code: '1', data: null }), {
    code: '1',
    data: null,
  });
  assert.deepEqual(runSplashFilter({ code: '0', message: 'failed' }), {
    code: '0',
    message: 'failed',
  });
});

test('limits MITM and rewrite matching to the splash configuration endpoint', () => {
  const rewrite = sectionLines('Body Rewrite');
  assert.equal(rewrite.length, 1);
  assert.match(
    rewrite[0],
    /^http-response-jq \^https:\\\/\\\/app\\\.chaolu\\\.com\\\.cn\\\/app\\\/getSplashData\\\/V2\(\?:\\\?\|\$\)/
  );
  assert.deepEqual(sectionLines('MITM'), [
    'hostname = %APPEND% app.chaolu.com.cn',
  ]);
  assert.doesNotMatch(moduleText, /img\.chaolu\.com\.cn/);
  assert.doesNotMatch(moduleText, /storeAdmin\/teacher\/2026/);
});
