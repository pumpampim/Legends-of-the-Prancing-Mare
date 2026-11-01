// Воскрешение мастером: игрок в сети и игрок, закрывший лист. Команда применяется один раз.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  let pl = players[0]; const sk = 'sessions/' + code;
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const prep = (p) => p.evaluate(() => { window.__al = []; window.alert = m => window.__al.push(String(m)); window.confirm = () => true; if (creationState) creationState.done = true; updateAll(); saveLocalStorage(true); });
  await prep(pl);
  const st = (p) => p.evaluate(() => ({ hp: document.getElementById('cur-hp').value, fallen: deathState.fallen, deaths: deathState.deaths, lives: _dLives(), ov: document.getElementById('death-overlay').style.display, al: window.__al.slice(-3) }));
  await S.gmAddEnemy(gm, 'Бандит');
  const eid = H.store[sk].doc.enemies[0].id;
  // 1. игрок в сети, убит врагом
  await pl.evaluate(() => { document.getElementById('cur-hp').value = 3; updateAll(); saveLocalStorage(true); }); await wait(2000);
  await S.gmAttack(gm, eid, 'p1', 'weapon', { tries: 20 }); await wait(3000);
  let s = await st(pl);
  check(s.fallen && s.hp === '0', 'игрок пал: ' + JSON.stringify(s));
  const deaths0 = s.deaths;
  await gm.evaluate(() => { const b = Array.from(document.querySelectorAll('#gm-party-list button')).find(b => /Воскресить/.test(b.textContent)); b.click(); });
  await wait(4000);
  s = await st(pl);
  check(!s.fallen && s.hp === '95' && s.ov === 'none', 'воскрешён в сети: ' + JSON.stringify(s));
  check(s.deaths === deaths0 + 1, 'падение засчитано один раз: ' + deaths0 + ' → ' + s.deaths);
  const logs = H.store[sk].doc.combatLog.map(x => x.text).filter(t => /воскрешён/.test(t));
  check(logs.length === 1, 'одна запись в журнале: ' + JSON.stringify(logs));
  check(H.store[sk].doc.participants.p1.curHp === 95 && H.store[sk].doc.participants.p1.fallen === false, 'сессия: ' + H.store[sk].doc.participants.p1.curHp + ' fallen=' + H.store[sk].doc.participants.p1.fallen);
  // +❤ один раз
  const l0 = s.lives; await gm.evaluate(() => gmDeathCmd('p1', 'addLives', 1)); await wait(3500);
  check((await st(pl)).lives === l0 + 1, '+❤ ровно на 1: ' + l0 + ' → ' + (await st(pl)).lives);

  // 2. игрок пал и закрыл лист
  await pl.evaluate(() => { document.getElementById('cur-hp').value = 0; checkDeath(); updateAll(); saveLocalStorage(true); }); await wait(2500);
  check(H.store['characters/p1'].doc.deathState.fallen === true, 'в облаке пал');
  const ctx = pl.context(); await pl.close(); await wait(500);
  await gm.evaluate(() => gmDeathCmd('p1', 'revive')); await wait(2000);
  const cd = H.store['characters/p1'].doc;
  check(cd.deathState.fallen === false && parseInt(cd.vitals[0]) === 95, 'лист в облаке без игрока: hp ' + cd.vitals[0] + ' fallen=' + cd.deathState.fallen);
  check(H.store[sk].doc.participants.p1.fallen === false, 'в сессии не пал');
  pl = await ctx.newPage(); pl.on('dialog', d => { (pl.__dialogs = pl.__dialogs || []).push(d.message()); d.accept(); }); await pl.goto('http://localhost:' + (process.env.PORT || 8765) + '/index.html');
  await wait(3500);
  s = await pl.evaluate(() => ({ hp: document.getElementById('cur-hp').value, fallen: deathState.fallen, ov: document.getElementById('death-overlay').style.display }));
  check(!s.fallen && s.hp === '95' && s.ov === 'none', 'после входа жив: ' + JSON.stringify(s));
  console.log('pending', JSON.stringify(H.store[sk].doc.participants.p1.pendingStatusEffects), JSON.stringify(await pl.evaluate(()=>window.__dialogs)), JSON.stringify(pl.__dialogs));
  console.log('log', JSON.stringify(H.store[sk].doc.combatLog.slice(-5).map(x => x.text)));
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  console.log(ok ? 'ALL OK' : 'HAS FAILS');
  await H.close();
})();
