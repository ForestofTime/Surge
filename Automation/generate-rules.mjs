#!/usr/bin/env node

import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POLICIES,
  PublicSuffixList,
  compileRuleSets,
  createManifest,
  normalizeRule,
  parseRuleText,
  parsePublicSuffixList,
  renderRuleSet,
  sha256,
} from './rule-compiler.mjs';

const PUBLISH_POLICIES = Object.freeze(['Direct', 'Proxy']);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'check-only') {
      args[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    args[key] = value;
  }
  return args;
}

async function readRequired(path) {
  try {
    return await readFile(resolve(path), 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error.code ?? error.message}`);
  }
}

async function readOptional(path, fallback = '') {
  try {
    return await readFile(resolve(path), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readJson(path) {
  const text = await readRequired(path);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON: ${path}`);
  }
}

function ensureWithin(root, target) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  const child = relative(rootPath, targetPath);
  if (targetPath !== rootPath && (!child || child === '..' || child.startsWith(`..${pathSeparator()}`) || isAbsolute(child))) {
    throw new Error(`path is outside output root: ${target}`);
  }
  return targetPath;
}

function pathSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}

async function rejectSymlinkPath(path, root) {
  const rootPath = resolve(root);
  const targetPath = ensureWithin(rootPath, path);
  let current = targetPath;
  while (true) {
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current === rootPath) break;
    const parent = dirname(current);
    if (parent === current || (!relative(rootPath, parent) && parent !== rootPath)) break;
    current = parent;
  }
  return targetPath;
}

async function writeIfChanged(path, content, { root } = {}) {
  const outputRoot = root ?? dirname(resolve(path));
  const absolute = await rejectSymlinkPath(path, outputRoot);
  await mkdir(dirname(absolute), { recursive: true });
  await rejectSymlinkPath(absolute, outputRoot);
  let old = null;
  try {
    old = await readFile(absolute, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (old === content) return false;
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
  return true;
}

function canonicalDigest(value) {
  return sha256(`${JSON.stringify(value)}\n`);
}

function resolveFrom(root, path) {
  return resolve(root, path);
}

function normalizeConfigEntries(config, key) {
  const values = config?.[key];
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw new Error(`invalid control-plane ${key}`);
  return values;
}

function validateShadowExceptions(value) {
  const entries = Array.isArray(value) ? value : value?.entries;
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) throw new Error('invalid shadow exceptions');
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || entry.profile_order === undefined || typeof entry.reason !== 'string' || typeof entry.owner !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(entry.expires)) {
      throw new Error('shadow exception requires profile_order, reason, owner, and YYYY-MM-DD expires');
    }
    if (entry.expires < new Date().toISOString().slice(0, 10)) throw new Error('shadow exception is expired');
  }
  return entries;
}

async function loadSecurityConfig(options, sourceRoot, proposalMode) {
  const configPath = (value, fallback) => {
    if (value === undefined || value === null) return fallback;
    return isAbsolute(value) ? value : resolveFrom(sourceRoot, value);
  };
  const defaultPath = (relativePath) => {
    const candidate = resolveFrom(sourceRoot, relativePath);
    return proposalMode ? candidate : null;
  };
  const controlPath = configPath(options.controlPlane ?? options['control-plane'], defaultPath('Automation/control-plane.json'));
  const sourceLockPath = configPath(options.sourceLock ?? options['source-lock'], defaultPath('Automation/sources.lock.json'));
  const shadowPath = configPath(options.shadowExceptions ?? options['shadow-exceptions'], defaultPath('Automation/shadow-exceptions.json'));
  const control = controlPath ? await readJson(controlPath) : {};
  if (control.schema_version !== undefined && control.schema_version !== 1) throw new Error('unsupported control-plane schema');
  const sourceLock = sourceLockPath ? await readJson(sourceLockPath) : null;
  if (sourceLock) {
    if (sourceLock.schema_version !== 1 || !Array.isArray(sourceLock.sources)) throw new Error('invalid source lock');
    for (const source of sourceLock.sources) {
      if (!/^[0-9a-f]{40}$/u.test(source.commit ?? '') || !/^[0-9a-f]{64}$/u.test(source.content_sha256 ?? '')) throw new Error('invalid source lock digest');
    }
  }
  const shadow = shadowPath ? await readJson(shadowPath) : [];
  const snapshotPath = configPath(options.psl ?? options['psl-path'], defaultPath(control.psl?.snapshot_path ?? 'Automation/vendor/public_suffix_list.dat'));
  const pslLockPath = configPath(options.pslLock ?? options['psl-lock'], defaultPath(control.psl?.lock_path ?? 'Automation/vendor/public_suffix_list.lock.json'));
  const pslLock = pslLockPath ? await readJson(pslLockPath) : null;
  if (pslLock) {
    if (pslLock.schema_version !== 1) throw new Error('invalid PSL lock');
    if (control.psl?.require_ready_snapshot === true && pslLock.ready !== true) throw new Error('PSL snapshot is not ready');
    if (pslLock.ready === true && /^[0-9a-f]{64}$/u.test(pslLock.sha256 ?? '') && snapshotPath) {
      const snapshot = await readRequired(snapshotPath);
      if (sha256(snapshot) !== pslLock.sha256) throw new Error('PSL snapshot hash mismatch');
    }
  }
  const sourceLockDigest = sourceLock ? canonicalDigest(sourceLock) : '';
  const requestedDigest = options.sourceLockDigest ?? options['source-lock-digest'] ?? '';
  if (requestedDigest && !/^[0-9a-f]{64}$/u.test(requestedDigest)) throw new Error('invalid source lock digest');
  if (requestedDigest && sourceLockDigest && requestedDigest !== sourceLockDigest) throw new Error('source lock digest mismatch');
  return {
    control,
    denylist: normalizeConfigEntries(control, 'never_learn_suffixes'),
    controlPlane: normalizeConfigEntries(control, 'never_capture_hosts'),
    shadowExceptions: validateShadowExceptions(shadow),
    sourceLockDigest: requestedDigest || sourceLockDigest,
    snapshotPath,
  };
}

function proposalRule(rule) {
  if (!rule || typeof rule !== 'object') throw new Error('invalid proposal rule');
  const policy = String(rule.policy ?? '').toUpperCase();
  if (policy !== 'DIRECT' && policy !== 'PROXY') throw new Error('proposal policy must be DIRECT or PROXY');
  if (rule.override !== undefined && rule.override !== true) throw new Error('proposal override flag is invalid');
  const type = String(rule.type ?? '').toUpperCase();
  const target = rule.value ?? rule.target;
  const normalized = normalizeRule({ type, target, options: rule.options ?? [], source: rule.override === true ? 'override' : 'auto', policy: policy[0] + policy.slice(1).toLowerCase() });
  return normalized;
}

async function readRuleSource(path, source, policy) {
  const text = await readOptional(path);
  return text ? parseRuleText(text, { source, policy }) : [];
}

async function generateFromProposal(options) {
  const sourceRoot = resolve(options.sourceRoot ?? process.cwd());
  const outputArg = options.outputRoot ?? options['output-root'];
  if (!outputArg) throw new Error('--output-root is required');
  const outputRoot = resolve(outputArg);
  const proposalPath = options.proposalFile ?? options['proposal-file'];
  if (!proposalPath) throw new Error('--proposal-file is required');
  const proposal = await readJson(proposalPath);
  if (proposal.schema_version !== 1 || typeof proposal.proposal_id !== 'string' || !/^[0-9a-f]{64}$/u.test(proposal.proposal_id) || !/^[0-9a-f]{64}$/u.test(proposal.lock_digest ?? '') || !Array.isArray(proposal.rules) || proposal.rules.length > 256) {
    throw new Error('invalid proposal');
  }
  await mkdir(outputRoot, { recursive: true });
  await rejectSymlinkPath(outputRoot, outputRoot);
  const security = await loadSecurityConfig(options, sourceRoot, true);
  if (proposal.lock_digest !== security.sourceLockDigest) throw new Error('proposal source lock digest mismatch');
  const pslText = await readRequired(security.snapshotPath);
  const psl = new PublicSuffixList(parsePublicSuffixList(pslText));
  const sources = {};
  for (const policy of PUBLISH_POLICIES) {
    const manual = await readRuleSource(resolveFrom(sourceRoot, `Source/${policy}+.list`), 'manual', policy);
    const autoPath = resolveFrom(outputRoot, `Source/Auto/${policy}+.list`);
    await rejectSymlinkPath(autoPath, outputRoot);
    const auto = await readRuleSource(autoPath, 'auto', policy);
    sources[policy] = [...manual, ...auto];
  }
  for (const rule of proposal.rules) {
    const normalized = proposalRule(rule);
    sources[normalized.policy].push(normalized);
  }
  const result = compileRuleSets({ ...security, sources, psl });
  const generatedPolicies = ['Direct', 'Proxy'];
  const autoByPolicy = Object.fromEntries(generatedPolicies.map((policy) => [policy, result.rulesByPolicy[policy].filter((rule) => rule.source !== 'manual' && rule.source !== 'override')]));
  const generatedRulesByPolicy = { Direct: result.rulesByPolicy.Direct, Proxy: result.rulesByPolicy.Proxy, Reject: [] };
  const generatedRendered = Object.fromEntries(generatedPolicies.map((policy) => [policy, result.rendered[policy]]));
  const generatedManifest = createManifest({ rulesByPolicy: generatedRulesByPolicy, sourceLockDigest: security.sourceLockDigest, rendered: generatedRendered });
  const processedPath = join(outputRoot, 'proposals/processed.json');
  await rejectSymlinkPath(processedPath, outputRoot);
  const oldProcessed = await readOptional(processedPath, '[]');
  let processed;
  try { processed = JSON.parse(oldProcessed); } catch { throw new Error('invalid processed ledger'); }
  if (!Array.isArray(processed)) processed = processed.entries;
  if (!Array.isArray(processed)) throw new Error('invalid processed ledger');
  const byId = new Map(processed.filter((entry) => entry && typeof entry.proposal_id === 'string').map((entry) => [entry.proposal_id, entry]));
  byId.set(proposal.proposal_id, { proposal_id: proposal.proposal_id, lock_digest: proposal.lock_digest, rules_sha256: sha256(JSON.stringify(proposal.rules)) });
  const ledger = [...byId.values()].sort((a, b) => a.proposal_id.localeCompare(b.proposal_id));
  for (const policy of generatedPolicies) {
    await writeIfChanged(join(outputRoot, `Source/Auto/${policy}+.list`), renderRuleSet(policy, autoByPolicy[policy], { sourceLockDigest: security.sourceLockDigest }), { root: outputRoot });
    await writeIfChanged(join(outputRoot, `Rule/${policy}+.list`), generatedRendered[policy], { root: outputRoot });
  }
  await writeIfChanged(join(outputRoot, 'manifest.json'), `${JSON.stringify(generatedManifest, null, 2)}\n`, { root: outputRoot });
  await writeIfChanged(processedPath, `${JSON.stringify(ledger, null, 2)}\n`, { root: outputRoot });
  return { ...result, manifest: generatedManifest, rendered: generatedRendered, proposal, ledger };
}

export async function generateFromFiles(options = {}) {
  if (options.proposalFile ?? options['proposal-file']) return generateFromProposal(options);
  const sourceDir = options.sourceDir ?? 'Source';
  const pslPath = options.psl ?? 'Automation/vendor/public_suffix_list.dat';
  const sourcePaths = Object.fromEntries(POLICIES.map((policy) => [
    policy,
    options[policy.toLowerCase()] ?? `${sourceDir}/${policy}+.list`,
  ]));
  const sources = {};
  for (const policy of POLICIES) {
    sources[policy] = [{ source: 'manual', text: await readRequired(sourcePaths[policy]) }];
  }
  const security = await loadSecurityConfig(options, process.cwd(), false);
  const psl = new PublicSuffixList(parsePublicSuffixList(await readRequired(pslPath)));
  const result = compileRuleSets({
    sources,
    psl,
    ...security,
  });
  if (!options.checkOnly) {
    const outputDir = options.outputDir ?? 'Rule';
    for (const policy of POLICIES) await writeIfChanged(`${outputDir}/${policy}+.list`, result.rendered[policy], { root: outputDir });
    if (options.manifest) await writeIfChanged(options.manifest, `${JSON.stringify(result.manifest, null, 2)}\n`, { root: dirname(options.manifest) });
    if (options.ledger) await writeIfChanged(options.ledger, `${JSON.stringify(result.ledger, null, 2)}\n`, { root: dirname(options.ledger) });
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await generateFromFiles(args);
  process.stdout.write(`${JSON.stringify(result.manifest)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`generate-rules: ${error.message}\n`);
    process.exitCode = 1;
  });
}
