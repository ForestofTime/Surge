import { createHash } from 'node:crypto';
import { domainToASCII } from 'node:url';

export const GENERATOR_VERSION = '1.0.0';
export const POLICIES = Object.freeze(['Direct', 'Proxy', 'Reject']);
export const RULE_TYPE_ORDER = Object.freeze([
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'IP-CIDR',
  'IP-CIDR6',
]);

const DOMAIN_TYPES = new Set(['DOMAIN', 'DOMAIN-SUFFIX']);
const IP_TYPES = new Set(['IP-CIDR', 'IP-CIDR6']);
const SUPPORTED_TYPES = new Set([...RULE_TYPE_ORDER]);
const SOURCE_PRIORITY = Object.freeze({
  manual: 4,
  override: 4,
  'upstream-suffix': 3,
  upstream: 2,
  auto: 1,
});

function fail(message) {
  throw new TypeError(message);
}

function assertString(value, name) {
  if (typeof value !== 'string') fail(`${name} must be a string`);
  return value;
}

function compareBytes(a, b) {
  const aa = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  const length = Math.min(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  }
  return aa.length - bb.length;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stripInlineComment(line) {
  const hash = line.indexOf('#');
  const slash = line.indexOf('//');
  let end = line.length;
  if (hash >= 0) end = Math.min(end, hash);
  if (slash >= 0) end = Math.min(end, slash);
  return line.slice(0, end).trim();
}

export function normalizeDomain(value, { allowSingleLabel = false, allowSpecialUse = false } = {}) {
  const input = assertString(value, 'domain').trim();
  if (!input || /[\u0000-\u0020\u007f]/u.test(input)) fail('invalid domain characters');
  const withoutDot = input.endsWith('.') ? input.slice(0, -1) : input;
  if (!withoutDot || withoutDot.includes('..')) fail('invalid domain');
  const ascii = domainToASCII(withoutDot).toLowerCase();
  if (!ascii || ascii.length > 253) fail('invalid domain');
  if (normalizeIp.maybe(ascii)) fail('IP literal is not a domain');
  const labels = ascii.split('.');
  if (!allowSingleLabel && labels.length < 2) fail('single-label domain is not supported');
  if (!allowSpecialUse && (labels.at(-1) === 'local' || (labels.length >= 2 && labels.slice(-2).join('.') === 'home.arpa'))) fail('local domain is not supported');
  for (const label of labels) {
    if (label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)) {
      fail('invalid domain label');
    }
  }
  return ascii;
}

function parseIPv4(value) {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) return null;
    const number = Number(part);
    if (number > 255) return null;
    bytes.push(number);
  }
  return bytes;
}

function parseIPv6(value) {
  let input = value;
  if (input.startsWith('[') && input.endsWith(']')) input = input.slice(1, -1);
  if (!input || input.includes('%')) return null;
  const compressionCount = (input.match(/::/gu) ?? []).length;
  if (compressionCount > 1 || (input.includes(':') && /(^|[^:]):{3,}([^:]|$)/u.test(input))) return null;

  let left = input;
  let right = '';
  const compressed = input.includes('::');
  if (compressed) {
    [left, right] = input.split('::');
  }

  const parseGroups = (part) => {
    if (!part) return [];
    const raw = part.split(':');
    const groups = [];
    for (let i = 0; i < raw.length; i += 1) {
      const group = raw[i];
      if (group.includes('.')) {
        if (i !== raw.length - 1) return null;
        const ipv4 = parseIPv4(group);
        if (!ipv4) return null;
        groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/iu.test(group)) return null;
        groups.push(Number.parseInt(group, 16));
      }
    }
    return groups;
  };

  const leftGroups = parseGroups(left);
  const rightGroups = parseGroups(right);
  if (!leftGroups || !rightGroups) return null;
  if (compressed) {
    if (leftGroups.length + rightGroups.length >= 8) return null;
    const groups = [...leftGroups, ...Array(8 - leftGroups.length - rightGroups.length).fill(0), ...rightGroups];
    return groups;
  }
  if (leftGroups.length !== 8 || rightGroups.length !== 0) return null;
  return leftGroups;
}

function ipv6GroupsToBigInt(groups) {
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function bigIntToIpv6(value) {
  const groups = [];
  for (let i = 7; i >= 0; i -= 1) {
    groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  }
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let i = 0; i <= groups.length; i += 1) {
    if (i < groups.length && groups[i] === 0) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      const length = i - runStart;
      if (length > bestLength && length >= 2) {
        bestStart = runStart;
        bestLength = length;
      }
      runStart = -1;
    }
  }
  const hex = (group) => group.toString(16);
  if (bestStart >= 0) {
    const left = groups.slice(0, bestStart).map(hex).join(':');
    const right = groups.slice(bestStart + bestLength).map(hex).join(':');
    if (!left && !right) return '::';
    if (!left) return `::${right}`;
    if (!right) return `${left}::`;
    return `${left}::${right}`;
  }
  return groups.map(hex).join(':');
}

function normalizeIpInternal(value) {
  const input = assertString(value, 'IP address').trim();
  if (!input || /[\u0000-\u0020\u007f]/u.test(input)) fail('invalid IP address');
  const ipv4 = parseIPv4(input);
  if (ipv4) return { address: ipv4.join('.'), family: 4, value: ipv4.reduce((n, byte) => (n << 8) | byte, 0) >>> 0 };
  const groups = parseIPv6(input.toLowerCase());
  if (!groups) fail('invalid IP address');
  return { address: bigIntToIpv6(ipv6GroupsToBigInt(groups)), family: 6, value: ipv6GroupsToBigInt(groups) };
}

export function normalizeIp(value) {
  return normalizeIpInternal(value).address;
}

normalizeIp.maybe = (value) => {
  try {
    normalizeIpInternal(value);
    return true;
  } catch {
    return false;
  }
};

export function normalizeCidr(value, { noResolve = false } = {}) {
  const input = assertString(value, 'CIDR').trim();
  const slash = input.lastIndexOf('/');
  let addressText = input;
  let prefixText = null;
  if (slash >= 0) {
    addressText = input.slice(0, slash);
    prefixText = input.slice(slash + 1);
  }
  const ip = normalizeIpInternal(addressText);
  const bits = ip.family === 4 ? 32 : 128;
  if (prefixText !== null && !/^(?:0|[1-9][0-9]*)$/u.test(prefixText)) fail('invalid CIDR prefix');
  const prefix = prefixText === null ? bits : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) fail('invalid CIDR prefix');
  const fullMask = (1n << BigInt(bits)) - 1n;
  const mask = prefix === 0 ? 0n : (fullMask << BigInt(bits - prefix)) & fullMask;
  const network = BigInt(ip.value) & mask;
  const address = ip.family === 4 ? [
    Number((network >> 24n) & 255n),
    Number((network >> 16n) & 255n),
    Number((network >> 8n) & 255n),
    Number(network & 255n),
  ].join('.') : bigIntToIpv6(network);
  const type = ip.family === 4 ? 'IP-CIDR' : 'IP-CIDR6';
  return {
    type,
    target: `${address}/${prefix}`,
    address,
    family: ip.family,
    prefix,
    network,
    options: noResolve ? ['no-resolve'] : [],
  };
}

export function cidrContains(parent, child) {
  if (!parent || !child || parent.family !== child.family || parent.prefix > child.prefix) return false;
  const bits = parent.family === 4 ? 32 : 128;
  const mask = parent.prefix === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(bits - parent.prefix);
  return (child.network & mask) === parent.network;
}

export function parsePublicSuffixList(text) {
  assertString(text, 'PSL text');
  const exact = new Map();
  const wildcard = new Map();
  const exception = new Map();
  let section = 'icann';
  for (const rawLine of text.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/BEGIN PRIVATE DOMAINS/iu.test(line)) {
      section = 'private';
      continue;
    }
    if (/BEGIN ICANN DOMAINS/iu.test(line)) {
      section = 'icann';
      continue;
    }
    if (line.startsWith('//')) continue;
    const candidate = line.split(/\s+/u)[0].toLowerCase();
    if (!candidate) continue;
    if (candidate.startsWith('!')) {
      const domain = normalizeDomain(candidate.slice(1), { allowSingleLabel: true, allowSpecialUse: true });
      exception.set(domain, section);
    } else if (candidate.startsWith('*.')) {
      const domain = normalizeDomain(candidate.slice(2), { allowSingleLabel: true, allowSpecialUse: true });
      wildcard.set(domain, section);
    } else {
      const domain = normalizeDomain(candidate, { allowSingleLabel: true, allowSpecialUse: true });
      exact.set(domain, section);
    }
  }
  return { exact, wildcard, exception };
}

export class PublicSuffixList {
  constructor(parsed) {
    this.exact = parsed?.exact ?? new Map();
    this.wildcard = parsed?.wildcard ?? new Map();
    this.exception = parsed?.exception ?? new Map();
  }

  getPublicSuffix(value) {
    const domain = normalizeDomain(value, { allowSingleLabel: true });
    const labels = domain.split('.');
    let exceptionMatch = null;
    for (let i = 0; i < labels.length; i += 1) {
      const candidate = labels.slice(i).join('.');
      if (this.exception.has(candidate)) {
        exceptionMatch = candidate;
        break;
      }
    }
    if (exceptionMatch) return exceptionMatch.split('.').slice(1).join('.');

    let best = labels.at(-1);
    let bestLength = 1;
    for (let i = 0; i < labels.length; i += 1) {
      const candidate = labels.slice(i).join('.');
      if (this.exact.has(candidate) && labels.length - i > bestLength) {
        best = candidate;
        bestLength = labels.length - i;
      }
      if (i < labels.length - 1) {
        const wildcard = labels.slice(i + 1).join('.');
        if (this.wildcard.has(wildcard) && labels.length - i > bestLength) {
          best = candidate;
          bestLength = labels.length - i;
        }
      }
    }
    return best;
  }

  isPublicSuffix(value) {
    return normalizeDomain(value, { allowSingleLabel: true }) === this.getPublicSuffix(value);
  }

  getRegistrableDomain(value) {
    const domain = normalizeDomain(value, { allowSingleLabel: true });
    const suffix = this.getPublicSuffix(domain);
    const domainLabels = domain.split('.');
    const suffixLabels = suffix.split('.');
    if (domainLabels.length <= suffixLabels.length) return null;
    return domainLabels.slice(-(suffixLabels.length + 1)).join('.');
  }

  isPrivateSuffix(value) {
    const suffix = this.getPublicSuffix(value);
    if (this.exact.get(suffix) === 'private' || this.wildcard.get(suffix) === 'private') return true;
    const suffixLabels = suffix.split('.');
    if (suffixLabels.length > 1 && this.wildcard.get(suffixLabels.slice(1).join('.')) === 'private') return true;
    return false;
  }
}

function normalizeKeyword(value) {
  const target = assertString(value, 'keyword').trim().toLowerCase();
  if (!target || /[\u0000-\u0020\u007f]/u.test(target)) fail('invalid keyword');
  return target;
}

export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') fail('rule must be an object');
  const type = assertString(rule.type, 'rule type').trim().toUpperCase();
  if (!SUPPORTED_TYPES.has(type)) fail(`unsupported rule type: ${type}`);
  const options = [...new Set((rule.options ?? []).map((item) => assertString(item, 'rule option').trim().toLowerCase()).filter(Boolean))].sort(compareBytes);
  const unsupportedOptions = options.filter((option) => option !== 'no-resolve');
  if (unsupportedOptions.length) fail(`unsupported rule option: ${unsupportedOptions[0]}`);
  if (DOMAIN_TYPES.has(type) || type === 'DOMAIN-KEYWORD') {
    if (options.length) fail(`unsupported rule option for ${type}: ${options[0]}`);
    if (type === 'DOMAIN-KEYWORD' && ['auto', 'observed-only'].includes(rule.source)) fail('DOMAIN-KEYWORD cannot be generated from observation');
    return { ...rule, type, target: type === 'DOMAIN-KEYWORD' ? normalizeKeyword(rule.target) : normalizeDomain(rule.target), options: [] };
  }
  const cidr = normalizeCidr(rule.target, { noResolve: options.includes('no-resolve') });
  if (cidr.type !== type) fail(`rule type ${type} does not match address family`);
  return { ...rule, type, target: cidr.target, options: cidr.options };
}

export function parseRuleText(text, { source = 'manual', policy } = {}) {
  assertString(text, 'rule text');
  const rules = [];
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = stripInlineComment(rawLine);
    if (!line) continue;
    const columns = line.split(',').map((item) => item.trim());
    const [type, target, ...options] = columns;
    if (!type || !target) fail(`invalid rule at line ${index + 1}`);
    rules.push(normalizeRule({ type, target, options, source, policy, line: index + 1 }));
  }
  return rules;
}

function labels(value) {
  return normalizeDomain(value, { allowSingleLabel: true }).split('.').reverse();
}

export class ReverseDomainTrie {
  constructor() {
    this.root = { children: new Map(), suffix: [], exact: [] };
    this.keywords = [];
  }

  insert(rule) {
    const normalized = normalizeRule(rule);
    if (normalized.type === 'DOMAIN-KEYWORD') {
      this.keywords.push(normalized);
      return normalized;
    }
    if (!DOMAIN_TYPES.has(normalized.type)) return normalized;
    let node = this.root;
    for (const label of labels(normalized.target)) {
      if (!node.children.has(label)) node.children.set(label, { children: new Map(), suffix: [], exact: [] });
      node = node.children.get(label);
    }
    node[normalized.type === 'DOMAIN-SUFFIX' ? 'suffix' : 'exact'].push(normalized);
    return normalized;
  }

  #nodeFor(value) {
    let node = this.root;
    for (const label of labels(value)) {
      node = node.children.get(label);
      if (!node) return null;
    }
    return node;
  }

  covers(value) {
    const domain = normalizeDomain(value);
    let node = this.root;
    for (const label of domain.split('.').reverse()) {
      if (node.suffix.length > 0) return true;
      node = node.children.get(label);
      if (!node) break;
    }
    if (node && (node.suffix.length > 0 || node.exact.length > 0)) return true;
    return this.keywords.some((rule) => domain.includes(rule.target));
  }

  findCoveringSuffix(value) {
    const domain = normalizeDomain(value);
    let node = this.root;
    let best = null;
    for (const label of domain.split('.').reverse()) {
      if (node.suffix.length > 0) best = node.suffix[0];
      node = node.children.get(label);
      if (!node) break;
    }
    if (node?.suffix.length > 0) best = node.suffix[0];
    return best;
  }

  hasDescendant(value) {
    const node = this.#nodeFor(value);
    if (!node) return false;
    const visit = (current) => {
      if (current.suffix.length || current.exact.length) return true;
      for (const child of current.children.values()) if (visit(child)) return true;
      return false;
    };
    return visit(node);
  }
}

function domainCoveredBySuffix(domain, suffix) {
  return domain === suffix || domain.endsWith(`.${suffix}`);
}

function domainRulesOverlap(a, b) {
  if (a.type === 'DOMAIN-KEYWORD' && b.type === 'DOMAIN-SUFFIX') return true;
  if (b.type === 'DOMAIN-KEYWORD' && a.type === 'DOMAIN-SUFFIX') return true;
  if (a.type === 'DOMAIN-KEYWORD' && b.type === 'DOMAIN-KEYWORD') return true;
  const aDomain = DOMAIN_TYPES.has(a.type);
  const bDomain = DOMAIN_TYPES.has(b.type);
  if (aDomain && bDomain) {
    if (a.type === 'DOMAIN-KEYWORD' || b.type === 'DOMAIN-KEYWORD') return false;
    if (a.type === 'DOMAIN' && b.type === 'DOMAIN') return a.target === b.target;
    if (a.type === 'DOMAIN-SUFFIX' && b.type === 'DOMAIN-SUFFIX') return domainCoveredBySuffix(a.target, b.target) || domainCoveredBySuffix(b.target, a.target);
    if (a.type === 'DOMAIN-SUFFIX') return domainCoveredBySuffix(b.target, a.target);
    return domainCoveredBySuffix(a.target, b.target);
  }
  if (a.type === 'DOMAIN-KEYWORD' && bDomain) return b.target.includes(a.target);
  if (b.type === 'DOMAIN-KEYWORD' && aDomain) return a.target.includes(b.target);
  return false;
}

function parseCidrRule(rule) {
  return normalizeCidr(rule.target, { noResolve: rule.options.includes('no-resolve') });
}

function rulesOverlap(a, b) {
  if (IP_TYPES.has(a.type) && IP_TYPES.has(b.type)) return cidrContains(parseCidrRule(a), parseCidrRule(b)) || cidrContains(parseCidrRule(b), parseCidrRule(a));
  if (DOMAIN_TYPES.has(a.type) || a.type === 'DOMAIN-KEYWORD') return domainRulesOverlap(a, b);
  return false;
}

function ruleKey(rule) {
  return `${rule.type}\u0000${rule.target}\u0000${rule.options.join(',')}`;
}

function ruleSort(a, b) {
  const type = RULE_TYPE_ORDER.indexOf(a.type) - RULE_TYPE_ORDER.indexOf(b.type);
  if (type) return type;
  return compareBytes(a.target, b.target) || compareBytes(a.options.join(','), b.options.join(','));
}

function sourcePriority(rule) {
  return SOURCE_PRIORITY[rule.source] ?? 0;
}

function canonicalPolicy(value) {
  const normalized = String(value ?? '').toLowerCase();
  return normalized === 'direct' ? 'Direct' : normalized === 'proxy' ? 'Proxy' : normalized === 'reject' ? 'Reject' : String(value ?? '');
}

function deduplicatePolicyRules(rules) {
  const byKey = new Map();
  for (const rule of rules.map(normalizeRule)) {
    const key = ruleKey(rule);
    const current = byKey.get(key);
    if (!current || sourcePriority(rule) > sourcePriority(current)) byKey.set(key, rule);
  }
  const unique = [...byKey.values()];
  const suffixes = unique.filter((rule) => rule.type === 'DOMAIN-SUFFIX');
  const keywords = unique.filter((rule) => rule.type === 'DOMAIN-KEYWORD');
  return unique.filter((rule) => {
    if (rule.type === 'DOMAIN-KEYWORD') {
      const broader = keywords.find((keyword) => keyword !== rule && rule.target.includes(keyword.target));
      if (!broader) return true;
      return sourcePriority(rule) > sourcePriority(broader);
    }
    if (rule.type === 'DOMAIN' || rule.type === 'DOMAIN-SUFFIX') {
      const coveringKeyword = keywords.find((keyword) => rule.target.includes(keyword.target));
      if (coveringKeyword && sourcePriority(rule) <= sourcePriority(coveringKeyword)) return false;
    }
    if (rule.type !== 'DOMAIN' && rule.type !== 'DOMAIN-SUFFIX') return true;
    const covering = suffixes.find((suffix) => suffix.target !== rule.target && domainCoveredBySuffix(rule.target, suffix.target));
    if (!covering) return true;
    if (rule.source && sourcePriority(rule.source) > sourcePriority(covering.source)) return true;
    return false;
  }).sort(ruleSort);
}

function allowsShadow(a, b, exceptions) {
  return exceptions.some((exception) => {
    const exceptionPolicyA = canonicalPolicy(exception.policyA);
    const exceptionPolicyB = canonicalPolicy(exception.policyB);
    const samePolicies = (exceptionPolicyA === a.policy && exceptionPolicyB === b.policy)
      || (exceptionPolicyA === b.policy && exceptionPolicyB === a.policy);
    if (!samePolicies) return false;
    const first = normalizeRule(exception.ruleA);
    const second = normalizeRule(exception.ruleB);
    return (ruleKey(first) === ruleKey(a) && ruleKey(second) === ruleKey(b))
      || (ruleKey(first) === ruleKey(b) && ruleKey(second) === ruleKey(a));
  });
}

function normalizePolicySources(sources = {}) {
  const result = {};
  for (const policy of POLICIES) {
    const entries = sources[policy] ?? [];
    const list = [];
    for (const entry of entries) {
      if (typeof entry === 'string') list.push(...parseRuleText(entry, { source: 'manual', policy }));
      else if (entry?.text !== undefined) list.push(...parseRuleText(entry.text, { source: entry.source ?? 'manual', policy }));
      else if (entry?.type) list.push(normalizeRule({ ...entry, policy, source: entry.source ?? 'manual' }));
      else fail(`invalid ${policy} source entry`);
    }
    result[policy] = list;
  }
  return result;
}

export function suffixSafetyGate(value, {
  psl,
  policy,
  denylist = [],
  existingRulesByPolicy = {},
  controlPlane = [],
  automatic = true,
} = {}) {
  let suffix;
  try {
    suffix = normalizeDomain(value);
  } catch (error) {
    return { ok: false, reason: 'invalid-domain', error: error.message };
  }
  if (!psl || typeof psl.isPublicSuffix !== 'function') return { ok: false, reason: 'missing-psl' };
  if (psl.isPublicSuffix(suffix)) return { ok: false, reason: 'public-suffix' };
  if (automatic && psl.isPrivateSuffix?.(suffix)) return { ok: false, reason: 'private-multitenant-suffix' };
  if (!psl.getRegistrableDomain(suffix)) return { ok: false, reason: 'no-registrable-domain' };
  const denied = [...denylist, ...controlPlane].some((item) => {
    try {
      const candidate = normalizeDomain(item);
      return domainCoveredBySuffix(suffix, candidate) || domainCoveredBySuffix(candidate, suffix);
    } catch {
      return false;
    }
  });
  if (denied) return { ok: false, reason: 'denylist' };
  const hasHighEntropyLabel = suffix.split('.').some((label) => /(?:[a-f0-9]{16,}|[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f-]{27,})/iu.test(label));
  if (automatic && hasHighEntropyLabel) {
    return { ok: false, reason: 'high-entropy-label' };
  }
  for (const [otherPolicy, rules] of Object.entries(existingRulesByPolicy)) {
    if (otherPolicy === policy) continue;
    for (const rule of rules ?? []) {
      if (rulesOverlap({ type: 'DOMAIN-SUFFIX', target: suffix, options: [] }, normalizeRule(rule))) {
        return { ok: false, reason: `cross-policy-overlap:${otherPolicy}` };
      }
    }
  }
  return { ok: true, suffix };
}

export function selectRuleForObservation(observed, {
  policy,
  evidence = { type: 'observed-only' },
  psl,
  denylist = [],
  existingRulesByPolicy = {},
  controlPlane = [],
} = {}) {
  if (normalizeIp.maybe(observed)) return { status: 'REVIEW', reason: 'public-ip-never-auto-publish' };
  let hostname;
  try {
    hostname = normalizeDomain(observed);
  } catch (error) {
    return { status: 'IGNORE', reason: error.message };
  }
  const evidenceType = evidence.type ?? 'observed-only';
  if (evidenceType === 'upstream-suffix' || evidenceType === 'override-suffix') {
    const candidate = normalizeDomain(evidence.target);
    if (!domainCoveredBySuffix(hostname, candidate)) return { status: 'REVIEW', reason: 'evidence-does-not-cover-observation' };
    const gate = suffixSafetyGate(candidate, { psl, policy, denylist, existingRulesByPolicy, controlPlane, automatic: evidenceType !== 'override-suffix' });
    if (!gate.ok) return { status: 'REVIEW', reason: gate.reason };
    return { type: 'DOMAIN-SUFFIX', target: candidate, options: [], source: evidenceType };
  }
  if (evidenceType === 'override-domain' || evidenceType === 'upstream-domain' || evidenceType === 'observed-only') {
    return { type: 'DOMAIN', target: hostname, options: [], source: evidenceType };
  }
  return { status: 'REVIEW', reason: 'unsupported-evidence' };
}

export function compileRuleSets({ sources = {}, psl, denylist = [], controlPlane = [], shadowExceptions = [], sourceLockDigest = '' } = {}) {
  const parsed = normalizePolicySources(sources);
  const rulesByPolicy = {};
  for (const policy of POLICIES) {
    for (const rule of parsed[policy]) {
      if (rule.type === 'DOMAIN-SUFFIX') {
        const gate = suffixSafetyGate(rule.target, { psl, policy, denylist, controlPlane, existingRulesByPolicy: {}, automatic: rule.source !== 'manual' && rule.source !== 'override' });
        if (!gate.ok) fail(`${policy} suffix safety gate: ${gate.reason}: ${rule.target}`);
      }
    }
    rulesByPolicy[policy] = deduplicatePolicyRules(parsed[policy]);
  }
  const conflicts = [];
  for (let leftIndex = 0; leftIndex < POLICIES.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < POLICIES.length; rightIndex += 1) {
      const leftPolicy = POLICIES[leftIndex];
      const rightPolicy = POLICIES[rightIndex];
      for (const left of rulesByPolicy[leftPolicy]) {
        for (const right of rulesByPolicy[rightPolicy]) {
          if (rulesOverlap(left, right)) {
            const conflict = { policyA: leftPolicy, policyB: rightPolicy, ruleA: left, ruleB: right };
            if (!allowsShadow({ ...left, policy: leftPolicy }, { ...right, policy: rightPolicy }, shadowExceptions)) conflicts.push(conflict);
          }
        }
      }
    }
  }
  if (conflicts.length) fail(`cross-policy rule conflict: ${JSON.stringify(conflicts[0])}`);
  const rendered = Object.fromEntries(POLICIES.map((policy) => [policy, renderRuleSet(policy, rulesByPolicy[policy], { sourceLockDigest })]));
  const manifest = createManifest({ rulesByPolicy, sourceLockDigest, rendered });
  const ledger = createPublicLedger(rulesByPolicy);
  return { rulesByPolicy, rendered, manifest, ledger, conflicts };
}

export function renderRuleSet(policy, rules, { sourceLockDigest = '' } = {}) {
  const normalized = deduplicatePolicyRules(rules).sort(ruleSort);
  const counts = Object.fromEntries(RULE_TYPE_ORDER.map((type) => [type, normalized.filter((rule) => rule.type === type).length]));
  const lines = [
    `# Generated by fallback-rule-compiler ${GENERATOR_VERSION}`,
    `# Policy: ${policy}`,
    `# Rules: ${normalized.length}`,
    `# Counts: ${RULE_TYPE_ORDER.map((type) => `${type}=${counts[type]}`).join(',')}`,
    `# Source lock: ${sourceLockDigest || 'none'}`,
    ...normalized.map((rule) => [rule.type, rule.target, ...rule.options].join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

export function createManifest({ rulesByPolicy = {}, sourceLockDigest = '', rendered = {}, nodeVersion = process.version } = {}) {
  const rules = {};
  for (const policy of POLICIES) {
    const text = rendered[policy] ?? renderRuleSet(policy, rulesByPolicy[policy] ?? [], { sourceLockDigest });
    const list = rulesByPolicy[policy] ?? [];
    const counts = Object.fromEntries(RULE_TYPE_ORDER.map((type) => [type, list.filter((rule) => rule.type === type).length]));
    rules[policy] = { count: list.length, counts, sha256: sha256(text) };
  }
  return { schema: 1, generator_version: GENERATOR_VERSION, node_version: nodeVersion, source_lock_sha256: sourceLockDigest || null, rules };
}

export function createPublicLedger(rulesByPolicy = {}) {
  const entries = [];
  for (const policy of POLICIES) {
    for (const rule of deduplicatePolicyRules(rulesByPolicy[policy] ?? [])) {
      const semantic = `${policy}\n${rule.type}\n${rule.target}\n${rule.options.join(',')}\n`;
      entries.push({ proposal_id: sha256(semantic), policy, type: rule.type, target: rule.target, options: [...rule.options] });
    }
  }
  return entries.sort((a, b) => compareBytes(a.proposal_id, b.proposal_id));
}
