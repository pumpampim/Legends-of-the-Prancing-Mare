// Городской дом (Гордость шпиля): готов, достраивать нельзя; сон у кровати даёт «Выспался»; медовуха с очагом; налёт без охраны.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  await gm.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('gm-estate-preset').value = 'solitude'; gmEstateCreate(); });
  await wait(1500);
  await pl.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('tab17-btn').click(); });
  await wait(800);
  await pl.evaluate(() => Estate.enter()); await wait(800);
  const id = await pl.evaluate(() => Object.keys(CloudSync.getSessionData().estates)[0]);
  let r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => Estate.R.place(e, 'found', [[1, 1]])); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(/достраивать его нельзя/.test(r), 'городской дом можно достраивать: ' + r);
  const pass = await pl.evaluate(id => { const e = CloudSync.getSessionData().estates[id]; return [Estate.passable(e, 14, 19), Estate.passable(e, 10, 19), Estate.passable(e, 14, 14), Estate.passable(e, 10, 10)]; }, id);
  chk(JSON.stringify(pass) === '[true,false,true,false]', 'проходимость дома (дверь/стена/пол/очаг): ' + JSON.stringify(pass));
  // сон: встать рядом с кроватью (19,10) и лечь
  await pl.evaluate(id => CloudSync.estateWrite({ ['estates.' + id + '.tokens.' + CloudSync.getCurrentUid()]: { x: 18, y: 10 } }), id); await wait(800);
  await pl.evaluate(() => { Estate.setMode('sleep'); const cv = document.getElementById('estate-canvas'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 3 * 14, clientY: r.top + 3 * 14, bubbles: true })); });
  await wait(600);
  chk(await pl.evaluate(() => (activeTimedEffects || []).some(e => e && e.id === 'eff-wellrested')), 'бонус «Выспался» не выдан');
  // медовуха: очаг есть, мёда нет → ошибка; кладём 2 мёда → получается
  r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => Estate.R.brew(e), ['store']); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(/Нужно мёда/.test(r), 'медовуха без мёда: ' + r);
  r = await pl.evaluate(async id => { await Estate.mutate(id, e => { Estate.R.put(e, { itemId: 'Мёд', name: 'Мёд' }, 4); Estate.R.brew(e); }, ['store']); const e = CloudSync.getSessionData().estates[id]; return JSON.stringify([e.store['Мёд'] && e.store['Мёд'].count, e.store['Медовуха'] && e.store['Медовуха'].count]); }, id);
  await wait(800);
  r = await pl.evaluate(id => { const e = CloudSync.getSessionData().estates[id]; return JSON.stringify([e.store['Мёд'].count, e.store['Медовуха'].count]); }, id);
  chk(r === '[2,1]', 'медовуха: 4 мёда → 2 мёда + 1 медовуха: ' + r);
  // налёт без охраны уносит стопки
  await gm.evaluate(() => gmEstateRaid()); await wait(1000);
  const left = await pl.evaluate(id => Object.keys(CloudSync.getSessionData().estates[id].store || {}).length, id);
  chk(left === 0, 'налёт без охраны ничего не унёс: ' + left);
  fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 600));
  await H.close();
})();
