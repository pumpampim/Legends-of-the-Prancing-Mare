// Выбор врага из базы в два шага: тип → противник.
const S = require('./setup');
(async () => {
  const { gm, H } = await S.setupSession(); const fails = [];
  const chk = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };
  const r = await gm.evaluate(() => {
    populateEnemyDbSelect();
    const ts = document.getElementById('enemy-type-select'), db = document.getElementById('enemy-db-select');
    const out = { types: Array.from(ts.options).map(o => o.text), emptyFirst: db.options.length, groups: db.querySelectorAll('optgroup').length };
    ts.value = 'falmer'; onEnemyTypePicked();
    out.falmer = db.options.length - 1; out.allFalmer = Array.from(db.options).slice(1).every(o => /Фалмер/.test(o.text));
    ts.value = 'bandit'; onEnemyTypePicked(); out.bandit = Array.from(db.options).map(o => o.text).join('|');
    const total = window.enemiesData.length; let sum = 0;
    Array.from(ts.options).slice(1).forEach(o => { ts.value = o.value; onEnemyTypePicked(); sum += db.options.length - 1; });
    out.cover = [sum, total];
    return out;
  });
  chk(r.emptyFirst === r.cover[1] + 1 && r.groups > 5, 'без типа — все враги по группам: ' + r.emptyFirst + ', групп ' + r.groups);
  chk(r.falmer >= 12 && r.allFalmer, 'фалмеры: ' + r.falmer);
  chk(/Бандит/.test(r.bandit) && !/Фалмер|Волк/.test(r.bandit), 'бандиты отдельно: ' + r.bandit.slice(0, 80));
  chk(r.cover[0] === r.cover[1], 'каждый враг попал в какой-то тип: ' + r.cover);
  console.log(r.types.join(' / '));
  fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 300));
  await H.close(); process.exit(fails.length ? 1 : 0);
})();
