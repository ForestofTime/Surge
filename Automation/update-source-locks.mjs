import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SOURCES_PATH = resolve(ROOT, 'Automation/sources.json');
const LOCKS_PATH = resolve(ROOT, 'Automation/sources.lock.json');
const MAX_REDIRECTS = 0;
const TIMEOUT_MS = 15_000;

function fail(message) {
  process.stderr.write(`source lock update stopped: ${message}\n`);
  process.exit(1);
}

function parseJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('configuration is invalid');
  }
}

async function request(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { headers, redirect: 'manual', signal: controller.signal });
  } catch {
    fail('source request failed');
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 300 && response.status < 400) fail('redirect is forbidden');
  return response;
}

function sourceUrl(source, commit) {
  return source.url.replace('{commit}', commit);
}

function countEntries(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#')).length;
}

function validateSourceText(source, text) {
  if (Buffer.byteLength(text, 'utf8') > source.max_bytes) fail('source exceeds configured size limit');
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('.')) {
      if (!source.allowed_rule_types.includes('DOMAIN-SUFFIX') || !/^[a-z0-9.-]+$/.test(trimmed.slice(1)) || trimmed.length > 254) {
        fail('source contains an invalid DOMAIN-SET entry');
      }
      continue;
    }
    const comma = trimmed.indexOf(',');
    if (comma === -1 && /^[a-z0-9.-]+$/.test(trimmed) && trimmed.includes('.')) {
      continue;
    }
    if (comma <= 0 || comma === trimmed.length - 1) fail('source contains malformed rule');
    const type = trimmed.slice(0, comma);
    const value = trimmed.slice(comma + 1);
    if (!source.allowed_rule_types.includes(type)) fail('source contains an unapproved rule type');
    if (!/^[\x21-\x7e]+$/.test(value)) fail('source contains invalid characters');
  }
}

const sources = parseJson(SOURCES_PATH);
const locks = parseJson(LOCKS_PATH);
if (sources.schema_version !== 1 || locks.schema_version !== 1 || !Array.isArray(sources.sources) || !Array.isArray(locks.sources)) {
  fail('unsupported lock schema');
}
const locksById = new Map(locks.sources.map((lock) => [lock.source_id, lock]));
let changed = false;

for (const source of sources.sources) {
  if (!source.enabled) continue;
  const current = locksById.get(source.source_id);
  if (!current) fail('enabled source is absent from lock');
  const apiUrl = `https://api.github.com/repos/${source.repo}/commits?path=${encodeURIComponent(source.path)}&per_page=1`;
  const apiResponse = await request(apiUrl, {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2026-03-10',
    'user-agent': 'fallback-rule-learning-lock-updater/1'
  });
  if (!apiResponse.ok) fail('source commit lookup failed');
  let commits;
  try {
    commits = await apiResponse.json();
  } catch {
    fail('source commit response is invalid');
  }
  const commit = commits?.[0]?.sha;
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) fail('source commit is not a full SHA');
  if (commit === current.commit) continue;

  const rawResponse = await request(sourceUrl(source, commit), {
    accept: 'text/plain',
    'user-agent': 'fallback-rule-learning-lock-updater/1'
  });
  if (!rawResponse.ok) fail('source content download failed');
  const text = await rawResponse.text();
  validateSourceText(source, text);
  const entryCount = countEntries(text);
  if (!Number.isInteger(current.entry_count) || current.entry_count < 0) fail('existing lock has no entry baseline');
  const ratio = Math.abs(entryCount - current.entry_count) / Math.max(current.entry_count, 1);
  if (ratio > source.max_entry_delta_ratio) fail('source entry delta exceeds review threshold');
  const contentSha256 = createHash('sha256').update(text).digest('hex');
  locksById.set(source.source_id, {
    ...current,
    commit,
    content_sha256: contentSha256,
    entry_count: entryCount,
    verified_at: new Date().toISOString()
  });
  changed = true;
}

if (!changed) {
  process.stdout.write('source locks are current\n');
  process.exit(0);
}

const next = {
  ...locks,
  updated_at: new Date().toISOString(),
  sources: [...locksById.values()].sort((a, b) => a.source_id.localeCompare(b.source_id))
};
writeFileSync(LOCKS_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
process.stdout.write('source lock changes prepared for review\n');
