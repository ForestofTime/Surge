import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function read(relativePath) {
  const absolutePath = resolve(root, relativePath);
  assert.ok(existsSync(absolutePath), `missing ${relativePath}`);
  return readFileSync(absolutePath, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assertPinnedActions(workflow, fileName) {
  const refs = [...workflow.matchAll(/uses:\s*[^\s@]+@([0-9a-f]{40})\b/g)].map((match) => match[1]);
  assert.ok(refs.length >= 2, `${fileName} must pin checkout and setup-node`);
  assert.doesNotMatch(workflow, /uses:\s*[^\s@]+@(?![0-9a-f]{40}\b)[^\s]+/, `${fileName} has an unpinned action`);
}

function assertWorkflowSafety(relativePath, expectedWriteBranch) {
  const workflow = read(relativePath);
  assert.match(workflow, /^permissions:\s*\{\}\s*$/m, `${relativePath} needs top-level permissions: {}`);
  assertPinnedActions(workflow, relativePath);
  assert.match(workflow, /node-version:\s*['"]22\.14\.0['"]/);
  assert.doesNotMatch(workflow, /\$\{\{\s*(?:inputs|github\.event\.inputs)\.[^}]+\}\}/, `${relativePath} must not interpolate event input`);
  assert.doesNotMatch(workflow, /toJSON\(github\)|set\s+-x|echo\s+.*(?:payload|candidate|proposal)/i, `${relativePath} may log raw input`);
  assert.match(workflow, /GITHUB_EVENT_PATH/);
  assert.match(workflow, new RegExp(`generated`));
  assert.match(workflow, new RegExp(expectedWriteBranch));
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /kill[_-]?switch|auto[_-]?write|enabled/i);
  assert.match(workflow, /symlink|isSymbolicLink/);
  assert.match(workflow, /git diff|diff --exit-code/);
  assert.match(workflow, /allowlist|allowed path|ALLOWED_PATH/i);
}

assertWorkflowSafety('.github/workflows/publish-fallback.yml', 'generated');
assertWorkflowSafety('.github/workflows/update-source-locks.yml', 'main');

for (const relativePath of [
  '.github/workflows/publish-fallback.yml',
  '.github/workflows/update-source-locks.yml',
  'docs/private-inbox-template/.github/workflows/intake-fallback.yml',
  'docs/private-inbox-template/.github/workflows/classify-fallback.yml',
]) {
  const workflow = read(relativePath);
  assertPinnedActions(workflow, relativePath);
  assert.match(workflow, /^permissions:\s*\{\}\s*$/m);
  assert.doesNotMatch(workflow, /persist-credentials:\s*true/);
  assert.doesNotMatch(workflow, /\$\{\{\s*(?:inputs|github\.event\.inputs)\.[^}]+\}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  if (/git -c .*http\.extraheader/.test(workflow)) {
    assert.match(workflow, /http\.extraheader=AUTHORIZATION: basic/);
    assert.doesNotMatch(workflow, /http\.extraheader=AUTHORIZATION: Bearer/);
  }
}
const classifyWorkflow = read('docs/private-inbox-template/.github/workflows/classify-fallback.yml');
assert.match(classifyWorkflow, /classifier_commit|steps\.classifier\.outputs\.commit/);
assert.match(classifyWorkflow, /PUBLIC_DISPATCH_TOKEN/);
assert.match(classifyWorkflow, /public-generated/);
assert.match(classifyWorkflow, /dispatch-proposal\.mjs/);
const dispatchProposal = read('docs/private-inbox-template/Automation/dispatch-proposal.mjs');
assert.match(dispatchProposal, /https:\/\/api\.github\.com/);
assert.match(dispatchProposal, /IP-CIDR/);
assert.match(dispatchProposal, /IP-CIDR6/);
assert.match(dispatchProposal, /override/);
assert.doesNotMatch(read('docs/private-inbox-template/Automation/dispatch-proposal.mjs'), /GITHUB_API_URL/);
assert.doesNotMatch(read('Automation/check-queue-depth.mjs'), /GITHUB_API_URL/);

const controlPlane = readJson('Automation/control-plane.json');
assert.equal(controlPlane.schema_version, 1);
assert.ok(Array.isArray(controlPlane.never_capture_hosts));
assert.ok(controlPlane.never_capture_hosts.includes('api.github.com'));
assert.ok(Array.isArray(controlPlane.source_hosts));
assert.ok(controlPlane.source_hosts.every((host) => /^[a-z0-9.-]+$/.test(host)));

const sources = readJson('Automation/sources.json');
assert.equal(sources.schema_version, 1);
assert.ok(Array.isArray(sources.sources));
for (const source of sources.sources) {
  assert.match(source.source_id, /^[a-z0-9][a-z0-9-]*$/);
  assert.match(source.family_id, /^[a-z0-9][a-z0-9-]*$/);
  assert.match(source.repo, /^[^/]+\/[^/]+$/);
  assert.ok(Array.isArray(source.allowed_rule_types));
  assert.ok(Array.isArray(source.allowed_policies));
}

const locks = readJson('Automation/sources.lock.json');
assert.equal(locks.schema_version, 1);
assert.ok(Array.isArray(locks.sources));
for (const lock of locks.sources) {
  assert.match(lock.commit, /^[0-9a-f]{40}$/);
  assert.match(lock.content_sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(lock.max_bytes) && lock.max_bytes > 0);
}

for (const configPath of ['Automation/manual-overrides.json', 'Automation/shadow-exceptions.json']) {
  const config = readJson(configPath);
  assert.equal(config.schema_version, 1);
  assert.ok(Array.isArray(config.entries));
}

const psl = read('Automation/vendor/public_suffix_list.dat');
const pslLock = readJson('Automation/vendor/public_suffix_list.lock.json');
assert.equal(pslLock.schema_version, 1);
assert.equal(pslLock.ready, true);
assert.match(pslLock.commit, /^[0-9a-f]{40}$/);
assert.match(pslLock.sha256, /^[0-9a-f]{64}$/);
assert.match(psl, /===BEGIN ICANN DOMAINS===/);
assert.match(psl, /===BEGIN PRIVATE DOMAINS===/);
assert.equal(createHash('sha256').update(psl, 'utf8').digest('hex'), pslLock.sha256);

const validEvent = resolve(root, 'Automation/tests/fixtures/valid-dispatch-event.json');
const validRun = spawnSync(process.execPath, ['Automation/validate-workflow-event.mjs'], {
  cwd: root,
  env: { ...process.env, GITHUB_EVENT_PATH: validEvent },
  encoding: 'utf8'
});
assert.equal(validRun.status, 0, validRun.stderr);
const validIpEvent = resolve(root, 'Automation/tests/fixtures/valid-ip-dispatch-event.json');
const validIpRun = spawnSync(process.execPath, ['Automation/validate-workflow-event.mjs'], {
  cwd: root,
  env: { ...process.env, GITHUB_EVENT_PATH: validIpEvent },
  encoding: 'utf8'
});
assert.equal(validIpRun.status, 0, validIpRun.stderr);
const invalidEvent = resolve(root, 'Automation/tests/fixtures/invalid-dispatch-event.json');
const invalidRun = spawnSync(process.execPath, ['Automation/validate-workflow-event.mjs'], {
  cwd: root,
  env: { ...process.env, GITHUB_EVENT_PATH: invalidEvent },
  encoding: 'utf8'
});
assert.notEqual(invalidRun.status, 0, 'cross-policy overlap must be rejected');

console.log('workflow security checks passed');
