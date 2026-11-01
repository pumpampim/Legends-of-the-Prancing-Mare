const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  const r = await p1.evaluate(() => {
    addToInventory('Железные перчатки', 'Железные перчатки', 1, 5, 'Тяжелая броня', '', { slot: 'gloves', armorValue: 15, price: 60 });
    addToInventory('Заполненный обычный камень душ', 'Заполненный обычный камень душ', 1, 0.5, 'Камни душ', '', {});
    const it = playerInventory.find(i => i.itemId === 'Железные перчатки');
    applyItemToSlot(it, 'gloves');
    const before = JSON.stringify(equippedSlots);
    const eff = (window.enchantArmorEffects || []).find(e => e.slots.includes(equipSlotToEnchantSlot('gloves')));
    knownEnchantments.push(eff.name);
    renderEnchantItemSelect();
    document.getElementById('enchant-item-select').value = 'Железные перчатки'; onEnchantItemPicked();
    const gemSel = document.getElementById('enchant-soulgem');
    const opts = Array.from(gemSel.options).map(o => o.value);
    return { before, eff: eff.name, opts };
  });
  console.log(r);
  const r2 = await p1.evaluate(() => {
    const gemSel = document.getElementById('enchant-soulgem');
    for (const o of gemSel.options) { if (countInInventory(enchantGemKey(o.value)) > 0) { gemSel.value = o.value; break; } }
    enchantItem();
    return { res: document.getElementById('enchant-result').innerText, slots: JSON.stringify(equippedSlots), inv: playerInventory.map(i => i.itemId) };
  });
  console.log(r2);
  await H.close();
})();
