const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession({});
  const [p1] = players;
  await S.gmAddEnemy(gm, 'Бандит'); await wait(1500);
  await S.gmGive(gm, 'Хлеб', 2); await wait(2000);
  const r = await p1.evaluate(() => {
    window.__al = []; window.alert = m => window.__al.push(String(m)); window.confirm = () => true;
    addToInventory('Зелье лечения', 'Зелье лечения', 1, 0.5, 'Зелье', 'Восстанавливает 25 здоровья', { price: 10 });
    activeTimedEffects.push({ id: 'mute1', name: 'Враг', effectName: 'Немота', statusFlag: 'mute', turnsRemaining: 3, description: '' });
    const out = { inCombat: inCombatNow() };
    const bread = playerInventory.find(i => i.name === 'Хлеб'); const pot = playerInventory.find(i => i.name === 'Зелье лечения');
    const c0 = [bread && bread.count, pot && pot.count];
    window.eatAnyFood(bread.itemId); window.useInventoryItem(pot.itemId);
    out.counts = [c0, [playerInventory.find(i => i.name === 'Хлеб').count, (playerInventory.find(i => i.name === 'Зелье лечения') || {}).count]];
    out.alerts = window.__al;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await H.close();
})();
