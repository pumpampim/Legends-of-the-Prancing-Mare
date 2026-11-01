const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  pl.__confirms = [true, true, true, true];
  await pl.evaluate(() => { creationState.done = true; characterLevel = 80; document.querySelectorAll('[data-raw-val]').forEach(e => e.setAttribute('data-raw-val', 100));
    ['Увядание','Раскаты грома','Священное оружие'].forEach(n=>{for(const sc in spellsData)for(const t in spellsData[sc]) if(spellsData[sc][t].some(s=>s.name===n)) learnSpellIntoBook(sc,n);}); updateAll(); });
  await S.gmAddEnemy(gm, 'Бандит'); await S.gmAddEnemy(gm, 'Скелет'); await wait(800);
  const ens = await pl.evaluate(() => { renderAttackTargetSelect(); return Array.from(document.getElementById('attack-target-select').options).map(o => o.value + '=' + o.text); });
  const band = ens.find(x => /Бандит/.test(x)).split('=')[0], sk = ens.find(x => /Скелет/.test(x)).split('=')[0];
  const ids = Object.fromEntries(await pl.evaluate(() => customSpells.map(s => [s.name, s.id])));
  for (const n of ['Увядание', 'Раскаты грома']) {
    await pl.evaluate(() => { document.getElementById('max-mp').value = 2000; document.getElementById('cur-mp').value = 999; });
    const r = await S.plAttack(pl, band, 'spell:' + ids[n], { tries: 8 });
    console.log(n, JSON.stringify(r[r.length - 1]).slice(0, 420));
    await S.gmNextTurn(pl);
  }
  const sess = Object.keys(H.store).find(p => /^sessions\/[^/]+$/.test(p));
  const e0 = H.store[sess].doc.enemies.find(e => e.id === band);
  console.log('bandit', e0 && { hp: e0.curHp, mp: e0.curMp, maxMp: e0.maxMp, st: (e0.statusEffects || []).map(s => s.name + ':' + s.desc) });
  // holy weapon via card cast
  await pl.evaluate((id) => { document.getElementById('cur-mp').value = 999; try { castCustomSpell(id, false); } catch (e) { console.error(e); } }, ids['Священное оружие']);
  await wait(500);
  console.log('effects', await pl.evaluate(() => activeTimedEffects.map(e => e.effectName + '/' + e.holyWeapon)), pl.__dialogs.slice(-2));
  await S.gmGive(gm, 'Стальной меч', 1); await wait(800); await S.plEquip(pl, 'Стальной меч', 'melee'); await S.gmNextTurn(pl);
  const h = await S.plAttack(pl, sk, 'melee', { tries: 8, apply: false });
  console.log('holy vs skeleton', JSON.stringify(h[h.length - 1]).slice(0, 400));
  console.log(H.issues.slice(0, 10));
  await H.close();
})();
