const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true })
    .map((name) => path.join(root, name))
    .filter((file) => fs.statSync(file).isFile())
    .filter((file) => file.endsWith('.sgmodule') || file.endsWith('.conf'));
}

const moduleFiles = [
  ...walk(path.join(repoRoot, 'Module')),
  ...walk(path.join(repoRoot, 'modules')),
  ...walk(path.join(repoRoot, 'Task')),
].sort();

test('all module descriptions are concise, precise metadata', () => {
  assert.ok(moduleFiles.length >= 29);
  for (const file of moduleFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file);
    const name = text.match(/^#!name\s*=\s*(.+)$/m)?.[1]?.trim();
    const desc = text.match(/^#!desc\s*=\s*(.+)$/m)?.[1]?.trim();
    const category = text.match(/^#!category\s*=\s*(.+)$/m)?.[1]?.trim();
    assert.ok(name, `${relative} missing #!name`);
    assert.ok(desc, `${relative} missing #!desc`);
    assert.ok(category, `${relative} missing #!category`);
    assert.ok(desc.length <= 48, `${relative} description is too long: ${desc.length}`);
    assert.doesNotMatch(desc, /\\n|作者[:：]|综合|补充|建议|请勿|尽量|等(?:请求|功能|内容|其它|定时)?/, relative);
    assert.equal(desc, desc.trim(), `${relative} description has surrounding whitespace`);
  }
});

test('module comments avoid decorative dividers and duplicate script names', () => {
  for (const file of moduleFiles.filter((file) => file.endsWith('.sgmodule'))) {
    const text = fs.readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file);
    assert.doesNotMatch(text, /^#\s*[=＿—-]{8,}\s*$/m, relative);

    let inScript = false;
    const names = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const section = line.match(/^\[([^\]]+)\]$/);
      if (section) {
        inScript = section[1] === 'Script';
        continue;
      }
      if (!inScript || !line || line.startsWith('#') || !line.includes('=')) continue;
      names.push(line.slice(0, line.indexOf('=')).trim());
    }
    assert.equal(new Set(names).size, names.length, `${relative} has duplicate [Script] names`);
  }
});

test('README catalogs every published module and the HAR repair skill', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  for (const file of moduleFiles) {
    const relative = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    assert.match(readme, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), relative);
  }
  assert.match(readme, /Skills\/debug-surge-qx-parity/);
  assert.match(readme, /百度网盘.*原生/);
  assert.match(readme, /曹操出行.*原生/);
});
