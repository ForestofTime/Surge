#!/usr/bin/env node
// lint-sgmodule.mjs
// Surge [Script] 段是「名称 = 参数」字典：同名后者静默覆盖前者。
// 本工具扫描所有 .sgmodule 模块，检测 (1) 模块内同名 [Script] 规则（硬错误）
// 与 (2) 跨模块同名 [Script] 规则（警告，可能同时启用时互相覆盖）。
//
// 用法：node Automation/lint-sgmodule.mjs [repo-root]
// 退出码：发现模块内重名 -> 1；否则 0

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || process.cwd();
const moduleDir = join(root, 'Module');

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.sgmodule')) out.push(p);
  }
  return out;
}

const SECTION_RE = /^\[([^\]]+)\]/;
const files = walk(moduleDir).sort();
if (files.length === 0) {
  console.error(`未在 ${moduleDir} 找到任何 .sgmodule 文件`);
  process.exit(0);
}

// 每个文件内的 [Script] 规则：name -> 出现行号列表
const perFile = new Map();
// 跨文件：name -> Set(相对路径)
const crossModule = new Map();

for (const file of files) {
  const rel = relative(root, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  let inScript = false;
  const names = new Map();
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const sec = line.match(SECTION_RE);
    if (sec) {
      inScript = sec[1].trim() === 'Script';
      continue;
    }
    if (!inScript) continue;
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim();
    if (name === '') continue;
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(i + 1);
    if (!crossModule.has(name)) crossModule.set(name, new Set());
    crossModule.get(name).add(rel);
  }
  perFile.set(rel, names);
}

let errors = 0;
let warnings = 0;

console.log('=== .sgmodule [Script] 同名检测 ===\n');
for (const [rel, names] of perFile) {
  for (const [name, locs] of names) {
    if (locs.length > 1) {
      errors++;
      console.error(`❌ [模块内重名] ${rel}\n   规则名「${name}」出现 ${locs.length} 次（行 ${locs.join(', ')}）—— 仅最后一条生效，其余被静默覆盖`);
    }
  }
}

for (const [name, set] of crossModule) {
  if (set.size > 1) {
    warnings++;
    console.warn(`⚠️  [跨模块重名] 「${name}」同时存在于 ${[...set].join(', ')} —— 若同时启用会互相覆盖`);
  }
}

console.log('');
if (errors > 0) {
  console.error(`结果：发现 ${errors} 处模块内同名 [Script] 规则（必须修复）`);
  process.exit(1);
}
if (warnings > 0) {
  console.log(`结果：模块内无重名 ✓  （${warnings} 处跨模块重名仅为警告，请人工确认是否同时启用）`);
} else {
  console.log('结果：未发现任何同名 [Script] 规则 ✓');
}
process.exit(0);
