const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  await pl.evaluate(() => { skillNames.forEach((n, i) => document.getElementById('skill-' + i).setAttribute('data-raw-val', 100)); characterLevel = 80; updateAll(); });
  await S.gmGive(gm, 'Стальной меч', 2);
  await S.gmGive(gm, 'Стальной слиток', 3);
  await S.gmGive(gm, 'Стальной слиток', 2, { stolen: true });
  await wait(800);
  console.log(await pl.evaluate(() => JSON.stringify(playerInventory.map(i => [i.itemId, i.name, i.count, i.weaponDmg, i.stolen]))));
  const eq = await pl.evaluate(() => { const it = playerInventory.find(i => i.name === 'Стальной меч'); const r = applyItemToSlot(it, 'meleeWeapon'); updateAll(); return [r, equippedSlots.meleeWeapon, document.getElementById('wep-melee-dmg').value]; });
  console.log('equip', eq);
  for (let k = 0; k < 4; k++) {
    const r = await pl.evaluate(() => { renderTemperSelect(); const it = playerInventory.find(i => /Стальной меч/.test(i.name)); document.getElementById('temper-item-select').value = it.itemId; temperItem(); updateAll();
      return [document.getElementById('temper-result').innerText, JSON.stringify(playerInventory.map(i => [i.itemId, i.name, i.count, i.weaponDmg])), equippedSlots.meleeWeapon, document.getElementById('wep-melee-dmg').value]; });
    console.log('temper', k, r);
  }
  console.log(H.issues.slice(0, 10));
  await H.close();
})();
