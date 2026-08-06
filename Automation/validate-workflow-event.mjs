import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';

const MAX_EVENT_BYTES = 96 * 1024;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_RULES = 256;
const DOMAIN_TYPES = new Set(['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD']);
const IP_TYPES = new Set(['IP-CIDR', 'IP-CIDR6']);
const POLICY_NAMES = new Set(['DIRECT', 'PROXY']);

function fail(message) {
  process.stderr.write(`workflow input rejected: ${message}\n`);
  process.exit(1);
}

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) fail('GITHUB_EVENT_PATH is not set');
  let raw;
  try {
    raw = readFileSync(eventPath);
  } catch {
    fail('event file is unreadable');
  }
  if (raw.byteLength > MAX_EVENT_BYTES) fail('event file is too large');
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    fail('event file is not JSON');
  }
}

function stringField(value, name, pattern, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || !pattern.test(value)) {
    fail(`invalid ${name}`);
  }
  return value;
}

function validDomain(value, type) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253 || /[\u0000-\u001f\u007f\s,]/.test(value)) {
    return false;
  }
  const domain = value.toLowerCase().replace(/\.$/, '');
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => label.length < 1 || label.length > 63)) return false;
  if (type === 'DOMAIN-SUFFIX' && labels.length < 2) return false;
  if (type !== 'DOMAIN-KEYWORD' && labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return false;
  if (type === 'DOMAIN-KEYWORD' && !/^[a-z0-9._*-]+$/.test(domain)) return false;
  return true;
}

function validCidr(value, family) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\s,]/.test(value)) return false;
  const [address, prefixText, extra] = value.split('/');
  if (!address || prefixText === undefined || extra !== undefined) return false;
  const version = isIP(address);
  const maxPrefix = version === 4 ? 32 : version === 6 ? 128 : 0;
  if ((family === 'IP-CIDR' && version !== 4) || (family === 'IP-CIDR6' && version !== 6)) return false;
  if (!/^\d+$/.test(prefixText)) return false;
  const prefix = Number(prefixText);
  return maxPrefix > 0 && prefix >= 0 && prefix <= maxPrefix;
}

function parseProposal(event) {
  if (event?.inputs === undefined || typeof event.inputs !== 'object' || Array.isArray(event.inputs)) {
    fail('workflow_dispatch inputs are missing');
  }
  const encoded = event.inputs.proposal;
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded, 'utf8') > MAX_PAYLOAD_BYTES) {
    fail('proposal input is missing or too large');
  }
  let proposal;
  try {
    proposal = JSON.parse(encoded);
  } catch {
    fail('proposal is not JSON');
  }
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) fail('proposal must be an object');
  if (proposal.schema_version !== 1) fail('unsupported proposal schema');
  stringField(proposal.proposal_id, 'proposal_id', /^[0-9a-f]{64}$/, 64);
  stringField(proposal.lock_digest, 'lock_digest', /^[0-9a-f]{64}$/, 64);
  if (!Array.isArray(proposal.rules) || proposal.rules.length > MAX_RULES) fail('invalid rule list');

  const seen = new Set();
  const rules = proposal.rules.map((rule, index) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) fail(`invalid rule at index ${index}`);
    const policy = stringField(rule.policy, 'rule policy', /^(DIRECT|PROXY)$/, 6);
    const type = stringField(rule.type, 'rule type', /^(DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|IP-CIDR|IP-CIDR6)$/, 16);
    const value = stringField(rule.value, 'rule value', /^[\x21-\x7e]+$/, 253);
    const override = rule.override === undefined ? false : rule.override;
    if (typeof override !== 'boolean') fail(`invalid override flag at index ${index}`);
    const options = rule.options === undefined ? [] : rule.options;
    if (!Array.isArray(options) || options.some((option) => option !== 'no-resolve') || new Set(options).size !== options.length) {
      fail(`invalid rule options at index ${index}`);
    }
    if (!POLICY_NAMES.has(policy)) fail('unsupported policy');
    if (DOMAIN_TYPES.has(type) && options.length) fail(`invalid domain options at index ${index}`);
    if (DOMAIN_TYPES.has(type) && !validDomain(value, type)) fail(`invalid domain at index ${index}`);
    if (IP_TYPES.has(type) && !validCidr(value, type)) fail(`invalid CIDR at index ${index}`);
    const normalized = `${policy}\u0000${type}\u0000${value.toLowerCase().replace(/\.$/, '')}\u0000${options.join(',')}`;
    if (seen.has(normalized)) fail(`duplicate rule at index ${index}`);
    seen.add(normalized);
    return {
      policy,
      type,
      value: value.toLowerCase().replace(/\.$/, ''),
      ...(options.length ? { options: [...options] } : {}),
      ...(override ? { override: true } : {}),
    };
  });

  for (let leftIndex = 0; leftIndex < rules.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rules.length; rightIndex += 1) {
      const left = rules[leftIndex];
      const right = rules[rightIndex];
      if (left.policy === right.policy) continue;
      const domainOverlap = DOMAIN_TYPES.has(left.type) && DOMAIN_TYPES.has(right.type) && (
        left.value === right.value ||
        (left.type === 'DOMAIN-SUFFIX' && right.value.endsWith(`.${left.value}`)) ||
        (right.type === 'DOMAIN-SUFFIX' && left.value.endsWith(`.${right.value}`)) ||
        (left.type === 'DOMAIN-KEYWORD' && right.value.includes(left.value)) ||
        (right.type === 'DOMAIN-KEYWORD' && left.value.includes(right.value))
      );
      const ipOverlap = IP_TYPES.has(left.type) && IP_TYPES.has(right.type) && left.value === right.value;
      if (domainOverlap || ipOverlap) fail('cross-policy rule overlap');
    }
  }

  const normalizedProposal = {
    schema_version: 1,
    lock_digest: proposal.lock_digest,
    rules
  };
  const expectedProposalId = createHash('sha256').update(`${JSON.stringify(normalizedProposal)}\n`).digest('hex');
  if (proposal.proposal_id !== expectedProposalId) fail('proposal id does not match canonical proposal');
  return { ...normalizedProposal, proposal_id: proposal.proposal_id };
}

const event = readEvent();
const proposal = parseProposal(event);
const canonical = `${JSON.stringify(proposal)}\n`;
const digest = createHash('sha256').update(canonical).digest('hex');
const workspace = process.cwd();
const outputDir = resolve(workspace, '.work');
mkdirSync(outputDir, { recursive: true, mode: 0o700 });
const outputPath = resolve(outputDir, 'fallback-proposal.json');
writeFileSync(outputPath, canonical, { encoding: 'utf8', mode: 0o600 });

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  writeFileSync(outputFile, `proposal_sha256=${digest}\nrule_count=${proposal.rules.length}\nlock_digest=${proposal.lock_digest}\n`, { flag: 'a' });
}
process.stdout.write('workflow input validated\n');
