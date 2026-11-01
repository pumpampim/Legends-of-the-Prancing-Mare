const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({ players: [
    { uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } },
    { uid: 'p2', name: 'Лидия', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  const [p1, p2] = players;
  H.dialogs = H.dialogs || [];
  // --- 4. Общий заказ
  await gm.evaluate(() => {

    document.getElementById('craft-order-npc').value = 'Адриана';
    const sel = document.getElementById('craft-order-item-select'); sel.innerHTML = '<option value="Железный кинжал">Железный кинжал</option>'; sel.value = 'Железный кинжал';
    document.getElementById('craft-order-qty').value = 1; document.getElementById('craft-order-reward').value = 100;
    const t = document.getElementById('craft-order-target'); if (![...t.options].some(o => o.value === 'all')) t.innerHTML = '<option value="all">all</option>'; t.value = 'all';
    window.sendCraftOrder();
  });
  await wait(2000);
  for (const p of [p1, p2]) await p.evaluate(() => { addToInventory('Железный кинжал', 'Железный кинжал', 1, 2, 'Оружие', '', { price: 10 }); renderInventoryList(); });
  await wait(2000);
  const o1 = await p1.evaluate(() => JSON.stringify(craftOrders));
  console.log('p1 orders', o1);
  const g1 = await p1.evaluate(() => parseInt(document.getElementById('char-gold').value) || 0);
  await p1.evaluate(() => window.deliverCraftOrder(craftOrders[0].id));
  await wait(2500);
  console.log('p1 gold', g1, '->', await p1.evaluate(() => parseInt(document.getElementById('char-gold').value) || 0), await p1.evaluate(() => craftOrders[0].status));
  console.log('claims', JSON.stringify(H.store[Object.keys(H.store).find(k => k.startsWith('sessions/'))].doc.craftOrderClaims));
  console.log('p2 status', await p2.evaluate(() => JSON.stringify(craftOrders.map(o => o.status))));
  const g2 = await p2.evaluate(() => parseInt(document.getElementById('char-gold').value) || 0);
  await p2.evaluate(() => { craftOrders.forEach(o => o.status = 'active'); window.deliverCraftOrder(craftOrders[0].id); });
  await wait(2000);
  console.log('p2 forced deliver gold', g2, '->', await p2.evaluate(() => parseInt(document.getElementById('char-gold').value) || 0), await p2.evaluate(() => craftOrders[0].status), 'dagger left', await p2.evaluate(() => countInInventory('Железный кинжал')));
  // --- 2. Сезоны
  console.log('seasons', await p1.evaluate(() => { const r = []; for (let m = 0; m < 12; m++) { gameMonth = m; r.push(m + ':' + getCurrentSeason().name); } gameMonth = 6; return r.join(' '); }));
  // --- 6. Продажа с расположением
  console.log('sell price disp', await p1.evaluate(() => { const it = { name: 'Железный кинжал', price: 100, category: 'Оружие' }; return [-1, 0, 1, 2].map(d => d + ':' + computeSellPrice(it, 'blacksmith', false, null, d)).join(' '); }));
  // --- 5. Промах — четверть
  console.log('miss progress', await p1.evaluate(() => { const i = skillNames.indexOf('Одноручное оружие'); skillProgress[i] = 0; logSkillSuccessByName('Одноручное оружие', MISS_SKILL_PROGRESS); return skillProgress[i]; }));
  // --- 7. Тюрьма
  await p1.evaluate(() => { playerCrimeState = { inJail: true, jailHold: 'Вайтран', jailDaysRemaining: 3 }; });
  console.log('jail cast', await p1.evaluate(() => castBlockReason()));
  console.log('jail gather', await p1.evaluate(() => { const n = playerInventory.length; window.gatherIngredients(); return n === playerInventory.length; }));
  console.log('hunger before', await p1.evaluate(() => daysWithoutFood));
  await p1.evaluate(() => window.nextDay()); await wait(800);
  console.log('hunger after day in jail', await p1.evaluate(() => daysWithoutFood));
  await p1.evaluate(() => { playerCrimeState = null; window.nextDay(); }); await wait(800);
  console.log('hunger after day free', await p1.evaluate(() => daysWithoutFood));
  console.log('dialogs p1', JSON.stringify((p1.__dialogs || []).slice(-5))); console.log('dialogs p2', JSON.stringify((p2.__dialogs || []).slice(-3)));
  // --- 9. дальность
  console.log('range', await p1.evaluate(() => [window.getSummonRangeFt('daedra'), window.getSummonRangeFt('skeleton')].join(',')));
  // --- 1. Змей: тик мастера с dotDice
  await S.gmAddEnemy(gm, 'Бандит');
  await wait(1000);
  const eid = await p1.evaluate(() => (window.CloudSync.getSessionData().enemies || [])[0].id);
  await p1.evaluate((id) => window.CloudSync.applyStatusToEnemy(id, 'Яд Змея', 't', 15, 'Бьорн', { dotHp: 2, dotDice: [2, 10], dotNoResist: true, unique: true }), eid);
  await wait(800);
  const hps = [];
  for (let i = 0; i < 4; i++) { await S.gmNextTurn(p1); hps.push(await p1.evaluate(() => (window.CloudSync.getSessionData().enemies || [])[0].curHp)); }
  console.log('zmey hp', hps.join(' '));
  console.log('issues', JSON.stringify(H.issues.slice(0, 5)));
  await H.close();
})();
