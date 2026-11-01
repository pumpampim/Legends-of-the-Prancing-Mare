const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession({});
  const [p1] = players;
  await S.gmGive(gm, 'Стальная стрела', 10); await wait(2500);
  const r = await p1.evaluate(() => {
    const out = {};
    // как при покупке у живого торговца (buyFromMerchant)
    addToInventory('Железная стрела', 'Железная стрела', 10, 0.04, 'Стрелы', '', { slot: undefined, armorValue: undefined, weaponDmg: 8, price: 1 });
    // как при ковке (craftSmithingItem, isAmmo)
    const rec = getAllSmithingRecipes().find(x => x.name === 'Двемерская стрела');
    out.rec = rec && { dmg: rec.damage, isAmmo: rec.isAmmo, cat: rec.category };
    addToInventory('Двемерская стрела', 'Двемерская стрела', 10, 0.04, 'Боеприпасы', 'Урон 12 (боеприпас)', { category: 'Боеприпасы', price: 3 });
    for (const n of ['Стальная стрела', 'Железная стрела', 'Двемерская стрела']) {
      const it = playerInventory.find(i => i.name === n);
      equippedSlots.ammo = it ? it.itemId : null;
      const inp = collectPlayerAttackInput();
      out[n] = { found: !!it, dmg: it && it.dmg, weaponDmg: it && it.weaponDmg, ammoDmg: inp.ranged.ammoDmg, ammoSel: isAmmoItem(it) };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await H.close();
})();
