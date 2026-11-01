const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  await pl.evaluate(() => { characterLevel = 80; document.querySelectorAll('[data-raw-val]').forEach(e => e.setAttribute('data-raw-val', 100)); 
    ['Огонь солнца','Малый оберег','Огненный плащ','Барьер','Увядание','Искры','Ледяная буря'].forEach(n=>{for(const sc in spellsData)for(const t in spellsData[sc]) if(spellsData[sc][t].some(s=>s.name===n)) learnSpellIntoBook(sc,n);});
    document.getElementById('cur-mp').value = 999; updateAll(); });
  await S.gmAddEnemy(gm, 'Бандит'); await S.gmAddEnemy(gm, 'Драугр'); await wait(800);
  const ens = await pl.evaluate(() => { renderAttackTargetSelect(); return Array.from(document.getElementById('attack-target-select').options).map(o => o.value + '=' + o.text); });
  console.log(ens);
  const ids = await pl.evaluate(() => customSpells.map(s => [s.name, s.id]));
  const band = ens.find(x => /Бандит/.test(x)).split('=')[0], dra = ens.find(x => /Драугр/.test(x)).split('=')[0];
  for (const [n, id] of ids) {
    for (const tgt of (n === 'Огонь солнца' ? [band, dra] : [band])) {
      const mp0 = await pl.evaluate(() => document.getElementById('cur-mp').value);
      const r = await S.plAttack(pl, tgt, 'spell:' + id, { tries: 6, apply: true });
      const mp1 = await pl.evaluate(() => document.getElementById('cur-mp').value);
      const last = r[r.length - 1];
      console.log('==', n, '->', tgt, 'mp', mp0, '->', mp1, JSON.stringify(last).slice(0, 500));
      await S.gmNextTurn(pl);
    }
  }
  const st = H.store; for (const p in st) if (/sessions\/[^/]+$/.test(p)) console.log(JSON.stringify((st[p].doc.enemies||[]).map(e=>[e.name,e.hp,e.maxHp])));
  console.log(H.issues.slice(0, 10));
  await H.close();
})();
