const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

// 76b0f04: 此链路已明确下线；不要为测试重新引入旧凭据上传脚本。
test('CMCCAutoLoginCapture remains retired and is not advertised for installation', () => {
  for (const file of ['Module/CMCCAutoLoginCapture.sgmodule', 'JS/CMCCAutoLoginCapture.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file + ' should stay retired');
  }
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('Module/CMCCAutoLoginCapture.sgmodule'), false);
});
