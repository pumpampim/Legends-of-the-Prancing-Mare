const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  const out = {};
  // a) enchant resist poison vs fire
  out.enchRes = await pl.evaluate(() => {
    const r0 = computeTotalResistances();
    playerInventory.push({ itemId: 'TestBoots', name: 'TestBoots', count: 1, weight: 1, category: 'Легкая броня', slot: 'boots', armorValue: 5, enchantment: { name: 'Сопротивление огню', value: 30, description: 'Сопротивление к урону огнём' } });
    playerInventory.push({ itemId: 'TestArmor', name: 'TestArmor', count: 1, weight: 1, category: 'Легкая броня', slot: 'chest', armorValue: 5, enchantment: { name: 'Сопротивление яду', value: 30, description: 'Сопротивление к урону ядом' } });
    playerInventory.push({ itemId: 'TestRing', name: 'TestRing', count: 1, weight: 0.1, category: 'Ювелирные изделия', slot: 'ring', enchantment: { name: 'Усиление рукопашного боя', value: 10, description: 'Увеличивает урон в рукопашном бою' } });
    applyItemToSlot(playerInventory.find(i => i.itemId === 'TestBoots'));
    applyItemToSlot(playerInventory.find(i => i.itemId === 'TestArmor'));
    const d0 = document.getElementById('main-panel-dmg') ? document.getElementById('main-panel-dmg').innerText : '';
    applyItemToSlot(playerInventory.find(i => i.itemId === 'TestRing'));
    updateAll();
    const r1 = computeTotalResistances();
    const d1 = document.getElementById('main-panel-dmg') ? document.getElementById('main-panel-dmg').innerText : '';
    return { fire0: r0.fire, fire1: r1.fire, poison0: r0.poison, poison1: r1.poison, eq: JSON.stringify(equippedSlots), dmgBefore: d0, dmgAfterRing: d1, wep: document.getElementById('wep-melee-name').value };
  });
  // c) equilibrium
  out.equil = await pl.evaluate(() => {
    document.getElementById('cur-hp').value = 300; const maxMp = parseInt(document.getElementById('max-mp').value); document.getElementById('cur-mp').value = maxMp;
    window.__p = ['200']; window.prompt = () => window.__p.shift(); window.confirm = () => true;
    window.castEquilibrium();
    return { maxMp, curMp: parseInt(document.getElementById('cur-mp').value), hp: document.getElementById('cur-hp').value };
  });
  await pl.evaluate(() => { updateAll(); });
  out.equilAfterUpdate = await pl.evaluate(() => ({ curMp: document.getElementById('cur-mp').value, maxMp: document.getElementById('max-mp').value }));
  // d) drop one of two swords
  out.drop = await pl.evaluate(() => {
    playerInventory.push({ itemId: 'Железный меч', name: 'Железный меч', count: 2, weight: 9, category: 'Одноручное', slot: 'melee', weaponDmg: 7, weaponType: 'onehand', price: 25 });
    applyItemToSlot(playerInventory.find(i => i.itemId === 'Железный меч'), 'melee');
    applyItemToSlot(playerInventory.find(i => i.itemId === 'Железный меч'), 'melee_offhand');
    const before = JSON.stringify([equippedSlots.meleeWeapon, equippedSlots.meleeWeaponOffhand]);
    window.askQuantity = (o) => o.onOk(1);
    window.dropInventoryItem('Железный меч');
    return { before, after: JSON.stringify([equippedSlots.meleeWeapon, equippedSlots.meleeWeaponOffhand]), count: (playerInventory.find(i => i.itemId === 'Железный меч') || {}).count };
  });
  // e) GM slow status payload
  out.slow = await pl.evaluate(() => {
    const s0 = document.getElementById('val-speed').innerText;
    window.applyIncomingStatusEffects([{ id: 'st-x', name: 'Бандит', effectName: 'Замедление', description: '-10 фт. скорости.', turnsRemaining: 3, rollPenalty: 0, fromGm: true, save: null }]);
    return { s0, s1: document.getElementById('val-speed').innerText };
  });
  // h,i) trap: lord fire, vampire poison
  out.trapLord = await pl.evaluate(() => { const s = document.getElementById('char-sign'); const old = s.value; s.value = 'lord'; window.onSignChanged && window.onSignChanged(); const r = trapHitsDamage([{ dmg: 20, type: 'fire' }]); s.value = old; window.onSignChanged && window.onSignChanged(); return r; });
  console.log(JSON.stringify(out, null, 1));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 8), null, 1));
  await H.close();
})();
