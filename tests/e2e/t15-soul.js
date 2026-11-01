// Захват душ: метка на живом (смерть от мастера / от удара игрока / после окончания метки) и труп.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0];
  const sk = 'sessions/' + code;
  for (let i = 0; i < 4; i++) await S.gmAddEnemy(gm, 'Волк');
  await S.gmGive(gm, 'Крохотный камень душ', 4);
  await wait(2000);
  const inv = () => pl.evaluate(() => playerInventory.filter(i => /камень душ/.test(i.name)).map(i => i.name + '×' + i.count).join(', '));
  const ids = H.store[sk].doc.enemies.map(e => e.id);
  await pl.evaluate(() => { characterLevel = 80; document.querySelectorAll('[data-raw-val]').forEach(e => e.setAttribute('data-raw-val', 100)); updateAll(); learnSpellIntoBook('conj', 'Захват душ'); window.__al = []; window.alert = m => window.__al.push(String(m)); window.alchToast = m => window.__al.push('TOAST ' + m); });
  const cast = (eid) => pl.evaluate((eid) => {
    document.getElementById('cur-mp').value = 999; window.__al = [];
    const card = Array.from(document.querySelectorAll('.spell-card')).find(c => c.querySelector('.spell-name-select').value === 'Захват душ');
    const sel = card.querySelector('.spell-target-select'); populateSpellTargetSelect(sel);
    const opts = Array.from(sel.options).map(o => o.text);
    sel.value = 'corpse:' + eid;
    castCustomSpell(card.id.replace('card-', ''), false);
    return { opts, al: window.__al.slice() };
  }, eid);
  const setEn = async (fn) => { const en = H.store[sk].doc.enemies.map(fn); await gm.evaluate(([c, en]) => firebase.firestore().collection('sessions').doc(c).update({ enemies: en }), [code, en]); await wait(1200); };
  const al = () => pl.evaluate(() => window.__al);
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };

  // 1. метка на живого, убивает мастер
  let r = await cast(ids[0]);
  console.log('opts', r.opts.filter(o => /Волк/.test(o)).slice(0, 2), r.al);
  await wait(1200);
  check(H.store[sk].doc.enemies[0].soulTrap && H.store[sk].doc.enemies[0].soulTrap.uid === 'p1', 'метка в сессии');
  check(/Крохотный камень душ×4/.test(await inv()), 'камень не тронут до смерти: ' + await inv());
  await setEn(x => x.id === ids[0] ? Object.assign({}, x, { curHp: 0, diedAtTurn: H.store[sk].doc.sessionTurnCounter || 0 }) : x);
  console.log('  ', JSON.stringify(await al()));
  check(/Заполненный крохотный камень душ×1/.test(await inv()) && /^Крохотный камень душ×3/.test(await inv()), 'после смерти от мастера: ' + await inv());
  check(H.store[sk].doc.enemies[0].soulTaken === true, 'soulTaken');

  // 2. метка, игрок добивает обычным ударом
  await pl.evaluate(() => window.nextTurn()); await wait(3300);
  console.log('  cast2', (await cast(ids[1])).al); await wait(1000);
  await setEn(x => x.id === ids[1] ? Object.assign({}, x, { curHp: 1 }) : x);
  await S.plAttack(pl, ids[1], 'melee', { tries: 10 }); await wait(1500);
  check(/Заполненный крохотный камень душ×2/.test(await inv()), 'после удара игрока: ' + await inv());

  // 3. метка истекла: умер через 6 ходов
  await pl.evaluate(() => window.nextTurn()); await wait(3300);
  console.log('  cast3', (await cast(ids[2])).al); await wait(1000);
  const until = H.store[sk].doc.enemies[2].soulTrap.until;
  await setEn(x => x.id === ids[2] ? Object.assign({}, x, { curHp: 0, diedAtTurn: until + 1 }) : x);
  check(/Заполненный крохотный камень душ×2/.test(await inv()), 'после окончания метки камень не заполнен: ' + await inv());

  // 4. труп
  await setEn(x => x.id === ids[3] ? Object.assign({}, x, { curHp: 0, diedAtTurn: H.store[sk].doc.sessionTurnCounter || 0 }) : x);
  await pl.evaluate(() => window.nextTurn()); await wait(3300);
  r = await cast(ids[3]); await wait(1200);
  console.log('  ', r.al);
  check(/Заполненный крохотный камень душ×3/.test(await inv()), 'труп: ' + await inv());

  // 5. перезагрузка — инвентарь из облака
  await pl.reload(); await wait(2500);
  check(/Заполненный крохотный камень душ×3/.test(await inv()), 'после перезагрузки: ' + await inv());
  console.log('log', JSON.stringify(H.store[sk].doc.combatLog.slice(-6).map(x => x.text)));
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  console.log(ok ? 'ALL OK' : 'HAS FAILS');
  await H.close();
})();
