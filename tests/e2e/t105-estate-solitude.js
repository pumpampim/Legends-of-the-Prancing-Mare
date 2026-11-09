// Гордость шпиля: этажи на месте, обстановку комнат покупают у управляющего.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  await gm.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('gm-estate-preset').value = 'solitude'; gmEstateCreate(); });
  await wait(1500);
  await pl.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('tab17-btn').click(); });
  await wait(800);
  const id = await pl.evaluate(() => Object.keys(CloudSync.getSessionData().estates)[0]);
  const M = (fn, f) => pl.evaluate(async o => { try { await Estate.mutate(o.id, new Function('e', 'return (' + o.src + ')(e)'), o.f); return 'ok'; } catch (e) { return e.message; } }, { id, src: fn, f });
  let e = await pl.evaluate(id => JSON.parse(JSON.stringify(CloudSync.getSessionData().estates[id])), id);
  chk(e.floors && e.floors['1'] && e.floors['-1'] && e.floors['1'].build['12_12'] === 'floor' && e.floors['-1'].build['12_12'] === 'floor', 'подвал и второй этаж на месте');
  let r = await M('e => Estate.R.order(e, "sol_dining")'); chk(/управляющего/.test(r), 'без управляющего: ' + r);
  await M('e => Estate.R.hire(e, "steward")', ['staff']);
  r = await M('e => { Estate.R.order(e, "sol_dining"); Estate.R.order(e, "sol_bedrooms"); Estate.R.order(e, "sol_study"); }', ['orders', 'log']); chk(r === 'ok', 'заказ комнат: ' + r);
  await M('e => Estate.R.advance(e, 2)'); await wait(600);
  e = await pl.evaluate(id => JSON.parse(JSON.stringify(CloudSync.getSessionData().estates[id])), id);
  chk(e.built.sol_dining && e.furn['16_10'] && e.furn['16_10'].t === 'table', 'столовая обставлена');
  chk(e.built.sol_bedrooms && e.floors['1'].furn['10_10'] && e.floors['1'].furn['10_10'].t === 'bed', 'спальни наверху');
  r = await M('e => Estate.R.order(e, "lv_house")'); chk(/не предлагает/.test(r), 'услуга Озёрного дома в городском: ' + r);
  fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 600), 'done');
  await H.close();
})();
