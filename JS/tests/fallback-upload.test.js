const test = require('node:test');
const assert = require('node:assert/strict');
const upload = require('../fallback-upload.js');
const { createStore } = require('./fallback-test-helpers.js');

test('builds a fixed GitHub workflow-dispatch request without accepting a dynamic URL', () => {
  const req = upload.buildDispatchRequest({
    owner: 'owner',
    repo: 'inbox',
    workflow: 'intake-fallback.yml',
    ref: 'main',
    token: 'github_pat_secret',
    policy: 'Proxy'
  }, '[1,"batch","2026-07-21",[["d","example.com"]]]');
  assert.equal(req.url, 'https://api.github.com/repos/owner/inbox/actions/workflows/intake-fallback.yml/dispatches');
  assert.equal(req.policy, 'Proxy');
  const tampered = upload.buildDispatchRequest({
    owner: 'owner',
    repo: 'inbox',
    workflow: 'intake-fallback.yml',
    ref: 'main',
    token: 'github_pat_secret',
    policy: 'DIRECT'
  }, '[]');
  assert.equal(tampered.policy, 'Proxy');
  assert.equal(req.timeout, 10);
  assert.equal(req['auto-cookie'], false);
  assert.equal(req['auto-redirect'], false);
  assert.match(req.headers.Authorization, /^Bearer github_pat_secret$/);
  assert.equal(JSON.parse(req.body).ref, 'main');
  assert.equal(JSON.parse(req.body).inputs.payload.startsWith('[1,'), true);
  assert.throws(() => upload.buildDispatchRequest({ owner: 'owner', repo: '../evil', workflow: 'intake-fallback.yml', ref: 'main', token: 'x' }, '[]'));
});

test('splits immutable wire payloads by UTF-8 bytes and by 256 targets', () => {
  const items = Array.from({ length: 300 }, (_, index) => ['d', `${String(index).padStart(3, '0')}.example.com`]);
  const batches = upload.splitItems(items, '2026-07-21', () => `batch-${Math.random()}`);
  assert.equal(batches.length >= 2, true);
  assert.equal(batches.every((batch) => batch.items.length <= 256), true);
  assert.equal(batches.every((batch) => upload.utf8ByteLength(batch.payload) <= upload.WIRE_MAX_BYTES), true);
});

test('classifies status codes without treating every 403 as a dead token', () => {
  assert.equal(upload.classifyHttpResponse({ status: 200, body: '{"workflow_run_id":12}' }).kind, 'accepted');
  assert.equal(upload.classifyHttpResponse({ status: 401, body: '' }).kind, 'fatal-auth');
  assert.equal(upload.classifyHttpResponse({ status: 403, headers: { 'Retry-After': '30' }, body: '' }).kind, 'retry');
  assert.equal(upload.classifyHttpResponse({ status: 403, headers: { 'X-RateLimit-Remaining': '0' }, body: 'rate limit exceeded' }).kind, 'retry');
  assert.equal(upload.classifyHttpResponse({ status: 403, headers: {}, body: 'Resource not accessible by personal access token' }).kind, 'fatal-permission');
  assert.equal(upload.classifyHttpResponse({ status: 404, body: '' }).kind, 'fatal-config');
  assert.equal(upload.classifyHttpResponse({ status: 422, body: '' }).kind, 'fatal-config');
  assert.equal(upload.classifyHttpResponse({ status: 429, body: '' }).kind, 'retry');
  assert.equal(upload.classifyHttpResponse({ status: 503, body: '' }).kind, 'retry');
});

test('does not delete a batch until the intake run is completed successfully', async () => {
  const payload = '[1,"batch-1","2026-07-21",[["d","example.com"]]]';
  const store = createStore({
    'frq.config': JSON.stringify({ enabled: true, uploadEnabled: true, owner: 'owner', repo: 'inbox', token: 'github_pat_secret', policy: 'Proxy' }),
    'frq.meta': JSON.stringify({ v: 1, batches: ['batch-1'] }),
    'frq.batch.batch-1': JSON.stringify({ v: 1, id: 'batch-1', d: '2026-07-21', payload, runId: 77, state: 'dispatched', attempts: 1 })
  });
  const calls = [];
  const http = {
    get(options, callback) {
      calls.push(options);
      callback(null, { status: 200, headers: {} }, JSON.stringify({ status: 'in_progress', conclusion: null }));
    },
    post() { throw new Error('post must not be used for a dispatched batch'); }
  };
  const result = await upload.uploadOnce({ store, http, now: new Date('2026-07-21T18:00:00.000Z') });
  assert.equal(result.removed, 0);
  assert.ok(store.get('frq.batch.batch-1'));
  assert.equal(calls.length, 1);
});

test('removes a batch only after a successful completed run', async () => {
  const payload = '[1,"batch-1","2026-07-21",[["d","example.com"]]]';
  const store = createStore({
    'frq.config': JSON.stringify({ enabled: true, uploadEnabled: true, owner: 'owner', repo: 'inbox', token: 'github_pat_secret', policy: 'Proxy' }),
    'frq.meta': JSON.stringify({ v: 1, batches: ['batch-1'] }),
    'frq.batch.batch-1': JSON.stringify({ v: 1, id: 'batch-1', d: '2026-07-21', payload, runId: 77, state: 'dispatched', attempts: 1 })
  });
  const http = {
    get(options, callback) {
      callback(null, { status: 200, headers: {} }, JSON.stringify({ status: 'completed', conclusion: 'success' }));
    }
  };
  const result = await upload.uploadOnce({ store, http, now: new Date('2026-07-21T18:00:00.000Z') });
  assert.equal(result.removed, 1);
  assert.equal(store.get('frq.batch.batch-1'), undefined);
  assert.deepEqual(JSON.parse(store.get('frq.meta')).batches, []);
});
