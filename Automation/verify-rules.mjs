#!/usr/bin/env node

import { lstat, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POLICIES,
  PublicSuffixList,
  compileRuleSets,
  parsePublicSuffixList,
} from './rule-compiler.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    args[key] = value;
  }
  return args;
}

export async function verifyRuleFiles({ ruleDir = 'Rule', psl = 'Automation/vendor/public_suffix_list.dat', policies = POLICIES } = {}) {
  const selectedPolicies = typeof policies === 'string' ? policies.split(',').map((item) => item.trim()).filter(Boolean) : policies;
  if (!Array.isArray(selectedPolicies) || selectedPolicies.length === 0 || selectedPolicies.some((policy) => !POLICIES.includes(policy))) throw new Error('invalid policy selection');
  const ruleRoot = resolve(ruleDir);
  const outputRoot = resolve(dirname(ruleRoot));
  const ensureWithin = (root, path) => {
    const rootPath = resolve(root);
    const targetPath = resolve(path);
    const child = relative(rootPath, targetPath);
    if (targetPath !== rootPath && (!child || child === '..' || child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(child))) throw new Error(`path is outside output root: ${path}`);
    return targetPath;
  };
  const assertRegular = async (path, root) => {
    const target = ensureWithin(root, path);
    let current = target;
    const rootPath = resolve(root);
    while (true) {
      let stat;
      try {
        stat = await lstat(current);
      } catch (error) {
        throw new Error(`missing generated file: ${current}: ${error.code ?? error.message}`);
      }
      if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${current}`);
      if (current === rootPath) break;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    const stat = await lstat(target);
    if (!stat.isFile()) throw new Error(`generated path is not a regular file: ${target}`);
    return target;
  };
  const sources = {};
  for (const policy of selectedPolicies) {
    const path = await assertRegular(join(ruleRoot, `${policy}+.list`), ruleRoot);
    sources[policy] = [{ source: 'manual', text: await readFile(path, 'utf8') }];
  }
  const absolutePsl = resolve(psl);
  const pslPath = await assertRegular(absolutePsl, dirname(absolutePsl));
  const suffixes = new PublicSuffixList(parsePublicSuffixList(await readFile(pslPath, 'utf8')));
  const manifestPath = await assertRegular(join(outputRoot, 'manifest.json'), outputRoot);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error('manifest is invalid JSON');
  }
  if (manifest.source_lock_sha256 !== null && !/^[0-9a-f]{64}$/u.test(manifest.source_lock_sha256 ?? '')) throw new Error('manifest source lock digest is invalid');
  const result = compileRuleSets({ sources, psl: suffixes, sourceLockDigest: manifest.source_lock_sha256 ?? '' });
  for (const policy of selectedPolicies) {
    const actual = await readFile(join(ruleRoot, `${policy}+.list`), 'utf8');
    if (actual !== result.rendered[policy]) throw new Error(`rendered output mismatch: ${policy}`);
  }
  if (JSON.stringify(manifest) !== JSON.stringify(result.manifest)) throw new Error('manifest mismatch');
  return result;
}

async function main() {
  const result = await verifyRuleFiles(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result.manifest)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`verify-rules: ${error.message}\n`);
    process.exitCode = 1;
  });
}
