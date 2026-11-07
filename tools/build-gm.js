#!/usr/bin/env node
// gm.js собирается из частей gm-src/NN-*.js (одна общая IIFE: замыкание и порядок те же, что были).
// Правим части в gm-src/, затем: node tools/build-gm.js (потом node tools/bump-versions.js).
//   --check  — проверить, что gm.js соответствует частям (для CI)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dir = path.join(root, 'gm-src');
const parts = fs.readdirSync(dir).filter(f => /^\d+-.*\.js$/.test(f)).sort();
const out = '// ============================================================================\n' +
  '// GM.JS — логика экрана мастера (gm.html). СОБРАНО из gm-src/*.js — не править руками: node tools/build-gm.js\n' +
  '// ============================================================================\n\n(function () {\n' +
  parts.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('') + '})();\n';
const target = path.join(root, 'gm.js');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== out) { console.log('gm.js устарел: запустите node tools/build-gm.js'); process.exit(1); }
  console.log('gm.js соответствует gm-src'); process.exit(0);
}
fs.writeFileSync(target, out); console.log('gm.js собран из ' + parts.length + ' частей, ' + out.split('\n').length + ' строк');
