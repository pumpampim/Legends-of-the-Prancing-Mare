const H = require('./lib');
(async () => {
  await H.launch();
  const gm = await H.openPage('gm.html', { uid: 'gm1', email: 'gm@x', displayName: 'Мастер' }, { tag: 'GM' });
  const pl = await H.openPage('index.html', { uid: 'p1', email: 'p1@x', displayName: 'P' }, { tag: 'p1' });
  await new Promise(r => setTimeout(r, 2500));
  await gm.evaluate(async () => { const t = await (await fetch('gm.js')).text(); const i = t.indexOf('const GM_SMITHING_SLOT_MAP'); const j = t.indexOf('function getSmithingGiveableItems'); let mapSrc = t.slice(i, t.indexOf(';', t.indexOf('}', i))+1); const f = t.slice(j, t.indexOf('return out;', j) + 11) + '}'; window.__gsi = eval('(function(){' + mapSrc + f + ' return getSmithingGiveableItems; })()'); const seen = new Set(); window.__gmPool = window.allItems.concat(window.__gsi(), window.skillBooksData||[], window.uniqueWeaponsData||[], window.spellTomesData||[]).filter(x => { if (seen.has(x.name)) return false; seen.add(x.name); return true; }); });
  const r = await gm.evaluate(() => {
    const stubs = {};
    for (let rep = 0; rep < 30; rep++) {
    (window.enemiesData || []).forEach(e => { if (!e.loot) return; const R = Math.random; Math.random = () => 0.0001 + Math.random.__x; Math.random = R; const res = EnemyLoot.rollFromText(e.loot, { pool: window.__gmPool, level: e.level || 1 }); (res.items||[]).forEach(i => { if (i.category === 'Добыча (с трупа)') { stubs[i.name] = stubs[i.name] || new Set(); stubs[i.name].add(e.name); } }); });
    }
    const out = {}; Object.keys(stubs).forEach(k => out[k] = [...stubs[k]].slice(0,4)); return out;
  });
  console.log(JSON.stringify(r, null, 1));
  // spell tomes vs spells
  const t = await pl.evaluate(() => {
    const names = new Set(); Object.keys(window.spellsData || {}).forEach(sc => Object.keys(window.spellsData[sc]).forEach(tr => (window.spellsData[sc][tr] || []).forEach(s => names.add(s.name))));
    const tomes = (window.spellTomesData || []).map(x => x.name.replace(/^Том заклинания:\s*/, '')).filter(n => !names.has(n));
    return { nSpells: names.size, nTomes: (window.spellTomesData||[]).length, missing: tomes };
  });
  console.log(JSON.stringify(t));
  await H.close();
})();
