import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';

const MAX_EVENT_BYTES = 96 * 1024;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_ITEMS = 256;
const root = resolve(process.cwd());

function fail(message) {
  process.stderr.write(`intake rejected: ${message}\n`);
  process.exit(1);
}

function safeName(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,95}$/.test(value);
}

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) fail('event path missing');
  let raw;
  try {
    raw = readFileSync(eventPath);
  } catch {
    fail('event file unreadable');
  }
  if (raw.byteLength > MAX_EVENT_BYTES) fail('event file too large');
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    fail('event file invalid');
  }
  const payload = event?.inputs?.payload;
  if (typeof payload !== 'string' || Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) fail('payload missing or too large');
  return payload;
}

function validDomain(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 253 || /[\u0000-\u001f\u007f\s,]/.test(value)) return false;
  const labels = value.toLowerCase().replace(/\.$/, '').split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

function validAddress(kind, value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\s,]/.test(value)) return false;
  const version = isIP(value);
  return (kind === '4' && version === 4) || (kind === '6' && version === 6);
}

function parsePayload(encoded) {
  let payload;
  try {
    payload = JSON.parse(encoded);
  } catch {
    fail('payload invalid');
  }
  if (!Array.isArray(payload) || payload.length !== 4 || payload[0] !== 1 || !safeName(payload[1]) || !/^\d{8}$/.test(payload[2]) || !Array.isArray(payload[3]) || payload[3].length > MAX_ITEMS) {
    fail('payload schema invalid');
  }
  const seen = new Set();
  const targets = [];
  for (const item of payload[3]) {
    if (!Array.isArray(item) || item.length !== 2 || !['d', '4', '6'].includes(item[0]) || typeof item[1] !== 'string') fail('target schema invalid');
    const [kind, rawValue] = item;
    const value = rawValue.toLowerCase().replace(/\.$/, '');
    if ((kind === 'd' && !validDomain(value)) || (kind !== 'd' && !validAddress(kind, value))) fail('target value invalid');
    const key = `${kind}\u0000${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ kind, value });
  }
  targets.sort((left, right) => `${left.kind}\u0000${left.value}`.localeCompare(`${right.kind}\u0000${right.value}`));
  return { schema_version: 1, batch_id: payload[1], device_date: payload[2], targets };
}

function shardFor(value) {
  let hash = 2166136261;
  for (const byte of Buffer.from(value, 'utf8')) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 2);
}

function assertRegularFile(path) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('state path is not a regular file');
}

function atomicJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 });
  assertRegularFile(path);
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
}

const encoded = readEvent();
const transportSha256 = createHash('sha256').update(encoded).digest('hex');
const parsed = parsePayload(encoded);
const receivedDate = new Date().toISOString().slice(0, 10);

if (process.env.MODE === 'persist') {
  const ledgerPath = join(root, 'Inbox', 'batches', `${parsed.batch_id}.json`);
  if (existsSync(ledgerPath)) {
    assertRegularFile(ledgerPath);
    const previous = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    if (previous.transport_sha256 !== transportSha256) fail('batch id was replayed with a different payload');
    process.stdout.write('batch already persisted\n');
    process.exit(0);
  }
  const grouped = new Map();
  for (const target of parsed.targets) {
    const shard = shardFor(`${target.kind}\u0000${target.value}`);
    if (!grouped.has(shard)) grouped.set(shard, []);
    grouped.get(shard).push(target);
  }
  for (const [shard, targets] of grouped) {
    const statePath = join(root, 'Inbox', 'observations', `${shard}.json`);
    const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
    assertRegularFile(statePath);
    const days = new Set();
    for (const record of Object.values(state)) {
      if (Array.isArray(record.seen_dates)) for (const date of record.seen_dates) days.add(date);
    }
    for (const target of targets) {
      const key = `${target.kind}:${target.value}`;
      const current = state[key] || { value: target.value, kind: target.kind, first_seen: receivedDate, last_seen: receivedDate, seen_dates: [] };
      current.first_seen = current.first_seen < receivedDate ? current.first_seen : receivedDate;
      current.last_seen = current.last_seen > receivedDate ? current.last_seen : receivedDate;
      current.seen_dates = [...new Set([...current.seen_dates, receivedDate])].sort().slice(-180);
      current.seen_days = current.seen_dates.length;
      state[key] = current;
      days.add(receivedDate);
    }
    atomicJson(statePath, state);
  }
  atomicJson(ledgerPath, { schema_version: 1, batch_id: parsed.batch_id, transport_sha256: transportSha256, received_at: receivedDate, target_count: parsed.targets.length, status: 'persisted' });
}

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) writeFileSync(outputFile, `transport_sha256=${transportSha256}\nitem_count=${parsed.targets.length}\n`, { flag: 'a' });
process.stdout.write('intake validated\n');
