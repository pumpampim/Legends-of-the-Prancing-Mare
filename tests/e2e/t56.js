const { setupSession, wait, gmAddEnemy, gmAttack, plAttack } = require('./setup');
(async () => {
  const { gm, players, H, code } = await setupSession();
  const pl = players[0];
  const o = await pl.evaluate(async () => {
    const o = {};
    const give = (n, c) => { const p = allItems.find(i => i.name === n) || (window.uniqueWeaponsData || []).find(i => i.name === n) || window.EnemyLoot.extraItems().find(i => i.name === n); const it = Object.assign({}, p, { itemId: n, count: c || 1, armorValue: p.armor, weaponDmg: p.dmg !== undefined ? p.dmg : p.damage }); playerInventory.push(it); return it; };
    // Кубок
    give('Кубок Бесконечного Хмеля'); renderInventoryList();
    activeTimedEffects.push({ id: 'x1', name: 'Мастер', effectName: 'Замедление', description: '-10 фт', turnsRemaining: 3, speed: -10, fromGm: true });
    const s0 = document.getElementById('stat-str').value;
    useArtifactItem('Кубок Бесконечного Хмеля'); updateAll();
    o.kubok = { str: s0 + '->' + document.getElementById('stat-str').value, slowLeft: activeTimedEffects.some(e => e.effectName === 'Замедление'), left: (playerInventory.find(i => i.itemId === 'Кубок Бесконечного Хмеля') || {}).count };
    activeTimedEffects = activeTimedEffects.filter(e => e.effectName !== 'Кубок Бесконечного Хмеля'); updateAll();
    // Чаша
    window.confirm = () => true;
    give('Чаша Благословения');
    const st = () => ['str','dex','con','int','wis','cha'].map(k => document.getElementById('stat-' + k).value).join(',');
    const c0 = st(); useArtifactItem('Чаша Благословения'); updateAll(); const c1 = st(); useArtifactItem('Чаша Благословения'); updateAll();
    o.chasha = c0 + ' -> ' + c1 + ' -> ' + st();
    // flat boost
    o.boost = [boostDiceFlat(40), boostDiceFlat(15), boostDiceFlat(0)];
    // hunger + robe
    daysWithoutFood = 2; const h0 = hungerRollPenalty();
    const robe = give('Одение повара'); applyItemToSlot(robe); updateAll(); const h1 = hungerRollPenalty(); daysWithoutFood = 0;
    o.hunger = [h0, h1, robe.effect];
    // sell price with hood
    const sw = give('Стальной меч'); sw.price = 100; sw.slot = 'melee';
    const p0 = computeSellPrice(sw, 'blacksmith', false);
    const hood = give('Капюшон мастера вора'); applyItemToSlot(hood); updateAll();
    o.sell = [p0, computeSellPrice(sw, 'blacksmith', false)];
    // dual sword drop
    const sw2 = give('Железный меч', 2); sw2.slot = 'melee'; sw2.weaponType = 'onehand';
    equippedSlots.meleeWeapon = 'Железный меч'; equippedSlots.meleeWeaponOffhand = 'Железный меч';
    adjustInventoryQty('Железный меч', -1);
    o.dual = [equippedSlots.meleeWeapon, equippedSlots.meleeWeaponOffhand];
    // unique props
    o.uniq = ['Соловьиный клинок', 'Соловьиный лук', 'Топор Жатвы', 'Рубиновый Тронный Кинжал'].map(n => n + ':' + JSON.stringify(uniqueWeaponHitProps(allItems.find(i => i.name === n))));
    // keeper
    ['Шлем Хранителя', 'Броня Хранителя', 'Перчатки Хранителя', 'Сапоги Хранителя'].forEach(n => applyItemToSlot(give(n)));
    document.getElementById('chk-defensive-stance').checked = true; updateAll();
    o.keeper = { active: keeperBarrierActive(), left: keeperBarrierLeft };
    // descriptions
    o.desc = ['Сапоги Дозорного-дезертира', 'Колпак повара', 'Перчатки Хранителя'].map(n => allItems.find(i => i.name === n).effect);
    // loot pool
    o.pool = window.EnemyLoot.rollFromText('Древне нордское оружие, Кинжал изгоев', { pool: (window.allItems || []).concat(window.EnemyLoot.extraItems()), level: 5 }).items.map(i => i.name + ':' + i.price);
    saveLocalStorage(true);
    o.alerts = (window.__alerts || []).slice(-3);
    return o;
  });
  console.log(JSON.stringify(o, null, 1));
  await wait(2500);
  // GM: sphere shot + barrier
  await gmAddEnemy(gm, 'Двемерская сфера');
  const sd = c => gm.evaluate(c2 => firebase.firestore().collection('sessions').doc(c2).get().then(d => d.data()), c);
  const eid = (await sd(code)).enemies[0].id;
  const r = await gmAttack(gm, eid, 'p1', 'spell:0');
  console.log('SPHERE', JSON.stringify(r.slice(-1)).slice(0, 500));
  await wait(1500);
  const log = ((await sd(code)).combatLog || []).slice(-3).map(x => x.text);
  console.log('LOG', JSON.stringify(log, null, 1));
  const kb = await pl.evaluate(() => keeperBarrierLeft);
  console.log('keeperLeft', kb);
  // Бастион: отражение
  await pl.evaluate(() => { const p = window.EnemyLoot.extraItems().concat(allItems).find(i => i.name === 'Бастион'); const it = Object.assign({}, p, { itemId: 'Бастион', count: 1, armorValue: p.armor }); playerInventory.push(it); applyItemToSlot(it); document.getElementById('chk-defensive-stance').checked = false; updateAll(); saveLocalStorage(true); return getGearSpecialBonuses().reflectMeleePct; }).then(v => console.log('reflectPct', v));
  await wait(2500);
  const hp0 = (await sd(code)).enemies[0].curHp;
  const r2 = await gmAttack(gm, eid, 'p1', 'weapon');
  await wait(1500);
  const s2 = await sd(code);
  console.log('REFLECT hp', hp0, '->', s2.enemies[0].curHp, JSON.stringify((s2.combatLog || []).slice(-1).map(x => x.text)));
  console.log('ISSUES', JSON.stringify(H.issues));
  await H.close();
})();
