const { setupSession, wait, gmAddEnemy } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  const r0 = await pl.evaluate(() => { performSummon(summonTemplates.find(t => t.name === 'Огненный атронах'), false); playerPets.push(makePetFromTemplate(window.PET_TEMPLATES[0], 'Шарик')); updateAll(); saveLocalStorage(true); return [activeSummons[0].id, playerPets[0].id]; });
  await wait(1500);
  await gmAddEnemy(gm, 'Бандит');
  const eid = H.store['sessions/' + code].doc.enemies[0].id;
  const G = { w: 20, h: 20, cells: {}, runes: {}, zones: {}, tokens: {} };
  G.tokens['e_' + eid] = { kind: 'e', ref: eid, x: 1, y: 1, size: 1 };
  const out = await gm.evaluate(([c, G, ids]) => {
    const k = GridCore.tokenKey('s', ids[0], 'p1'), kp = GridCore.tokenKey('s', ids[1], 'p1');
    G.tokens[k] = { kind: 's', ref: ids[0], owner: 'p1', x: 10, y: 10, size: 1 };
    G.tokens[kp] = { kind: 's', ref: ids[1], owner: 'p1', x: 2, y: 1, size: 1 };
    return firebase.firestore().collection('sessions').doc(c).update({ grid: G }).then(() => [k, kp]);
  }, [code, G, r0]);
  await wait(800);
  gm.__confirms = [false];
  const msgs = [];
  gm.on('dialog', d => { msgs.push(d.message()); });
  const r = await gm.evaluate(([eid, sid, keys]) => {
    populateGmAttackSelects();
    document.getElementById('gm-attack-attacker-select').value = eid; onGmAttackAttackerPicked();
    GmGrid.targetForEnemy(keys[1]);
    const v1 = document.getElementById('gm-attack-target-select').value;
    GmGrid.targetForEnemy(keys[0]);
    const v2 = document.getElementById('gm-attack-target-select').value;
    rollGmAttack();
    return { v1, v2, txt: document.getElementById('gm-attack-roll-text').innerText.slice(0, 200), tokens: Object.keys(lastDataTokens = (window.__x || {})) };
  }, [eid, r0[0], out]);
  console.log(JSON.stringify(r)); console.log('dialogs', msgs);
  console.log('grid tokens kept', Object.keys(H.store['sessions/' + code].doc.grid.tokens));
  console.log('issues', JSON.stringify(H.issues).slice(0, 800));
  await H.close();
})();
