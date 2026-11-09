// Поместье: услуги управляющего (дом, этажи, крылья), лестницы между этажами, действие крыла раз в день.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  await gm.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('gm-estate-preset').value = 'lakeview'; gmEstateCreate(); });
  await wait(1500);
  await pl.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('tab17-btn').click(); document.getElementById('char-gold').value = 99999; });
  await wait(800);
  const id = await pl.evaluate(() => Object.keys(CloudSync.getSessionData().estates)[0]);
  const M = (fn, f, l) => pl.evaluate(async o => { try { await Estate.mutate(o.id, new Function('e', 'return (' + o.src + ')(e)'), o.f, o.l); return 'ok'; } catch (e) { return e.message; } }, { id, src: fn, f, l });
  const E = () => pl.evaluate(id => JSON.parse(JSON.stringify(CloudSync.getSessionData().estates[id])), id);
  let r = await M('e => Estate.R.order(e, "lv_house")');
  chk(/управляющего/.test(r), 'заказ без управляющего: ' + r);
  r = await M('e => Estate.R.hire(e, "steward")', ['staff']); chk(r === 'ok', 'найм: ' + r);
  r = await M('e => Estate.R.order(e, "lv_floor1")'); chk(/Сначала закажите/.test(r), 'этаж без дома: ' + r);
  r = await M('e => Estate.R.order(e, "lv_house")', ['orders', 'log']); chk(r === 'ok', 'заказ дома: ' + r);
  r = await M('e => Estate.R.advance(e, 6)'); await wait(500);
  let e = await E(); chk(!e.built.lv_house && e.orders.length === 1, 'дом готов раньше срока');
  r = await M('e => Estate.R.advance(e, 1)'); await wait(500);
  e = await E(); chk(e.built && e.built.lv_house && !e.orders.length, 'дом не построен за 7 дней');
  chk(e.build['24_35'] === 'door' && e.build['19_24'] === 'wall' && e.found['25_30'] === 1, 'стены/дверь/фундамент главного зала');
  // этажи
  r = await M('e => { Estate.R.order(e, "lv_floor1"); Estate.R.order(e, "lv_cellar"); }', ['orders', 'log']); chk(r === 'ok', 'заказ этажей: ' + r);
  await M('e => Estate.R.advance(e, 3)'); await wait(500);
  e = await E(); chk(e.built.lv_floor1 && e.built.lv_cellar, 'этажи не построены');
  chk(e.floors && e.floors['1'] && e.floors['1'].build['25_30'] === 'floor' && e.floors['-1'].build['25_30'] === 'floor', 'пол на втором этаже и в подвале');
  chk(!e.roof['25_30'] === true, 'крыша над вторым этажом должна стоять не на первом');
  // лестница
  await pl.evaluate(() => Estate.enter()); await wait(800);
  await pl.evaluate(id => CloudSync.estateWrite({ ['estates.' + id + '.tokens.' + CloudSync.getCurrentUid()]: { x: 28, y: 32 } }), id); await wait(800);
  await pl.evaluate(() => { const cv = document.getElementById('estate-canvas'), r = cv.getBoundingClientRect(), cs = cv.width / 50; cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + (28 + .5) * cs * r.width / cv.width, clientY: r.top + (33 + .5) * cs * r.height / cv.height })); });
  await wait(1000);
  const tk = await pl.evaluate(id => CloudSync.getSessionData().estates[id].tokens[CloudSync.getCurrentUid()], id);
  chk(tk && tk.l === 1, 'лестница не подняла на второй этаж: ' + JSON.stringify(tk));
  // крыло
  r = await M('e => Estate.R.wings(e, ["armory", "library"])', ['wings', 'wingsLocked', 'wingSlot']); chk(r === 'ok', 'выбор крыльев: ' + r);
  r = await M('e => Estate.R.order(e, "lv_wing_armory")', ['orders', 'log']); chk(r === 'ok', 'заказ крыла: ' + r);
  await M('e => Estate.R.advance(e, 3)'); await wait(500);
  e = await E(); chk(e.built.lv_wing_armory && e.build['12_24'] === 'wall' && e.build['18_26'] === 'door' && e.build['19_26'] === 'door', 'крыло оружейная построено с дверью в зал');
  const act = await pl.evaluate(id => Estate.wingActive(CloudSync.getSessionData().estates[id], 'armory'), id); chk(act === true, 'оружейная не действует');
  r = await M('e => Estate.R.useWing(e, "armory", "u1")', ['used']); chk(r === 'ok', 'первое пользование: ' + r);
  r = await M('e => Estate.R.useWing(e, "armory", "u1")', ['used']); chk(/уже пользовался/.test(r), 'второе пользование в тот же день: ' + r);
  await M('e => Estate.R.advance(e, 1)'); r = await M('e => Estate.R.useWing(e, "armory", "u1")', ['used']); chk(r === 'ok', 'пользование в новый день: ' + r);
  r = await M('e => Estate.R.useWing(e, "library", "u1")', ['used']); chk(/не обставлено/.test(r), 'библиотека без шкафов: ' + r);
  fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 600), 'done');
  await H.close();
})();
