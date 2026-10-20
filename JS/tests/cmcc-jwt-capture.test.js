const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

// 0861670: 此链路已明确下线；不要为测试重新引入旧凭据上传脚本。
test('CMCCJwtCapture remains retired and is not advertised for installation', () => {
  for (const file of ['Module/CMCCJwtCapture.sgmodule', 'JS/CMCCJwtCapture.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file + ' should stay retired');
  }
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('Module/CMCCJwtCapture.sgmodule'), false);
});
