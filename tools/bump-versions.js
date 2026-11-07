#!/usr/bin/env node
// Версии подключений (?v=...) в HTML считаются сами: это первые 8 символов SHA-1 файла.
// Файл изменился — версия изменилась, у игроков не остаётся старый кэш. Вручную версии больше не вести.
//   node tools/bump-versions.js          — обновить версии в index.html, gm.html, holds.html, test.html
//   node tools/bump-versions.js --check  — только проверить (для CI), выйти с кодом 1, если что-то устарело
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const pages = ['index.html', 'gm.html', 'holds.html', 'test.html'];
const check = process.argv.includes('--check');
const cache = {};
function hashOf(rel) {
  if (!(rel in cache)) {
    const f = path.join(root, rel);
    cache[rel] = fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8) : null;
  }
  return cache[rel];
}
let stale = 0, changed = 0, missing = [];
pages.forEach(p => {
  const f = path.join(root, p); if (!fs.existsSync(f)) return;
  const src = fs.readFileSync(f, 'utf8');
  const out = src.replace(/((?:src|href)=")([^"?#:]+)\?v=([^"]*)(")/g, (m, a, rel, v, d) => {
    const h = hashOf(rel);
    if (!h) { missing.push(p + ': ' + rel); return m; }
    if (v === h) return m;
    stale++; return a + rel + '?v=' + h + d;
  });
  if (out !== src && !check) { fs.writeFileSync(f, out); changed++; }
});
missing.forEach(m => console.log('нет файла: ' + m));
if (check) { console.log(stale ? 'Устаревших версий: ' + stale + ' — запустите node tools/bump-versions.js' : 'Версии актуальны'); process.exit(stale || missing.length ? 1 : 0); }
console.log('Обновлено версий: ' + stale + ' (страниц: ' + changed + ')');
