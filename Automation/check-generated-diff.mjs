import { readFileSync } from 'node:fs';

const allowed = [
  /^Source\/Auto\/(Direct|Proxy)\+\.list$/,
  /^Rule\/(Direct|Proxy)\+\.list$/,
  /^manifest\.json$/,
  /^proposals\/processed\.json$/,
  /^README\.md$/
];
const names = readFileSync(0, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
for (const name of names) {
  if (!allowed.some((pattern) => pattern.test(name))) {
    process.stderr.write('generated diff contains an unauthorized path\n');
    process.exit(1);
  }
}
process.stdout.write(`generated diff paths checked: ${names.length}\n`);
