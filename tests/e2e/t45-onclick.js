const { setupSession, wait } = require('./setup');
const fs = require('fs');
const SITE = require('path').resolve(process.env.SITE || require('path').join(__dirname, '..', '..')) + '/';
function handlers(files) { const set = new Set(); for (const f of files) { const s = fs.readFileSync(SITE + f, 'utf8'); const re = /on(?:click|change|input|submit|keyup|keydown|blur|focus)\s*=\s*\\?["']\s*(?:return\s+)?(?:event\.stopPropagation\(\);\s*)?([A-Za-z_$][\w$.]*)\s*\(/g; let m; while ((m = re.exec(s))) if (!/^(if|for|while|return|typeof|void|new)$/.test(m[1])) set.add(m[1]); } return [...set]; }
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  // cloud.js рисует кнопки только на листе игрока — его обработчики проверяем у игрока
  const hp = handlers(['index.html', 'cloud.js']), hg = handlers(['gm.html', 'gm.js', 'gm-grid.js']);
  const miss = async (pg, list) => pg.evaluate(l => l.filter(n => { try { const v = n.split('.').reduce((o, k) => o == null ? undefined : o[k], window); return typeof v !== 'function'; } catch (e) { return true; } }), list);
  const mp = await miss(pl, hp), mg = await miss(gm, hg);
  console.log('player missing', JSON.stringify(mp));
  console.log('gm missing', JSON.stringify(mg));
  if (mp.length || mg.length) { console.log('FAIL: кнопки вызывают несуществующие функции'); process.exitCode = 1; }
  await H.close();
})();
