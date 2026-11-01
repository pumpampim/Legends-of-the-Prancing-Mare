const { setupSession, wait, gmAddEnemy, gmAttack } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  const r0 = await pl.evaluate(() => {
    const t = summonTemplates.find(t => t.name === 'Огненный атронах');
    const res = performSummon(t, false);
    playerPets.push(makePetFromTemplate(window.PET_TEMPLATES[0], 'Шарик'));
    // аура: +100 брони существам
    activeTimedEffects.push({ id: 'aur', name: 'Тест-аура', effectName: 'Тест-аура', turnsRemaining: 5, summonAura: { armor: 100, resPct: 10 } });
    updateAll(); saveLocalStorage(true);
    return { res, sum: activeSummons.map(s => [s.id, s.name, s.curHp]), pets: playerPets.map(p => [p.id, p.hp]) };
  });
  console.log('player', JSON.stringify(r0));
  await wait(1500);
  const part = H.store['sessions/' + code].doc.participants.p1;
  console.log('session summons', JSON.stringify(part.summons), 'pets', JSON.stringify(part.pets));
  await gmAddEnemy(gm, 'Бандит');
  const eid = H.store['sessions/' + code].doc.enemies[0].id;
  const opts = await gm.evaluate(() => { populateGmAttackSelects(); return Array.from(document.getElementById('gm-attack-target-select').options).map(o => o.value + ' = ' + o.text); });
  console.log('targets', opts);
  const sumId = r0.sum[0][0];
  const a1 = await gmAttack(gm, eid, 'summon:p1:' + sumId, 'weapon', { tries: 20 });
  console.log('attack summon', JSON.stringify(a1[a1.length - 1]));
  await wait(2000);
  console.log('player summons after', JSON.stringify(await pl.evaluate(() => activeSummons.map(s => [s.name, s.curHp, s.maxHp]))));
  console.log('log', JSON.stringify(H.store['sessions/' + code].doc.combatLog.slice(-2).map(x => x.text)));
  const petId = r0.pets[0][0];
  const a2 = await gmAttack(gm, eid, 'pet:p1:' + petId, 'weapon', { tries: 20 });
  console.log('attack pet', JSON.stringify(a2[a2.length - 1]));
  await wait(2500);
  console.log('player pets after', JSON.stringify(await pl.evaluate(() => playerPets.map(p => [p.name, p.hp, p.dead]))));
  // kill summon: big damage
  { const en = H.store['sessions/' + code].doc.enemies.map(x => Object.assign({}, x, { weaponDmg: 5000 })); await gm.evaluate(([c, en]) => firebase.firestore().collection('sessions').doc(c).update({ enemies: en }), [code, en]); }
  await wait(800);
  const a3 = await gmAttack(gm, eid, 'summon:p1:' + sumId, 'weapon', { tries: 20 });
  console.log('attack summon 2', JSON.stringify(a3[a3.length - 1]));
  await wait(2500);
  console.log('player summons after kill', JSON.stringify(await pl.evaluate(() => activeSummons.map(s => [s.name, s.curHp]))));
  console.log('session summons', JSON.stringify(H.store['sessions/' + code].doc.participants.p1.summons));
  console.log('log', JSON.stringify(H.store['sessions/' + code].doc.combatLog.slice(-3).map(x => x.text)));
  // player still targetable
  const a4 = await gmAttack(gm, eid, 'p1', 'weapon', { tries: 3, once: true });
  console.log('attack player', JSON.stringify(a4[0]).slice(0, 300));
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  await H.close();
})();
