const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  const out = {};
  await gm.evaluate(async () => { window.loadGmItems(); await new Promise(r => setTimeout(r, 1000)); });
  // B44: chest until a potion/poison appears
  out.chest = await gm.evaluate(async () => {
    document.getElementById('loot-tier-select').value = 'poor';
    for (let i = 0; i < 300; i++) {
      window.generateChestLoot();
      const t = document.getElementById('loot-gen-result').innerText;
      const m = /• ((?:Яд|Зелье)[^\n(]*?) \(/.exec(t);
      if (m) { const s = document.getElementById('loot-gen-target-player'); s.value = 'p1'; window.grantGeneratedLoot(); return m[1]; }
    }
    return null;
  });
  await wait(2500);
  out.chestInv = await pl.evaluate((n) => { const it = playerInventory.find(i => i.name.trim() === n.trim()) || playerInventory.find(i => /^(Яд|Зелье)/.test(i.name)); if (it) return { name: it.name, cat: it.category, ae: !!it.alchemyEffects }; return it ? { cat: it.category, ae: !!it.alchemyEffects } : 'none'; }, out.chest);
  out.allInv = await pl.evaluate(() => playerInventory.map(i => i.name)); out.store = (H.store["characters/p1"].doc.inventory||[]).map(i=>i.name+"|"+i.category+"|"+!!i.alchemyEffects);
  // B50: GM loots corpse with poison
  await gm.evaluate((c) => firebase.firestore().collection('sessions').doc(c).update({ enemies: [
    { id: 'e1', name: 'Труп1', maxHp: 10, curHp: 0, corpseLoot: { gold: 3, items: [{ name: 'Яд: Урон здоровью (Базовое)', category: 'Яд (лут)', price: 5, weight: 0.5, alchemyEffects: [{ name: 'Урон здоровью', magnitude: 5, duration: null, unit: '' }] }] } },
    { id: 'e2', name: 'Маг', maxHp: 50, curHp: 50, maxMp: 100, curMp: 100, spells: [{ name: 'Огненная стрела', dmg: 10, cost: 30 }] } ] }), code);
  await wait(1200);
  await gm.evaluate(() => window.lootCorpse('e1'));
  await wait(2500);
  out.corpseInv = await pl.evaluate(() => { const it = playerInventory.find(i => /Урон здоровью/.test(i.name)); return it ? { cat: it.category, ae: !!it.alchemyEffects } : 'none'; });
  // B46: roll enemy spell twice
  await gm.evaluate(() => { populateGmAttackSelects(); document.getElementById('gm-attack-attacker-select').value = 'e2'; onGmAttackAttackerPicked(); document.getElementById('gm-attack-target-select').value = 'p1'; document.getElementById('gm-attack-action-select').value = 'spell:0'; window.rollGmAttack(); });
  await wait(1200);
  await gm.evaluate(() => { document.getElementById('gm-attack-attacker-select').value = 'e2'; document.getElementById('gm-attack-action-select').value = 'spell:0'; window.rollGmAttack(); });
  await wait(1200);
  out.mpAfter2Rolls = H.store['sessions/' + code].doc.enemies.find(e => e.id === 'e2').curMp;
  // B47/B48 generators
  out.gen = await gm.evaluate(() => {
    let ammo = 0, xbow = 0, n = 200; document.getElementById('bandit-avg-level').value = 20;
    for (let i = 0; i < n; i++) { window.generateBandit(); const t = document.getElementById('bandit-gen-result').innerText; if (/(стрела|болт) \(/i.test(t)) ammo++; if (/арбалет \(/i.test(t)) xbow++; }
    let conj = 0, costs = new Set(); document.getElementById('bandit-mage-avg-level').value = 30;
    for (let i = 0; i < 200; i++) { window.generateMageBandit(); const t = document.getElementById('bandit-mage-gen-result').innerText; (t.match(/\/(\d+) маны/g) || []).forEach(x => costs.add(x)); if (/Призыв|Атронах|Оживление|Поднять|Изгнание/i.test(t)) conj++; }
    return { ammo, xbow, n, conj, costs: [...costs] };
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 8), null, 1));
  await H.close();
})();
