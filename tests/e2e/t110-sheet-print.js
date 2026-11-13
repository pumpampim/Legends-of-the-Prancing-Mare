// Бумажный лист героя (sheet-print.js): кнопка у игрока и «🖨 Лист» у мастера открывают заполненный лист A4;
// страницы не переполняются; длинные списки уходят на страницы-продолжения.
const S = require('./setup');
const path = require('path'); const fs = require('fs');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const [p1] = players;
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  // Проверка вкладки печати: число страниц, переполнение, текст.
  async function inspect(pg, shot) {
    await pg.waitForSelector('.page', { timeout: 8000 });
    await pg.evaluate(() => document.fonts && document.fonts.ready);
    const r = await pg.evaluate(() => {
      const pages = [...document.querySelectorAll('.page')];
      const over = pages.map((p, i) => { const b = p.getBoundingClientRect(); let m = 0; p.querySelectorAll('.sec,.top,.row,.cols').forEach(e => { const q = e.getBoundingClientRect(); if (q.height) m = Math.max(m, q.bottom - b.top); }); return m > b.height - 20 ? (i + 1) + ':' + Math.round(m) + '/' + Math.round(b.height) : null; }).filter(Boolean);
      const css = [...document.styleSheets].some(s => /sheet-print\.css/.test(s.href || ''));
      return { n: pages.length, over, css, text: document.body.innerText };
    });
    if (shot) { await pg.emulateMedia({ media: 'print' }); await pg.pdf({ path: path.join(out, shot + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true }); await pg.emulateMedia({ media: 'screen' }); }
    return r;
  }
  // 1. Игрок: перк, вещь, золото — и печать
  await p1.evaluate(() => {
    window.print = () => { window.__printed = true; };
    perkPointsAvailable = 2; const c = document.getElementById('perk-0-0-1'); if (c && !c.checked) c.click();
    document.getElementById('char-gold').value = 321;
    document.getElementById('char-backstory').value = 'Сын кузнеца из Вайтрана, ушёл в Соратники.';
    updateAll(); saveLocalStorage(true);
  });
  await wait(500);
  const ctx = p1.context();
  ctx.on('page', pg => pg.addInitScript(() => { window.print = () => { window.__printed = true; }; }));
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p1.evaluate(() => stPrintSheet())]);
  await tab.evaluate(() => { window.print = () => { window.__printed = true; }; });
  const a = await inspect(tab, 'sheet-player');
  check(a.n === 5, 'у игрока 5 страниц: ' + a.n);
  check(!a.over.length, 'страницы не переполнены: ' + JSON.stringify(a.over));
  check(a.css, 'стили листа подключены');
  check(/Бьорн/.test(a.text) && /Норд/.test(a.text) && /Воин/.test(a.text), 'имя, раса, знак на листе');
  check(/321/.test(a.text), 'золото на листе');
  check(/Сильная рука/.test(a.text), 'взятый перк на листе');
  check(/Сын кузнеца/.test(a.text), 'предыстория на листе');
  const stats = await tab.evaluate(() => [...document.querySelectorAll('.stat .sv .val')].map(e => e.textContent));
  check(stats.length === 6 && +stats[0] >= 16, 'характеристики заполнены: ' + stats.join(','));
  const btnOnPage = await p1.evaluate(() => !!Array.from(document.querySelectorAll('button')).find(b => /Распечатать лист/.test(b.textContent)));
  check(btnOnPage, 'кнопка «Распечатать лист» есть на листе игрока');
  // 2. Мастер: «🖨 Лист» в «Отряде»
  await gm.evaluate(() => { window.print = () => { }; });
  const gctx = gm.context();
  gctx.on('page', pg => pg.addInitScript(() => { window.print = () => { }; }));
  const [gtab] = await Promise.all([gctx.waitForEvent('page'), gm.evaluate(() => Array.from(document.querySelectorAll('#gm-party-list button')).find(b => /Лист/.test(b.textContent)).click())]);
  await wait(800);
  const g = await inspect(gtab, 'sheet-gm');
  check(g.n === 5 && !g.over.length, 'у мастера 5 страниц без переполнения: ' + g.n + ' ' + JSON.stringify(g.over));
  check(/Бьорн/.test(g.text) && /321/.test(g.text) && /Сильная рука/.test(g.text), 'мастер печатает лист игрока с его данными');
  // 3. Большой герой: много перков, заклинаний и вещей — продолжения, без переполнения
  const big = await p1.evaluate(() => {
    const d = stBuildSheet();
    d.takenPerks = Array.from({ length: 45 }, (_, i) => ({ s: 0, p: 0, tree: 'Одноручное оружие', name: 'Перк ' + i, taken: 2, steps: 5 }));
    d.customSpells = Array.from({ length: 30 }, (_, i) => ({ school: 'destr', name: 'Заклинание ' + i, baseCost: 30, desc: 'Длинное описание заклинания, которое не должно ломать вёрстку листа даже если оно очень длинное и занимает много места' }));
    d.inventory = Array.from({ length: 120 }, (_, i) => ({ itemId: 'x' + i, name: 'Очень длинное название предмета номер ' + i, count: 3, weight: 1.5 }));
    d.backstory = 'Очень длинная история. '.repeat(60);
    return d;
  });
  const bctx = await H.browser.newContext();
  const bp = await bctx.newPage();
  await bp.goto('http://localhost:' + (process.env.PORT || 8765) + '/index.html', { waitUntil: 'domcontentloaded' }).catch(() => { });
  await bp.setContent(await p1.evaluate(d => StSheetPrint.html(d, '<base href="' + location.origin + '/"><link rel="stylesheet" href="vendor/fonts.css"><link rel="stylesheet" href="sheet-print.css">'), big));
  await wait(800);
  const b = await inspect(bp, 'sheet-big');
  check(b.n === 5 + 1 + 1 + 2, 'продолжения: перки, заклинания, инвентарь ×2 — страниц ' + b.n);
  check(!b.over.length, 'большой герой без переполнения: ' + JSON.stringify(b.over));
  check(/Перк 44/.test(b.text) && /Заклинание 29/.test(b.text) && /номер 119/.test(b.text), 'ничего не потерялось');
  // 4. Пустой бланк
  await bp.setContent(await p1.evaluate(() => StSheetPrint.html(null, '<base href="' + location.origin + '/"><link rel="stylesheet" href="sheet-print.css">')));
  const e = await inspect(bp);
  check(e.n === 5 && !e.over.length, 'пустой бланк: 5 страниц');
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  console.log(ok ? 'ALL OK' : 'HAS FAILS');
  await H.close();
})();
