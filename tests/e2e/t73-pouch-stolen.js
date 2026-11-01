const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  const r = await p1.evaluate(() => {
    addToInventory('Малый подсумок', 'Малый подсумок', 1, 1, 'Подсумки', '', { slot: 'pouch', capacity: 3 });
    applyItemToSlot(playerInventory.find(i => i.itemId === 'Малый подсумок'), 'pouch');
    const fx = [{ name: 'Восстановление здоровья', magnitude: 25, duration: null, unit: '', kind: 'heal_hp' }];
    addToInventory('Зелье лечения#stolen', 'Зелье лечения', 1, 0.5, 'Зелья', '+25 хп', { price: 40, stolen: true, alchemyEffects: fx });
    const before = JSON.stringify(playerInventory.filter(i => i.name === 'Зелье лечения').map(i => ({ id: i.itemId, stolen: !!i.stolen, w: i.weight })));
    const w0 = getInventoryTotalWeight();
    document.getElementById('pouch-load-select').value = 'Зелье лечения#stolen';
    loadPouch();
    const w1 = getInventoryTotalWeight();
    returnFromPouch(0);
    const after = JSON.stringify(playerInventory.filter(i => i.name === 'Зелье лечения').map(i => ({ id: i.itemId, stolen: !!i.stolen, w: i.weight })));
    return { before, after, weightBefore: w0, weightWhileInPouch: w1, weightAfter: getInventoryTotalWeight() };
  });
  console.log(r);
  await H.close();
})();
