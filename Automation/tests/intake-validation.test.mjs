import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const script = fileURLToPath(new URL('../../docs/private-inbox-template/Automation/validate-intake-event.mjs', import.meta.url));

function runValidator(event) {
  return new Promise(async (resolve, reject) => {
    const directory = await mkdtemp(join(tmpdir(), 'surge-intake-validation-'));
    const eventPath = join(directory, 'event.json');
    await writeFile(eventPath, JSON.stringify(event));
    const child = spawn(process.execPath, [script], {
      cwd: directory,
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', async (code) => {
      await rm(directory, { recursive: true, force: true });
      resolve({ code, stdout, stderr });
    });
  });
}

test('accepts the ISO device date emitted by the Surge uploader', async () => {
  const result = await runValidator({
    inputs: {
      payload: '[1,"20260722-abc","2026-07-22",[["d","fallback-check.invalid"]]]',
    },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /intake validated/);
});

test('rejects a non-ISO device date', async () => {
  const result = await runValidator({
    inputs: {
      payload: '[1,"20260722-abc","20260722",[["d","fallback-check.invalid"]]]',
    },
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /payload schema invalid/);
});
