'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const moduleText = fs.readFileSync(path.join(repoRoot, 'Module/CMCCJwtCapture.sgmodule'), 'utf8');
const scriptText = fs.readFileSync(path.join(repoRoot, 'JS/CMCCJwtCapture.js'), 'utf8');
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/cmcc-wmhnewcenter-login.json'), 'utf8'),
);

test('module only intercepts the two applet login endpoints', () => {
  const scriptLines = moduleText.split('\n').filter((line) => line.startsWith('中国移动-'));
  assert.equal(scriptLines.length, 1);
  const line = scriptLines[0];
  assert.match(line, /type=http-response/);
  assert.match(line, /requires-body=true/);
  assert.match(line, /wx\\\.online-cmcc\\\.cn/);
  assert.match(line, /alipay\|wechat86/);
  assert.match(line, /\\\/login/);
  // 不得把 wmhsso 等其它接口一并挂上：只在 login 上取票。
  assert.doesNotMatch(line, /wmhsso/);
});

test('module declares MITM for the wmhnewcenter host and a tailnet receiver', () => {
  assert.match(moduleText, /\[MITM\]/);
  assert.match(moduleText, /%APPEND% wx\.online-cmcc\.cn/);
  assert.match(moduleText, /receiver_url:https:\/\/[a-z0-9-]+\.taila66285\.ts\.net\/cmcc-jwt/);
});

test('module pins the script with a cache-busting version', () => {
  // Surge 按 URL 缓存脚本；改了 JS 却不升版本号会让真机继续跑旧缓存。
  const match = moduleText.match(/CMCCJwtCapture\.js\?v=(\d+)/);
  assert.ok(match, 'script-path 必须带 ?v= 版本号');
  assert.ok(Number(match[1]) >= 2, '转发密文版至少为 v2');
});

test('script accepts only a tailnet /cmcc-jwt receiver', () => {
  assert.match(scriptText, /\\\.ts\\\.net\\\/cmcc-jwt/);
  assert.doesNotMatch(scriptText, /http:\/\//);
});

test('script detects the applet end from the URL, not the user agent', () => {
  assert.match(scriptText, /\/alipay-applet\//);
  assert.match(scriptText, /\/wechat86-applet\//);
  assert.doesNotMatch(scriptText, /AlipayClient|MicroMessenger/);
});

test('script forwards the raw envelope instead of decrypting it', () => {
  // Surge 的 JSC 引擎没有 atob / Buffer，任何本地解密都会在真机上抛异常。
  // 只看代码，注释里提到这些名字不算。
  const code = scriptText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
    .join('\n');
  assert.doesNotMatch(code, /atob\s*\(/);
  assert.doesNotMatch(code, /\bBuffer\b/);
  assert.doesNotMatch(code, /Uint8Array/);
  assert.doesNotMatch(code, /\$crypto\b/);
  assert.doesNotMatch(code, /require\s*\(\s*['"]crypto['"]\s*\)/);
  // 转发原始密文，解密由接收器负责。
  assert.match(scriptText, /encryptData/);
  assert.match(scriptText, /postReceiver/);
});

test('script validates the envelope length before forwarding', () => {
  assert.match(scriptText, /encryptData\.length < 64/);
  assert.match(scriptText, /encryptData\.length > 131072/);
});

test('fixture decrypts back to synthetic credentials, never real ones', () => {
  assert.equal(fixture.end, 'alipay');
  assert.equal(fixture.request.url.includes('/alipay-applet/login'), true);
  assert.equal(typeof fixture.response.encryptData, 'string');
  assert.ok(fixture.response.encryptData.length > 0);

  // 用与脚本相同的参数解密，验证夹具结构真实可用。
  const crypto = require('node:crypto');
  const inner = Buffer.from(fixture.response.encryptData, 'base64').toString('utf8');
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from('1234123412ABCDEF'),
    Buffer.from('ABCDEF1234123412'),
  );
  const plain = Buffer.concat([decipher.update(Buffer.from(inner, 'base64')), decipher.final()]).toString('utf8');
  const decoded = JSON.parse(plain);
  assert.equal(decoded.returnCode, '0');
  assert.match(decoded.object.sessionId, /^[A-Za-z0-9_-]{40,512}$/);
  assert.match(decoded.object.telephone, /^1\d{10}$/);

  // 夹具必须是合成值：公开仓库里不得出现真实号码。
  assert.equal(decoded.object.telephone, '13800000000');
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /6707/);
  assert.doesNotMatch(serialized, /QT08/);
});
