// Гордость шпиля: у старого участка без этажей достраиваются этаж, подвал и парные лестницы; лестница ставится с парой.
const S = require('./setup');
(async () => {
  const { players, H } = await S.setupSession();
  const pl = players[0]; const fails = [];
  const chk = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };
  const r = await pl.evaluate(() => {
    const E = window.Estate, out = {};
    const e = E.preset('solitude', 'u1');
    // «старый» участок: без этажей, лестниц и признака починки
    e.floors = {}; Object.keys(e.furn).forEach(k => { if (/stair/.test(e.furn[k].t)) delete e.furn[k]; }); delete e.shellV2; e.roof = e.roof || {};
    E.R.shell(e);
    const g = e.furn, f1 = (e.floors[1] || {}).furn || {}, fm = (e.floors[-1] || {}).furn || {};
    const pairUp = Object.keys(g).filter(k => g[k].t === 'stairup' && (f1[k] || {}).t === 'stairdown');
    const pairDown = Object.keys(g).filter(k => g[k].t === 'stairdown' && (fm[k] || {}).t === 'stairup');
    out.pairs = [pairUp.length, pairDown.length];
    out.stray = Object.keys(f1).filter(k => f1[k].t === 'stairup').length + Object.keys(fm).filter(k => fm[k].t === 'stairdown').length;
    out.again = JSON.stringify(E.R.shell(e));
    // ставим лестницу вверх руками — пара на втором этаже появляется сама
    e.stock = { plank: 99 }; const k = Object.keys(e.build).find(c => e.build[c] === 'floor' && !e.furn[c] && ((e.floors[1].build || {})[c] === 'floor') && !((e.floors[1].furn || {})[c]));
    const [x, y] = k.split('_').map(Number); E.R.furn(e, 'stairup', x, y);
    out.auto = ((e.floors[1].furn || {})[k] || {}).t;
    return out;
  });
  chk(r.pairs[0] >= 1 && r.pairs[1] >= 1, 'парные лестницы вверх и вниз есть: ' + r.pairs);
  chk(r.stray === 0, 'лестниц в никуда нет');
  chk(r.auto === 'stairdown', 'парная лестница ставится сама: ' + r.auto);
  chk(r.again === '[]', 'повторная починка ничего не делает');
  fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 300), 'done');
  await H.close(); process.exit(fails.length ? 1 : 0);
})();
