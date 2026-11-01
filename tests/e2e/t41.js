const H = require('./lib');
(async () => {
  await H.launch();
  const gm = await H.openPage('gm.html', { uid: 'gm1', email: 'gm@x', displayName: 'Мастер' }, { tag: 'GM' });
  const pl = await H.openPage('index.html', { uid: 'p1', email: 'p1@x', displayName: 'P' }, { tag: 'p1' });
  await new Promise(r => setTimeout(r, 2500));
  const roll = async (pg, poolExpr) => pg.evaluate((poolExpr) => {
    const pool = eval(poolExpr);
    const R = Math.random; Math.random = () => 0;
    const out = {};
    (window.enemiesData || []).forEach(e => { if (!e.loot) return; const r = EnemyLoot.rollFromText(e.loot, { pool, level: e.level || 1 }); out[e.name] = (r.items || []).map(i => i.name + (i.category === 'Добыча (с трупа)' ? '#STUB' : '') + '|' + (i.price||0)); });
    Math.random = R; return { n: pool.length, out };
  }, poolExpr);
  const a = await roll(pl, 'window.allItems');
  await gm.evaluate(() => window.loadGmItems && window.loadGmItems());
  await new Promise(r => setTimeout(r, 1500));
  // gm pool: reconstruct through gmGiveItemFromTable scope not possible; use table rows count
  const gmPoolSrc = await gm.evaluate(() => { try { return typeof gmAllItems; } catch (e) { return 'noaccess'; } });
  console.log('gm access', gmPoolSrc, 'player pool', a.n);
  let diff = 0, stubs = 0; const ex = [];
  await gm.evaluate(async () => { const t = await (await fetch('gm.js')).text(); const i = t.indexOf('const GM_SMITHING_SLOT_MAP'); const j = t.indexOf('function getSmithingGiveableItems'); const k = t.indexOf('return drop.size', j); let mapSrc = ''; if (i>=0) { mapSrc = t.slice(i, t.indexOf(';', t.indexOf('}', i))+1); } const f = t.slice(j, t.indexOf('return out;', j) + 11) + '}'; window.__gsi = eval('(function(){' + mapSrc + f + ' return getSmithingGiveableItems; })()'); const seen = new Set(); window.__gmPool = window.allItems.concat(window.__gsi(), window.skillBooksData||[], window.uniqueWeaponsData||[], window.spellTomesData||[]).filter(x => { if (seen.has(x.name)) return false; seen.add(x.name); return true; }); });
  const b = await roll(gm, "window.__gmPool");
  console.log('gm pool', b.n);
  for (const k in a.out) { const x = a.out[k].join(', '), y = (b.out[k]||[]).join(', '); if (x !== y) { diff++; if (ex.length < 25) ex.push(k + '\n  PL: ' + x + '\n  GM: ' + y); } stubs += a.out[k].filter(s => s.includes('#STUB')).length; }
  console.log('enemies differ', diff, 'player stubs', stubs); console.log(ex.join('\n'));
  await H.close();
})();
