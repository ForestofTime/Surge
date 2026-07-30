import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';

const proposalPath = process.env.PROPOSAL_PATH;
const token = process.env.GH_TOKEN;
const repository = process.env.PUBLIC_REPOSITORY;
const workflow = 'publish-fallback.yml';
const ref = 'main';
const DOMAIN_TYPES = new Set(['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD']);
const IP_TYPES = new Set(['IP-CIDR', 'IP-CIDR6']);

function validCidr(value, type) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\s,]/u.test(value)) return false;
  const [address, prefixText, extra] = value.split('/');
  if (!address || prefixText === undefined || extra !== undefined) return false;
  const version = isIP(address);
  const maxPrefix = version === 4 ? 32 : version === 6 ? 128 : 0;
  if ((type === 'IP-CIDR' && version !== 4) || (type === 'IP-CIDR6' && version !== 6)) return false;
  if (!/^\d+$/u.test(prefixText)) return false;
  const prefix = Number(prefixText);
  return maxPrefix > 0 && prefix >= 0 && prefix <= maxPrefix;
}
if (process.env.PUBLISH_ENABLED !== 'true') {
  process.stdout.write('public publishing is disabled\n');
  process.exit(0);
}
if (!proposalPath || !token || !repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
  process.stderr.write('proposal dispatch configuration is invalid\n');
  process.exit(2);
}

let proposal;
try {
  proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
} catch {
  process.stderr.write('proposal file is invalid\n');
  process.exit(1);
}
if (!proposal || proposal.schema_version !== 1 || !/^[0-9a-f]{64}$/u.test(proposal.proposal_id) || !/^[0-9a-f]{64}$/u.test(proposal.lock_digest) || !Array.isArray(proposal.rules) || proposal.rules.length > 256) {
  process.stderr.write('proposal schema is invalid\n');
  process.exit(1);
}
for (const rule of proposal.rules) {
  const options = rule && rule.options === undefined ? [] : rule?.options;
  const validOptions = Array.isArray(options) && options.every((option) => option === 'no-resolve') && new Set(options).size === options.length;
  const type = rule?.type;
  const validValue = typeof rule?.value === 'string' && /^[\x21-\x7e]{1,253}$/u.test(rule.value);
  const validType = DOMAIN_TYPES.has(type) || IP_TYPES.has(type);
  const validTarget = validType && validValue && (DOMAIN_TYPES.has(type) ? options.length === 0 : validCidr(rule.value, type));
  if (!rule || !['DIRECT', 'PROXY'].includes(rule.policy) || !validType || !validOptions || !validTarget) {
    process.stderr.write('proposal rule is invalid\n');
    process.exit(1);
  }
}
const encoded = JSON.stringify(proposal);
const expectedProposalId = createHash('sha256').update(`${JSON.stringify({ schema_version: 1, lock_digest: proposal.lock_digest, rules: proposal.rules })}\n`).digest('hex');
if (proposal.proposal_id !== expectedProposalId) {
  process.stderr.write('proposal id is invalid\n');
  process.exit(1);
}
if (Buffer.byteLength(encoded, 'utf8') > 32 * 1024) {
  process.stderr.write('proposal is too large\n');
  process.exit(1);
}
if (proposal.rules.length === 0) {
  process.stdout.write('no public proposal to dispatch\n');
  process.exit(0);
}

const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10_000);
let response;
try {
  response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    signal: controller.signal,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2026-03-10',
      'user-agent': 'surge-fallback-private-classifier/1',
    },
    body: JSON.stringify({ ref, inputs: { proposal: encoded } }),
  });
} catch {
  clearTimeout(timer);
  process.stderr.write('proposal dispatch request failed\n');
  process.exit(1);
}
clearTimeout(timer);
if (response.status >= 300 && response.status < 400) {
  process.stderr.write('proposal dispatch redirect is forbidden\n');
  process.exit(1);
}
if (!response.ok) {
  process.stderr.write('proposal dispatch was rejected\n');
  process.exit(1);
}
const proposalDigest = createHash('sha256').update(encoded, 'utf8').digest('hex');
process.stdout.write(`proposal dispatched: ${proposalDigest}\n`);
