const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const skillRoot = path.join(repoRoot, 'Skills/debug-surge-qx-parity');

test('publishes the complete Surge HAR repair skill', () => {
  for (const relative of [
    'SKILL.md',
    'agents/openai.yaml',
    'references/evidence-playbook.md',
    'scripts/har_endpoint_diff.py',
    'scripts/har_timeline.py',
  ]) {
    assert.equal(fs.existsSync(path.join(skillRoot, relative)), true, relative);
  }
  const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /^name: debug-surge-qx-parity$/m);
  assert.match(skill, /prepared.*observed.*verified/);
  assert.match(skill, /FAIL_SYS_NETWORK_ERROR/);
  assert.match(skill, /M3U8、TS/);
  assert.match(skill, /共享商品流/);
  assert.match(skill, /完整打印 Raw URL/);
});

test('HAR timeline utility sorts events and never prints headers or body secrets', (t) => {
  const script = path.join(skillRoot, 'scripts/har_timeline.py');
  if (!fs.existsSync(script)) return assert.fail('har_timeline.py must exist');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surge-har-skill-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const harPath = path.join(tempDir, 'sample.har');
  fs.writeFileSync(harPath, JSON.stringify({
    log: {
      creator: { name: 'Surge iOS', version: 'test' },
      entries: [
        {
          startedDateTime: '2026-08-24T10:00:02+08:00',
          request: {
            method: 'POST',
            url: 'https://api.example.com/ad/show',
            headers: [{ name: 'Cookie', value: 'header-secret' }],
            postData: { text: 'event=exposure&token=body-secret' },
          },
          response: { status: 200, content: { size: 2, text: '{}' } },
          comment: 'Handled by VIF\nHTTP response script found\nResponse is modified by script',
        },
        {
          startedDateTime: '2026-08-24T10:00:01+08:00',
          request: { method: 'GET', url: 'https://api.example.com/ad/config', headers: [] },
          response: { status: 200, content: { size: 10, text: 'exposure=response-secret' } },
          comment: 'TLS Client Hello SNI',
        },
      ],
    },
  }));
  const result = spawnSync('python3', [script, harPath, '--match', 'exposure'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.match(lines[0], /creator=Surge iOS test/);
  assert.match(lines[2], /10:00:01/);
  assert.match(lines[3], /10:00:02/);
  assert.doesNotMatch(result.stdout, /header-secret|body-secret|response-secret/);
  assert.match(result.stdout, /matched_in/);
});
