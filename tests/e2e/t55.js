const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const out = await pl.evaluate(async () => {
    const o = {};
    const give = (n) => { const p = allItems.find(i => i.name === n); const it = Object.assign({}, p, { itemId: n, count: 1, armorValue: p.armor }); playerInventory.push(it); return it; };
    for (const n of ['Кубок Бесконечного Хмеля', 'Чаша Благословения']) {
      give(n); renderInventoryList();
      const s0 = document.getElementById('stat-str').value, eff0 = activeTimedEffects.length;
      const btns = Array.from(document.querySelectorAll('#player-inventory-list button')).filter(b => (b.getAttribute('onclick') || '').indexOf(n) !== -1).map(b => b.textContent.trim() + ' => ' + b.getAttribute('onclick').slice(0, 60));
      let err = null; try { useInventoryItem(n); } catch (e) { err = e.message; }
      await new Promise(r => setTimeout(r, 300));
      o[n] = { btns, err, str: s0 + '->' + document.getElementById('stat-str').value, eff: eff0 + '->' + activeTimedEffects.length, left: (playerInventory.find(i => i.itemId === n) || {}).count };
    }
    // werewolf hours with Шкура Спасителя
    applyItemToSlot(give('Шкура Спасителя')); updateAll();
    if (!playerSupernaturalState) playerSupernaturalState = {}; playerSupernaturalState.werewolf = playerSupernaturalState.werewolf || { heartsEaten: 0 };
    o.wolfHours = wolfFormHours();
    return o;
  });
  console.log(JSON.stringify(out, null, 1), JSON.stringify(pl.__dialogs || []).slice(0, 600));
  await H.close();
})();
