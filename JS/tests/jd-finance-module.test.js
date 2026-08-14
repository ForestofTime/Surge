const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const modulePath = path.join(repoRoot, 'Module/JDFinance.sgmodule');
const readmePath = path.join(repoRoot, 'README.md');
const moduleText = fs.existsSync(modulePath) ? fs.readFileSync(modulePath, 'utf8') : '';
const readmeText = fs.readFileSync(readmePath, 'utf8');

function sectionLines(text, sectionName) {
  const section = text.match(
    new RegExp('\\[' + sectionName + '\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)')
  );
  assert.ok(section, '[' + sectionName + '] section must exist');
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

test('publishes a narrowly scoped native JD Finance splash module', () => {
  assert.notEqual(moduleText, '', 'Module/JDFinance.sgmodule must exist');
  assert.match(moduleText, /^#!name=京东金融去开屏$/m);
  assert.match(moduleText, /^#!desc=.*开屏配置接口.*v1$/m);
  assert.match(moduleText, /^#!category=AdBlock$/m);
  assert.match(moduleText, /^#!homepage=https:\/\/github\.com\/ForestofTime\/Surge$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/JDFinance\.sgmodule$/m
  );
});

test('returns explicit empty JSON only for the two splash configuration APIs', () => {
  assert.deepEqual(sectionLines(moduleText, 'Map Local'), [
    '^https:\\/\\/ms\\.jr\\.jd\\.com\\/gw\\/generic\\/aladdin\\/(?:new)?na\\/m\\/getLoadingPicture(?:\\?|$) data-type=json data="{}" status-code=200',
    '^https:\\/\\/ms\\.jr\\.jd\\.com\\/gw\\/generic\\/app\\/(?:new)?na\\/m\\/getLaunchImageList(?:\\?|$) data-type=json data="{}" status-code=200',
  ]);
});

test('does not block shared image hosts, homepage layout, navigation, or finance APIs', () => {
  for (const forbidden of [
    'm.360buyimg.com',
    'api.m.jd.com',
    'getPageMutilDataForHomePage',
    'getTopCard',
    'getBottomNavigation',
    '/base/',
    'adInfo',
  ]) {
    assert.equal(moduleText.includes(forbidden), false, forbidden + ' must stay outside the splash module');
  }
  assert.deepEqual(sectionLines(moduleText, 'MITM'), [
    'hostname = %APPEND% ms.jr.jd.com',
  ]);
});

test('README publishes the JD Finance module with a one-click import', () => {
  assert.match(
    readmeText,
    /`Module\/JDFinance\.sgmodule` \| AdBlock \| 京东金融仅去开屏/
  );
  assert.match(
    readmeText,
    /surge\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJDFinance\.sgmodule/
  );
});
