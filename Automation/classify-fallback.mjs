import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  PublicSuffixList,
  cidrContains,
  normalizeCidr,
  normalizeDomain,
  normalizeIp,
  normalizeRule,
  parsePublicSuffixList,
  parseRuleText,
  suffixSafetyGate,
} from './rule-compiler.mjs';

const DOMAIN_TYPES = new Set(['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD']);
const IP_TYPES = new Set(['IP-CIDR', 'IP-CIDR6']);
const POLICY_NAMES = Object.freeze({ DIRECT: 'Direct', PROXY: 'Proxy', REJECT: 'Reject' });
const MAX_OBSERVATIONS = 100_000;
const MAX_RULES_PER_SOURCE = 100_000;

function fail(message) {
  throw new TypeError(message);
}

function canonicalJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function policyName(value) {
  const key = String(value ?? '').toUpperCase();
  return POLICY_NAMES[key] ?? null;
}

function normalizeObserved(record) {
  if (!record || typeof record !== 'object') return null;
  const kind = record.kind;
  if (!['d', '4', '6'].includes(kind) || typeof record.value !== 'string') return null;
  let value;
  try {
    value = kind === 'd' ? normalizeDomain(record.value) : normalizeIp(record.value);
  } catch {
    return null;
  }
  return {
    kind,
    value,
    seen_days: Number.isInteger(record.seen_days) && record.seen_days > 0 ? Math.min(record.seen_days, 366) : 1,
    last_seen: typeof record.last_seen === 'string' ? record.last_seen : null,
  };
}

function ruleCovers(ruleInput, value) {
  let rule;
  try {
    rule = normalizeRule(ruleInput);
  } catch {
    return false;
  }
  if (rule.type === 'DOMAIN') return rule.target === value;
  if (rule.type === 'DOMAIN-SUFFIX') return value === rule.target || value.endsWith(`.${rule.target}`);
  if (rule.type === 'DOMAIN-KEYWORD') return value.includes(rule.target);
  if (IP_TYPES.has(rule.type)) {
    try {
      const bits = rule.type === 'IP-CIDR' ? 32 : 128;
      const candidate = normalizeCidr(`${value}/${bits}`, { noResolve: true });
      return cidrContains(rule, candidate);
    } catch {
      return false;
    }
  }
  return false;
}

function sourceMatch(source, value) {
  const matches = [];
  for (const rule of source.rules ?? []) {
    if (rule.type === 'DOMAIN' || rule.type === 'DOMAIN-SUFFIX') {
      if (ruleCovers(rule, value)) matches.push(rule);
    }
  }
  matches.sort((left, right) => {
    const leftScope = left.type === 'DOMAIN-SUFFIX' ? left.target.length : Number.MAX_SAFE_INTEGER;
    const rightScope = right.type === 'DOMAIN-SUFFIX' ? right.target.length : Number.MAX_SAFE_INTEGER;
    return rightScope - leftScope;
  });
  return matches[0] ?? null;
}

function normalizeExisting(existingRulesByPolicy = {}) {
  const result = { Direct: [], Proxy: [], Reject: [] };
  for (const policy of Object.keys(result)) {
    result[policy] = (existingRulesByPolicy[policy] ?? []).flatMap((rule) => {
      try {
        return [normalizeRule(rule)];
      } catch {
        return [];
      }
    });
  }
  return result;
}

function normalizeOverrides(overrides = []) {
  const entries = Array.isArray(overrides) ? overrides : overrides?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || entry.enabled === false) return [];
    const policy = policyName(entry.policy);
    if (!policy || policy === 'Reject' || typeof entry.target !== 'string') return [];
    const type = String(entry.type ?? '').toUpperCase();
    if (IP_TYPES.has(type)) {
      try {
        const normalized = normalizeRule({
          type,
          target: entry.target,
          options: entry.options ?? ['no-resolve'],
          source: 'override',
          policy,
        });
        const address = normalizeCidr(normalized.target, { noResolve: true }).address;
        return [{
          policy,
          type: normalized.type,
          target: normalized.target,
          address,
          options: normalized.options,
          reason: typeof entry.reason === 'string' ? entry.reason : 'manual override',
        }];
      } catch {
        return [];
      }
    }
    let target;
    try {
      target = normalizeDomain(entry.target);
    } catch {
      return [];
    }
    const scope = String(entry.scope ?? 'DOMAIN').toUpperCase();
    if (!['DOMAIN', 'DOMAIN-SUFFIX'].includes(scope)) return [];
    return [{ policy, type: scope, target, scope, reason: typeof entry.reason === 'string' ? entry.reason : 'manual override' }];
  });
}

function isControlPlane(value, controlPlane = []) {
  return controlPlane.some((host) => {
    try {
      const normalized = normalizeDomain(host);
      return value === normalized || value.endsWith(`.${normalized}`);
    } catch {
      return false;
    }
  });
}

function hasHighEntropyLabel(value) {
  return normalizeDomain(value, { allowSingleLabel: true }).split('.').some((label) => /(?:[a-f0-9]{16,}|[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f-]{27,})/iu.test(label));
}

function existingConflict(value, policy, existingRulesByPolicy) {
  const existing = normalizeExisting(existingRulesByPolicy);
  if (existing[policy].some((rule) => ruleCovers(rule, value))) return 'exists';
  for (const other of Object.keys(existing)) {
    if (other !== policy && existing[other].some((rule) => ruleCovers(rule, value))) return 'conflict';
  }
  return null;
}

function readObservationShards(observationsDir) {
  const records = [];
  if (!observationsDir || !existsSync(observationsDir)) return records;
  for (const name of readdirSync(observationsDir).sort()) {
    if (!/^[0-9a-f]{2}\.json$/u.test(name)) continue;
    let shard;
    try {
      shard = JSON.parse(readFileSync(join(observationsDir, name), 'utf8'));
    } catch {
      continue;
    }
    if (!shard || typeof shard !== 'object' || Array.isArray(shard)) continue;
    for (const record of Object.values(shard)) records.push(record);
    if (records.length >= MAX_OBSERVATIONS) break;
  }
  return records;
}

function readJsonFile(path, fallback) {
  if (!path || !existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function buildPsl(pslText, pslReady) {
  if (!pslReady || typeof pslText !== 'string' || pslText.includes('PSL_SNAPSHOT_STATUS=placeholder')) return null;
  try {
    return new PublicSuffixList(parsePublicSuffixList(pslText));
  } catch {
    return null;
  }
}

function sourceLockDigest(lockValue) {
  return digest(typeof lockValue === 'string' ? lockValue : canonicalJson(lockValue));
}

function makeProposal(rules, lockDigest) {
  const dedupe = new Map();
  for (const rule of rules) dedupe.set(`${rule.policy}\u0000${rule.type}\u0000${rule.value}`, rule);
  const sortedRules = [...dedupe.values()].sort((left, right) => `${left.policy}\u0000${left.type}\u0000${left.value}`.localeCompare(`${right.policy}\u0000${right.type}\u0000${right.value}`));
  const base = { schema_version: 1, lock_digest: lockDigest, rules: sortedRules };
  return { ...base, proposal_id: digest(canonicalJson(base)) };
}

function classifyOne(observation, {
  sourceRules,
  overrides,
  existingRulesByPolicy,
  controlPlane,
  psl,
  pslReady,
  sourceError,
  minimumProxyFamilies,
}) {
  const normalized = normalizeObserved(observation);
  if (!normalized) return { status: 'IGNORE', reason: 'invalid-observation' };
  const value = normalized.value;
  if (normalized.kind === 'd' && isControlPlane(value, controlPlane)) return { status: 'IGNORE', reason: 'control-plane', value };

  const explicit = overrides.find((entry) => {
    if (IP_TYPES.has(entry.type)) return normalized.kind !== 'd' && entry.address === value;
    return normalized.kind === 'd' && (entry.target === value || (entry.scope === 'DOMAIN-SUFFIX' && value.endsWith(`.${entry.target}`)));
  });
  if (explicit) {
    const conflict = existingConflict(value, explicit.policy, existingRulesByPolicy);
    if (conflict === 'exists') return { status: 'EXISTS', value };
    if (conflict === 'conflict') return { status: 'REVIEW', reason: 'existing-policy-conflict', value };
    if (IP_TYPES.has(explicit.type)) {
      return {
        status: 'PROPOSE',
        policy: explicit.policy,
        type: explicit.type,
        value: explicit.target,
        options: explicit.options,
        override: true,
        reason: explicit.reason,
      };
    }
    if (explicit.scope === 'DOMAIN-SUFFIX') {
      if (!pslReady || !psl) return { status: 'DEFERRED', reason: 'missing-psl', value };
      const gate = suffixSafetyGate(explicit.target, { psl, policy: explicit.policy, existingRulesByPolicy, controlPlane, automatic: false });
      if (!gate.ok) return { status: 'REVIEW', reason: `suffix-${gate.reason}`, value };
      return { status: 'PROPOSE', policy: explicit.policy, type: 'DOMAIN-SUFFIX', value: explicit.target, override: true, reason: explicit.reason };
    }
    return { status: 'PROPOSE', policy: explicit.policy, type: 'DOMAIN', value, override: true, reason: explicit.reason };
  }

  if (normalized.kind !== 'd') return { status: 'REVIEW', reason: 'public-ip-never-auto-publish', kind: normalized.kind, value };

  const conflict = existingConflict(value, 'Proxy', existingRulesByPolicy);
  if (conflict === 'exists') return { status: 'EXISTS', value };
  if (conflict === 'conflict') return { status: 'REVIEW', reason: 'existing-policy-conflict', value };
  if (sourceError) return { status: 'DEFERRED', reason: sourceError, value };

  const matches = sourceRules
    .filter((source) => policyName(source.policy) === 'Proxy')
    .map((source) => ({ source, rule: sourceMatch(source, value) }))
    .filter((item) => item.rule);
  if (!matches.length) return { status: 'REVIEW', reason: 'no-proxy-evidence', value };
  const families = new Set(matches.map((item) => item.source.family_id ?? item.source.source_id));
  const authoritative = matches.some((item) => item.source.authoritative === true);
  if (families.size < minimumProxyFamilies && !(authoritative && normalized.seen_days >= 2)) {
    return { status: 'REVIEW', reason: 'insufficient-independent-proxy-evidence', value };
  }

  const selected = matches.sort((left, right) => right.rule.target.length - left.rule.target.length)[0];
  if (selected.rule.type === 'DOMAIN-SUFFIX') {
    if (!pslReady || !psl) return { status: 'DEFERRED', reason: 'missing-psl', value };
    const gate = suffixSafetyGate(selected.rule.target, { psl, policy: 'Proxy', existingRulesByPolicy, controlPlane, automatic: true });
    if (!gate.ok) return { status: 'REVIEW', reason: `suffix-${gate.reason}`, value };
    if (normalized.seen_days < 2) return { status: 'REVIEW', reason: 'insufficient-observation-days', value };
    return { status: 'PROPOSE', policy: 'Proxy', type: 'DOMAIN-SUFFIX', value: selected.rule.target, reason: 'locked-authoritative-proxy-source' };
  }
  if (hasHighEntropyLabel(value)) return { status: 'REVIEW', reason: 'high-entropy-label', value };
  if (normalized.seen_days < 2) return { status: 'REVIEW', reason: 'insufficient-observation-days', value };
  return { status: 'PROPOSE', policy: 'Proxy', type: 'DOMAIN', value, reason: 'locked-proxy-source' };
}

export function classifyFallback({
  observations = [],
  overrides = [],
  sourceRules = [],
  existingRulesByPolicy = { Direct: [], Proxy: [], Reject: [] },
  controlPlane = [],
  psl = null,
  pslReady = false,
  sourceLockDigest: lockDigest = '',
  sourceError = null,
  minimumProxyFamilies = 2,
} = {}) {
  const merged = new Map();
  for (const raw of observations) {
    const normalized = normalizeObserved(raw);
    if (!normalized) {
      merged.set(`invalid:${merged.size}`, raw);
      continue;
    }
    const key = `${normalized.kind}\u0000${normalized.value}`;
    const current = merged.get(key);
    if (!current || normalized.seen_days > current.seen_days) merged.set(key, normalized);
  }
  const normalizedOverrides = normalizeOverrides(overrides);
  const proposalRules = [];
  const review = [];
  const deferred = [];
  const ignored = [];
  const existing = [];
  for (const observation of merged.values()) {
    const result = classifyOne(observation, { sourceRules, overrides: normalizedOverrides, existingRulesByPolicy, controlPlane, psl, pslReady, sourceError, minimumProxyFamilies });
    const entry = { ...result, kind: observation.kind, value: result.value ?? observation.value };
    if (result.status === 'PROPOSE') proposalRules.push({
      policy: result.policy.toUpperCase(),
      type: result.type,
      value: result.value,
      ...(Array.isArray(result.options) && result.options.length ? { options: [...result.options] } : {}),
      ...(result.override === true ? { override: true } : {}),
    });
    else if (result.status === 'REVIEW') review.push(entry);
    else if (result.status === 'DEFERRED') deferred.push(entry);
    else if (result.status === 'IGNORE') ignored.push(entry);
    else if (result.status === 'EXISTS') existing.push(entry);
  }
  const proposal = makeProposal(proposalRules, lockDigest || digest('empty-source-lock'));
  return { proposal, review, deferred, ignored, existing };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replaceAll('-', '_');
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

async function fetchLockedSources(sources, locks) {
  const lockById = new Map((locks.sources ?? []).map((lock) => [lock.source_id, lock]));
  const sourceRules = [];
  for (const source of sources.sources ?? []) {
    if (source.enabled === false) continue;
    const lock = lockById.get(source.source_id);
    if (!lock || !/^[0-9a-f]{40}$/u.test(lock.commit) || !/^[0-9a-f]{64}$/u.test(lock.content_sha256)) throw new Error('source lock is invalid');
    const url = source.url.replace('{commit}', lock.commit);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response;
    try {
      response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { accept: 'text/plain', 'user-agent': 'fallback-rule-classifier/1' } });
    } catch {
      clearTimeout(timer);
      throw new Error('source fetch failed');
    }
    clearTimeout(timer);
    if (response.status >= 300 && response.status < 400) throw new Error('source redirect forbidden');
    if (!response.ok) throw new Error('source fetch failed');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > lock.max_bytes) throw new Error('source exceeds lock size');
    if (digest(text) !== lock.content_sha256) throw new Error('source content hash mismatch');
    const rules = [];
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('.')) {
        try { rules.push(normalizeRule({ type: 'DOMAIN-SUFFIX', target: trimmed.slice(1), options: [], source: 'upstream-suffix' })); } catch { /* ignore malformed upstream line */ }
        continue;
      }
      if (!trimmed.includes(',')) {
        try { rules.push(normalizeRule({ type: 'DOMAIN', target: trimmed, options: [], source: 'upstream' })); } catch { /* ignore malformed upstream line */ }
        continue;
      }
      const [type, target, ...options] = trimmed.split(',').map((item) => item.trim());
      if (!DOMAIN_TYPES.has(type)) continue;
      try { rules.push(normalizeRule({ type, target, options, source: type === 'DOMAIN-SUFFIX' ? 'upstream-suffix' : 'upstream' })); } catch { /* ignore malformed upstream line */ }
      if (rules.length >= MAX_RULES_PER_SOURCE) throw new Error('source rule limit exceeded');
    }
    sourceRules.push({ source_id: source.source_id, family_id: source.family_id, policy: source.allowed_policies?.[0], authoritative: source.authoritative === true, rules });
  }
  return sourceRules;
}

function writeReports(result, outputDir, reviewDir, deferredDir) {
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(outputDir, 'proposal.json'), canonicalJson(result.proposal), { encoding: 'utf8', mode: 0o600 });
  const day = new Date().toISOString().slice(0, 10);
  const report = (entries) => canonicalJson({ schema_version: 1, date: day, entries });
  if (result.review.length && reviewDir) {
    mkdirSync(reviewDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(reviewDir, `${day}.json`), report(result.review), { encoding: 'utf8', mode: 0o600 });
  }
  if (result.deferred.length && deferredDir) {
    mkdirSync(deferredDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(deferredDir, `${day}.json`), report(result.deferred), { encoding: 'utf8', mode: 0o600 });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const observations = readObservationShards(args.observations);
  const overrides = readJsonFile(args.overrides, { entries: [] });
  const sources = readJsonFile(args.sources, { sources: [] });
  const locks = readJsonFile(args.locks, { sources: [] });
  const controlPlane = readJsonFile(args.control_plane, { never_capture_hosts: [] });
  const existingRulesByPolicy = {};
  for (const policy of ['Direct', 'Proxy', 'Reject']) {
    const path = args[`existing_${policy.toLowerCase()}`];
    existingRulesByPolicy[policy] = path && existsSync(path) ? parseRuleText(readFileSync(path, 'utf8'), { policy }) : [];
  }
  let sourceRules = [];
  let sourceError = null;
  try {
    sourceRules = await fetchLockedSources(sources, locks);
  } catch (error) {
    sourceError = error instanceof Error ? error.message : 'source fetch failed';
  }
  const pslLock = readJsonFile(args.psl_lock, { ready: false });
  const pslText = args.psl && existsSync(args.psl) ? readFileSync(args.psl, 'utf8') : '';
  const pslReady = pslLock.ready === true;
  const psl = buildPsl(pslText, pslReady);
  const result = classifyFallback({ observations, overrides, sourceRules, existingRulesByPolicy, controlPlane: controlPlane.never_capture_hosts ?? [], psl, pslReady, sourceLockDigest: sourceLockDigest(locks), sourceError, minimumProxyFamilies: 2 });
  writeReports(result, args.output_dir ?? '.work', args.review_dir, args.deferred_dir);
  process.stdout.write(`classification complete: proposals=${result.proposal.rules.length} review=${result.review.length} deferred=${result.deferred.length} existing=${result.existing.length}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
