import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const rootArg = process.argv[process.argv.indexOf('--root') + 1];
if (!rootArg || rootArg === '--root') {
  process.stderr.write('usage: node Automation/verify-generated-tree.mjs --root <directory>\n');
  process.exit(2);
}
const root = resolve(rootArg);
const allowed = [
  /^Source\/Auto\/(Direct|Proxy)\+\.list$/,
  /^Rule\/(Direct|Proxy)\+\.list$/,
  /^manifest\.json$/,
  /^proposals\/processed\.json$/,
  /^README\.md$/,
  /^\.gitkeep$/
];
const maxBytes = 5 * 1024 * 1024;
const forbiddenControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const rel = relative(root, path).split('\\').join('/');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${rel}`);
    if (rel === '.git') continue;
    if (rel.startsWith('.git/')) continue;
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!stat.isFile()) throw new Error(`non-regular file is forbidden: ${rel}`);
    if (!allowed.some((pattern) => pattern.test(rel))) throw new Error(`path is outside generated allowlist: ${rel}`);
    if (stat.size > maxBytes) throw new Error(`generated file is too large: ${rel}`);
    const content = readFileSync(path, 'utf8');
    if (content.charCodeAt(0) === 0xfeff || forbiddenControl.test(content)) throw new Error(`invalid control character: ${rel}`);
  }
}

walk(root);
for (const required of ['Rule/Direct+.list', 'Rule/Proxy+.list', 'manifest.json']) {
  try {
    const stat = lstatSync(join(root, required));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid');
  } catch {
    throw new Error(`required generated file missing: ${required}`);
  }
}
process.stdout.write('generated tree validated\n');
