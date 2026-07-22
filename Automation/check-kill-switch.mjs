import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2];
if (!['capture', 'classify', 'publish'].includes(mode)) {
  process.stderr.write('usage: node Automation/check-kill-switch.mjs <capture|classify|publish>\n');
  process.exit(2);
}

const config = JSON.parse(readFileSync(resolve(process.cwd(), 'Automation/control-plane.json'), 'utf8'));
const key = `${mode}_enabled`;
if (config.schema_version !== 1 || config.enabled !== true || config.kill_switches?.[key] !== true) {
  process.stderr.write(`kill switch blocks ${mode}\n`);
  process.exit(1);
}
process.stdout.write(`${mode} enabled\n`);
