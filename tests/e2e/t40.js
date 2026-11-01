const { setupSession, wait, gmAttack } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  const out = {};
  await pl.evaluate(() => { activeTimedEffects.push({ id: 'vx', name: 'Уязвимость к огню', effectName: 'Уязвимость к огню', turnsRemaining: 50, res: { fire: -50 } }); document.getElementById('max-hp').value; updateAll(); saveLocalStorage(true); });
  await wait(1500);
  out.plRes = await pl.evaluate(() => computeTotalResistances().fire);
  out.savedRes = (H.store['characters/p1'].doc.resistances || {}).fire;
  await gm.evaluate((c) => firebase.firestore().collection('sessions').doc(c).update({ enemies: [
    { id: 'e2', name: 'Маг', maxHp: 50, curHp: 50, maxMp: 1000, curMp: 1000, spells: [{ name: 'Огненная стрела', dmg: 20, cost: 10, dmgType: 'fire' }] } ] }), code);
  await wait(1200);
  await pl.evaluate(() => { const o = window.applyGmControlledFields; window.__agf = []; window.applyGmControlledFields = function (d) { window.__agf.push(JSON.stringify(d.vitals) + ' stale=' ); const r = o.apply(this, arguments); window.__agf.push('after=' + document.getElementById('cur-hp').value); setTimeout(() => window.__agf.push('later=' + document.getElementById('cur-hp').value), 50); setTimeout(() => window.__agf.push('later2=' + document.getElementById('cur-hp').value), 1500); return r; }; });
  const hp0 = await pl.evaluate(() => parseInt(document.getElementById('cur-hp').value));
  const r = await gmAttack(gm, 'e2', 'p1', 'spell:0', { tries: 15 });
  await wait(6000);
  out.storeVitals = (H.store['characters/p1'].doc.vitals||[]).slice(0,2); out.gmCmds = H.store['characters/p1'].doc.gmCmds; out.pend = (H.store['sessions/'+code].doc.participants.p1.pendingStatusEffects||[]).length;
  out.agf = await pl.evaluate(() => window.__agf);
  const hp1 = await pl.evaluate(() => parseInt(document.getElementById('cur-hp').value));
  out.attack = r.slice(-1)[0]; out.hp0 = hp0; out.hp1 = hp1;
  out.log = (H.store['sessions/' + code].doc.combatLog || []).slice(-3).map(x => x.text);
  // trap
  out.trap = await pl.evaluate(() => { const hp = parseInt(document.getElementById('cur-hp').value); const d = trapHitsDamage([{ dmg: 20, type: 'fire' }]); return { d, hp }; });
  out.aoe = await pl.evaluate(() => { const before = parseInt(document.getElementById('cur-hp').value); gridAoeHit({ dmg: 20, dmgType: 'fire', from: 'Тест' }); return before - parseInt(document.getElementById('cur-hp').value); });
  console.log(JSON.stringify(out, null, 1));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 8), null, 1));
  await H.close();
})();
