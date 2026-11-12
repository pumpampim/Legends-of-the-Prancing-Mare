// Инструменты мастера: сводка круга, часы событий, досье героя, характеристики предметов, оценка сложности.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession(); const pl = players[0]; const fails = [];
  const chk = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };

  // --- база предметов: характеристики ---
  const items = await gm.evaluate(async () => {
    window.loadGmItems(); await new Promise(r => setTimeout(r, 1200));
    const q = (s) => { document.getElementById('gm-item-search').value = s; window.filterGmItems(); return document.getElementById('gm-items-table-body').innerText; };
    const out = {};
    out.ingr = q('Горноцвет'); out.ench = q('Урон огнем'); out.sword = q('Стальной меч'); out.armor = q('Железная броня');
    out.byProp = document.getElementById('gm-items-count') ? (q('регенерация здоровья'), document.getElementById('gm-items-count').textContent) : '0';
    out.head = Array.from(document.querySelectorAll('#gm-items-table-body')[0].closest('table').querySelectorAll('th')).map(t => t.textContent).join('|');
    return out;
  });
  chk(/Характеристики/.test(items.head), 'в таблице есть колонка «Характеристики»');
  chk(/свойства:/.test(items.ingr), 'у ингредиента показаны свойства: ' + items.ingr.replace(/\s+/g, ' ').slice(0, 140));
  chk(/урон \d+/.test(items.sword), 'у оружия показан урон');
  chk(/✨ Урон огнем/.test(items.ench), 'у зачарованной вещи показано зачарование');
  chk(/броня \d+/.test(items.armor), 'у брони показана броня');
  chk(parseInt(items.byProp) > 0, 'поиск работает и по свойствам: ' + items.byProp);

  // --- сводка круга + оценка сложности ---
  await S.gmAddEnemy(gm, 'Волк'); await wait(800);
  const sum = await gm.evaluate(() => { const b = document.getElementById('gm-round-summary'); return b ? b.innerText : null; });
  chk(sum && /Бьорн/.test(sum) && /Волк/.test(sum), 'в сводке круга игрок и враг: ' + (sum || '').replace(/\s+/g, ' ').slice(0, 160));
  chk(/Круг \d+/.test(sum || ''), 'видны круг и ход');
  const diff = await gm.evaluate(() => { const d = window.EnemyRanks.difficulty([{ curHp: 400, dmg: 100, physRes: 50 }], [{ curHp: 600, weaponDmg: 100, resist: { physical: 50 } }]); const e = window.EnemyRanks.difficulty([{ curHp: 400, dmg: 100, physRes: 0 }], [{ curHp: 600, weaponDmg: 100, resist: { physical: 0 } }]); return { d, e }; });
  chk(diff.d.enDmg === 50 && diff.d.pcDmg === 50, 'сопротивления учтены в оценке: враг ' + diff.d.enDmg + ', отряд ' + diff.d.pcDmg);
  chk(diff.e.roundsToWin === 6 && diff.e.roundsToLose === 4, 'без сопротивлений: 6 и 4 круга');
  chk(typeof diff.e.advice === 'string' && diff.e.advice.length > 0, 'есть совет по бою: ' + diff.e.advice);
  // броня игрока доходит до мастера
  const pr = await pl.evaluate(() => { updateAll(); saveLocalStorage(true); return document.getElementById('armor-total').innerText; });
  await wait(2500);
  const pub = await gm.evaluate(() => { const p = Object.values(window.GmBridge.data().participants || {})[0]; return p ? { armor: p.armor, physRes: p.physRes } : null; });
  chk(pub && typeof pub.physRes === 'number', 'броня героя видна мастеру: ' + JSON.stringify(pub));

  // --- часы событий ---
  const clk = await gm.evaluate(() => {
    document.getElementById('gm-clock-title').value = 'Набег на деревню'; document.getElementById('gm-clock-days').value = '0'; document.getElementById('gm-clock-effect').value = 'Горит мельница';
    window.gmClockAdd(); gmRoundDossierRefresh();
    const due = document.getElementById('gm-round-summary').innerText;
    const list = document.getElementById('gm-clocks-list').innerText;
    const idBtn = document.querySelector('#gm-clocks-list button'); idBtn.click();
    const after = document.getElementById('gm-round-summary').innerText;
    return { due, list, after };
  });
  chk(/Набег на деревню/.test(clk.due) && /Горит мельница/.test(clk.due), 'просроченные часы всплывают в сводке');
  chk(/пора/.test(clk.list), 'в списке часов — «пора»');
  chk(!/Набег на деревню/.test(clk.after), 'после «Сработало» напоминание исчезает');

  // --- досье ---
  const dos = await gm.evaluate(async () => {
    const sel = document.getElementById('gm-dossier-select');
    gmRoundDossierRefresh(); const uid = sel.options[1].value; sel.value = uid; window.gmDossierLoad(); await new Promise(r => setTimeout(r, 900));
    return document.getElementById('gm-dossier-body').innerText;
  });
  chk(/Бьорн/.test(dos) && /Норд/.test(dos), 'досье: имя и раса: ' + dos.replace(/\s+/g, ' ').slice(0, 160));
  chk(/Лучшие навыки/.test(dos) && /Характеристики/.test(dos), 'в досье есть навыки и характеристики');

  fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 300));
  await H.close(); process.exit(fails.length ? 1 : 0);
})();
