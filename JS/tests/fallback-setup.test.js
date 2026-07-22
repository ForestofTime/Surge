const test = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../fallback-setup.js');
const { createStore } = require('./fallback-test-helpers.js');

test('validates and stores the private inbox configuration without printing secrets', () => {
  const store = createStore();
  const result = setup.configure({
    store,
    argument: 'owner=my-user&repo=Surge-Rule-Inbox&token=github_pat_abcdefghijklmnopqrstuvwxyz123456&enabled=true'
  });
  assert.equal(result.ok, true);
  const config = JSON.parse(store.get('frq.config'));
  assert.equal(config.owner, 'my-user');
  assert.equal(config.repo, 'Surge-Rule-Inbox');
  assert.equal(config.workflow, 'intake-fallback.yml');
  assert.equal(config.ref, 'main');
  assert.equal(config.policy, 'Proxy');
  assert.equal(config.token.startsWith('github_pat_'), true);
});

test('rejects an arbitrary endpoint, workflow, ref, or malformed token', () => {
  const store = createStore();
  for (const argument of [
    'owner=x&repo=y&token=secret&url=https://evil.example',
    'owner=x&repo=y&workflow=evil.yml&token=github_pat_abcdefghijklmnopqrstuvwxyz123456',
    'owner=x&repo=y&ref=evil&token=github_pat_abcdefghijklmnopqrstuvwxyz123456',
    'owner=x&repo=y&token=short'
  ]) {
    assert.equal(setup.configure({ store, argument }).ok, false);
  }
  assert.equal(store.get('frq.config'), undefined);
});

test('supports a kill switch without deleting queued batches', () => {
  const store = createStore({
    'frq.config': JSON.stringify({ enabled: true, captureEnabled: true, uploadEnabled: true, owner: 'x', repo: 'y', token: 'github_pat_abcdefghijklmnopqrstuvwxyz123456' }),
    'frq.batch.batch-1': 'private-payload'
  });
  const result = setup.configure({ store, argument: 'enabled=false&capture=false&upload=false' });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(store.get('frq.config')).enabled, false);
  assert.equal(JSON.parse(store.get('frq.config')).captureEnabled, false);
  assert.equal(JSON.parse(store.get('frq.config')).uploadEnabled, false);
  assert.equal(store.get('frq.batch.batch-1'), 'private-payload');
});
