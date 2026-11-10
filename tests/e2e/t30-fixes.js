const { setupSession, wait, gmAddEnemy, gmGive, plEquip } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const R = {};
  pl.__confirms = []; 
  // --- player-only checks (no combat) ---
  R.food = await pl.evaluate(() => ({ rawhideHelmet: isFoodItem({ name: 'Сыромятный шлем', slot: 'helmet', category: 'Лёгкая броня' }), cheese: isFoodItem({ name: 'Козий сыр' }) }));
  R.costCut = await pl.evaluate(() => {
    const out = {};
    for (const [n, slot] of [['Одеяние упокоения', 'chest'], ['Шлем Хранителя', 'helmet'], ['Азидалов шлем проницательности', 'helmet']]) {
      const p = allItems.find(i => i.name === n); addToInventory(n, n, 1, 1, p.category, p.effect, { slot: p.slot, armorValue: p.armor });
      applyItemToSlot(playerInventory.find(i => i.name === n), p.slot); out[n] = JSON.stringify(getGearSpellCostCut());
      equippedSlots[p.slot === 'chest' ? 'chest' : p.slot] = null;
    }
    return out;
  });
  R.enchantKeep = await pl.evaluate(() => {
    const p = allItems.find(i => /\+1 к кубам на скрытность/i.test(i.effect || '') && !i.unique && i.slot);
    if (!p) return 'no item';
    addToInventory(p.name, p.name, 1, 1, p.category, p.effect, { slot: p.slot, armorValue: p.armor, price: p.price });
    const it = playerInventory.find(i => i.itemId === p.name);
    // имитируем зачарованную вещь старого формата (без baseEffect)
    it.enchantment = { name: 'Повышение здоровья', value: 20 }; it.name = p.name + ' [Повышение здоровья]'; it.effect = 'Повышение здоровья: 20';
    applyItemToSlot(it, p.slot);
    return { item: p.name, skill: getGearTextBonuses().skill, hpBonus: getEquipmentEnchantBonuses().hp };
  });
  R.gold0 = await pl.evaluate(async () => { const d = (await firebase.firestore().collection('characters').doc('p1').get()).data(); d.gold = 0; applyCharacterData(d); return document.getElementById('char-gold').value; });
  R.order = await pl.evaluate(() => {
    craftOrders.push({ id: 'o1', npc: 'Кузнец', itemName: 'Стальной меч', qty: 1, reward: 50, status: 'active' });
    addToInventory('Стальной меч#zen', 'Стальной меч', 1, 10, 'Оружие', '', { slot: 'melee', weaponDmg: 9 });
    const have = craftOrderHave('Стальной меч'); const g0 = parseInt(document.getElementById('char-gold').value);
    deliverCraftOrder('o1');
    return { have, goldDelta: parseInt(document.getElementById('char-gold').value) - g0, left: playerInventory.filter(i => i.name === 'Стальной меч').length };
  });
  R.stolenIng = await pl.evaluate(() => {
    addToInventory('Белянка#stolen', 'Белянка', 2, 0.1, 'Ингредиенты для алхимии', '', { stolen: true });
    return getAlchemyIngredientsInInventory().map(i => i.itemId + ':' + i.count);
  });
  R.dualSell = await pl.evaluate(() => {
    addToInventory('Железный меч', 'Железный меч', 2, 9, 'Оружие', '', { slot: 'melee', weaponDmg: 7 });
    const it = playerInventory.find(i => i.itemId === 'Железный меч');
    equippedSlots.meleeWeapon = 'Железный меч'; equippedSlots.meleeWeaponOffhand = 'Железный меч';
    removeFromInventoryByName('Железный меч', 1);
    return { main: equippedSlots.meleeWeapon, off: equippedSlots.meleeWeaponOffhand };
  });
  R.fish = await pl.evaluate(() => ({ hjal: holdWaters('Хьялмарк (Морфал)'), wint: holdWaters('Винтерхолд') }));
  // --- GM: remove player effect ---
  await pl.evaluate(() => { activeTimedEffects.push({ id: 'dis1', name: 'Болезнь', effectName: 'Болезнь: Атаксия', description: '', turnsRemaining: Infinity, fromGm: true }); renderActiveEffects(); saveLocalStorage(true); });
  await wait(1500);
  R.selfRemove = await pl.evaluate(() => { window.__alerts = []; const a = window.alert; window.alert = m => window.__alerts.push(m); removeActiveEffect('dis1'); window.alert = a; return { still: activeTimedEffects.some(e => e.id === 'dis1'), alert: (window.__alerts[0] || '').slice(0, 40) }; });
  await gm.evaluate(async () => { document.getElementById('inv-player-select').value = 'p1'; window.loadPlayerInventoryForGm(); await new Promise(r => setTimeout(r, 800)); });
  R.gmEffList = await gm.evaluate(() => (document.getElementById('inv-effects-list') || {}).innerText);
  await gm.evaluate(() => window.gmRemovePlayerEffect('dis1', 'Болезнь: Атаксия'));
  await wait(2500);
  R.afterGmRemove = await pl.evaluate(() => activeTimedEffects.some(e => e.id === 'dis1'));
  // --- tournament fee with low gold ---
  await pl.evaluate(() => { document.getElementById('char-gold').value = 50; saveLocalStorage(true); }); await wait(1500);
  await gm.evaluate(async () => { window.tournChargeEntryFee(); await new Promise(r => setTimeout(r, 800)); });
  R.tourn = await gm.evaluate(() => document.getElementById('tourn-result').innerText);
  // --- museum / guild ---
  R.guild = await pl.evaluate(async () => { await window.CloudSync.incrementGuildProgress('Гильдия воров'); await new Promise(r => setTimeout(r, 800)); return JSON.stringify((playerGuildsData || {})['Гильдия воров']); });
  // --- enemies & combat ---
  await gmAddEnemy(gm, 'Бандит', { 'enemy-dmg-input': 99, 'enemy-loot-input': 'Мой лут' });
  const sess = () => gm.evaluate(async () => (await firebase.firestore().collection('sessions').doc(localStorage.getItem('ttrpg_gm_session_code')).get()).data());
  R.addEnemy = await sess().then(d => { const e = d.enemies[d.enemies.length - 1]; return { dmg: e.weaponDmg, loot: e.loot }; });
  await gmAddEnemy(gm, 'Драугр');
  R.block = await gm.evaluate(() => Array.from(document.getElementById('gm-attack-attacker-select').options).map(o => o.text));
  await wait(800);
  // potion in combat = action
  R.potion = await pl.evaluate(() => {
    addToInventory('Зелье лечения', 'Зелье лечения', 3, 0.5, 'Зелье', 'Восстанавливает 25 здоровья', {});
    window.__alerts = []; const a = window.alert; window.alert = m => window.__alerts.push(m);
    combatMarks.attack = null; combatMarks.swap = null;
    useInventoryItem('Зелье лечения'); useInventoryItem('Зелье лечения');
    window.alert = a;
    return { left: countInInventory('Зелье лечения'), inCombat: inCombatNow(), alert: (window.__alerts[0] || '').slice(0, 50) };
  });
  // hunger in dice check
  R.hunger = await pl.evaluate(() => { daysWithoutFood = 2; return hungerRollPenalty(); });
  await pl.evaluate(() => { daysWithoutFood = 0; });
  // GM form preservation: type into fine input, trigger snapshot
  R.form = await gm.evaluate(async () => { const f = document.getElementById('fine-amount-input'); if (!f) return 'no fine input'; f.value = '345'; f.focus(); await new Promise(r => setTimeout(r, 10)); return 'typed'; });
  await pl.evaluate(() => saveLocalStorage(true)); await wait(1500);
  R.formAfter = await gm.evaluate(() => (document.getElementById('fine-amount-input') || {}).value);
  // camp night
  await gm.evaluate(async () => { await firebase.firestore().collection('sessions').doc(localStorage.getItem('ttrpg_gm_session_code')).update({ 'campState.active': true }); await new Promise(r => setTimeout(r, 800)); });
  await gm.evaluate(async () => { const m = Math.random; Math.random = () => 0.99; try { window.resolveCampNight(); } finally { Math.random = m; } await new Promise(r => setTimeout(r, 1500)); });
  await wait(2000);
  R.camp = await pl.evaluate(() => activeTimedEffects.filter(e => e.effectName === 'Полноценный отдых').map(e => e.rollPenalty));
  // template reroll
  R.tpl = await gm.evaluate(async () => {
    window.generateBandit(); const n0 = 0;
    const p = window.prompt; window.prompt = () => 'T1'; const al = window.alert; window.alert = () => {};
    window.gmSaveNpcTemplate('bandit'); window.prompt = p; window.alert = al;
    const t = JSON.parse(localStorage.getItem('skyrim_gm_npc_templates') || '[]').slice(-1)[0];
    return { hasCorpse: !!t.data.corpseLoot, hasKit: !!t.data.lootKit, kitItems: (t.data.lootKit || {}).items ? t.data.lootKit.items.length : -1 };
  });
  // mage robe slot
  R.mage = await gm.evaluate(() => { const out = []; const p = window.prompt; window.prompt = () => 'M'; const al = window.alert; window.alert = () => {}; for (let i = 0; i < 25; i++) { window.generateMageBandit(); window.gmSaveNpcTemplate('mage'); const t = JSON.parse(localStorage.getItem('skyrim_gm_npc_templates') || '[]'); const last = t[t.length - 1]; (last && last.data.lootKit ? last.data.lootKit.items : []).forEach(x => { if (/одеян/i.test(x.category || '')) out.push(x.slot); }); localStorage.setItem('skyrim_gm_npc_templates', JSON.stringify(t.slice(0, -1))); } window.prompt = p; window.alert = al; return [...new Set(out)]; });
  console.log(JSON.stringify(R, null, 1));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 10)));
  await H.close();
})();
