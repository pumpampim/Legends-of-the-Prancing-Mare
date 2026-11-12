const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const out = await pl.evaluate(() => {
    const o = {};
    const give = (n) => { const p = allItems.find(i => i.name === n); if(!p) return null; const it = Object.assign({}, p, { itemId: n, count: 1, armorValue: p.armor }); playerInventory.push(it); return it; };
    const unequipAll = () => { Object.keys(equippedSlots).forEach(k => { equippedSlots[k] = null; }); updateAll(); };
    const tests = [
      ['Эльфийские перчатки [Повышение навыка: «Алхимия»]', () => getSkillBoostPercent('Алхимия')],
      ['Стальные пластинчатые перчатки [Повышение навыка:«Одноручное оружие»]', () => getSkillBoostPercent('Одноручное оружие')],
      ['Кожаные наручи [Повышение навыка: «Карманные кражи»]', () => getSkillBoostPercent('Карманные кражи')],
      ['Золотое кольцо с изумрудом [Повышение навыка:«Восстановление»]', () => getSkillBoostPercent('Восстановление')],
      ['Перчатки Гильдии Воров', () => getActiveSkillRollBonus('Карманные кражи')],
      ['Перчатки Умелого вора', () => getActiveSkillRollBonus('Карманные кражи')],
      ['Сапоги мастера вора', () => getActiveSkillRollBonus('Карманные кражи')],
      ['Сапоги Умелого вора', () => getActiveSkillRollBonus('Взлом')],
      ['Перчатки мастера вора', () => getActiveSkillRollBonus('Взлом')],
      ['Кольцо Кхаджита', () => getActiveSkillRollBonus('Скрытность')],
      ['Серый Капюшон Ноктюрнал', () => getActiveSkillRollBonus('Скрытность')],
      ['Шлем Дозорного-дезертира', () => document.getElementById('armor-total').innerText],
      ['Шлем понихиды', () => JSON.stringify(computeTotalResistances())],
      ['Шкура Спасителя', () => JSON.stringify(computeTotalResistances())],
      ['Сапоги Дозорного-дезертира', () => JSON.stringify(computeTotalResistances())],
    ];
    tests.forEach(([n, f]) => {
      unequipAll();
      const before = f();
      const it = give(n); if (!it) { o[n] = 'NOITEM'; return; }
      try { applyItemToSlot(it); updateAll(); } catch (e) { o[n] = 'ERR ' + e.message; return; }
      o[n] = before + ' -> ' + f() + ' | ' + (it.effect || '').slice(0, 90);
    });
    return o;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 8), null, 1));
  await H.close();
})();
