import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('Automation/config.json', 'utf8'));
if (config.schema_version !== 1 || config.classify_enabled !== true) {
  process.stderr.write('classifier kill switch is disabled\n');
  process.exit(1);
}
if (typeof config.public_repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(config.public_repository)) {
  process.stderr.write('public repository configuration is invalid\n');
  process.exit(1);
}
if (typeof config.classifier_commit !== 'string' || !/^[0-9a-f]{40}$/u.test(config.classifier_commit)) {
  process.stderr.write('classifier commit must be a full SHA\n');
  process.exit(1);
}
if (config.artifact_branch !== 'main') {
  process.stderr.write('artifact branch is invalid\n');
  process.exit(1);
}

if (process.env.GITHUB_OUTPUT) {
  const output = [
    `repository=${config.public_repository}`,
    `commit=${config.classifier_commit}`,
    `artifact_branch=${config.artifact_branch}`,
    `publish_enabled=${config.publish_enabled === true ? 'true' : 'false'}`,
  ].join('\n');
  writeFileSync(process.env.GITHUB_OUTPUT, `${output}\n`, { flag: 'a' });
}
process.stdout.write('classifier configuration validated\n');
