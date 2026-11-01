const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const out = await pl.evaluate(() => {
    const o = {}; Math.random = () => 0.5;
    const give = (n) => { const p = allItems.find(i => i.name === n); const it = Object.assign({}, p, { itemId: n, count: 1, armorValue: p.armor }); playerInventory.push(it); return it; };
    o.sp0 = computeSpellDamage('Ледяной шип', 'destr', 25).dmg;
    o.cost0 = JSON.stringify(getGearSpellCostCut());
    applyItemToSlot(give('Выпускник Коллегии Магов Винтерхолда')); updateAll();
    o.sp1 = computeSpellDamage('Ледяной шип', 'destr', 25).dmg;
    o.cost1 = JSON.stringify(getGearSpellCostCut());
    o.mp = document.getElementById('max-mp').value;
    return o;
  });
  console.log(JSON.stringify(out, null, 1));
  await H.close();
})();
