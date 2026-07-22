import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyFallback } from '../classify-fallback.mjs';
import { PublicSuffixList, parsePublicSuffixList } from '../rule-compiler.mjs';

const PSL_FIXTURE = `
// ===BEGIN ICANN DOMAINS===
com
co.uk
// ===END ICANN DOMAINS===
// ===BEGIN PRIVATE DOMAINS===
github.io
pages.dev
// ===END PRIVATE DOMAINS===
`;
const psl = new PublicSuffixList(parsePublicSuffixList(PSL_FIXTURE));
const lockDigest = 'a'.repeat(64);

function base(options = {}) {
  return classifyFallback({
    observations: [],
    overrides: [],
    sourceRules: [],
    existingRulesByPolicy: { Direct: [], Proxy: [], Reject: [] },
    controlPlane: [],
    psl,
    pslReady: true,
    sourceLockDigest: lockDigest,
    ...options,
  });
}

test('proposes only high-confidence proxy suffix evidence', () => {
  const result = base({
    observations: [{ kind: 'd', value: 'cdn.proxy.example.com', seen_days: 3 }],
    sourceRules: [{
      source_id: 'proxy-a',
      family_id: 'proxy-family-a',
      policy: 'Proxy',
      authoritative: true,
      rules: [{ type: 'DOMAIN-SUFFIX', target: 'proxy.example.com', options: [] }],
    }],
  });

  assert.deepEqual(result.proposal.rules, [{
    policy: 'PROXY',
    type: 'DOMAIN-SUFFIX',
    value: 'proxy.example.com',
  }]);
  assert.equal(result.review.length, 0);
  assert.equal(result.deferred.length, 0);
});

test('keeps direct observations in private review and never auto-proposes an IP', () => {
  const result = base({
    observations: [
      { kind: 'd', value: 'internal.example.com', seen_days: 10 },
      { kind: '4', value: '203.0.113.7', seen_days: 10 },
    ],
  });

  assert.equal(result.proposal.rules.length, 0);
  assert.equal(result.review.length, 2);
  assert.equal(result.review.some((entry) => entry.reason === 'public-ip-never-auto-publish'), true);
  assert.equal(result.review.some((entry) => entry.reason === 'no-proxy-evidence'), true);
});

test('defers suffix proposals when the source lock or PSL is unavailable', () => {
  const result = base({
    pslReady: false,
    observations: [{ kind: 'd', value: 'cdn.proxy.example.com', seen_days: 7 }],
    sourceRules: [{
      source_id: 'proxy-a',
      family_id: 'proxy-family-a',
      policy: 'Proxy',
      authoritative: true,
      rules: [{ type: 'DOMAIN-SUFFIX', target: 'proxy.example.com', options: [] }],
    }],
    sourceError: 'source lock mismatch',
  });

  assert.equal(result.proposal.rules.length, 0);
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].reason, 'source lock mismatch');
});

test('blocks proxy evidence that overlaps an existing direct or reject rule', () => {
  const result = base({
    observations: [{ kind: 'd', value: 'cdn.proxy.example.com', seen_days: 7 }],
    sourceRules: [{
      source_id: 'proxy-a',
      family_id: 'proxy-family-a',
      policy: 'Proxy',
      authoritative: true,
      rules: [{ type: 'DOMAIN-SUFFIX', target: 'proxy.example.com', options: [] }],
    }],
    existingRulesByPolicy: {
      Direct: [{ type: 'DOMAIN', target: 'cdn.proxy.example.com', options: [] }],
      Proxy: [],
      Reject: [],
    },
  });

  assert.equal(result.proposal.rules.length, 0);
  assert.equal(result.review[0].reason, 'existing-policy-conflict');
});

test('honors an explicit proxy override with exact or suffix scope', () => {
  const result = base({
    observations: [{ kind: 'd', value: 'video.example.net', seen_days: 1 }],
    overrides: [{ policy: 'PROXY', target: 'video.example.net', scope: 'DOMAIN' }],
  });

  assert.deepEqual(result.proposal.rules, [{
    policy: 'PROXY',
    type: 'DOMAIN',
    value: 'video.example.net',
  }]);
});

test('does not turn a reject override into a public proposal', () => {
  const result = base({
    observations: [{ kind: 'd', value: 'blocked.example.net', seen_days: 10 }],
    overrides: [{ policy: 'REJECT', target: 'blocked.example.net', scope: 'DOMAIN' }],
  });
  assert.equal(result.proposal.rules.length, 0);
  assert.equal(result.review[0].reason, 'no-proxy-evidence');
});

test('keeps high-entropy exact proxy observations in review', () => {
  const result = base({
    observations: [{ kind: 'd', value: '0123456789abcdef.example.com', seen_days: 10 }],
    sourceRules: [{
      source_id: 'proxy-a',
      family_id: 'proxy-family-a',
      policy: 'Proxy',
      authoritative: true,
      rules: [{ type: 'DOMAIN', target: '0123456789abcdef.example.com', options: [] }],
    }],
  });
  assert.equal(result.proposal.rules.length, 0);
  assert.equal(result.review[0].reason, 'high-entropy-label');
});
