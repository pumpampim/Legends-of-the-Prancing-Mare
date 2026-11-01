const S = require('./setup');
const H0 = require('./lib');
(async () => {
  const { gm, players, H, wait, code } = await S.setupSession({ players: [{ uid: 'p1', name: 'Хиш', race: 'argonian', sign: 'atronach', stats: { str: 14, dex: 12, con: 12, int: 14, wis: 10, cha: 10 } }] });
  const pl = players[0];
  pl.__confirms = [true]; await pl.evaluate(() => { creationState.done = true; updateAll(); });
  // fresh sheet creation check in separate player
  const fresh = await H.openPage('index.html', { uid: 'p2', email: 'p2@x', displayName: 'Новичок' }, { tag: 'p2' });
  const cr = await fresh.evaluate(() => { try { dismissOnboarding && dismissOnboarding(); } catch (e) {} updateAll();
    const box = document.getElementById('creation-panel');
    const r = { visible: !box.hidden, str: document.getElementById('stat-str').getAttribute('data-raw-stat'), hp: document.getElementById('cur-hp').value + '/' + document.getElementById('max-hp').value };
    for (let i = 0; i < 16; i++) creationStat('con', 1);
    r.conRaw = document.getElementById('stat-con').getAttribute('data-raw-stat');
    for (let i = 0; i < 31; i++) creationSkill(0, 1);
    document.getElementById('creation-bg-main').value = '1'; creationBackground();
    document.getElementById('creation-bg-second').value = '2'; creationBackground();
    r.sk = [0,1,2].map(i => document.getElementById('skill-' + i).getAttribute('data-raw-val'));
    r.hp2 = document.getElementById('cur-hp').value + '/' + document.getElementById('max-hp').value;
    return r; });
  console.log('CREATION', JSON.stringify(cr), fresh.__dialogs);
  // argonian: bite option, disease res
  const ar = await pl.evaluate(() => { renderAttackActionSelect(); return { bite: Array.from(document.getElementById('attack-action-select').options).some(o => o.value === 'argbite'), res: computeTotalResistances() }; });
  console.log('ARG', JSON.stringify(ar));
  await S.gmAddEnemy(gm, 'Бандит'); await wait(800);
  const eid = await pl.evaluate(() => { renderAttackTargetSelect(); return document.getElementById('attack-target-select').options[0].value; });
  const b = await S.plAttack(pl, eid, 'argbite', { tries: 6 });
  console.log('BITE', JSON.stringify(b[b.length - 1]).slice(0, 300));
  // power attack hit penalty: compare roll text mods
  await S.gmNextTurn(pl);
  await S.gmGive(gm, 'Стальной меч', 1); await wait(800); await S.plEquip(pl, 'Стальной меч', 'melee');
  const pa = await pl.evaluate(() => { document.getElementById('chk-power-attack').checked = false; updateAll(); const a = lastWeaponCombatCalc && lastWeaponCombatCalc.hitModifier; document.getElementById('chk-power-attack').checked = true; updateAll(); const c = lastWeaponCombatCalc && lastWeaponCombatCalc.hitModifier; document.getElementById('chk-power-attack').checked = false; updateAll(); return [a, c]; });
  console.log('POWER hit', pa);
  // enemy fear spell to player
  const sk = Object.keys(H.store).find(p => /^sessions\/[^/]+$/.test(p));
  const st = H.store[sk].doc; st.enemies[0].spells = [{ name: 'Страх', dmg: 0, cost: 0 }]; st.enemies[0].hands = 'free';
  H.store[sk].ver++;
  await gm.evaluate(() => {}); 
  // force GM refresh via a harmless update
  await gm.evaluate(async (c) => { await firebase.firestore().collection('sessions').doc(c).update({ __ping: Date.now() }); }, code);
  await wait(800);
  const g = await S.gmAttack(gm, st.enemies[0].id, 'p1', 'spell:0', { tries: 10 });
  console.log('GM FEAR', JSON.stringify(g).slice(0, 600), gm.__dialogs.slice(-4));
  await wait(1200);
  console.log('pl effects', await pl.evaluate(() => activeTimedEffects.map(e => e.effectName)), pl.__dialogs.slice(-3));
  // camp rest: atronach half mana, no poultice -> hp unchanged
  await pl.evaluate(() => { document.getElementById('cur-hp').value = 50; document.getElementById('cur-mp').value = 20; updateAll(); saveLocalStorage(true); });
  await wait(1500);
  await gm.evaluate(async (c) => { await firebase.firestore().collection('sessions').doc(c).update({ enemies: [], campState: { active: true, isMagicallySafe: true } }); }, code);
  await wait(800);
  await gm.evaluate(() => window.resolveCampNight()); await wait(1500);
  console.log('CAMP', await pl.evaluate(() => document.getElementById('cur-hp').value + '/' + document.getElementById('max-hp').value + ' mp ' + document.getElementById('cur-mp').value + '/' + document.getElementById('max-mp').value));
  console.log('log', (H.store[sk].doc.combatLog || []).slice(-1).map(x => x.text));
  console.log(H.issues.slice(0, 10));
  await H.close();
})();
