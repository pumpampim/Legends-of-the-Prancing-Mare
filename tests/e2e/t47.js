const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const out = await pl.evaluate(() => {
    const o = {};
    const give = (n) => { const p = allItems.find(i => i.name === n); const it = Object.assign({}, p, { itemId: n, count: 1, armorValue: p.armor }); playerInventory.push(it); return it; };
    // a) hood price
    o.price0 = getSpeechPriceMultiplier();
    applyItemToSlot(give('Капюшон Гильдии Воров')); updateAll();
    o.price1 = getSpeechPriceMultiplier();
    // b) arrow resist
    const r0 = computeTotalResistances();
    applyItemToSlot(give('Шлем Туманной заставы')); updateAll();
    const r1 = computeTotalResistances();
    o.arrow = { phys0: r0.physical, phys1: r1.physical, arrow0: r0.arrow, arrow1: r1.arrow, armor: document.getElementById('armor-total').innerText };
    // c) shield +10% base weapon dmg
    playerInventory.push({ itemId: 'Железный меч', name: 'Железный меч', count: 1, weight: 9, category: 'Одноручное', slot: 'melee', weaponDmg: 10, weaponType: 'onehand', price: 25 });
    applyItemToSlot(playerInventory.find(i => i.itemId === 'Железный меч'), 'melee'); updateAll();
    o.dmg0 = document.getElementById('main-panel-dmg').value;
    applyItemToSlot(give('Щит налетчика')); updateAll();
    o.dmg1 = document.getElementById('main-panel-dmg').value;
    // d) graduate robe +20% spells
    o.sp0 = JSON.stringify(computeSpellDamage('Огненная стрела', 'destr', 25)).slice(0, 120);
    applyItemToSlot(give('Выпускник Коллегии Магов Винтерхолда')); updateAll();
    o.sp1 = JSON.stringify(computeSpellDamage('Огненная стрела', 'destr', 25)).slice(0, 120);
    // e) pouch return re-render
    applyItemToSlot(give('Подсумок на 2 зелья'));
    playerInventory.push({ itemId: 'Зелье лечения', name: 'Зелье лечения', count: 1, weight: 0.5, category: 'Зелья', effect: '+25 хп', price: 20 });
    renderInventoryList(); renderPouchPanel();
    document.getElementById('pouch-load-select').value = 'Зелье лечения'; window.loadPouch();
    const listEl = document.getElementById('player-inventory-list');
    o.afterLoad = /Зелье лечения/.test(listEl.innerText);
    window.returnFromPouch(0);
    o.inInv = playerInventory.some(i => i.name === 'Зелье лечения');
    o.domAfterReturn = /Зелье лечения/.test(listEl.innerText);
    // f) Impulse type
    o.impulse = detectDmgTypeFromName('Импульс') + '/' + detectDmgTypeFromName('Телекинетический столп');
    return o;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 8), null, 1));
  await H.close();
})();
