const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  const out = await pl.evaluate(() => {
    const g = id => { const e = document.getElementById(id); return e ? (e.value !== undefined && e.value !== '' ? e.value : e.innerText) : null; };
    updateAll(); const d0 = g('main-panel-dmg'), c0 = JSON.stringify(window.lastWeaponCombatCalc || null).slice(0, 300);
    playerInventory.push({ itemId: 'TestRing', name: 'TestRing', count: 1, weight: 0.1, category: 'Ювелирные изделия', slot: 'ring', enchantment: { name: 'Усиление рукопашного боя', value: 10, description: 'Увеличивает урон в рукопашном бою' } });
    applyItemToSlot(playerInventory.find(i => i.itemId === 'TestRing')); updateAll();
    const d1 = g('main-panel-dmg');
    const s0 = g('val-speed');
    window.applyIncomingStatusEffects([{ id: 'st-x', name: 'Бандит', effectName: 'Замедление', description: '-10 фт. скорости.', turnsRemaining: 3, rollPenalty: 0, fromGm: true, save: null }]);
    updateAll();
    const s1 = g('val-speed');
    return { d0, d1, c0, s0, s1, eff: activeTimedEffects.map(e => e.effectName + ':' + e.speed) };
  });
  console.log(JSON.stringify(out, null, 1));
  await H.close();
})();
