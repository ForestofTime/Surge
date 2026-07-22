import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PublicSuffixList,
  ReverseDomainTrie,
  cidrContains,
  compileRuleSets,
  createManifest,
  createPublicLedger,
  normalizeCidr,
  normalizeDomain,
  normalizeIp,
  parsePublicSuffixList,
  parseRuleText,
  renderRuleSet,
  selectRuleForObservation,
  sha256,
  suffixSafetyGate,
} from '../rule-compiler.mjs';
import { generateFromFiles } from '../generate-rules.mjs';
import { verifyRuleFiles } from '../verify-rules.mjs';

const PSL_FIXTURE = `
// ===BEGIN ICANN DOMAINS===
com
co.uk
*.ck
!www.ck
// ===END ICANN DOMAINS===
// ===BEGIN PRIVATE DOMAINS===
github.io
pages.dev
appspot.com
// ===END PRIVATE DOMAINS===
`;

const psl = new PublicSuffixList(parsePublicSuffixList(PSL_FIXTURE));

test('normalizes Unicode domains, trailing dots, IPv4 and IPv6', () => {
  assert.equal(normalizeDomain(' WWW.Example.COM. '), 'www.example.com');
  assert.equal(normalizeDomain('例子.测试'), 'xn--fsqu00a.xn--0zwm56d');
  assert.equal(normalizeIp('192.0.2.1'), '192.0.2.1');
  assert.equal(normalizeIp('2001:0db8:0:0:0:0:0:1'), '2001:db8::1');
  assert.equal(normalizeIp('[2001:db8::1]'), '2001:db8::1');
  assert.throws(() => normalizeDomain('localhost'));
  assert.throws(() => normalizeIp('192.0.2.999'));
});

test('parses ICANN, PRIVATE, wildcard and exception PSL rules', () => {
  assert.equal(psl.isPublicSuffix('com'), true);
  assert.equal(psl.isPublicSuffix('github.io'), true);
  assert.equal(psl.isPublicSuffix('foo.github.io'), false);
  assert.equal(psl.getPublicSuffix('www.example.com'), 'com');
  assert.equal(psl.getPublicSuffix('a.b.ck'), 'b.ck');
  assert.equal(psl.getRegistrableDomain('a.b.ck'), 'a.b.ck');
  assert.equal(psl.getPublicSuffix('a.www.ck'), 'ck');
  assert.equal(psl.getRegistrableDomain('www.example.com'), 'example.com');
  assert.equal(psl.getRegistrableDomain('alice.github.io'), 'alice.github.io');
  assert.equal(psl.getRegistrableDomain('github.io'), null);
});

test('accepts PSL special-use entries while rejecting them as learned domains', () => {
  const specialUse = new PublicSuffixList(parsePublicSuffixList('home.arpa\nlocal\n'));
  assert.equal(specialUse.exact.has('home.arpa'), true);
  assert.equal(specialUse.exact.has('local'), true);
  assert.throws(() => normalizeDomain('router.home.arpa'));
  assert.throws(() => normalizeDomain('printer.local'));
});

test('reverse domain trie finds suffix and exact coverage', () => {
  const trie = new ReverseDomainTrie();
  trie.insert({ type: 'DOMAIN-SUFFIX', target: 'example.com' });
  trie.insert({ type: 'DOMAIN', target: 'only.example.net' });
  trie.insert({ type: 'DOMAIN-KEYWORD', target: 'tracker' });

  assert.equal(trie.covers('a.example.com'), true);
  assert.equal(trie.covers('example.com'), true);
  assert.equal(trie.covers('only.example.net'), true);
  assert.equal(trie.covers('no.example.net'), false);
  assert.equal(trie.covers('cdn.tracker.invalid'), true);
  assert.equal(trie.hasDescendant('com'), true);
  assert.equal(trie.hasDescendant('not-example.com'), false);
});

test('CIDR containment handles IPv4, IPv6, and adjacent ranges without aggregation', () => {
  const v4 = normalizeCidr('192.0.2.0/24', { noResolve: true });
  const host = normalizeCidr('192.0.2.12/32', { noResolve: true });
  const adjacent = normalizeCidr('192.0.3.0/24', { noResolve: true });
  const v6 = normalizeCidr('2001:db8::/32', { noResolve: true });
  const v6Host = normalizeCidr('2001:db8:1::1/128', { noResolve: true });

  assert.equal(cidrContains(v4, host), true);
  assert.equal(cidrContains(v4, adjacent), false);
  assert.equal(cidrContains(v6, v6Host), true);
  assert.equal(cidrContains(host, v4), false);
  assert.equal(host.options[0], 'no-resolve');
});

test('suffix safety gate denies PSL boundaries, multi-tenant hosts, and policy conflicts', () => {
  const existing = {
    Direct: parseRuleText('DOMAIN-SUFFIX,internal.example.com'),
    Proxy: parseRuleText('DOMAIN-SUFFIX,example.com'),
    Reject: parseRuleText('DOMAIN,blocked.example.com'),
  };

  assert.equal(suffixSafetyGate('example.com', { psl, policy: 'Direct', existingRulesByPolicy: existing }).ok, false);
  assert.equal(suffixSafetyGate('github.io', { psl, policy: 'Proxy', existingRulesByPolicy: existing }).ok, false);
  assert.equal(suffixSafetyGate('foo.pages.dev', { psl, policy: 'Proxy', existingRulesByPolicy: existing }).ok, false);
  assert.equal(suffixSafetyGate('example.com', { psl, policy: 'Proxy', existingRulesByPolicy: existing }).ok, false);
  assert.equal(suffixSafetyGate('new.internal.example.com', { psl, policy: 'Proxy', existingRulesByPolicy: existing }).ok, false);
  assert.equal(suffixSafetyGate('safe.other.com', { psl, policy: 'Direct', existingRulesByPolicy: existing }).ok, true);
});

test('cross-policy keyword overlap fails closed and same-policy keyword coverage deduplicates', () => {
  assert.throws(() => compileRuleSets({
    psl,
    sources: {
      Direct: [{ source: 'manual', text: 'DOMAIN-KEYWORD,tracker' }],
      Proxy: [{ source: 'manual', text: 'DOMAIN-SUFFIX,example.com' }],
      Reject: [],
    },
  }), /cross-policy rule conflict/);
  assert.throws(() => compileRuleSets({
    psl,
    sources: {
      Direct: [{ source: 'manual', text: 'DOMAIN-KEYWORD,foo' }],
      Proxy: [{ source: 'manual', text: 'DOMAIN-KEYWORD,bar' }],
      Reject: [],
    },
  }), /cross-policy rule conflict/);
  const result = compileRuleSets({
    psl,
    sources: {
      Direct: [{ source: 'manual', text: 'DOMAIN-KEYWORD,tracker\nDOMAIN,cdn.tracker.example' }],
      Proxy: [],
      Reject: [],
    },
  });
  assert.deepEqual(result.rulesByPolicy.Direct.map((rule) => rule.type), ['DOMAIN-KEYWORD']);
});

test('rejects malformed CIDR prefixes and unknown options', () => {
  assert.throws(() => normalizeCidr('192.0.2.1/'), /invalid CIDR prefix/);
  assert.throws(() => normalizeCidr('192.0.2.1/0x10'), /invalid CIDR prefix/);
  assert.throws(() => parseRuleText('DOMAIN,foo.example,evil'), /unsupported rule option/);
});

test('checks every suffix label for high-entropy automatic candidates', () => {
  const candidate = 'cdn.0123456789abcdef.example.com';
  assert.equal(suffixSafetyGate(candidate, { psl, policy: 'Proxy' }).ok, false);
});

test('observation selector is suffix-first only with explicit safe evidence', () => {
  const options = {
    psl,
    policy: 'Proxy',
    existingRulesByPolicy: { Direct: [], Proxy: [], Reject: [] },
  };

  assert.deepEqual(
    selectRuleForObservation('www.example.com', { ...options, evidence: { type: 'upstream-suffix', target: 'example.com' } }),
    { type: 'DOMAIN-SUFFIX', target: 'example.com', options: [], source: 'upstream-suffix' },
  );
  assert.deepEqual(
    selectRuleForObservation('www.example.com', { ...options, evidence: { type: 'observed-only' } }),
    { type: 'DOMAIN', target: 'www.example.com', options: [], source: 'observed-only' },
  );
  assert.equal(
    selectRuleForObservation('www.github.io', { ...options, evidence: { type: 'upstream-suffix', target: 'github.io' } }).status,
    'REVIEW',
  );
});

test('compiler deduplicates within policy and fails closed on cross-policy overlap', () => {
  const sources = {
    Direct: [
      { source: 'manual', text: 'DOMAIN,foo.example.com\nDOMAIN-SUFFIX,example.com\nDOMAIN,foo.example.com' },
    ],
    Proxy: [{ source: 'manual', text: 'DOMAIN-SUFFIX,proxy.example.net\nDOMAIN,cdn.proxy.example.net' }],
    Reject: [{ source: 'manual', text: 'DOMAIN,blocked.example.org' }],
  };
  const compiled = compileRuleSets({ sources, psl });
  assert.equal(compiled.rulesByPolicy.Direct.length, 1);
  assert.equal(compiled.rulesByPolicy.Direct[0].type, 'DOMAIN-SUFFIX');
  assert.equal(compiled.rulesByPolicy.Proxy.length, 1);
  assert.equal(compiled.conflicts.length, 0);

  assert.throws(() => compileRuleSets({
    psl,
    sources: {
      Direct: [{ source: 'manual', text: 'DOMAIN-SUFFIX,example.com' }],
      Proxy: [{ source: 'manual', text: 'DOMAIN,foo.example.com' }],
      Reject: [],
    },
  }), /cross-policy rule conflict/);
});

test('rendering, manifest, and public ledger are deterministic', () => {
  const rules = [
    { type: 'DOMAIN-SUFFIX', target: 'example.com', options: [] },
    { type: 'DOMAIN', target: 'a.example.net', options: [] },
    { type: 'IP-CIDR', target: '192.0.2.1/32', options: ['no-resolve'] },
  ];
  const first = renderRuleSet('Proxy', rules, { sourceLockDigest: 'abc' });
  const second = renderRuleSet('Proxy', [...rules].reverse(), { sourceLockDigest: 'abc' });
  assert.equal(first, second);
  const manifest = createManifest({ rulesByPolicy: { Direct: [], Proxy: rules, Reject: [] }, sourceLockDigest: 'abc' });
  assert.equal(manifest.rules.Proxy.count, 3);
  assert.match(manifest.rules.Proxy.sha256, /^[a-f0-9]{64}$/);
  const ledger = createPublicLedger({ Proxy: rules, Direct: [], Reject: [] });
  assert.equal(ledger.length, 3);
  assert.equal(ledger[0].proposal_id, createPublicLedger({ Proxy: rules, Direct: [], Reject: [] })[0].proposal_id);
  assert.equal(JSON.stringify(ledger), JSON.stringify(createPublicLedger({ Proxy: [...rules].reverse(), Direct: [], Reject: [] })));
});

test('generate and verify CLIs write only changed deterministic outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'surge-rule-compiler-'));
  try {
    await writeFile(join(root, 'psl.dat'), PSL_FIXTURE);
    await writeFile(join(root, 'Direct+.list'), 'DOMAIN-SUFFIX,example.com\n');
    await writeFile(join(root, 'Proxy+.list'), 'DOMAIN,proxy.example.net\n');
    await writeFile(join(root, 'Reject+.list'), 'DOMAIN,blocked.example.org\n');
    const first = await generateFromFiles({
      direct: join(root, 'Direct+.list'),
      proxy: join(root, 'Proxy+.list'),
      reject: join(root, 'Reject+.list'),
      psl: join(root, 'psl.dat'),
      outputDir: join(root, 'Rule'),
      manifest: join(root, 'manifest.json'),
      ledger: join(root, 'ledger.json'),
    });
    const firstOutput = await readFile(join(root, 'Rule/Proxy+.list'), 'utf8');
    const second = await generateFromFiles({
      direct: join(root, 'Direct+.list'),
      proxy: join(root, 'Proxy+.list'),
      reject: join(root, 'Reject+.list'),
      psl: join(root, 'psl.dat'),
      outputDir: join(root, 'Rule'),
      manifest: join(root, 'manifest.json'),
      ledger: join(root, 'ledger.json'),
    });
    assert.equal(first.rendered.Proxy, firstOutput);
    assert.deepEqual(first.manifest, second.manifest);
    assert.deepEqual((await verifyRuleFiles({ ruleDir: join(root, 'Rule'), psl: join(root, 'psl.dat') })).manifest, first.manifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('publish CLI merges proposal with manual and existing auto sources idempotently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'surge-rule-publish-'));
  try {
    const sourceRoot = join(root, 'source');
    const outputRoot = join(root, 'generated');
    const pslPath = join(sourceRoot, 'Automation/vendor/public_suffix_list.dat');
    const pslLockPath = join(sourceRoot, 'Automation/vendor/public_suffix_list.lock.json');
    const sourceLock = { schema_version: 1, sources: [{ source_id: 'fixture', commit: 'a'.repeat(40), content_sha256: 'b'.repeat(64) }] };
    const sourceLockDigest = sha256(`${JSON.stringify(sourceLock)}\n`);
    const control = {
      schema_version: 1,
      never_capture_hosts: ['api.github.com'],
      never_learn_suffixes: ['github.io'],
      psl: { snapshot_path: 'Automation/vendor/public_suffix_list.dat', lock_path: 'Automation/vendor/public_suffix_list.lock.json', require_ready_snapshot: true },
    };
    await mkdir(join(sourceRoot, 'Source'), { recursive: true });
    await mkdir(join(sourceRoot, 'Automation/vendor'), { recursive: true });
    await mkdir(join(sourceRoot, '.work'), { recursive: true });
    await mkdir(join(outputRoot, 'Source/Auto'), { recursive: true });
    await writeFile(join(sourceRoot, 'Source/Direct+.list'), 'DOMAIN-SUFFIX,direct.example.com\n', { encoding: 'utf8' });
    await writeFile(join(sourceRoot, 'Source/Proxy+.list'), '');
    await writeFile(join(sourceRoot, 'Source/Reject+.list'), '');
    await writeFile(pslPath, PSL_FIXTURE);
    await writeFile(pslLockPath, JSON.stringify({ schema_version: 1, ready: true, sha256: sha256(PSL_FIXTURE) }));
    await writeFile(join(sourceRoot, 'Automation/control-plane.json'), JSON.stringify(control));
    await writeFile(join(sourceRoot, 'Automation/sources.lock.json'), JSON.stringify(sourceLock));
    await writeFile(join(sourceRoot, 'Automation/shadow-exceptions.json'), JSON.stringify({ schema_version: 1, entries: [] }));
    await writeFile(join(outputRoot, 'Source/Auto/Proxy+.list'), 'DOMAIN,old.example.com\n');
    await writeFile(join(outputRoot, 'Source/Auto/Direct+.list'), '');
    const proposalPath = join(sourceRoot, '.work/fallback-proposal.json');
    await writeFile(proposalPath, JSON.stringify({ schema_version: 1, proposal_id: '6a7ad7cfe2659f8a7e5769803c58d394d33e8958bc6c94b8dabd789bbfe678c7', lock_digest: sourceLockDigest, rules: [{ policy: 'PROXY', type: 'DOMAIN-SUFFIX', value: 'new.example.com' }] }));
    const first = await generateFromFiles({ proposalFile: proposalPath, outputRoot, sourceRoot });
    assert.match(await readFile(join(outputRoot, 'Rule/Direct+.list'), 'utf8'), /direct\.example\.com/);
    assert.match(await readFile(join(outputRoot, 'Rule/Proxy+.list'), 'utf8'), /new\.example\.com/);
    assert.match(await readFile(join(outputRoot, 'Source/Auto/Proxy+.list'), 'utf8'), /old\.example\.com/);
    assert.equal(JSON.parse(await readFile(join(outputRoot, 'manifest.json'), 'utf8')).rules.Reject.count, 0);
    await assert.rejects(() => readFile(join(outputRoot, 'Rule/Reject+.list'), 'utf8'), /ENOENT/);
    await assert.doesNotReject(() => verifyRuleFiles({ ruleDir: join(outputRoot, 'Rule'), psl: pslPath, policies: ['Direct', 'Proxy'] }));
    assert.equal(JSON.parse(await readFile(join(outputRoot, 'proposals/processed.json'), 'utf8')).length, 1);
    const second = await generateFromFiles({ proposalFile: proposalPath, outputRoot, sourceRoot });
    assert.deepEqual(first.manifest, second.manifest);
    assert.equal(JSON.parse(await readFile(join(outputRoot, 'proposals/processed.json'), 'utf8')).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifier rejects rendered-byte drift and symlinked rule files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'surge-rule-verify-'));
  try {
    await writeFile(join(root, 'psl.dat'), PSL_FIXTURE);
    await writeFile(join(root, 'Direct+.list'), 'DOMAIN-SUFFIX,direct.example.com\n');
    await writeFile(join(root, 'Proxy+.list'), 'DOMAIN,proxy.example.net\n');
    await writeFile(join(root, 'Reject+.list'), 'DOMAIN,blocked.example.org\n');
    await generateFromFiles({
      direct: join(root, 'Direct+.list'),
      proxy: join(root, 'Proxy+.list'),
      reject: join(root, 'Reject+.list'),
      psl: join(root, 'psl.dat'),
      outputDir: join(root, 'Rule'),
      manifest: join(root, 'manifest.json'),
    });
    await assert.doesNotReject(() => verifyRuleFiles({ ruleDir: join(root, 'Rule'), psl: join(root, 'psl.dat'), manifest: join(root, 'manifest.json') }));
    await writeFile(join(root, 'Rule/Proxy+.list'), `${await readFile(join(root, 'Rule/Proxy+.list'), 'utf8')}DOMAIN,drift.example.net\n`);
    await assert.rejects(() => verifyRuleFiles({ ruleDir: join(root, 'Rule'), psl: join(root, 'psl.dat'), manifest: join(root, 'manifest.json') }), /rendered output|manifest/);
    await rm(join(root, 'Rule/Proxy+.list'));
    await symlink(join(root, 'Rule/Direct+.list'), join(root, 'Rule/Proxy+.list'));
    await assert.rejects(() => verifyRuleFiles({ ruleDir: join(root, 'Rule'), psl: join(root, 'psl.dat'), manifest: join(root, 'manifest.json') }), /symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
