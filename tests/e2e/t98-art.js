// Рисованные аватары врагов и иконки предметов (art-data.js, img/): у каждого слага есть файл,
// мастер видит картинку врага вместо SVG, в сумке на телефоне иконки грузятся.
const fs = require('fs'), path = require('path');
const { setupSession, wait } = require('./setup');
(async () => {
  const SITE = path.join(__dirname, '..', '..');
  global.window = {}; require(path.join(SITE, 'art-data.js'));
  const miss = [];
  Object.keys(window.ENEMY_ART_READY).forEach(s => { if (!fs.existsSync(path.join(SITE, 'img/enemies', s + '.webp'))) miss.push('enemy ' + s); });
  Object.keys(window.ITEM_ART_READY).forEach(k => { if (!fs.existsSync(path.join(SITE, 'img/items', k + '.webp'))) miss.push('item ' + k); });
  Object.keys(window.SPELL_ART_READY).forEach(k => { if (!fs.existsSync(path.join(SITE, 'img/spells', k + '.webp'))) miss.push('spell ' + k); });
  Object.keys(window.UI_ART_READY).forEach(k => { if (!fs.existsSync(path.join(SITE, 'img/ui', k + '.webp'))) miss.push('ui ' + k); });
  const sp = new Function(fs.readFileSync(path.join(SITE, 'spell-data.js'), 'utf8') + ';return spellsData;')(), noArt = [];
  Object.keys(sp).forEach(sc => Object.keys(sp[sc]).forEach(t => sp[sc][t].forEach(x => { if (!window.spellArtUrl(x.name)) noArt.push(x.name); })));
  if (noArt.length) console.log('FAIL у заклинаний нет иконки: ' + noArt.slice(0, 10).join(', '));
  if (miss.length) console.log('FAIL нет файлов: ' + miss.join(', ')); else console.log('ok: все файлы на месте');

  const { gm, players, H } = await setupSession();
  const pl = players[0];
  await gm.evaluate(async () => {
    for (const nm of ['Бандит', 'Фалмер (шаман)', 'Волк']) {
      const idx = window.enemiesData.findIndex(e => e.name === nm); const sel = document.getElementById('enemy-db-select');
      if (sel.options.length < 2) populateEnemyDbSelect(); sel.value = String(idx); window.onEnemyDbPicked(); window.addEnemy();
    }
  });
  await wait(2000);
  const av = await gm.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img.enemy-avatar')];
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
    return imgs.map(i => ({ src: i.getAttribute('src').slice(0, 40), w: i.naturalWidth }));
  });
  console.log('gm avatars', JSON.stringify(av));
  if (av.length < 3) console.log('FAIL мало аватаров у мастера');
  av.forEach(a => { if (!/^img\/enemies\/[a-z-]+\.webp$/.test(a.src) || !a.w) console.log('FAIL аватар не картинка: ' + JSON.stringify(a)); });
  if (!av.some(a => a.src === 'img/enemies/falmer-shaman.webp')) console.log('FAIL фалмер-шаман не нашёлся');

  await pl.setViewportSize({ width: 390, height: 800 }); await wait(800);
  const bag = await pl.evaluate(async () => {
    [['Железный меч', 'Одноручное', 'melee'], ['Зелье здоровья', 'Зелья', ''], ['Капуста', 'Продукты', ''], ['Железный шлем', 'Тяжёлая броня', 'helmet']]
      .forEach(([n, c, s]) => playerInventory.push({ itemId: n, name: n, count: 1, weight: 1, category: c, slot: s || undefined, price: 10 }));
    updateAll(); if (window.renderInventory) renderInventory();
    const b = document.querySelector('#st-tabbar [data-g="bag"], #st-tabbar button:nth-child(3)'); b && b.click();
    await new Promise(r => setTimeout(r, 800));
    const imgs = [...document.querySelectorAll('.st-bag-cell img.st-art')];
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
    return imgs.map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth }));
  });
  console.log('bag icons', JSON.stringify(bag));
  bag.forEach(a => { if (!a.w) console.log('FAIL иконка не загрузилась: ' + a.src); });
  const ui = await pl.evaluate(async () => {
    window.stIconScan && stIconScan(document.body);
    const imgs = [...document.querySelectorAll('.sk-ic img.sk-pic')];
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
    return { n: imgs.length, bad: imgs.filter(i => !i.naturalWidth).length, txt: document.querySelectorAll('.sk-ic .sk-ic-t').length };
  });
  console.log('ui icons', JSON.stringify(ui));
  if (ui.bad) console.log('FAIL иконки интерфейса не загрузились: ' + ui.bad);
  await H.close();
})();
