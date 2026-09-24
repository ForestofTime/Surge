#!/usr/bin/env node
// ABCSplash.js 真实 HAR 数据回归测试
// 用 2026-09-24-170947.har 里的真实响应体做样本

const fs = require('fs');
const vm = require('vm');

const scriptText = fs.readFileSync('/Users/huangyinan/Documents/Surge/JS/ABCSplash.js', 'utf8');
const har = JSON.parse(fs.readFileSync('/tmp/abc.har', 'utf8'));
const entries = har.log.entries;

let pass = 0, fail = 0;
function run(url, body) {
  let payload = null;
  const sandbox = {
    $request: { url },
    $response: { body },
    console: { log: () => {} },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    $done: (p) => { payload = p || {}; },
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { timeout: 3000 });
  return payload;
}

console.log('═══ ① 真实开屏图（1125x2082 JPEG 196KB）→ 应拦截 ═══');
for (const e of entries) {
  const url = e.request.url;
  if (!url.includes('100d20c86f8f4726bdd3f5fa66e7bd6c')) continue;
  const b64 = e.response.content.text;
  const p = run(url, b64);
  const ok = p && p.body && p.headers && p.headers['Content-Type'] === 'image/gif';
  console.log('  拦截返回 tiny-gif:', ok ? '✅' : '❌ ' + JSON.stringify(p).slice(0, 80));
  ok ? pass++ : fail++;
  // 验证 tiny-gif 字节
  if (ok) {
    const gif = Buffer.from(p.body, 'binary');
    const valid = gif.slice(0, 6).toString() === 'GIF89a' && gif.length === 42;
    console.log('  GIF89a 魔数 + 42 字节:', valid ? '✅' : '❌');
    valid ? pass++ : fail++;
  }
}

console.log('═══ ② 真实活动小图 → 应放行 ═══');
const cases = [
  ['670x200 横幅', '6651c257701c4863a416caf86c0f980b9900032820260922'],
  ['319x184', 'cadb73a549474cbab6c1d005cf11cdb69900032820250521'],
  ['1005x231 长横幅', 'b37f7e22f3b7476092581d733814320e9900032820260107'],
  ['323x382 弹窗', '4e935f25543441fabb56504a0b1353549900032820260924'],
];
for (const [label, id] of cases) {
  for (const e of entries) {
    if (!e.request.url.includes(id)) continue;
    const b64 = e.response.content.text;
    if (!b64) { console.log(`  ${label}: 无 body 跳过`); break; }
    const p = run(e.request.url, b64);
    const ok = !p || !p.body;
    console.log(`  ${label} → 放行:`, ok ? '✅' : '❌ 误拦');
    ok ? pass++ : fail++;
    break;
  }
}

console.log('═══ ③ 域名外 URL → 应放行 ═══');
const p3 = run('https://mb.cdn-static.abchina.com.cn/A230192191308-product/x/fallback/www/img/newboy.37835521.png', 'x');
const ok3 = !p3 || !p3.body;
console.log('  mb.cdn URL 放行:', ok3 ? '✅' : '❌');
ok3 ? pass++ : fail++;

console.log(`\n结果: ${pass} 过 / ${fail} 败`);
process.exit(fail ? 1 : 0);
