// Восьмой обход (2026-11-10): тип атаки не сбрасывается, зелья одного рода не стакаются, ножны не берут ножны и сырьё,
// дата мастера не затирается, растущие ингредиенты на грядках, ассортимент всех торговцев, блок внутри атаки НПС.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code; const fails = [];
  const chk = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };
  await S.gmAddEnemy(gm, 'Бандит'); await wait(1500);
  const eid = H.store[sk].doc.enemies[0].id;
  const r = await pl.evaluate((eid) => {
    window.confirm = () => true; window.alert = () => {};
    const out = {};
    // 9: тип атаки сохраняется при перерисовке списка; 6: бросок и обычная атака в одном ходу
    const pouch = allItems.find(i => i.name === 'Подсумок на 4 зелья');
    addToInventory(pouch.name, pouch.name, 1, 2, pouch.category, pouch.effect, { slot: 'pouch', capacity: 4, type: 'pouch' }); equippedSlots.pouch = pouch.name;
    addToInventory('Стальной метательный нож', 'Стальной метательный нож', 6, 0.3, 'Метательное', '', { thrown: true, throwKind: 'knife', weaponDmg: 11, price: 6 });
    renderPouchPanel(); document.getElementById('pouch-load-select').value = 'Стальной метательный нож'; loadPouch();
    combatMarks = {}; renderAttackTargetSelect(); renderAttackActionSelect();
    const sel = document.getElementById('attack-action-select'); sel.value = 'throw:0'; renderAttackActionSelect();
    out.keep = sel.value;
    document.getElementById('attack-target-select').value = eid; window.rollPlayerAttack(); out.m1 = JSON.stringify(combatMarks);
    renderAttackActionSelect(); sel.value = 'melee'; window.rollPlayerAttack(); out.m2 = JSON.stringify(combatMarks);
    // 8: зелья одного рода
    const fx = (n, m, k) => [{ name: n, magnitude: m, duration: 5, unit: '', kind: k }];
    addToInventory('Зелье A', 'Зелье A', 1, 0.5, 'Зелья', '', { alchemyEffects: fx('Повышение здоровья', 30, 'max_hp') });
    addToInventory('Зелье B', 'Зелье B', 1, 0.5, 'Зелья', '', { alchemyEffects: fx('Здоровье великое', 50, 'max_hp') });
    addToInventory('Зелье C', 'Зелье C', 1, 0.5, 'Зелья', '', { alchemyEffects: fx('Увеличение физ.урона', 10, 'dmg_pct') });
    addToInventory('Зелье D', 'Зелье D', 1, 0.5, 'Зелья', '', { alchemyEffects: fx('Увеличение физ.урона', 20, 'dmg_pct') });
    ['Зелье A', 'Зелье B', 'Зелье C', 'Зелье D'].forEach(n => { combatMarks = {}; useInventoryItem(n); });
    out.pot = activeTimedEffects.filter(e => e.fromAlchemy).map(e => e.name);
    // 12: ножны
    addToInventory('Ножны для меча', 'Ножны для меча', 1, 0.2, 'Ножны и колчаны', '', { sheathKind: 'sword' });
    addToInventory('Глаз саблезуба', 'Глаз саблезуба', 1, 0.1, 'Ингредиенты для алхимии', '', {});
    out.sheath = [weaponSheathKind(playerInventory.find(i => i.name === 'Ножны для меча')), weaponSheathKind(playerInventory.find(i => i.name === 'Глаз саблезуба'))];
    out.sword = weaponSheathKind({ name: 'Стальной меч', category: 'Оружие', weaponType: 'onehand' });
    out.crops = ['Голубой горноцвет', 'Лаванда'].map(k => !!ESTATE_DATA.CROPS[k]);
    return out;
  }, eid);
  chk(r.keep === 'throw:0', 'тип атаки не сбросился при перерисовке: ' + r.keep);
  chk(/bonus/.test(r.m1) && /attack/.test(r.m2), 'бросок (бонусное) и обычная атака в одном ходу: ' + r.m1 + ' / ' + r.m2);
  chk(r.pot.length === 2 && r.pot.indexOf('Зелье B') >= 0 && r.pot.indexOf('Зелье D') >= 0, 'зелья одного рода не складываются: ' + r.pot.join(','));
  chk(r.sheath[0] === null && r.sheath[1] === null && r.sword === 'sword', 'ножны/глаз саблезуба не лезут в ножны, меч лезет: ' + JSON.stringify(r.sheath) + r.sword);
  chk(r.crops[0] && r.crops[1], 'горноцвет можно посадить');
  // 2: дата мастера не затирается снимком, пока мастер правит поля
  await gm.evaluate(() => { window.alert = () => {}; });
  const uid = await pl.evaluate(() => window.CloudSync.getCurrentUid());
  const dt = await gm.evaluate(async (uid) => {
    document.getElementById('inv-player-select').value = uid; window.loadPlayerInventoryForGm(); await new Promise(r => setTimeout(r, 1200));
    const d = document.getElementById('inv-date-day'); d.value = 3; d.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('inv-date-food').focus();
    await firebase.firestore().collection('characters').doc(uid).update({ gold: 777 }); await new Promise(r => setTimeout(r, 1200));
    return d.value;
  }, uid).catch(e => 'err:' + e.message);
  chk(dt === '3', 'дата мастера не сброшена снимком: ' + dt);
  fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 600), 'done');
  await H.close();
  process.exit(fails.length ? 1 : 0);
})();
