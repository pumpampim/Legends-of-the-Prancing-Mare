const { setupSession, wait, gmAddEnemy } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession({ players: [
    { uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } },
    { uid: 'p2', name: 'Лидия', race: 'nord', sign: 'warrior', stats: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  const [pl, pl2] = players;
  const R = {};
  const sess = () => gm.evaluate(async () => (await firebase.firestore().collection('sessions').doc(localStorage.getItem('ttrpg_gm_session_code')).get()).data());
  R.summonHeal = await pl.evaluate(() => {
    activeSummons.push({ id: 'sum-x', name: 'Скелет', category: 'skeleton', curHp: 10, maxHp: 60, dmg: 5 });
    const desc = (findSpellDescByName('Лечение') || 'Восстанавливает 30 здоровья');
    const r = resolveSpellEffect('Лечение', desc, 'restor', 'summon:sum-x', true);
    return { hp: activeSummons.find(s => s.id === 'sum-x').curHp, msg: (r.message || '').slice(0, 80) };
  });
  await gmAddEnemy(gm, 'Бандит');
  await wait(800);
  // scroll read from backpack in combat costs the action
  R.scroll = await pl.evaluate(() => {
    addToInventory('Свиток: Дубовая плоть', 'Свиток: Дубовая плоть', 2, 0.1, 'Свиток', findSpellDescByName('Дубовая плоть') || 'Броня +40 на 60 ходов', { scrollSpellName: 'Дубовая плоть', scrollSchool: 'alter' });
    const al = window.alert; const A = []; window.alert = m => A.push(m);
    combatMarks.attack = null; combatMarks.swap = null;
    useScrollItem('Свиток: Дубовая плоть'); useScrollItem('Свиток: Дубовая плоть');
    window.alert = al;
    return { left: countInInventory('Свиток: Дубовая плоть'), second: (A[1] || '').slice(0, 50) };
  });
  // coop attack
  const eid = (await sess()).enemies[0].id;
  R.coop = await gm.evaluate(async (eid) => {
    window.populateCoopSelects && 0;
    const s1 = document.getElementById('coop-player1-select'), s2 = document.getElementById('coop-player2-select'), t = document.getElementById('coop-target-select');
    s1.value = 'p1'; s2.value = 'p2'; t.value = eid;
    window.rollCoopAttack(); await new Promise(r => setTimeout(r, 800));
    const txt = document.getElementById('coop-attack-result').innerText;
    window.applyCoopAttackDamage(); await new Promise(r => setTimeout(r, 800));
    return txt.replace(/\n/g, ' ').slice(0, 260);
  }, eid);
  R.coopEnemy = await sess().then(d => { const e = d.enemies[0]; return { hp: e.curHp + '/' + e.maxHp, lastHitBy: e.lastHitBy || null }; });
  // kill enemy via GM, player loots DB-text corpse
  await gm.evaluate(async () => { const ref = firebase.firestore().collection('sessions').doc(localStorage.getItem('ttrpg_gm_session_code')); const d = (await ref.get()).data(); d.enemies[0].curHp = 0; d.enemies[0].isRaisable = true; delete d.enemies[0].corpseLoot; d.enemies[0].loot = 'Золото 10-20, Железный кинжал'; await ref.update({ enemies: d.enemies }); });
  await wait(1500);
  R.lootBtn = await pl.evaluate(() => (document.getElementById('enemies-list') || {}).innerText.replace(/\n/g, ' ').slice(0, 200));
  R.loot = await pl.evaluate(async (eid) => { const al = window.alert; let m = ''; window.alert = x => m = x; window.playerLootCorpse(eid); await new Promise(r => setTimeout(r, 1200)); window.alert = al; return m; }, eid);
  // wall once per turn
  R.wall = await pl.evaluate(async () => {
    activeTimedEffects.push({ id: 'w1', name: 'Стена пламени', effectName: 'Стена пламени', turnsRemaining: Infinity, wall: { base: 10, icon: '🔥' } });
    // ещё один живой враг нужен — проверим только отметку хода
    const al = window.alert; const A = []; window.alert = m => A.push(m);
    const w = activeTimedEffects.find(e => e.id === 'w1').wall; w.lastTurn = turnKeyNow();
    window.openWallStrike('w1'); window.alert = al; return A[0] || 'no alert';
  });
  console.log(JSON.stringify(R, null, 1));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 10)));
  await H.close();
})();
