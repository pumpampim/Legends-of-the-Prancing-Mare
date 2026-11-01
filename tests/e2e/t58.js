const { setupSession, wait } = require('./setup');
(async () => {
  const { players, H } = await setupSession();
  const pl = players[0];
  const o = await pl.evaluate(() => {
    const o = {};
    const at = summonTemplates.find(t => t.category === 'atronach'), sk = summonTemplates.find(t => t.category === 'skeleton' && !t.requiresItem) || summonTemplates.find(t => t.category === 'skeleton');
    const names = () => activeSummons.map(s => s.name).join(' | ');
    o.a1 = performSummon(at, false).message; o.a2 = performSummon(at, false).message; o.after2 = names();
    const robe = allItems.find(i => i.name === 'Одеяние атрономага'); const it = Object.assign({}, robe, { itemId: robe.name, count: 1 }); playerInventory.push(it); applyItemToSlot(it); updateAll();
    o.a3 = performSummon(at, false).message; o.after3 = names();
    playerInventory.push({ itemId: 'Кучка костей', name: 'Кучка костей', count: 5, weight: 2, category: 'Бытовые предметы' });
    o.s1 = performSummon(sk, false).message; o.afterS = names();
    window.perkBonuses = Object.assign({}, window.perkBonuses, { extraSkeletons: 1 });
    o.s2 = performSummon(sk, false).message; o.afterS2 = names();
    return o;
  });
  console.log(JSON.stringify(o, null, 1)); console.log('ISSUES', JSON.stringify(H.issues));
  await H.close();
})();
