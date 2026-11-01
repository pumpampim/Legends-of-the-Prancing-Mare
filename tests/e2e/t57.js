const { setupSession, wait, gmAddEnemy, plAttack } = require('./setup');
(async () => {
  const { gm, players, H, code } = await setupSession();
  const pl = players[0];
  await gmAddEnemy(gm, 'Бандит');
  const sd = c => gm.evaluate(c2 => firebase.firestore().collection('sessions').doc(c2).get().then(d => d.data()), c);
  await wait(1200);
  const eid = (await sd(code)).enemies[0].id;
  await pl.evaluate(() => { const p = allItems.find(i => i.name === 'Соловьиный клинок'); const it = Object.assign({}, p, { itemId: p.name, count: 1, weaponDmg: p.damage }); playerInventory.push(it); applyItemToSlot(it); document.getElementById('cur-hp').value = 50; updateAll(); });
  const r = await plAttack(pl, eid, 'melee');
  await wait(1500);
  const s = await sd(code);
  console.log(JSON.stringify(r.slice(-1)).slice(0, 400));
  console.log(JSON.stringify((s.combatLog || []).slice(-4).map(x => x.text), null, 1));
  console.log('hp', await pl.evaluate(() => document.getElementById('cur-hp').value));
  // god boots x1.5
  const g = await pl.evaluate(() => { document.getElementById('faith-god').value = 'mara'; document.getElementById('faith-rank').value = 3; const a = allItems.find(i => i.name === 'Амулет Мары'); const it = Object.assign({}, a, { itemId: a.name, count: 1 }); playerInventory.push(it); applyItemToSlot(it); updateAll(); const b0 = JSON.stringify(getGodBonuses('mara', 3));
    ['Шлем Хранителя', 'Броня Хранителя', 'Перчатки Хранителя', 'Сапоги Хранителя'].forEach(n => { const p = allItems.find(i => i.name === n); const x = Object.assign({}, p, { itemId: n, count: 1, armorValue: p.armor }); playerInventory.push(x); applyItemToSlot(x); }); updateAll();
    return b0 + ' => ' + JSON.stringify(getGodBonuses('mara', 3)); });
  console.log('GOD', g);
  console.log('ISSUES', JSON.stringify(H.issues));
  await H.close();
})();
