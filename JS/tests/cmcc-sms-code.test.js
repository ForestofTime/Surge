'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(repoRoot, 'Module/CMCCSmsCode.sgmodule'), 'utf8');
const scriptText = fs.readFileSync(path.join(repoRoot, 'JS/CMCCSmsCode.js'), 'utf8');

function runScript(request, argument) {
  const writes = [];
  const posts = [];
  let done = null;
  const sandbox = {
    $argument: argument,
    $request: request,
    $persistentStore: {
      write(value, key) { writes.push({ value, key }); },
    },
    $httpClient: {
      post(options, callback) { posts.push(options); callback(null); },
    },
    console,
    setTimeout,
    $done(result) { done = result; },
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { timeout: 1000 });
  return { writes, posts, done };
}

test('module intercepts only the local relay host at request stage', () => {
  const scriptLines = moduleText.split('\n').filter((line) => line.startsWith('中国移动-'));
  assert.equal(scriptLines.length, 1);
  const line = scriptLines[0];
  assert.match(line, /type=http-request/);
  assert.match(line, /pattern=\^http:\\\/\\\/example\\\.com\\\//);
  assert.match(line, /requires-body=true/);
});

test('module pins the script with a cache-busting version', () => {
  const match = moduleText.match(/CMCCSmsCode\.js\?v=(\d+)/);
  assert.ok(match, 'script-path 必须带 ?v= 版本号');
  assert.ok(Number(match[1]) >= 1);
});

test('module never ships a real ntfy topic', () => {
  // 主题是隐性凭据：公开仓库只允许占位符，真值留在本机 Surge 参数与青龙 env。
  assert.match(moduleText, /ntfy_topic:CHANGE_ME_SET_VIA_ARGUMENT/);
  assert.match(scriptText, /CHANGE_ME_SET_VIA_ARGUMENT/);
  assert.doesNotMatch(scriptText, /ntfy\.sh\/[A-Za-z0-9]{16,}/);
});

test('script extracts a 4-8 digit code from the POST body', () => {
  const result = runScript(
    { url: 'http://example.com/c', body: 'code=650217' },
    'ntfy_topic=fixture-topic',
  );
  assert.equal(result.done.response.status, 200);
  assert.equal(result.done.response.body, 'ok 650217');
  assert.deepEqual(result.writes[0], { value: '650217', key: 'cmcc_sms_code' });
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].url, 'https://ntfy.sh/fixture-topic');
  assert.equal(result.posts[0].body, '650217');
});

test('script extracts the code from a GET query string', () => {
  const result = runScript(
    { url: 'http://example.com/c?code=812345', body: '' },
    'ntfy_topic=fixture-topic',
  );
  assert.equal(result.done.response.body, 'ok 812345');
  assert.deepEqual(result.writes[0], { value: '812345', key: 'cmcc_sms_code' });
});

test('script stamps the arrival time alongside the code', () => {
  const result = runScript(
    { url: 'http://example.com/c', body: '998877' },
    'ntfy_topic=fixture-topic',
  );
  const stamp = result.writes.find((entry) => entry.key === 'cmcc_sms_at');
  assert.ok(stamp, 'cmcc_sms_at 必须写入，青龙侧靠它判 5 分钟时效');
  assert.match(stamp.value, /^\d{13}$/);
});

test('script answers no-code and posts nothing when no digits are present', () => {
  const result = runScript(
    { url: 'http://example.com/c', body: 'no digits here' },
    'ntfy_topic=fixture-topic',
  );
  assert.equal(result.done.response.body, 'no-code');
  assert.equal(result.writes.length, 0);
  assert.equal(result.posts.length, 0);
});

test('script falls back to the default topic when no argument is supplied', () => {
  const result = runScript(
    { url: 'http://example.com/c', body: '123456' },
    '',
  );
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].url, 'https://ntfy.sh/CHANGE_ME_SET_VIA_ARGUMENT');
});
